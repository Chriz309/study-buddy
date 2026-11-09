"""Merlo the wizard - generator for the 16-bit pixel-art sprite frames + spell props.

Draws every frame procedurally on a 48x48 grid with a fixed palette (no external art), adds a 1px 'K' outline
around each silhouette, and writes:
  * src/renderer/art-wizard.js     window.WIZARD_ART = { idle: "data:image/png;base64,...", ... }  (1x, sampled NEAREST)
  * src/mischief/art-spells.js     window.SPELL_ART = { portal0: ..., cauldron0: ..., ... }          (1x props)
  * graphify-out/wizard-sheet.png, graphify-out/spells-sheet.png   4x contact sheets (gitignored)

Needs only Pillow. Run from the repo root:
    python scripts/gen_wizard.py
    python scripts/gen_wizard.py --sheet-only
"""
import base64, io, math, os, sys
from PIL import Image, ImageDraw

W = H = 48
CX = 22
PAL = {
    'K': (24, 14, 44),     # outline
    'h': (62, 46, 140),    # hat indigo
    'H': (38, 28, 96),     # hat dark
    'j': (104, 86, 186),   # hat / robe light
    'Y': (255, 208, 64),   # gold
    'y': (200, 138, 22),   # gold shade
    'S': (250, 200, 160),  # skin
    's': (222, 150, 120),  # skin shade
    'P': (255, 128, 140),  # cheek rose
    'W': (250, 250, 255),  # beard / eye glint
    'w': (196, 204, 232),  # beard shade
    'R': (84, 58, 164),    # robe
    'r': (52, 36, 112),    # robe shade
    'B': (122, 74, 38),    # boots
    't': (78, 46, 24),     # boot sole / wood dark
    'T': (160, 104, 52),   # staff wood
    'C': (96, 232, 255),   # crystal cyan
    'c': (36, 148, 224),   # crystal deep
    'V': (180, 112, 255),  # violet glow
    'L': (230, 255, 255),  # glow core
    'E': (30, 20, 50),     # eyes
    'F': (96, 204, 84),    # frog green
    'f': (52, 142, 62),    # frog shade
    'N': (178, 236, 132),  # frog belly
    'M': (255, 122, 228),  # magenta spark / potion
}


