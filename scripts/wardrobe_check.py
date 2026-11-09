"""Rasterises graphify-out/wardrobe-placements.json (made by wardrobe_check.js from the app's own anchor table) onto the real sprite
frames and writes graphify-out/wardrobe-check.png.  Usage: node scripts/wardrobe_check.js [char ...]"""
import base64, io, json, os, re, sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETS = 'ABCD'
only = []
for a in sys.argv[1:]:
    if a.startswith('--sets='): SETS = a[7:]
    else: only.append(a)
data = json.load(open(os.path.join(ROOT, 'graphify-out', 'wardrobe-placements.json'), encoding='utf8'))
ITEM = {k: Image.open(io.BytesIO(base64.b64decode(v.split(',', 1)[1]))).convert('RGBA') for k, v in data['items'].items()}


def js_frames(fname):
    s = open(os.path.join(ROOT, 'src', 'renderer', fname), encoding='utf8').read()
    return {m.group(1): Image.open(io.BytesIO(base64.b64decode(m.group(2)))).convert('RGBA')
            for m in re.finditer(r'(\w+)\s*:\s*"data:image/png;base64,([A-Za-z0-9+/=]+)"', s)}


def body(fname):
    s = open(os.path.join(ROOT, 'src', 'renderer', fname), encoding='utf8').read()
    return Image.open(io.BytesIO(base64.b64decode(re.search(r'data:image/png;base64,([A-Za-z0-9+/=]+)', s).group(1)))).convert('RGBA')


def with_face(im):
    """blob/ghost bodies carry no face (the app overlays a vector one): draw a stand-in at the same 40/60% x 45% spots"""
    im = im.copy(); d = ImageDraw.Draw(im); W, H = im.size
    for fx in (0.40, 0.60):
        cx, cy = fx * W, 0.45 * H
        d.ellipse([cx - 0.074 * W, cy - 0.094 * H, cx + 0.074 * W, cy + 0.094 * H], fill=(27, 35, 56, 255))
        d.ellipse([cx - 0.04 * W, cy - 0.07 * H, cx - 0.0 * W, cy - 0.02 * H], fill=(255, 255, 255, 255))
    d.arc([0.43 * W, 0.50 * H, 0.57 * W, 0.62 * H], 20, 160, fill=(27, 35, 56, 255), width=max(2, W // 100))
    return im


BASE = {'hero': js_frames('art-hero.js'), 'wizard': js_frames('art-wizard.js'),
        'cat': {**js_frames('art-cat.js'), **js_frames('art-cat-mischief.js')},
        'blob': {'front': with_face(body('art.js')), 'back': body('art.js')},
        'ghost': {'front': with_face(body('art-ghost.js')), 'back': body('art-ghost.js')}}
TARGET_H = {'hero': 160, 'wizard': 144, 'cat': 200, 'blob': 130, 'ghost': 160}
PIXEL = ('hero', 'wizard')


def render(char, p):
    base = BASE[char][p['key']]
    if char in PIXEL: k = TARGET_H[char] / p['fh']
    elif char == 'cat': k = TARGET_H[char] / 270
    else: k = TARGET_H[char] / 440
    pad = 30 if char in PIXEL else int(70 * k)
    bw, bh = int(base.width * k), int(base.height * k)
    W, H = bw + 2 * pad, bh + 2 * pad
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.alpha_composite(base.resize((bw, bh), Image.NEAREST if char in PIXEL else Image.LANCZOS), (pad, pad))
    for it in p['items']:
        im = ITEM[it['id']]
        w, h = max(1, round(it['w'] * k)), max(1, round(it['h'] * k))
        layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        sm = im.resize((w, h), Image.NEAREST)
        layer.paste(sm, (pad + round(it['x'] * k), pad + round(it['y'] * k)), sm)
        if it['rot']:
            layer = layer.rotate(-it['rot'], resample=Image.NEAREST, center=(pad + (it['x'] + it['ox']) * k, pad + (it['y'] + it['oy']) * k))
        canvas.alpha_composite(layer)
    return canvas


sheet_rows = []
for char, plist in data['placements'].items():
    if only and char not in only: continue
    by_key = {}
    for p in plist: by_key.setdefault(p['key'], []).append(p)
    for set_name in SETS:
        tiles = [(render(char, [q for q in v if q['set'] == set_name][0]), f"{char}/{k} {set_name}") for k, v in by_key.items()]
        sheet_rows.append((char, set_name, tiles))

layout, total_h, max_w = [], 0, 0
for char, set_name, tiles in sheet_rows:
    cols = 9 if char in PIXEL else 6
    cw, ch = max(t[0].width for t in tiles) + 6, max(t[0].height for t in tiles) + 18
    n = (len(tiles) + cols - 1) // cols
    layout.append((tiles, total_h, cols, cw, ch)); total_h += n * ch + 4; max_w = max(max_w, cols * cw)
sheet = Image.new('RGB', (max_w, total_h), (62, 66, 84))
d = ImageDraw.Draw(sheet)
for tiles, y0, cols, cw, ch in layout:
    for i, (im, label) in enumerate(tiles):
        x, y = (i % cols) * cw, y0 + (i // cols) * ch
        sheet.paste(im, (x + 3, y + 14), im)
        d.text((x + 4, y + 2), label, fill=(255, 255, 255))
out = os.path.join(ROOT, 'graphify-out', 'wardrobe-check.png' if not only else 'wardrobe-check-' + '-'.join(only) + '.png')
sheet.save(out); print('wrote', out, sheet.size)
