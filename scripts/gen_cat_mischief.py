"""Pib (cat) - the five desktop-mischief reaction frames, derived from the existing painted poses.

The cat art is painted, not pixel art, so instead of redrawing it this script re-uses src/renderer/art/cat-front.png and cat-side.png
and adds the reaction on top with PIL (wide eyes, spiky fur, soot, raised paws, a peeking head). It writes:
  * src/renderer/art-cat-mischief.js   window.CAT_ART_EXTRA = { shock, frazzled, pull, juggle, peek }  (small PNG data URLs)
                                       window.CAT_ART_EXTRA_H = { key: height scale }  (so every frame keeps the cat's art scale)
  * graphify-out/mischief-sheet.png    contact sheet: these five + Captain Cram's five new frames (4x for the hero), gitignored
Needs only Pillow. Run from the repo root:   python scripts/gen_cat_mischief.py
"""
import base64, io, math, os, sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, 'src', 'renderer', 'art')
FRONT_PER_PX = 1.052 / 172.0      # renderer height scale per source pixel for the front pose (see POSE_H in app.js)
SIDE_PER_PX = 1.0 / 142.0
GINGER, DARK, CREAM = (246, 160, 52, 255), (176, 92, 20, 255), (255, 233, 196, 255)
EYES = ((57, 67), (93, 67))       # eye centres in cat-front.png


def load(name):
    return Image.open(os.path.join(ART, name)).convert('RGBA')


def pad(im, top=0, side=0, bottom=0):
    out = Image.new('RGBA', (im.width + 2 * side, im.height + top + bottom), (0, 0, 0, 0))
    out.alpha_composite(im, (side, top))
    return out


def bolt(d, x, y, n=5, col=(255, 240, 120, 255), seed=0):
    pts, cx, cy = [(x, y)], x, y
    for i in range(n):
        cx += (6 if (i + seed) % 2 else -6); cy += 7; pts.append((cx, cy))
    d.line(pts, fill=(255, 190, 0, 255), width=5); d.line(pts, fill=col, width=2)


def spikes(d, box, n, col, seed=1, length=9):
    x0, y0, x1, y1 = box
    for i in range(n):
        a = math.pi + (i + 0.5) / n * math.pi             # across the top of the head
        cx, cy = (x0 + x1) / 2 + math.cos(a) * (x1 - x0) / 2, (y0 + y1) / 2 + math.sin(a) * (y1 - y0) / 2
        tx, ty = cx + math.cos(a) * length, cy + math.sin(a) * length
        d.polygon([(cx - 3, cy + 2), (tx, ty), (cx + 3, cy + 2)], fill=col)


def f_shock():
    im = pad(load('cat-front.png'), top=22, side=26)
    d = ImageDraw.Draw(im)
    for (ex, ey) in EYES:                                         # huge round eyes, tiny pupils
        x, y = ex + 26, ey + 22
        d.ellipse([x - 12, y - 12, x + 12, y + 12], fill=(255, 255, 255, 255), outline=(40, 20, 10, 255), width=2)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(20, 10, 5, 255))
    d.ellipse([75 + 26 - 8, 88 + 22 - 2, 75 + 26 + 8, 88 + 22 + 14], fill=(120, 30, 30, 255))   # gaping mouth
    spikes(d, (36 + 26, 14 + 22, 118 + 26, 90 + 22), 11, GINGER, length=11)
    bolt(d, 10, 6, seed=0); bolt(d, 140, 4, seed=1); bolt(d, 8, 100, 4, seed=1); bolt(d, 146, 96, 4, seed=0)
    return im


def f_frazzled():
    base = load('cat-front.png')
    r, g, b, a = base.split()
    dark = ImageEnhance.Brightness(Image.merge('RGB', (r, g, b))).enhance(0.55)
    dark = ImageEnhance.Color(dark).enhance(0.55)
    im = pad(Image.merge('RGBA', (*dark.split(), a)), top=40, side=20)
    d = ImageDraw.Draw(im)
    for (ex, ey) in EYES:                                         # dizzy spirals instead of eyes
        x, y = ex + 20, ey + 40
        d.ellipse([x - 11, y - 11, x + 11, y + 11], fill=(235, 225, 210, 255))
        pts = [(x + math.cos(t / 3.0) * t / 5.0, y + math.sin(t / 3.0) * t / 5.0) for t in range(0, 40)]
        d.line(pts, fill=(30, 20, 15, 255), width=2)
    d.line([(75 + 20 - 7, 90 + 40), (75 + 20 + 7, 92 + 40)], fill=(40, 20, 15, 255), width=3)  # flat mouth
    spikes(d, (36 + 20, 14 + 40, 118 + 20, 90 + 40), 9, (120, 66, 24, 255), length=12)
    for i, (x, y, r) in enumerate(((60, 26, 7), (70, 14, 9), (82, 3, 7), (96, 20, 6))):        # smoke
        d.ellipse([x - r, y - r, x + r, y + r], fill=(150, 150, 160, 200))
    for i in range(14):                                           # soot speckles
        x, y = 40 + (i * 37) % 70 + 20, 60 + (i * 53) % 90 + 40
        d.ellipse([x - 3, y - 2, x + 3, y + 2], fill=(30, 25, 25, 120))
    return im