class Cv:
    def __init__(self, w=W, h=H, pal=PAL):
        self.w, self.h, self.pal = w, h, pal
        self.p = [[None] * w for _ in range(h)]
        self.fxl = []

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

    def brush(self, x, y, t, c):
        o = t // 2
        self.rect(round(x) - o, round(y) - o, round(x) - o + t - 1, round(y) - o + t - 1, c)

    def line(self, x0, y0, x1, y1, c, t=1):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(int(n) + 1):
            self.brush(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, t, c)

    def disc(self, cx, cy, r, c):
        for y in range(self.h):
            for x in range(self.w):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.p[y][x] = c

    def ell(self, cx, cy, rx, ry, c):
        for y in range(self.h):
            for x in range(self.w):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    self.p[y][x] = c

    def fx(self, x, y, c):
        self.fxl.append((int(round(x)), int(round(y)), c))

    def outline(self, col='K'):
        out = []
        for y in range(self.h):
            for x in range(self.w):
                if self.p[y][x] is None and any(self.get(x + dx, y + dy) is not None for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out.append((x, y))
        for x, y in out:
            self.p[y][x] = col
        return self

    def finish(self, outline=True):
        if outline:
            self.outline()
        for x, y, c in self.fxl:
            if 0 <= x < self.w and 0 <= y < self.h and self.p[y][x] is None:
                self.p[y][x] = c
        self.fxl = []
        return self

    def image(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for y in range(self.h):
            for x in range(self.w):
                c = self.p[y][x]
                if c:
                    im.putpixel((x, y), self.pal[c] + (255,))
        return im


# ---------------------------------------------------------------- wizard parts
BEARD = [4, 8, 9, 9, 8, 8, 7, 6, 6, 5, 4, 4, 3, 2, 1]   # half-width per row, rows y=22..36


def orb(c, x, y, r=3.3, glow=1):
    c.disc(x, y, r, 'c'); c.disc(x, y, r - 1.0, 'C')
    for yy in range(int(y - r) - 1, int(y + r) + 2):
        for xx in range(int(x - r) - 1, int(x + r) + 2):
            d = math.hypot(xx - x, yy - y)
            if d <= r and (xx - x) + (yy - y) > r * 0.55:
                c.px(xx, yy, 'V' if d > r - 1.2 else 'c')
    c.px(x - r * 0.4 - 0.5, y - r * 0.4 - 0.5, 'L'); c.px(x - r * 0.4 + 0.5, y - r * 0.4 - 0.5, 'L'); c.px(x - r * 0.4 - 0.5, y - r * 0.4 + 0.5, 'L')
    if glow >= 1:
        for a in (0, 90, 180, 270):
            d = r + 2
            c.fx(x + math.cos(math.radians(a)) * d, y + math.sin(math.radians(a)) * d, 'L')
    if glow >= 2:
        for yy in range(int(y - r - 5), int(y + r + 6)):
            for xx in range(int(x - r - 5), int(x + r + 6)):
                d = math.hypot(xx - x, yy - y)
                if r + 1 <= d <= r + 3.6 and (xx + yy) % 2 == 0:
                    c.fx(xx, yy, 'C' if d < r + 2.4 else 'V')
        for a in (45, 135, 225, 315):
            c.fx(x + math.cos(math.radians(a)) * (r + 4), y + math.sin(math.radians(a)) * (r + 4), 'M')
    if glow >= 3:
        for a in range(0, 360, 30):
            d = r + 6 + (a // 30) % 2
            c.fx(x + math.cos(math.radians(a)) * d, y + math.sin(math.radians(a)) * d, 'L' if (a // 30) % 2 else 'Y')


def staff(c, bx, by, tx, ty, glow=1, r=3.3):
    c.line(bx, by, tx, ty + 1, 'T', 2)
    c.line(bx + 1, by, tx + 1, ty + 1, 't', 1)
    c.rect(tx - 2, ty, tx + 1, ty, 'Y'); c.px(tx - 2, ty - 1, 'y'); c.px(tx + 1, ty - 1, 'y')
    orb(c, tx - 0.5, ty - 3.8, r, glow)


def limb(c, p0, p1, cuff=True, fist=False):
    x0, y0 = p0; x1, y1 = p1
    L = math.hypot(x1 - x0, y1 - y0) or 1
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    qx, qy = x1 - ux * 2.5, y1 - uy * 2.5
    c.line(x0, y0, qx, qy, 'r', 3)
    n = max(abs(qx - x0), abs(qy - y0), 1)
    for i in range(int(n) + 1):
        px_, py_ = x0 + (qx - x0) * i / n, y0 + (qy - y0) * i / n
        c.px(px_ - 1, py_ - 1, 'R'); c.px(px_, py_ - 1, 'R')
        if i % 3 == 0: c.px(px_ - 1, py_, 'j')
    if cuff:
        c.brush(qx, qy, 3, 'Y')
    if fist:
        c.rect(x1 - 1, y1 - 1, x1 + 1, y1 + 1, 'S'); c.px(x1 + 1, y1 + 1, 's')
    else:
        c.rect(x1 - 1, y1 - 1, x1, y1, 'S'); c.px(x1, y1, 's')


def robe(c, top):
    for y in range(top, 44):
        half = 8 + int(round((y - 27) * 3 / 16.0))
        for x in range(CX - half, CX + half + 1):
            col = 'R'
            if x >= CX + half - 1: col = 'r'
            elif x == CX - half + 1: col = 'j'
            elif 36 <= y < 42 and x in (CX - 4, CX + 4): col = 'r'
            c.px(x, y, col)
    for y in (42, 43):
        half = 8 + int(round((y - 27) * 3 / 16.0))
        for x in range(CX - half, CX + half + 1):
            c.px(x, y, 'Y' if y == 42 else 'y')
    for y in range(37, 42):
        c.px(CX, y, 'Y'); c.px(CX + 1, y, 'y')
    for (dx, y) in ((-6, 37), (6, 39)):                    # little gold plus stars
        for ox, oy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            if top <= y + oy:
                c.px(CX + dx + ox, y + oy, 'Y')
    for (dx, y) in ((6, 34), (-8, 41), (-7, 33), (8, 36), (4, 41), (-5, 40)):
        if top <= y:
            c.px(CX + dx, y, 'Y')


def boots(c, lx=14, rx=26, ll=0, rl=0):
    for x0, l in ((lx, ll), (rx, rl)):
        c.rect(x0, 44 - l, x0 + 5, 44 - l, 'B'); c.rect(x0, 45 - l, x0 + 5, 45 - l, 't')
        c.px(x0 + 1, 44 - l, 'j')


def beard(c, hx, hy, sway, L=14, mouth=None):
    cx = CX + hx
    for k in range(L + 1):
        half = BEARD[int(round(k * 14.0 / L))]
        y = 22 + hy + k
        sh = int(round(sway * 2.2 * (k / 14.0) ** 1.4))
        for x in range(cx + sh - half, cx + sh + half + 1):
            c.px(x, y, 'w' if (x >= cx + sh + half - 1 and k > 0) else 'W')
    for k, a, b in ((4, -4, -2), (7, 1, 3), (10, -2, 0), (12, 0, 1)):
        if k <= L - 1:
            sh = int(round(sway * 2.2 * (k / 14.0) ** 1.4))
            for x in range(cx + sh + a, cx + sh + b + 1):
                c.px(x, 22 + hy + k, 'w')
    c.px(cx - 5, 23 + hy, 'w'); c.px(cx + 5, 23 + hy, 'w')
    if mouth == 'open':
        c.rect(cx - 1, 24 + hy, cx + 2, 25 + hy, 'E'); c.rect(cx, 25 + hy, cx + 1, 25 + hy, 'P')
    elif mouth == 'smile':
        c.rect(cx, 24 + hy, cx + 1, 24 + hy, 'E')


def head(c, hx, hy, eyes='open'):
    x0 = CX + hx
    for y in range(16 + hy, 23 + hy):
        for x in range(x0 - 8, x0 + 9):
            if y == 22 + hy and abs(x - x0) > 6:
                continue
            c.px(x, y, 'S' if abs(x - x0) <= 6 else ('w' if abs(x - x0) == 8 else 'W'))
    for y in range(18 + hy, 22 + hy):
        c.px(x0 + 6, y, 's')
    c.rect(x0 - 6, 21 + hy, x0 - 5, 22 + hy, 'P'); c.rect(x0 + 5, 21 + hy, x0 + 6, 22 + hy, 'P')
    c.rect(x0, 20 + hy, x0 + 1, 21 + hy, 'P')
    for ex in (x0 - 3, x0 + 3):
        ey = 18 + hy
        if eyes == 'open':
            c.rect(ex, ey, ex + 1, ey + 2, 'E'); c.px(ex, ey, 'W')
        elif eyes == 'blink':
            c.rect(ex, ey + 2, ex + 1, ey + 2, 'E')
        elif eyes == 'happy':
            c.px(ex, ey + 2, 'E'); c.px(ex + 1, ey + 1, 'E'); c.px(ex + 2, ey + 2, 'E')
        elif eyes == 'wide':
            c.rect(ex - 1, ey - 1, ex + 2, ey + 3, 'W'); c.rect(ex, ey, ex + 1, ey + 2, 'E'); c.px(ex, ey, 'W')
        elif eyes == 'down':
            c.rect(ex - 1, ey + 1, ex + 2, ey + 1, 'E'); c.rect(ex, ey + 2, ex + 1, ey + 2, 'E')
        elif eyes == 'strain':
            if ex < x0:
                c.px(ex, ey + 1, 'E'); c.px(ex + 1, ey + 2, 'E'); c.px(ex, ey + 3, 'E')
            else:
                c.px(ex + 1, ey + 1, 'E'); c.px(ex, ey + 2, 'E'); c.px(ex + 1, ey + 3, 'E')


TIPS = {
    'flop':  [(6, 3), (7, 3), (8, 3), (9, 4), (10, 5), (10, 6)],
    'flop2': [(6, 3), (7, 3), (8, 4), (9, 5), (10, 7), (10, 8)],
    'up':    [(6, 3), (6, 2), (7, 2), (7, 1)],
}


def hat(c, hx, hy, tip='flop', moon=True):
    cx = CX + hx
    for y in range(4, 14):
        t = (13 - y) / 9.0
        half = int(round(8 * (1 - t) + 1.2)); ctr = cx + int(round(6 * t * t))
        for x in range(ctr - half, ctr + half + 1):
            col = 'h'
            if x == ctr - half: col = 'j'
            elif x >= ctr + half - 1: col = 'H'
            c.px(x, y + hy, col)
    for x in range(cx - 8, cx + 9):
        c.px(x, 12 + hy, 'Y'); c.px(x, 13 + hy, 'y')      # hat band
    for x in range(cx - 10, cx + 11):
        c.px(x, 14 + hy, 'j' if x < cx + 4 else 'h'); c.px(x, 15 + hy, 'h')
    for x in range(cx - 9, cx + 10):
        c.px(x, 16 + hy, 'H')
    c.px(cx - 11, 15 + hy, 'H'); c.px(cx + 11, 15 + hy, 'H')
    path = TIPS[tip]
    for i, (dx, dy) in enumerate(path):
        c.rect(cx + dx, dy + hy, cx + dx + 1, dy + hy + 1, 'h' if i < 4 else 'H')
    dx, dy = path[-1]
    c.rect(cx + dx, dy + hy, cx + dx + 2, dy + hy + 2, 'Y'); c.px(cx + dx + 2, dy + hy + 2, 'y')
    if moon:
        for ox, oy in ((1, 0), (2, 0), (0, 1), (0, 2), (1, 3), (2, 3)):
            c.px(cx - 1 + ox, 8 + hy + oy, 'Y')
        c.px(cx + 4, 10 + hy, 'Y'); c.px(cx - 4, 11 + hy, 'Y'); c.px(cx + 5, 7 + hy, 'Y')


def wiz(arms=None, back=None, front=None, hx=0, hy=0, sway=0, tip='flop', eyes='open', mouth=None, bt=(14, 26, 0, 0),
        L=14, hat_dy=0, hat_dx=0, robe_top=27, moon=True):
    c = Cv()
    if back: back(c)
    robe(c, robe_top)
    boots(c, *bt)
    if arms: arms(c)
    beard(c, hx, hy, sway, L, mouth)
    head(c, hx, hy, eyes)
    hat(c, hx + hat_dx, hy + hat_dy, tip, moon)
    if front: front(c)
    return c


def hold_staff_back(g=1, tx=37):
    return lambda c: staff(c, tx, 45, tx, 14, g)


def arms_idle(c, lsw=0):
    limb(c, (16, 31), (14 + lsw, 38)); limb(c, (28, 31), (35, 34))


# ---------------------------------------------------------------- frames
def f_idle(sway=0, eyes='open', tip='flop', hy=0, g=1):
    return wiz(arms_idle, hold_staff_back(g), hy=hy, sway=sway, eyes=eyes, tip=tip)


def f_walk(i):
    cfg = [dict(bt=(13, 26, 0, 1), hy=-1, hx=1, sway=1, ls=-3), dict(bt=(15, 25, 1, 0), hy=0, hx=0, sway=-1, ls=3)][i]
    def arms(c):
        limb(c, (16, 31), (14 + cfg['ls'], 38)); limb(c, (28, 31), (35, 34))
    return wiz(arms, lambda c: staff(c, 37, 45, 37, 14 - (1 if i == 0 else 0), 1), hx=cfg['hx'], hy=cfg['hy'], sway=cfg['sway'],
               bt=cfg['bt'], tip=('flop' if i else 'flop2'))


def f_cast():
    def arms(c):
        limb(c, (16, 31), (13, 37)); limb(c, (28, 31), (36, 31))
    return wiz(arms, lambda c: staff(c, 33, 44, 40, 17, 2, 3.6), hx=1, sway=-1, mouth='smile', eyes='open')


def f_cast2():
    def back(c):
        staff(c, 38, 35, 38, 12, 3, 4.0)
    def arms(c):
        limb(c, (28, 30), (37, 22)); limb(c, (16, 30), (8, 17))
        for (x, y) in ((6, 12), (4, 15), (10, 11), (7, 19)):
            c.fx(x, y, 'M'); c.fx(x - 1, y, 'V')
    return wiz(arms, back, mouth='open', eyes='wide', tip='up', sway=-1, bt=(13, 27, 0, 0))


def f_point():
    def back(c): staff(c, 6, 45, 6, 14, 1)
    def arms(c):
        limb(c, (16, 31), (8, 33)); limb(c, (28, 30), (41, 29))
        c.rect(41, 28, 43, 28, 'S')
        for (x, y, col) in ((46, 28, 'Y'), (45, 26, 'M'), (45, 30, 'M'), (44, 27, 'L'), (46, 27, 'L'), (44, 29, 'L')):
            c.fx(x, y, col)
        c.px(44, 28, 'L'); c.px(45, 28, 'Y')
    return wiz(arms, back, hx=1, eyes='open', mouth='smile')


def f_stir():
    def back(c):
        c.line(32, 25, 43, 42, 'T', 2); c.line(33, 25, 44, 42, 't', 1)
        c.disc(43.5, 43, 2.4, 't'); c.disc(43.5, 43, 1.4, 'T')
    def arms(c):
        limb(c, (28, 31), (35, 31), fist=True); limb(c, (16, 31), (13, 37))
    return wiz(arms, back, hx=2, hy=1, sway=-1, eyes='down', tip='flop2')


def f_drink():
    def back(c): staff(c, 6, 45, 6, 14, 1)
    def arms(c):
        limb(c, (16, 31), (8, 34)); limb(c, (29, 32), (32, 28))
    def front(c):
        c.rect(26, 23, 30, 29, 'M'); c.rect(26, 23, 30, 23, 'P'); c.rect(30, 24, 30, 29, 'pk' if False else 'P')
        c.rect(24, 20, 26, 22, 'T'); c.rect(23, 19, 24, 20, 'B'); c.px(25, 22, 'W'); c.px(27, 26, 'L'); c.px(27, 25, 'L'); c.px(28, 27, 'W')
        c.rect(30, 28, 32, 30, 'S'); c.px(32, 30, 's')
    return wiz(arms, back, front, eyes='blink', hx=-1, sway=1)


def f_read():
    def back(c):
        staff(c, 40, 41, 40, 11, 2)
    def front(c):
        x0, y0 = CX - 9, 33
        c.rect(x0, y0 + 7, x0 + 18, y0 + 8, 'r'); c.rect(x0 + 1, y0 + 8, x0 + 17, y0 + 8, 'H')
        for yy in range(y0, y0 + 8):
            off = 1 if yy in (y0, y0 + 1) else 0
            c.rect(x0 + off, yy, x0 + 8, yy, 'W'); c.rect(x0 + 10, yy, x0 + 18 - off, yy, 'W')
            c.px(x0 + 9, yy, 'r')
        for yy in (y0 + 2, y0 + 4, y0 + 6):
            c.rect(x0 + 2, yy, x0 + 7, yy, 'w'); c.rect(x0 + 11, yy, x0 + 16, yy, 'w')
        c.px(x0 + 14, y0 + 1, 'M'); c.px(x0 + 4, y0 + 1, 'C')
        c.rect(x0 - 1, y0 + 6, x0 - 1, y0 + 8, 'Y'); c.rect(x0 + 19, y0 + 6, x0 + 19, y0 + 8, 'Y')
        c.rect(x0 - 2, y0 + 5, x0, y0 + 7, 'S'); c.rect(x0 + 18, y0 + 5, x0 + 20, y0 + 7, 'S')
        c.px(x0 - 1, y0 + 7, 's'); c.px(x0 + 19, y0 + 7, 's')
    def arms(c):
        limb(c, (16, 31), (13, 38)); limb(c, (28, 31), (31, 38))
    return wiz(arms, back, front, eyes='down', hy=1, tip='flop2', L=11)


def f_happy():
    def back(c): staff(c, 39, 45, 39, 13, 3, 3.3)
    def arms(c):
        limb(c, (28, 30), (38, 19), fist=True); limb(c, (16, 30), (7, 19))
        for (x, y, col) in ((4, 10, 'Y'), (9, 6, 'M'), (43, 6, 'Y'), (45, 14, 'M'), (3, 25, 'C'), (44, 31, 'V'), (12, 3, 'C'), (28, 1, 'Y')):
            c.fx(x, y, col); c.fx(x, y + 1, col)
            if col != 'M': c.fx(x + 1, y, col)
    return wiz(arms, back, eyes='happy', mouth='open', bt=(11, 29, 0, 0), sway=1, hy=-1, tip='flop2')


def f_surprised():
    def back(c): staff(c, 38, 45, 38, 14, 1)
    def arms(c):
        limb(c, (16, 31), (7, 29)); limb(c, (28, 31), (36, 31))
        for (x, y) in ((6, 8), (4, 11), (3, 14), (41, 12), (43, 9), (44, 15), (1, 3), (1, 4), (1, 5), (1, 7)):
            c.fx(x, y, 'Y')
    return wiz(arms, back, eyes='wide', mouth='open', tip='up', sway=1, hy=0, bt=(13, 27, 0, 0))


def f_sleep():
    def back(c):
        c.line(26, 42, 38, 42, 'T', 2); c.line(26, 43, 38, 43, 't', 1)
        orb(c, 40.5, 41.5, 3.2, 1)
    def arms(c):
        c.rect(CX - 9, 40, CX - 4, 42, 'R'); c.rect(CX + 4, 40, CX + 9, 42, 'R')
    def front(c):
        for (x, y, s) in ((36, 22, 3), (40, 14, 3), (43, 8, 2)):
            for i in range(s):
                c.fx(x + i, y, 'C'); c.fx(x + i, y + s - 1, 'C')
            for i in range(1, s - 1):
                c.fx(x + s - 1 - i, y + i, 'C')
    return wiz(arms, back, front, hy=9, hat_dy=4, hat_dx=1, sway=0, eyes='none', L=8, robe_top=35, tip='flop2')


def f_pull():
    def back(c):
        c.line(40, 33, 47, 33, 't', 1)
    def arms(c):
        limb(c, (28, 31), (38, 31), fist=True); limb(c, (16, 33), (37, 36), fist=True)
    return wiz(arms, back, hx=-2, hy=1, sway=-1, eyes='strain', bt=(8, 29, 0, 0), tip='flop2')


def f_hang():
    def arms(c):
        limb(c, (13, 30), (5, 3), fist=True); limb(c, (31, 30), (39, 3), fist=True)
    return wiz(arms, None, eyes='wide', mouth='open', tip='up')


def f_fly():
    c = Cv()
    staff(c, 40, 41, 40, 13, 2)
    for y in range(24, 41):
        half = 7 + int(round((y - 24) * 4 / 16.0))
        for x in range(CX - half, CX + half + 1):
            col = 'R'
            if x >= CX + half - 1: col = 'r'
            elif x == CX - half + 1: col = 'j'
            c.px(x, y, col)
    for y in (38, 39):
        half = 7 + int(round((y - 24) * 4 / 16.0))
        for x in range(CX - half, CX + half + 1):
            c.px(x, y, 'Y' if y == 38 else 'y')
    for (dx, y) in ((-6, 33), (6, 35), (-7, 36), (4, 31)):
        c.px(CX + dx, y, 'Y')
    for yy in range(34, 38):
        c.px(CX, yy, 'Y')
    c.rect(CX - 7, 40, CX - 2, 41, 'B'); c.rect(CX - 7, 41, CX - 1, 41, 't')
    c.rect(CX + 1, 40, CX + 6, 41, 'B'); c.rect(CX, 41, CX + 6, 41, 't')
    limb(c, (15, 29), (12, 36)); limb(c, (29, 29), (33, 35))
    beard(c, 0, -3, 0, 12)
    head(c, 0, -3, 'happy')
    hat(c, 0, -3, 'flop2')
    for (x, y, col) in ((10, 43, 'C'), (16, 45, 'Y'), (24, 44, 'V'), (31, 45, 'C'), (37, 43, 'Y'), (28, 43, 'M'), (19, 43, 'L'), (16, 44, 'V'), (31, 44, 'V')):
        c.fx(x, y, col)
    return c


def f_frog():
    c = Cv()
    c.ell(CX, 40.5, 8.5, 5.5, 'F')
    c.ell(CX - 8, 42, 3.4, 3.6, 'F'); c.ell(CX + 8, 42, 3.4, 3.6, 'F')
    c.rect(CX - 13, 44, CX - 9, 45, 'F'); c.rect(CX + 9, 44, CX + 13, 45, 'F')
    c.rect(CX - 14, 45, CX - 8, 45, 'f'); c.rect(CX + 8, 45, CX + 14, 45, 'f')
    c.ell(CX, 42, 5.5, 3.5, 'N')
    for y in range(36, 46):
        for x in range(CX + 4, CX + 10):
            if c.get(x, y) == 'F' and x >= CX + 7 + (1 if y > 41 else 0):
                c.px(x, y, 'f')
    c.rect(CX - 6, 43, CX - 4, 45, 'F'); c.rect(CX + 4, 43, CX + 6, 45, 'F')
    c.rect(CX - 8, 45, CX - 4, 45, 'f'); c.rect(CX + 4, 45, CX + 8, 45, 'f')
    for ex in (CX - 5, CX + 5):
        c.disc(ex, 35, 2.8, 'F'); c.disc(ex, 35, 2.0, 'W'); c.rect(ex, 35, ex + 1, 36, 'E'); c.px(ex, 34, 'W')
    c.line(CX - 4, 40, CX + 4, 40, 'f', 1); c.px(CX - 5, 39, 'f'); c.px(CX + 5, 39, 'f')
    c.px(CX - 6, 40, 'P')
    for y in range(26, 36):
        t = (35 - y) / 9.0
        half = int(round(3.8 * (1 - t) + 0.6)); ctr = CX + int(round(2.5 * t * t))
        for x in range(ctr - half, ctr + half + 1):
            c.px(x, y, 'j' if x == ctr - half else ('H' if x >= ctr + half else 'h'))
    for x in range(CX - 4, CX + 5):
        c.px(x, 34, 'Y')
    for x in range(CX - 6, CX + 7):
        c.px(x, 35, 'h'); c.px(x, 36, 'H')
    c.px(CX - 7, 36, 'H'); c.px(CX + 7, 36, 'H')
    c.rect(CX + 2, 25, CX + 4, 26, 'h'); c.rect(CX + 4, 26, CX + 6, 27, 'H'); c.rect(CX + 5, 27, CX + 7, 29, 'Y')
    c.px(CX - 1, 30, 'Y'); c.px(CX, 30, 'Y'); c.px(CX - 1, 31, 'Y'); c.px(CX, 32, 'Y')
    for (x, y, col) in ((9, 30, 'Y'), (13, 26, 'M'), (35, 29, 'C'), (39, 36, 'V'), (7, 38, 'C'), (36, 24, 'Y'), (4, 34, 'M'), (40, 31, 'M')):
        for ox, oy in ((0, 0), (0, -1), (0, 1), (-1, 0), (1, 0)):
            c.fx(x + ox, y + oy, col)
    return c


FRAMES = [
    ('idle',      lambda: f_idle(0, 'open', 'flop', 0, 1)),
    ('idle2',     lambda: f_idle(1, 'open', 'flop2', 1, 2)),
    ('blink',     lambda: f_idle(0, 'blink', 'flop', 0, 1)),
    ('walk1',     lambda: f_walk(0)),
    ('walk2',     lambda: f_walk(1)),
    ('fly',       f_fly),
    ('cast',      f_cast),
    ('cast2',     f_cast2),
    ('point',     f_point),
    ('stir',      f_stir),
    ('drink',     f_drink),
    ('read',      f_read),
    ('happy',     f_happy),
    ('surprised', f_surprised),
    ('sleep',     f_sleep),
    ('frog',      f_frog),
    ('pull',      f_pull),
    ('hang',      f_hang),
]


# ---------------------------------------------------------------- spell props
SP = {
    'K': (24, 14, 44), 'k': (12, 8, 24),
    'p0': (38, 10, 84), 'p1': (104, 40, 196), 'p2': (200, 60, 220), 'p3': (255, 150, 240), 'rim': (160, 96, 255), 'rimL': (240, 200, 255), 'L': (255, 236, 255),
    'i': (58, 58, 72), 'I': (30, 30, 42), 'g': (120, 122, 142),
    'G': (84, 214, 84), 'g2': (170, 255, 120), 'G2': (40, 140, 60), 'bub': (214, 255, 200),
    'sm0': (244, 244, 252), 'sm1': (204, 208, 226), 'sm2': (150, 156, 184),
    'glass': (216, 236, 255), 'cork': (166, 112, 62), 'corkd': (104, 66, 34), 'wh': (255, 255, 255),
    'rd': (232, 48, 70), 'rdd': (160, 20, 44), 'rdl': (255, 130, 140),
    'bl': (56, 130, 240), 'bld': (28, 70, 170), 'bll': (140, 200, 255),
    'gr': (70, 200, 90), 'grd': (30, 130, 56), 'grl': (160, 255, 150),
    'pk': (255, 110, 200), 'pkd': (190, 56, 150), 'pkl': (255, 190, 235),
    'f0': (255, 255, 230), 'f1': (255, 220, 70), 'f2': (255, 140, 24), 'f3': (224, 48, 24), 'f4': (140, 20, 20),
    'cd0': (84, 92, 118), 'cd1': (56, 62, 86), 'cd2': (112, 122, 152), 'cw0': (255, 255, 255), 'cw1': (214, 224, 246), 'cw2': (172, 188, 224),
    'rb0': (240, 60, 70), 'rb1': (255, 150, 40), 'rb2': (255, 226, 70), 'rb3': (90, 210, 90), 'rb4': (70, 150, 250), 'rb5': (150, 90, 230),
    'ow': (134, 92, 56), 'owd': (88, 58, 34), 'owl': (214, 176, 126), 'ey': (255, 214, 60), 'be': (255, 150, 30),
    'bu': (252, 252, 255), 'bus': (214, 218, 238), 'bun': (255, 170, 200), 'bk': (40, 30, 54),
    'bkc': (96, 52, 160), 'bkd': (60, 30, 110), 'pg': (252, 244, 214), 'pgs': (214, 200, 160), 'gold': (255, 208, 64), 'goldd': (200, 138, 22),
    'st': (255, 224, 80), 'std': (214, 150, 20), 'fl': (255, 120, 190), 'fld': (214, 60, 140), 'fy': (255, 230, 80), 'fs': (70, 190, 70),
    'fg': (96, 204, 84), 'fgd': (52, 142, 62), 'fgl': (178, 236, 132), 'an': (100, 104, 124), 'and': (58, 60, 78), 'anl': (170, 176, 200),
    'du': (255, 220, 40), 'dud': (224, 160, 10), 'dub': (255, 130, 30), 'rg': (255, 214, 80), 'rgh': (255, 244, 170), 'rgg': (150, 100, 20),
}


def sc(w, h):
    return Cv(w, h, SP)


def portal(k):
    c = sc(48, 48)
    cx, cy, rx, ry = 23.5, 23.5, 17.5, 22.0
    for y in range(48):
        for x in range(48):
            dx, dy = (x - cx) / rx, (y - cy) / ry
            r = math.hypot(dx, dy)
            if r > 1.06:
                continue
            a = math.atan2(dy, dx)
            u = (3 * a / (2 * math.pi) + 1.5 * r - k / 4.0) % 1.0
            col = 'p0' if u < 0.3 else ('p1' if u < 0.55 else ('p2' if u < 0.8 else 'p3'))
            if r > 0.86:
                col = 'rim'
                if ((x * 7 + y * 3 + k * 5) % 11) == 0: col = 'rimL'
                if r > 1.0: col = 'K'
            elif r < 0.14: col = 'L'
            elif r < 0.3 and col == 'p0': col = 'k'
            c.p[y][x] = col
    for y in range(48):
        for x in range(48):
            if c.p[y][x] is None:
                r = math.hypot((x - cx) / rx, (y - cy) / ry)
                if 1.06 < r < 1.28 and (x + y + k) % 3 == 0:
                    c.fx(x, y, 'p1' if r < 1.17 else 'p2')
    for (a, rr) in ((k * 90 + 20, 1.2), (k * 90 + 140, 1.25), (k * 90 + 250, 1.18)):
        c.fx(cx + math.cos(math.radians(a)) * rx * rr, cy + math.sin(math.radians(a)) * ry * rr, 'L')
    return c.finish(False)


def cauldron(k):
    c = sc(32, 32)
    c.ell(16, 20, 14.5, 10.5, 'i')
    for y in range(32):
        for x in range(32):
            if c.p[y][x] == 'i':
                if y < 12: c.p[y][x] = None
                elif x >= 24 and ((x - 16) / 14.5) ** 2 + ((y - 20) / 10.5) ** 2 > 0.45: c.p[y][x] = 'I'
                elif y >= 27: c.p[y][x] = 'I'
    for y in range(14, 24):
        if c.get(7, y) == 'i' and y < 19: c.p[y][7] = 'g'
        if c.get(8, y) == 'i' and y < 18: c.p[y][8] = 'g'
    c.rect(6, 28, 9, 30, 'I'); c.rect(22, 28, 25, 30, 'I'); c.rect(14, 28, 17, 29, 'I')
    c.ell(16, 11, 14.5, 4.2, 'I'); c.ell(16, 11, 13.2, 3.4, 'i')
    c.ell(16, 11.4, 12.0, 2.8, 'G2'); c.ell(16, 11.4, 10.8, 2.2, 'G')
    for x in range(5, 28):
        if (x * 5 + k * 3) % 7 == 0: c.px(x, 11, 'g2')
    for (x, y) in ((2, 15), (2, 16), (1, 16), (29, 15), (29, 16), (30, 16)):
        c.px(x, y, 'I')
    bubs = [[(11, 11, 1), (19, 10, 1), (23, 12, 1), (15, 5, 1)],
            [(13, 12, 1), (21, 11, 1), (9, 10, 1), (18, 4, 2), (24, 7, 1)],
            [(15, 11, 1), (22, 10, 1), (11, 12, 1), (14, 3, 1), (21, 5, 2)]][k]
    for (x, y, r) in bubs:
        if y > 8:
            c.px(x, y, 'bub'); c.px(x + 1, y, 'g2'); c.px(x, y + 1, 'g2')
        else:
            c.disc(x, y, r + 0.5, 'G'); c.px(x, y - (1 if r > 1 else 0), 'bub')
    return c.finish(True)


def smoke():
    c = sc(16, 16)
    for (x, y, r, col) in ((6, 10, 4.5, 'sm1'), (10.5, 9, 3.8, 'sm1'), (8, 6, 4.2, 'sm1'), (6, 10, 3.4, 'sm0'), (10, 9, 2.8, 'sm0'), (8, 6, 3.2, 'sm0')):
        c.disc(x, y, r, col)
    c.px(6, 5, 'wh'); c.px(7, 5, 'wh'); c.px(5, 9, 'wh')
    for y in range(16):
        for x in range(16):
            if c.p[y][x] == 'sm1' and x + y > 20: c.p[y][x] = 'sm2'
    return c.finish(False)


def potion(b, d, l):
    c = sc(12, 16)
    c.rect(4, 0, 7, 1, 'cork'); c.rect(4, 1, 7, 1, 'corkd'); c.rect(5, 2, 6, 4, 'glass')
    c.disc(5.5, 10, 5.2, 'glass'); c.disc(5.5, 10.5, 4.3, b)
    for y in range(16):
        for x in range(12):
            if c.p[y][x] == b:
                if y < 8: c.p[y][x] = 'glass'
                elif x >= 8 or y >= 14: c.p[y][x] = d
    for x in range(2, 10):
        if c.get(x, 8) == b: c.p[8][x] = l
    c.px(3, 10, 'wh'); c.px(3, 11, 'wh'); c.px(4, 9, 'wh'); c.px(5, 3, 'wh')
    return c.finish(True)


def fireball(k):
    c = sc(16, 16)
    tail = [[(5, 8, 'f3'), (3, 7, 'f3'), (2, 9, 'f4'), (4, 5, 'f3'), (4, 11, 'f3')],
            [(5, 8, 'f3'), (3, 9, 'f3'), (2, 7, 'f4'), (4, 11, 'f3'), (4, 5, 'f3')]][k]
    for (x, y, col) in tail:
        c.disc(x, y, 1.6, col)
    c.line(5, 8, 1, 8 + (1 if k else -1), 'f4', 1)
    c.disc(10, 8, 5.2, 'f3'); c.disc(10, 8, 4.2, 'f2'); c.disc(10.4, 8, 3.0, 'f1'); c.disc(10.6, 8, 1.6, 'f0')
    c.px(10, 2 + k, 'f2'); c.px(14, 5 - k, 'f1')
    return c.finish(False)


def cloud(pal3):
    c = sc(48, 24)
    for (x, y, r) in ((11, 15, 7), (21, 11, 9), (32, 12, 8), (40, 16, 6), (24, 17, 7), (15, 17, 6)):
        c.disc(x, y, r, pal3[0])
    for y in range(24):
        for x in range(48):
            if c.p[y][x] and y > 20: c.p[y][x] = None
    for y in range(24):
        for x in range(48):
            if c.p[y][x]:
                if y >= 18 or (c.get(x, y + 1) is None and y >= 14): c.p[y][x] = pal3[1]
                elif c.get(x - 1, y - 1) is None or c.get(x, y - 1) is None: c.p[y][x] = pal3[2]
    return c.finish(False)


def rainbow():
    c = sc(64, 32)
    cols = ['rb0', 'rb1', 'rb2', 'rb3', 'rb4', 'rb5']
    for y in range(32):
        for x in range(64):
            r = math.hypot(x - 31.5, y - 31.5)
            if 18.5 <= r <= 31.5:
                c.p[y][x] = cols[min(5, int((31.5 - r) / 2.2))]
    for (x, y, r) in ((4, 29, 3), (9, 30, 3), (59, 29, 3), (54, 30, 3)):
        c.disc(x, y, r, 'cw0')
    for y in range(32):
        for x in range(64):
            if c.p[y][x] == 'cw0' and y >= 30: c.p[y][x] = 'cw1'
    return c.finish(False)


def owl(k):
    c = sc(24, 24)
    for sx in (-1, 1):
        for i in range(5):
            x = 12 + sx * (6 + i)
            if k == 0:
                c.rect(min(x, x + sx), 4 + i, max(x, x + sx), 14 - (i // 2), 'owd')
            else:
                c.rect(min(x, x + sx), 11 + i, max(x, x + sx), 19, 'owd')
    c.ell(12, 14, 6.5, 7.5, 'ow'); c.ell(12, 15.5, 4, 5.2, 'owl')
    c.ell(12, 9, 7, 5.2, 'ow'); c.rect(6, 3, 7, 5, 'ow'); c.rect(16, 3, 17, 5, 'ow'); c.px(6, 3, 'owd'); c.px(17, 3, 'owd')
    for ex in (9, 15):
        c.disc(ex, 9, 2.6, 'owl'); c.disc(ex, 9, 1.9, 'ey'); c.px(ex, 9, 'bk'); c.px(ex, 10, 'bk'); c.px(ex - 1, 8, 'wh')
    c.px(12, 11, 'be'); c.px(12, 12, 'be')
    for y in range(13, 19):
        for x in range(10, 15):
            if c.p[y][x] == 'owl' and (x + y) % 3 == 0: c.p[y][x] = 'pgs'
    c.rect(9, 21, 11, 21, 'be'); c.rect(13, 21, 15, 21, 'be')
    return c.finish(True)


def bunny():
    c = sc(16, 20)
    for ex in (5, 10):
        c.ell(ex, 4.5, 1.8, 4.6, 'bu'); c.ell(ex, 4.5, 0.8, 3.2, 'bun')
    c.ell(7.5, 12, 5.0, 4.6, 'bu')
    c.ell(8, 17, 5.2, 3.2, 'bu'); c.disc(13, 17.5, 1.7, 'wh')
    c.px(5, 11, 'bk'); c.px(5, 12, 'bk'); c.px(10, 11, 'bk'); c.px(10, 12, 'bk'); c.px(7, 13, 'bun'); c.px(8, 13, 'bun')
    c.px(4, 14, 'bun'); c.px(11, 14, 'bun')
    for y in range(20):
        for x in range(16):
            if c.p[y][x] == 'bu' and (x >= 11 or y >= 18): c.p[y][x] = 'bus'
    return c.finish(True)


def book():
    c = sc(20, 16)
    c.rect(1, 12, 18, 14, 'bkd'); c.rect(2, 11, 17, 11, 'bkc')
    for y in range(2, 12):
        off = 1 if y < 4 else 0
        c.rect(2 + off, y, 9, y + 1, 'pg'); c.rect(10, y, 17 - off, y + 1, 'pg')
    c.rect(2, 10, 9, 11, 'pgs'); c.rect(10, 10, 17, 11, 'pgs')
    for yy in (4, 6, 8):
        c.rect(3, yy, 8, yy, 'pgs'); c.rect(11, yy, 16, yy, 'pgs')
    c.px(13, 3, 'gold'); c.px(5, 3, 'gold'); c.px(14, 3, 'gold')
    c.rect(9, 1, 10, 12, 'goldd')
    c.px(1, 12, 'gold'); c.px(18, 12, 'gold')
    c.rect(1, 13, 18, 13, 'bkc')
    return c.finish(True)


def star():
    c = sc(8, 8)
    for (x, y) in ((3, 0), (4, 0), (3, 1), (4, 1), (0, 3), (1, 3), (2, 3), (3, 3), (4, 3), (5, 3), (6, 3), (7, 3), (1, 2), (2, 2), (5, 2), (6, 2),
                   (1, 4), (2, 4), (3, 4), (4, 4), (5, 4), (6, 4), (2, 5), (3, 5), (4, 5), (5, 5), (1, 6), (2, 6), (5, 6), (6, 6), (3, 2), (4, 2)):
        c.px(x, y, 'st')
    for (x, y) in ((5, 4), (6, 4), (5, 5), (5, 6), (6, 6), (4, 5), (6, 3)):
        c.px(x, y, 'std')
    c.px(3, 2, 'wh'); c.px(3, 1, 'wh')
    return c.finish(True)


def flower():
    c = sc(8, 8)
    for (x, y) in ((3, 0), (4, 0), (2, 1), (5, 1), (1, 2), (6, 2), (2, 3), (5, 3), (3, 4), (4, 4), (1, 1), (6, 1), (1, 3), (6, 3), (0, 2), (7, 2),
                   (3, 1), (4, 1), (2, 2), (5, 2), (3, 3), (4, 3)):
        c.px(x, y, 'fl')
    c.px(3, 2, 'fy'); c.px(4, 2, 'fy')
    for (x, y) in ((3, 5), (4, 5), (3, 6), (4, 6), (3, 7), (5, 6)):
        c.px(x, y, 'fs')
    c.px(1, 1, 'fld'); c.px(6, 3, 'fld')
    return c.finish(False)


def frog_small():
    c = sc(16, 12)
    c.ell(8, 8, 6.5, 3.6, 'fg'); c.ell(8, 9, 3.6, 2.2, 'fgl')
    c.rect(1, 10, 4, 11, 'fg'); c.rect(11, 10, 14, 11, 'fg'); c.rect(1, 11, 4, 11, 'fgd'); c.rect(11, 11, 14, 11, 'fgd')
    for ex in (4, 11):
        c.disc(ex, 4, 2.2, 'fg'); c.disc(ex, 4, 1.5, 'wh'); c.px(ex, 4, 'bk'); c.px(ex, 5, 'bk')
    c.rect(5, 7, 10, 7, 'fgd')
    for y in range(12):
        for x in range(16):
            if c.p[y][x] == 'fg' and x >= 12 and y > 6: c.p[y][x] = 'fgd'
    return c.finish(True)


def anvil():
    c = sc(16, 12)
    c.rect(0, 1, 15, 4, 'an'); c.rect(14, 2, 15, 3, 'an')
    c.rect(0, 1, 15, 1, 'anl')
    c.rect(4, 5, 11, 7, 'an'); c.rect(2, 8, 13, 10, 'an'); c.rect(1, 10, 14, 11, 'and')
    c.rect(11, 2, 15, 4, 'and'); c.rect(9, 5, 11, 7, 'and'); c.rect(11, 8, 13, 10, 'and')
    c.rect(2, 2, 6, 2, 'anl')
    return c.finish(True)


def duck():
    c = sc(14, 12)
    c.ell(6, 8, 5.2, 3.2, 'du'); c.disc(9, 4, 3.2, 'du')
    c.px(13, 5, 'dub'); c.px(12, 5, 'dub'); c.px(12, 6, 'dub')
    c.px(9, 3, 'bk')
    c.ell(5, 8, 2.3, 1.5, 'dud'); c.px(4, 7, 'du')
    c.px(2, 6, 'du'); c.px(1, 6, 'du'); c.px(2, 5, 'du')
    for y in range(12):
        for x in range(14):
            if c.p[y][x] == 'du' and y >= 10: c.p[y][x] = 'dud'
    return c.finish(True)


def rune(k):
    c = sc(16, 16)
    g = [[(8, 2, 8, 13), (8, 5, 13, 2), (8, 9, 12, 6)],
         [(4, 2, 4, 13), (4, 2, 11, 7), (11, 7, 4, 12), (11, 3, 11, 7)],
         [(4, 3, 8, 7), (8, 7, 12, 3), (8, 7, 8, 13), (4, 10, 12, 10)]][k]
    for yy in range(16):
        for xx in range(16):
            d = min(math.hypot(xx - (x0 + (x1 - x0) * t / 20.0), yy - (y0 + (y1 - y0) * t / 20.0)) for (x0, y0, x1, y1) in g for t in range(21))
            if 1.2 < d < 2.8 and (xx + yy + k) % 2 == 0:
                c.fx(xx, yy, 'rgg')
    for (x0, y0, x1, y1) in g:
        c.line(x0, y0, x1, y1, 'rg', 1)
    for (x0, y0, x1, y1) in g:
        c.px(x0, y0, 'rgh'); c.px(x1, y1, 'rgh')
    return c.finish(False)


SPELLS = []
for _k in range(4):
    SPELLS.append(('portal%d' % _k, (lambda k=_k: portal(k))))
for _k in range(3):
    SPELLS.append(('cauldron%d' % _k, (lambda k=_k: cauldron(k))))
SPELLS += [
    ('smoke', smoke),
    ('potion_red', lambda: potion('rd', 'rdd', 'rdl')),
    ('potion_blue', lambda: potion('bl', 'bld', 'bll')),
    ('potion_green', lambda: potion('gr', 'grd', 'grl')),
    ('potion_pink', lambda: potion('pk', 'pkd', 'pkl')),
    ('fireball0', lambda: fireball(0)), ('fireball1', lambda: fireball(1)),
    ('cloud', lambda: cloud(('cd0', 'cd1', 'cd2'))),
    ('cloud_white', lambda: cloud(('cw0', 'cw1', 'cw2'))),
    ('rainbow', rainbow),
    ('owl0', lambda: owl(0)), ('owl1', lambda: owl(1)),
    ('bunny', bunny), ('book', book), ('star', star), ('flower', flower), ('frog_small', frog_small),
    ('anvil', anvil), ('duck', duck),
    ('rune0', lambda: rune(0)), ('rune1', lambda: rune(1)), ('rune2', lambda: rune(2)),
]


# ---------------------------------------------------------------- output
def png_b64(im):
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return base64.b64encode(b.getvalue()).decode('ascii')


def write_js(path, imgs, head, open_line, close_line):
    lines = [head, open_line]
    for name, im in imgs:
        lines.append('  %s: "data:image/png;base64,%s",' % (name, png_b64(im)))
    lines.append(close_line)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf8').write('\n'.join(lines) + '\n')


def write_sheet(path, imgs, scale=4, cols=6, cell=None, footline=False):
    pad, label_h = 10, 14
    cw = max(im.width for _, im in imgs); ch = max(im.height for _, im in imgs)
    if cell:
        cw, ch = cell
    cell_w, cell_h = cw * scale + pad, ch * scale + pad + label_h
    rows = (len(imgs) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w + pad, rows * cell_h + pad), (40, 44, 60, 255))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(imgs):
        cx, cy = pad + (i % cols) * cell_w, pad + (i // cols) * cell_h
        for yy in range(0, ch * scale, 8):
            for xx in range(0, cw * scale, 8):
                col = (74, 80, 104, 255) if ((xx // 8 + yy // 8) % 2 == 0) else (62, 67, 90, 255)
                d.rectangle([cx + xx, cy + yy, cx + xx + 7, cy + yy + 7], fill=col)
        sheet.alpha_composite(im.resize((im.width * scale, im.height * scale), Image.NEAREST), (cx, cy + (ch - im.height) * scale))
        if footline:
            d.line([cx, cy + 46 * scale, cx + cw * scale, cy + 46 * scale], fill=(255, 80, 80, 255))
        d.text((cx + 2, cy + ch * scale + 2), '%s %dx%d' % (name, im.width, im.height), fill=(235, 238, 250, 255))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert('RGB').save(path)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    wimgs = [(n, fn().finish().image()) for n, fn in FRAMES]
    simgs = [(n, fn().image()) for n, fn in SPELLS]
    write_sheet(os.path.join(root, 'graphify-out', 'wizard-sheet.png'), wimgs, 4, 6, footline=True)
    write_sheet(os.path.join(root, 'graphify-out', 'spells-sheet.png'), simgs, 4, 6, (64, 48))
    if '--sheet-only' not in sys.argv:
        write_js(os.path.join(root, 'src', 'renderer', 'art-wizard.js'), wimgs,
                 '// GENERATED by scripts/gen_wizard.py - Merlo the wizard 16-bit frames (48x48, 1x; sampled with NEAREST). Do not edit by hand.',
                 'window.WIZARD_ART = {', '};')
        write_js(os.path.join(root, 'src', 'mischief', 'art-spells.js'), simgs,
                 '// GENERATED by scripts/gen_wizard.py - spell prop sprites (1x, transparent). Do not edit by hand.',
                 '(function (r) { r.SPELL_ART = {', "}; })(typeof window !== 'undefined' ? window : globalThis);")
    print('wrote %d wizard frames, %d spell props; wizard colours: %d' % (len(wimgs), len(simgs), len(PAL)))


if __name__ == '__main__':
    main()
