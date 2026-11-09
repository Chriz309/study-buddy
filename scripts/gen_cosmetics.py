"""Wardrobe cosmetics - generator for the 16-bit pixel-art costume items.

Draws every item procedurally on a tiny grid with a fixed palette (no external art), adds the same 1px dark
outline the buddies have (head and neck items; the face items are drawn with their own dark frame because an
outline would swallow a 5px lens), and writes:
  * src/renderer/art-cosmetics.js   window.COSMETIC_ART = { id: { src: "data:image/png;base64,...", w, h, ax, ay } }
        (1x, sampled NEAREST; ax/ay is the attach point in image pixels: head = bottom centre of the hat,
         face = midpoint of the eyes, neck = where the item hangs from the throat)
  * graphify-out/cosmetics-sheet.png   8x contact sheet for review (gitignored)

Face items are drawn for an eye spacing of 6 art pixels; the anchor table (src/renderer/cosmetics.js) scales them
per buddy so the lenses sit on that buddy's eyes. Needs only Pillow. Run from the repo root:
    python scripts/gen_cosmetics.py
    python scripts/gen_cosmetics.py --sheet-only
"""
import base64, io, math, os, sys
from PIL import Image, ImageDraw

PAL = {
    'K': (24, 14, 44),       # outline (same as Merlo)
    'a': (226, 62, 80),      # red
    'A': (158, 30, 56),      # red shade
    'W': (252, 252, 255),    # white
    'w': (196, 204, 232),    # white shade
    'Y': (255, 208, 64),     # gold
    'y': (200, 138, 22),     # gold shade
    'G': (255, 70, 120),     # ruby
    'U': (80, 190, 255),     # sapphire
    'p': (255, 112, 190),    # party pink
    'P': (255, 170, 214),    # pink light
    'q': (255, 226, 92),     # party yellow
    'c': (84, 214, 255),     # party cyan
    'F': (96, 204, 84),      # green
    'f': (52, 142, 62),      # green shade
    'N': (178, 236, 132),    # green light
    'M': (255, 122, 228),    # magenta
    'o': (255, 150, 60),     # orange
    'Z': (46, 40, 62),       # top hat black
    'z': (96, 90, 122),      # top hat shine
    'D': (44, 52, 96),       # grad cap navy
    'd': (24, 30, 64),       # grad cap shade
    'B': (92, 108, 176),     # grad cap light
    'E': (30, 20, 50),       # pupils
    'Q': (62, 40, 58),       # glasses frame
    'L': (205, 236, 255, 120),   # lens, see-through
    'l': (255, 255, 255, 230),   # lens glint
    'S': (255, 96, 150),     # pink
    'V': (92, 54, 168),      # star lens violet
    's': (255, 180, 70, 255),    # star glint orange
    'b': (255, 120, 150, 215),   # blush
    'T': (120, 200, 255),    # scarf ice blue
    'r': (150, 92, 214),     # scarf violet
}


