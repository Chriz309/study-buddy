# Build front / sit / lay (+ blink variants) from a 3-pose sheet and its eyes-closed edit.
import sys, numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
sys.path.insert(0, sys.argv[5]); from sprite_cutout import cut   # reuse the walk-frame cut-out

sheet = np.asarray(Image.open(sys.argv[1]).convert('RGB'))
closed = np.asarray(Image.open(sys.argv[2]).convert('RGB'))
outdir, walk_ref = sys.argv[3], sys.argv[4]

# 1) find the 3 cats (column runs of non-white)
fg = (np.abs(sheet.astype(int) - 255).max(-1) > 40)
cols = fg.any(0); segs = []; st = None
for x, c in enumerate(cols):
    if c and st is None: st = x
    if not c and st is not None:
        if x - st > 60: segs.append((st, x))
        st = None
if st is not None: segs.append((st, len(cols)))
assert len(segs) == 3, segs
print('segments', segs)

# 2) eyes-only blink patch: changed pixels in the cat's upper half, grown + feathered
def blink_patch(x0, x1):
    # Patch ONLY around the eyes: find the irises (big dark-brown blobs) in the OPEN pose,
    # grow them a little and blend in the closed-eye pixels there. Everything else stays
    # pixel-identical, so the head can't shift/flicker when the cat blinks.
    reg = sheet[:, x0:x1].astype(int)
    r, g, b = reg[..., 0], reg[..., 1], reg[..., 2]
    # eyes are big solid dark blobs; the outline / brows / mouth are thin dark lines.
    # Opening the dark mask erases anything thinner than ~12 px and keeps the eyes.
    dark = reg.max(-1) < 110
    iris = ndimage.binary_opening(dark, iterations=6)
    ys = np.where(fg[:, x0:x1].any(1))[0]; top, bot = ys.min(), ys.max()
    iris[int(top + (bot - top) * 0.55):] = False
    lab, n = ndimage.label(iris)
    sizes = ndimage.sum(iris, lab, range(1, n + 1))
    eyes = [i + 1 for i, sz in sorted(enumerate(sizes), key=lambda t: -t[1])[:2] if sz > 800]
    assert eyes, 'no eyes found'
    # per eye: grow generously (covers the thick outline + white), but never above the
    # eye's own top edge + a small margin — the brows sit higher and must stay untouched
    # (Canva's edit also removed the brows, so they must come from the open image)
    grow = int(sys.argv[6]) if len(sys.argv) > 6 else 40
    TOPM = int(sys.argv[7]) if len(sys.argv) > 7 else 14
    m = np.zeros(iris.shape, bool)
    dark_full = reg.max(-1) < 110
    for e in eyes:
        blob = lab == e
        yy, xx = np.where(blob); cy = yy.mean()
        print('  eye at', int(xx.mean()) + x0, int(cy), 'size', int(sizes[e - 1]))
        # the eye's real top edge = top of the dark region connected to this iris blob
        conn, _ = ndimage.label(dark_full); ids = np.unique(conn[blob]); ids = ids[ids > 0]
        full = np.isin(conn, ids); ty = np.where(full)[0].min()
        g = ndimage.binary_dilation(blob, iterations=grow)
        # also cover the eye's own outline + lash flick (dark strokes touching the eye),
        # but only within a box around this eye so the head outline is never included
        y0b, y1b = yy.min() - 70, yy.max() + 70; x0b, x1b = xx.min() - 70, xx.max() + 70
        box = np.zeros_like(blob); box[max(0, y0b):y1b, max(0, x0b):x1b] = True
        dark_eye = (reg.max(-1) < 150) & box
        cl, _ = ndimage.label(dark_eye); ids2 = np.unique(cl[blob]); ids2 = ids2[ids2 > 0]
        g |= ndimage.binary_dilation(np.isin(cl, ids2), iterations=8)
        g[:max(0, ty - TOPM)] = False; print("    eye top", ty, "patch top", ty - TOPM)
        m |= g
    m = m.astype(float)
    m = ndimage.gaussian_filter(m, 3)
    out = reg.astype(float) * (1 - m[..., None]) + closed[:, x0:x1].astype(float) * m[..., None]
    ys2, xs2 = np.where(m > 0.05)
    print('  blink patch bbox', xs2.min() + x0, ys2.min(), xs2.max() + x0, ys2.max(), 'area', int((m > 0.5).sum()))
    return out.astype(np.uint8)

# 3) head width of the walk frame = reference size so every pose matches on screen
def head_width(alpha, frac_rows=(0.30, 0.42)):
    h = alpha.shape[0]; ws = []
    for r in range(int(h * frac_rows[0]), int(h * frac_rows[1])):
        xr = np.where(alpha[r] > 128)[0]
        if xr.size: runs = np.split(xr, np.where(np.diff(xr) > 1)[0] + 1); ws.append(runs[-1].max() - runs[-1].min())
    return float(np.median(ws))
wa = np.asarray(Image.open(walk_ref).convert('RGBA'))[..., 3]
walk_head = head_width(wa[6:-6, 6:-6]); print('walk head width', walk_head, 'walk img h', wa.shape[0])

def tight(rgb):
    rgba = cut(rgb); al = rgba[..., 3] > 40; ys, xs = np.where(al)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

names = ['front', 'sit', 'lay']
pad = 14; results = {}
for (x0, x1), name in zip(segs, names):
    a0, a1 = max(0, x0 - pad), min(sheet.shape[1], x1 + pad)
    open_rgba = tight(sheet[:, a0:a1])
    variants = {name: open_rgba}
    if name != 'lay':
        # cut the blink from the PATCHED sheet with the open frame's exact crop
        patched = sheet.copy(); patched[:, x0:x1] = blink_patch(x0, x1)
        rgba_full = cut(patched[:, a0:a1]); al = cut(sheet[:, a0:a1])[..., 3] > 40
        ys, xs = np.where(al); variants[name + '_blink'] = rgba_full[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        assert variants[name + '_blink'].shape == open_rgba.shape
    results.update(variants)

# scale: front/sit by head width; lay's head is turned/tucked, so match it to sit's scale (same sheet scale)
s_front = walk_head / head_width(results['front'][..., 3], (0.18, 0.30))
s_sit = walk_head / head_width(results['sit'][..., 3], (0.18, 0.30))
s = (s_front + s_sit) / 2
print('scale front %.3f sit %.3f -> using %.3f for all three (same sheet)' % (s_front, s_sit, s))
pose_h = {}
for k, rgba in results.items():
    img = Image.fromarray(rgba).resize((round(rgba.shape[1] * s), round(rgba.shape[0] * s)), Image.LANCZOS)
    m = 6; full = Image.new('RGBA', (img.width + 2 * m, img.height + 2 * m), (0, 0, 0, 0)); full.paste(img, (m, m))
    full.save(f'{outdir}/cat-{k.replace("_", "-")}.png'); pose_h[k] = full.height
    print(k, full.size)
print('POSE_H (relative to walk frame height %d):' % wa.shape[0], {k: round(v / wa.shape[0], 3) for k, v in pose_h.items()})