def f_pull():
    side = load('cat-side.png')
    im = pad(side, top=20, side=20, bottom=0)
    d = ImageDraw.Draw(im)
    im = im.rotate(-9, resample=Image.BICUBIC, center=(im.width // 2, im.height - 6), expand=False)   # leaning back
    d = ImageDraw.Draw(im)
    d.ellipse([128 + 20, 64 + 20, 140 + 20, 80 + 20], fill=(120, 190, 255, 255))                    # strain sweat drop
    d.polygon([(134 + 20, 58 + 20), (128 + 20, 70 + 20), (140 + 20, 70 + 20)], fill=(120, 190, 255, 255))
    for k in range(3):                                            # claws bared on the front paw
        d.line([(160 + 20 + k * 4, 118 + 20), (166 + 20 + k * 4, 128 + 20)], fill=(250, 250, 250, 255), width=2)
    return im


def f_juggle():
    im = pad(load('cat-front.png'), top=40, side=28)
    d = ImageDraw.Draw(im)
    # no raised arms: the cat stays on all four legs and the icons bounce around its head
    for (x, y, col) in ((38, 8, (255, 90, 106, 255)), (92, 2, (255, 210, 63, 255)), (146, 12, (110, 168, 255, 255))):
        d.ellipse([x, y, x + 20, y + 20], fill=col, outline=(40, 30, 50, 255), width=2); d.ellipse([x + 4, y + 4, x + 8, y + 8], fill=(255, 255, 255, 220))
    return im


def f_peek():
    front = load('cat-front.png').crop((0, 0, 128, 112))            # head and ears only
    im = pad(front, top=0, side=10, bottom=16)
    d = ImageDraw.Draw(im)
    for x in (34, 108):                                           # paws gripping the edge
        d.ellipse([x - 14, 112 - 4, x + 14, 112 + 14], fill=GINGER, outline=DARK, width=2)
        for k in (-6, 0, 6):
            d.line([(x + k, 112 + 6), (x + k, 112 + 12)], fill=DARK, width=2)
    return im


FRAMES = [('shock', f_shock, FRONT_PER_PX), ('frazzled', f_frazzled, FRONT_PER_PX), ('pull', f_pull, SIDE_PER_PX), ('juggle', f_juggle, FRONT_PER_PX), ('peek', f_peek, FRONT_PER_PX)]


def b64(im):
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return base64.b64encode(b.getvalue()).decode('ascii')


def hero_new_frames():
    sys.path.insert(0, os.path.join(ROOT, 'scripts'))
    import gen_hero
    keep = {'shock', 'frazzled', 'pull', 'juggle', 'peek'}
    return [(n, fn().image()) for n, fn in gen_hero.FRAMES if n in keep]


def main():
    imgs = [(n, fn(), per) for n, fn, per in FRAMES]
    lines = ['// GENERATED by scripts/gen_cat_mischief.py - Pib desktop-mischief frames. Do not edit by hand.', 'window.CAT_ART_EXTRA = {']
    for n, im, _ in imgs:
        lines.append('  %s: "data:image/png;base64,%s",' % (n, b64(im)))
    lines.append('};')
    lines.append('window.CAT_ART_EXTRA_H = { %s };' % ', '.join('%s: %.4f' % (n, im.height * per) for n, im, per in imgs))
    open(os.path.join(ROOT, 'src', 'renderer', 'art-cat-mischief.js'), 'w', encoding='utf8').write('\n'.join(lines) + '\n')
    # contact sheet: cat frames at 1.5x, hero frames at 4x
    cells = [(n, im.resize((int(im.width * 1.5), int(im.height * 1.5)), Image.LANCZOS)) for n, im, _ in imgs] + [('hero ' + n, im.resize((160, 160), Image.NEAREST)) for n, im in hero_new_frames()]
    cw, ch, p = 260, 300, 10
    cols = 5; rows = (len(cells) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cw + p, rows * ch + p), (40, 44, 60, 255)); d = ImageDraw.Draw(sheet)
    for i, (n, im) in enumerate(cells):
        x, y = p + (i % cols) * cw, p + (i // cols) * ch
        d.rectangle([x, y, x + cw - p, y + ch - p - 14], fill=(62, 67, 90, 255))
        s = min(1.0, (cw - p) / im.width, (ch - p - 24) / im.height); im2 = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS) if s < 1 else im
        sheet.alpha_composite(im2, (x + (cw - p - im2.width) // 2, y + (ch - p - 14 - im2.height)))
        d.text((x + 4, y + ch - p - 12), n, fill=(235, 238, 250, 255))
    os.makedirs(os.path.join(ROOT, 'graphify-out'), exist_ok=True)
    sheet.convert('RGB').save(os.path.join(ROOT, 'graphify-out', 'mischief-sheet.png'))
    print('wrote', len(imgs), 'cat frames +', len(cells) - len(imgs), 'hero frames on the sheet')


if __name__ == '__main__':
    main()