class Cv:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.p = [[None] * w for _ in range(h)]

    def px(self, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.p[y][x] = c

    def get(self, x, y):
        return self.p[y][x] if 0 <= x < self.w and 0 <= y < self.h else None

    def rect(self, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1):
            for x in range(int(x0), int(x1) + 1):
                self.px(x, y, c)

    def ell(self, cx, cy, rx, ry, c):
        for y in range(self.h):
            for x in range(self.w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.p[y][x] = c

    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0), 1))
        for i in range(n + 1):
            self.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c)

    def rows(self, x0, y0, rows):
        """stamp ASCII rows ('.' = leave alone) at (x0, y0)"""
        for j, r in enumerate(rows):
            for i, ch in enumerate(r):
                if ch != '.':
                    self.px(x0 + i, y0 + j, ch)

    def outline(self):
        out = []
        for y in range(self.h):
            for x in range(self.w):
                if self.p[y][x] is None and any(self.get(x + dx, y + dy) is not None for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out.append((x, y))
        for x, y in out:
            self.p[y][x] = 'K'

    def image(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for y in range(self.h):
            for x in range(self.w):
                c = self.p[y][x]
                if c:
                    v = PAL[c]
                    im.putpixel((x, y), v if len(v) == 4 else v + (255,))
        return im


def padded(w, h):
    """canvas with a 1px margin for the outline; draw in 0-based item coordinates via ox/oy"""
    return Cv(w + 2, h + 2)


# Each builder draws into a Cv with a 1px margin (so item coordinate (0,0) is canvas (1,1)) and returns
# (cv, ax, ay) with the attach point in item coordinates. The margin is added back to the attach point below.

def shift(cv_fn):
    return cv_fn


def mk_beanie():
    c = padded(14, 11)
    o = 1
    c.ell(o + 6.5, o + 1.5, 2.3, 1.7, 'W'); c.px(o + 5, o + 2, 'w'); c.px(o + 8, o + 2, 'w'); c.px(o + 6, o + 0, 'w')
    c.ell(o + 6.5, o + 6.2, 5.6, 4.0, 'a')
    for x in (3, 6, 9):
        for y in range(3, 7):
            c.px(o + x, o + y, 'A')
    c.rect(o + 0, o + 7, o + 13, o + 10, 'W')
    for x in range(0, 14, 2):
        c.px(o + x, o + 8, 'w'); c.px(o + x + 1, o + 9, 'w')
    c.rect(o + 0, o + 10, o + 13, o + 10, 'w')
    return c, 7, 11


def mk_party_hat():
    c = padded(12, 14)
    o = 1
    for y in range(1, 13):
        half = 0.7 + y * 0.43
        for x in range(12):
            if abs(x - 5.5) <= half:
                stripe = ((x + y) // 3) % 2
                c.px(o + x, o + y, 'p' if stripe == 0 else 'q')
    c.rect(o + 0, o + 12, o + 11, o + 13, 'P')
    for x in range(0, 12, 2):
        c.px(o + x, o + 13, 'p')
    c.rows(o + 4, o + 0, ['.cc.', 'cWcc', 'cccc', '.cc.']); c.rect(o + 5, o + 3, o + 6, o + 3, 'c')
    return c, 6, 14


def mk_crown():
    c = padded(14, 9)
    o = 1
    c.rows(o, o, ['..Y...YY...Y..', '..YY..YY..YY..', '.YYY.YYYY.YYY.', '.YYYYYYYYYYYY.', '.YYYYYYYYYYYY.',
                  'YYYYYYYYYYYYYY', 'YYYYYYYYYYYYYY', 'YYYYYYYYYYYYYY', 'yyyyyyyyyyyyyy'])
    c.px(o + 2, o + 0, 'W'); c.px(o + 6, o + 0, 'W'); c.px(o + 11, o + 0, 'W'); c.px(o + 1, o + 5, 'W'); c.px(o + 2, o + 5, 'W')
    c.px(o + 3, o + 6, 'U'); c.px(o + 10, o + 6, 'U'); c.px(o + 6, o + 6, 'G'); c.px(o + 7, o + 6, 'G'); c.px(o + 6, o + 7, 'G'); c.px(o + 7, o + 7, 'G')
    for x in (1, 4, 9, 12):
        c.px(o + x, o + 7, 'y')
    return c, 7, 9


def mk_flower_crown():
    c = padded(16, 8)
    o = 1
    for x in range(16):
        y = 5 + round(-1.4 * (1 - ((x - 7.5) / 7.5) ** 2))
        c.px(o + x, o + y + 1, 'F'); c.px(o + x, o + y + 2, 'f')
    for fx, fy, col in ((2, 4, 'M'), (5, 3, 'W'), (8, 2, 'o'), (11, 3, 'W'), (14, 4, 'M')):
        for dx, dy in ((0, -1), (-1, 0), (1, 0), (0, 1)):
            c.px(o + fx + dx, o + fy + dy, col)
        c.px(o + fx, o + fy, 'Y')
    for lx, ly in ((3, 5), (6, 4), (10, 4), (13, 5)):
        c.px(o + lx, o + ly, 'N')
    return c, 8, 8


def mk_top_hat():
    c = padded(14, 13)
    o = 1
    c.rect(o + 3, o + 0, o + 10, o + 10, 'Z')
    c.rect(o + 0, o + 10, o + 13, o + 11, 'Z')
    c.rect(o + 3, o + 7, o + 10, o + 8, 'a')
    c.px(o + 3, o + 8, 'A'); c.px(o + 10, o + 8, 'A')
    for y in range(1, 7):
        c.px(o + 4, o + y, 'z')
    c.px(o + 1, o + 10, 'z'); c.px(o + 2, o + 10, 'z')
    c.rect(o + 0, o + 12, o + 13, o + 12, 'Z')
    return c, 7, 13


def mk_chef_hat():
    c = padded(14, 13)
    o = 1
    c.ell(o + 3.8, o + 4.4, 3.4, 3.2, 'W'); c.ell(o + 7, o + 3.3, 3.6, 3.2, 'W'); c.ell(o + 10.2, o + 4.4, 3.4, 3.2, 'W')
    c.rect(o + 2, o + 5, o + 11, o + 9, 'W')
    c.rect(o + 3, o + 9, o + 10, o + 12, 'W')
    for x in (5, 8):
        for y in range(3, 12):
            c.px(o + x, o + y, 'w') if y > 6 else None
    c.rect(o + 3, o + 12, o + 10, o + 12, 'w')
    c.px(o + 5, o + 2, 'w'); c.px(o + 9, o + 3, 'w'); c.px(o + 2, o + 5, 'w'); c.px(o + 11, o + 5, 'w')
    return c, 7, 13


def mk_frog_hat():
    c = padded(14, 10)
    o = 1
    c.ell(o + 6.5, o + 6.0, 6.2, 3.6, 'F')
    c.ell(o + 3.2, o + 2.8, 2.2, 2.0, 'F'); c.ell(o + 9.8, o + 2.8, 2.2, 2.0, 'F')
    c.rect(o + 2, o + 3, o + 4, o + 4, 'W'); c.rect(o + 9, o + 3, o + 11, o + 4, 'W')
    c.px(o + 3, o + 3, 'E'); c.px(o + 3, o + 4, 'E'); c.px(o + 10, o + 3, 'E'); c.px(o + 10, o + 4, 'E')
    c.rect(o + 2, o + 7, o + 11, o + 9, 'N')
    for x in range(3, 11):
        c.px(o + x, o + 7, 'f')
    c.px(o + 3, o + 8, 'P'); c.px(o + 10, o + 8, 'P'); c.px(o + 6, o + 5, 'f'); c.px(o + 8, o + 5, 'f')
    return c, 7, 10


def mk_grad_cap():
    c = padded(16, 10)
    o = 1
    c.rect(o + 4, o + 4, o + 11, o + 8, 'D')
    c.rect(o + 4, o + 8, o + 11, o + 8, 'd')
    for y, (x0, x1) in enumerate(((6, 9), (3, 12), (0, 15), (3, 12), (6, 9))):
        c.rect(o + x0, o + y, o + x1, o + y, 'D')
    for x in range(1, 15):
        c.px(o + x, o + 2, 'B') if x < 9 else None
    c.px(o + 7, o + 0, 'B'); c.px(o + 8, o + 0, 'B'); c.px(o + 4, o + 1, 'B'); c.px(o + 5, o + 1, 'B')
    c.px(o + 8, o + 2, 'Y'); c.px(o + 9, o + 2, 'Y')
    c.line(o + 9, o + 2, o + 14, o + 3, 'Y')
    c.rect(o + 14, o + 4, o + 14, o + 6, 'Y'); c.rect(o + 13, o + 7, o + 15, o + 8, 'y'); c.px(o + 14, o + 7, 'Y')
    return c, 8, 9


def mk_round_glasses():
    c = Cv(11, 5)
    for x0 in (0, 6):
        c.rows(x0, 0, ['.QQQ.', 'QLLLQ', 'QLLLQ', 'QLLLQ', '.QQQ.'])
        c.px(x0 + 1, 1, 'l')
    c.px(5, 1, 'Q')
    return c, 5.5, 2.5


def mk_star_shades():
    c = Cv(11, 5)
    star = ['..V..', '.VVV.', 'VVVVV', '.VVV.', '.V.V.']
    for x0 in (0, 6):
        c.rows(x0, 0, star)
        c.px(x0 + 2, 1, 'W'); c.px(x0 + 1, 2, 'P')
    c.px(5, 1, 'p'); c.px(5, 2, 'p')
    return c, 5.5, 2.5


def mk_monocle():
    c = Cv(7, 11)
    c.rows(0, 0, ['.YYY.', 'YLLLY', 'YLLLY', 'YLLLY', '.YYY.'])
    c.px(1, 1, 'l')
    for x, y in ((4, 5), (5, 6), (5, 7), (4, 8), (4, 9), (5, 10)):
        c.px(x, y, 'y')
    return c, -0.5, 2.5


def mk_blush():
    c = Cv(12, 2)
    for x0 in (0, 9):
        c.rows(x0, 0, ['bbb', 'bbb'])
    return c, 6, -2


def mk_bow_tie():
    c = padded(9, 6)
    o = 1
    rows = ['aa.....aa', 'aaaAAAaaa', 'aaaAAAaaa', 'aa.....aa']
    c.rows(o, o + 1, rows)
    c.px(o + 1, o + 2, 'A'); c.px(o + 7, o + 2, 'A')
    return c, 4.5, 3.5


def mk_scarf():
    c = padded(13, 9)
    o = 1
    c.rect(o + 0, o + 0, o + 12, o + 2, 'T')
    for x in range(0, 13, 4):
        c.rect(o + x, o + 0, o + min(x + 1, 12), o + 2, 'r')
    c.rect(o + 8, o + 3, o + 10, o + 7, 'T')
    for y in (4, 5):
        c.rect(o + 8, o + y, o + 10, o + y, 'r')
    for x in (8, 10):
        c.px(o + x, o + 8, 'r')
    c.px(o + 9, o + 8, 'T')
    return c, 6.5, 1.5


def mk_gold_medal():
    c = padded(8, 13)
    o = 1
    c.line(o + 0, o + 0, o + 3, o + 4, 'a'); c.line(o + 1, o + 0, o + 4, o + 4, 'a')
    c.line(o + 7, o + 0, o + 4, o + 4, 'A'); c.line(o + 6, o + 0, o + 3, o + 4, 'A')
    c.ell(o + 3.5, o + 8.5, 3.4, 3.4, 'Y')
    c.ell(o + 3.5, o + 8.5, 2.2, 2.2, 'y')
    c.ell(o + 3.5, o + 8.5, 1.6, 1.6, 'Y')
    c.px(o + 3, o + 8, 'W'); c.px(o + 4, o + 9, 'q')
    c.px(o + 1, o + 6, 'W')
    return c, 4.0, 1.0


# id -> (slot, builder, outline)
ITEMS = [
    ('beanie', 'head', mk_beanie, True), ('party_hat', 'head', mk_party_hat, True), ('crown', 'head', mk_crown, True),
    ('flower_crown', 'head', mk_flower_crown, True), ('top_hat', 'head', mk_top_hat, True), ('chef_hat', 'head', mk_chef_hat, True),
    ('frog_hat', 'head', mk_frog_hat, True), ('grad_cap', 'head', mk_grad_cap, True),
    ('round_glasses', 'face', mk_round_glasses, False), ('star_shades', 'face', mk_star_shades, False),
    ('monocle', 'face', mk_monocle, False), ('blush', 'face', mk_blush, False),
    ('bow_tie', 'neck', mk_bow_tie, True), ('scarf', 'neck', mk_scarf, True), ('gold_medal', 'neck', mk_gold_medal, True),
]


def build_all():
    out = {}
    for iid, slot, fn, outline in ITEMS:
        cv, ax, ay = fn()
        if outline:
            cv.outline()
            ax, ay = ax + 1, ay + 1      # the 1px outline margin shifts the attach point
        out[iid] = (cv.image(), ax, ay, slot)
    return out


def write_sheet(path, items, scale=8):
    cell_w, cell_h, cols = 18 * scale, 18 * scale, 5
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * cell_w, rows * (cell_h + 14)), (40, 44, 60))
    d = ImageDraw.Draw(sheet)
    for k, (iid, (im, ax, ay, slot)) in enumerate(items.items()):
        x0, y0 = (k % cols) * cell_w, (k // cols) * (cell_h + 14)
        for yy in range(0, cell_h, scale):          # checker
            for xx in range(0, cell_w, scale):
                if ((xx + yy) // scale) % 2 == 0:
                    d.rectangle([x0 + xx, y0 + yy, x0 + xx + scale - 1, y0 + yy + scale - 1], fill=(52, 56, 74))
        ox, oy = x0 + (cell_w - im.width * scale) // 2, y0 + (cell_h - im.height * scale) // 2
        big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        sheet.paste(big, (ox, oy), big)
        cx, cy = ox + int(ax * scale), oy + int(ay * scale)
        d.line([cx - 6, cy, cx + 6, cy], fill=(255, 60, 60), width=1); d.line([cx, cy - 6, cx, cy + 6], fill=(255, 60, 60), width=1)
        d.text((x0 + 4, y0 + cell_h), f'{iid} {slot} {im.width}x{im.height}', fill=(230, 230, 240))
    sheet.save(path)


def write_js(path, items):
    lines = ['// GENERATED by scripts/gen_cosmetics.py - Wardrobe cosmetic items (1x pixel art, sampled with NEAREST). Do not edit by hand.',
             '// ax/ay: attach point in image pixels (head = bottom centre of the hat, face = midpoint of the eyes, neck = where it hangs from the throat).',
             'window.COSMETIC_ART = {']
    for iid, (im, ax, ay, slot) in items.items():
        buf = io.BytesIO(); im.save(buf, 'PNG', optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        lines.append(f'  {iid}: {{ slot: "{slot}", w: {im.width}, h: {im.height}, ax: {ax}, ay: {ay}, src: "data:image/png;base64,{b64}" }},')
    lines.append('};')
    with open(path, 'w', encoding='utf8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    items = build_all()
    os.makedirs(os.path.join(root, 'graphify-out'), exist_ok=True)
    write_sheet(os.path.join(root, 'graphify-out', 'cosmetics-sheet.png'), items)
    if '--sheet-only' not in sys.argv:
        write_js(os.path.join(root, 'src', 'renderer', 'art-cosmetics.js'), items)
    print('cosmetics:', ', '.join(items))


if __name__ == '__main__':
    main()
