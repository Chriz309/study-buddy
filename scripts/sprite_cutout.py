# Cut the 4 walk frames out of a white-background sprite sheet and register them
# onto one identical canvas (heads level horizontally, paws on one ground line).
import sys, numpy as np
from PIL import Image
from scipy import ndimage

def cut(rgb):
    a = rgb.astype(float)
    dist = np.abs(a - 255).max(-1)                    # how far from pure white
    near_white = dist < 28
    lab, _ = ndimage.label(near_white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # soft edge: pixels touching the background get alpha from how dark they are
    edge = ndimage.binary_dilation(bg, iterations=2) & ~bg
    lum = a.mean(-1)
    alpha = np.where(bg, 0.0, 1.0)
    alpha = np.where(edge, np.clip((255 - lum) / (255 - 70), 0, 1), alpha)
    alpha = np.where(bg & (dist >= 8), np.clip(dist / 120, 0, 1) * 0.6, alpha)  # faint halo kept soft
    # un-mix white from the semi-transparent edge pixels
    am = np.maximum(alpha, 1e-3)[..., None]
    col = np.clip((a - (1 - am) * 255) / am, 0, 255)
    col = np.where(alpha[..., None] > 0, col, 0)
    return np.dstack([col, alpha * 255]).astype(np.uint8)

def main(sheet, segs, out_prefix, target_h):
    im = np.asarray(Image.open(sheet).convert('RGB'))
    frames = []
    for (x0, x1) in segs:
        pad = 12
        crop = im[:, max(0, x0 - pad):min(im.shape[1], x1 + pad)]
        rgba = cut(crop)
        al = rgba[..., 3] > 40
        ys, xs = np.where(al)
        rgba = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        frames.append(rgba)
    # register: head = top 38% of each cutout; align heads' horizontal centre of mass,
    # and align the bottom (paws) to one ground line
    def head_cx(f):
        # centre of the HEAD only: on each upper row take the right-most opaque run
        # (the tail is a separate run further left, so it's ignored)
        h = f.shape[0]; cs = []
        for r in range(int(h * 0.12), int(h * 0.45)):
            xr = np.where(f[r, :, 3] > 128)[0]
            if xr.size == 0: continue
            runs = np.split(xr, np.where(np.diff(xr) > 1)[0] + 1)
            cs.append((runs[-1].min() + runs[-1].max()) / 2)
        return float(np.median(cs))
    cxs = [head_cx(f) for f in frames]
    left = max(cxs); right = max(f.shape[1] - c for f, c in zip(frames, cxs))
    H = max(f.shape[0] for f in frames)
    W = int(np.ceil(left + right))
    out = []
    for f, c in zip(frames, cxs):
        can = np.zeros((H, W, 4), np.uint8)
        ox = int(round(left - c)); oy = H - f.shape[0]
        can[oy:oy + f.shape[0], ox:ox + f.shape[1]] = f
        out.append(can)
    margin = 6
    for i, can in enumerate(out):
        img = Image.fromarray(can)
        s = target_h / H
        img = img.resize((round(W * s), target_h), Image.LANCZOS)
        full = Image.new('RGBA', (img.width + 2 * margin, img.height + 2 * margin), (0, 0, 0, 0))
        full.paste(img, (margin, margin))
        full.save(f'{out_prefix}{i + 1}.png')
        print(f'{out_prefix}{i + 1}.png', full.size)

if __name__ == '__main__':
    segs = [(42, 449), (480, 840), (863, 1265), (1294, 1659)]
    main(sys.argv[1], segs, sys.argv[2], int(sys.argv[3]))
