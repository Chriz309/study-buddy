"""Captain Cram - generator for the 16-bit pixel-art sprite frames.

Draws every frame procedurally on a 40x40 grid with a fixed 16-colour palette (no external art),
adds a 1px outline around each silhouette, and writes:
  * src/renderer/art-hero.js   window.HERO_ART = { idle: "data:image/png;base64,...", ... }  (1x frames;
                               the renderer samples them with NEAREST so the pixels stay crisp at any size)
  * graphify-out/hero-sheet.png  contact sheet at 4x nearest-neighbour for review (gitignored)

Needs only Pillow (already used by the other sprite scripts). Run from the repo root:
    python scripts/gen_hero.py            # writes both outputs
    python scripts/gen_hero.py --sheet-only
"""
import base64, io, os, sys
from PIL import Image, ImageDraw

W = H = 40
PAL = {
    'K': (27, 18, 38),     # outline
    'S': (244, 189, 145),  # skin
    's': (217, 143, 102),  # skin shade
    'H': (90, 52, 24),     # hair
    'h': (122, 74, 36),    # hair highlight
    'B': (47, 107, 216),   # suit blue
    'b': (31, 69, 160),    # suit shade
    'l': (110, 168, 255),  # suit highlight
    'R': (214, 40, 57),    # cape / boots / trunks red
    'r': (142, 21, 38),    # red shade
    'p': (255, 90, 106),   # red highlight
    'Y': (255, 210, 63),   # gold: belt, gloves, emblem
    'y': (201, 143, 16),   # gold shade
    'W': (255, 255, 255),  # eyes / glint
    'M': (20, 32, 79),     # mask
}


class Cv:
    def __init__(self):
        self.p = [[None] * W for _ in range(H)]

    def px(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.p[y][x] = c

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, c)

    def get(self, x, y):
        return self.p[y][x] if 0 <= x < W and 0 <= y < H else None

    def outline(self):
        out = [[None] * W for _ in range(H)]
        for y in range(H):
            for x in range(W):
                if self.p[y][x] is None and any(self.get(x + dx, y + dy) is not None for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out[y][x] = 'K'
        for y in range(H):
            for x in range(W):
                if out[y][x]:
                    self.p[y][x] = 'K'

    def image(self):
        im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for y in range(H):
            for x in range(W):
                c = self.p[y][x]
                if c:
                    im.putpixel((x, y), PAL[c] + (255,))
        return im


def mirror(cv_fn):
    """not used: kept simple - frames draw both sides explicitly"""
    return cv_fn


# ---------------------------------------------------------------- shared parts
def cape_back(c, sway=0, y0=19, y1=33, top=0):
    """Cape seen from the front, flaring out behind the shoulders. sway shifts the hem sideways."""
    for y in range(y0, y1 + 1):
        t = (y - y0) / (y1 - y0)
        half = 10 + int(round(t * 3.2))
        shift = int(round(sway * t * 2.4))
        l, r = 20 - half + shift, 19 + half + shift
        for x in range(l, r + 1):
            col = 'R'
            if x <= l + 1 or x >= r - 1:
                col = 'r'
            elif x in (l + 3, r - 3):
                col = 'p'
            c.px(x, y + top, col)
    # scalloped hem
    for x in range(20 - 13 + int(round(sway * 2.4)), 19 + 13 + int(round(sway * 2.4)) + 1):
        if (x % 3) == 0:
            c.px(x, y1 + 1 + top, 'r')


def head_front(c, dy=0, eye='open', mouth='smile'):
    """10x11 head, hair + quiff, domino mask. dy = vertical offset."""
    c.rect(16, 7 + dy, 23, 7 + dy, 'H')                   # hair top
    c.rect(15, 8 + dy, 24, 10 + dy, 'H')
    c.rect(18, 6 + dy, 21, 6 + dy, 'H'); c.px(21, 6 + dy, 'h'); c.px(22, 7 + dy, 'h'); c.px(17, 8 + dy, 'h')
    c.rect(15, 11 + dy, 24, 16 + dy, 'S')                 # face
    c.rect(16, 17 + dy, 23, 17 + dy, 'S')                 # chin
    c.rect(15, 11 + dy, 15, 15 + dy, 'S'); c.px(15, 11 + dy, 'H'); c.px(24, 11 + dy, 'H')
    c.rect(15, 12 + dy, 24, 13 + dy, 'M')                 # mask band
    c.px(14, 12 + dy, 'M'); c.px(25, 12 + dy, 'M')
    if eye == 'open':          # white eyes with a dark pupil in the mask band
        for x0 in (17, 21):
            c.rect(x0, 12 + dy, x0 + 1, 13 + dy, 'W'); c.px(x0 + 1, 13 + dy, 'M')
    elif eye == 'blink':       # eyes shut: just the mask, plus a thin lid line
        for x0 in (17, 21):
            c.rect(x0, 13 + dy, x0 + 1, 13 + dy, 'W') if False else None
    elif eye == 'happy':       # ^ ^
        for x0 in (17, 21):
            c.px(x0, 13 + dy, 'W'); c.px(x0 + 1, 12 + dy, 'W'); c.px(x0 + 2, 13 + dy, 'W') if False else None
    # cheeks + mouth
    c.px(16, 15 + dy, 's'); c.px(23, 15 + dy, 's')
    if mouth == 'smile':
        c.rect(18, 15 + dy, 21, 15 + dy, 's'); c.px(17, 14 + dy, 's'); c.px(22, 14 + dy, 's')
    elif mouth == 'open':
        c.rect(18, 15 + dy, 21, 16 + dy, 'K'); c.rect(19, 16 + dy, 20, 16 + dy, 'p')
    elif mouth == 'flat':
        c.rect(19, 15 + dy, 20, 15 + dy, 's')
    c.rect(18, 17 + dy, 21, 17 + dy, 'Y') if False else None


def torso_front(c, dy=0):
    c.rect(14, 18 + dy, 25, 27 + dy, 'B')                 # chest + waist
    c.rect(14, 18 + dy, 14, 27 + dy, 'b'); c.rect(25, 18 + dy, 25, 27 + dy, 'b')
    c.rect(15, 19 + dy, 16, 22 + dy, 'l')                 # shoulder highlight
    c.rect(18, 18 + dy, 21, 18 + dy, 'Y')                 # cape clasp at the neck
    c.rect(16, 18 + dy, 17, 18 + dy, 'R'); c.rect(22, 18 + dy, 23, 18 + dy, 'R')
    # chest emblem: gold shield with a blue "C"
    ex, ey = 17, 20 + dy
    rows = ["YYYYYY", "YYCCYY", "YCYYYY", "YCYYYY", "YYCCYY", ".YYYY."]
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == 'Y': c.px(ex + i, ey + j, 'Y')
            elif ch == 'C': c.px(ex + i, ey + j, 'B')
    c.px(17, 20 + dy, 'y'); c.px(22, 20 + dy, 'y'); c.px(17, 25 + dy, 'y') if False else None
    # belt + trunks
    c.rect(14, 28 + dy, 25, 28 + dy, 'Y'); c.rect(19, 28 + dy, 20, 28 + dy, 'y')
    c.rect(14, 29 + dy, 25, 30 + dy, 'R'); c.rect(14, 29 + dy, 14, 30 + dy, 'r'); c.rect(25, 29 + dy, 25, 30 + dy, 'r')
    c.rect(19, 30 + dy, 20, 30 + dy, 'B') if False else None


def legs_front(c, apart=0, lift=0):
    """two legs + boots; apart widens the stance, lift raises the feet (air pose)."""
    for sx, (x0, x1) in enumerate(((15 - apart, 18 - apart), (21 + apart, 24 + apart))):
        c.rect(x0, 31 - lift, x1, 34 - lift, 'B'); c.px(x0, 31 - lift, 'b')
        c.rect(x0, 31 - lift, x0, 34 - lift, 'b') if sx == 0 else c.rect(x1, 31 - lift, x1, 34 - lift, 'b')
        c.rect(x0 - 1, 35 - lift, x1 + 1, 37 - lift, 'R')
        c.rect(x0 - 1, 35 - lift, x1 + 1, 35 - lift, 'Y')    # boot cuff
        c.rect(x0 - 1, 38 - lift, x1 + 1, 38 - lift, 'r')    # sole
        c.px(x0 - 1, 36 - lift, 'p') if sx == 0 else c.px(x1 + 1, 36 - lift, 'r')


def arm(c, x, y0, y1, glove_rows=3, shade_left=True):
    """vertical arm: 3 wide sleeve with a gold glove at the bottom"""
    c.rect(x, y0, x + 2, y1 - glove_rows, 'B')
    c.rect(x, y0, x, y1 - glove_rows, 'b') if shade_left else c.rect(x + 2, y0, x + 2, y1 - glove_rows, 'b')
    c.rect(x, y1 - glove_rows + 1, x + 2, y1, 'Y'); c.rect(x, y1, x + 2, y1, 'y')


# ---------------------------------------------------------------- frames
def f_idle(sway=0, eye='open'):
    c = Cv()
    cape_back(c, sway)
    legs_front(c)
    torso_front(c)
    arm(c, 11, 19, 27, 3, True); arm(c, 26, 19, 27, 3, False)
    head_front(c, 0, eye)
    c.outline(); return c


def f_happy():
    c = Cv()
    cape_back(c, 1, 19, 31)
    legs_front(c, 2, 2)
    torso_front(c, -1)
    # arms thrown up in a V (cheer)
    for i in range(7):
        c.rect(12 - i // 2 - 1, 18 - i - 0, 14 - i // 2 - 1, 18 - i, 'B') if i < 5 else None
    for i in range(6):
        c.rect(11 - i, 18 - i, 13 - i, 18 - i, 'B'); c.rect(26 + i, 18 - i, 28 + i, 18 - i, 'B')
    c.rect(4, 11, 7, 13, 'Y'); c.rect(32, 11, 35, 13, 'Y'); c.rect(4, 13, 7, 13, 'y'); c.rect(32, 13, 35, 13, 'y')
    head_front(c, -1, 'happy', 'open')
    c.outline(); return c


def f_flex():
    c = Cv()
    cape_back(c, 0, 19, 33)
    legs_front(c, 1)
    torso_front(c)
    # double bicep: upper arms out, forearms up
    c.rect(8, 19, 13, 22, 'B'); c.rect(26, 19, 31, 22, 'B')
    c.rect(8, 19, 13, 19, 'l'); c.rect(26, 19, 31, 19, 'l')
    c.rect(8, 13, 11, 19, 'B'); c.rect(28, 13, 31, 19, 'B')
    c.rect(8, 13, 8, 19, 'b'); c.rect(31, 13, 31, 19, 'b')
    c.rect(8, 9, 11, 13, 'Y'); c.rect(28, 9, 31, 13, 'Y'); c.rect(8, 13, 11, 13, 'y'); c.rect(28, 13, 31, 13, 'y')
    c.px(9, 15, 'l'); c.px(30, 15, 'l')                    # bicep glint
    head_front(c, 1, 'open', 'smile')
    c.outline(); return c


def side_head(c, x, y, eye='open'):
    """side view head facing right; (x,y) = top-left of a 10x10 box"""
    c.rect(x + 1, y, x + 8, y + 2, 'H'); c.rect(x, y + 1, x + 4, y + 7, 'H')          # hair, back of head
    c.px(x + 5, y - 1, 'H'); c.px(x + 6, y - 1, 'H'); c.px(x + 6, y - 2, 'h'); c.px(x + 3, y, 'h')   # quiff
    c.rect(x + 4, y + 3, x + 9, y + 8, 'S'); c.rect(x + 5, y + 9, x + 8, y + 9, 'S')   # face
    c.rect(x + 3, y + 3, x + 9, y + 4, 'M')                                             # mask
    if eye == 'open': c.rect(x + 7, y + 3, x + 8, y + 3, 'W'); c.px(x + 8, y + 4, 'W')
    else: c.rect(x + 7, y + 4, x + 8, y + 4, 'W')
    c.px(x + 10, y + 6, 'S')                                                            # nose
    c.rect(x + 7, y + 7, x + 8, y + 7, 's')                                             # mouth


def f_walk(i):
    c = Cv()
    bob = 1 if i in (1, 3) else 0
    # cape streaming back (left), flapping per frame
    flap = (0, 1, 2, 1)[i]
    for k, y in enumerate(range(18 + bob, 31 + bob)):
        t = k / 12
        x1 = 17 - int(t * 1)            # attaches at the shoulders
        x0 = 4 + int(t * 6) + flap * (1 if k > 4 else 0) - (flap if k > 7 else 0)
        for x in range(x0, x1 + 1):
            c.px(x, y, 'r' if (x == x0 or y == 18 + bob) else ('p' if x == x0 + 3 else 'R'))
    # legs
    legs = {0: (4, -4, 0, 0), 1: (0, 0, 2, 0), 2: (-4, 4, 0, 0), 3: (0, 0, 0, 2)}[i]   # (front dx, back dx, front lift, back lift)
    def leg(dx, lift, back):
        x = 18 + dx - (1 if back else 0)
        c.rect(x, 31 + bob, x + 3, 34 - lift + bob, 'b' if back else 'B')
        c.rect(x + (-1 if dx < 0 else 0), 35 - lift + bob, x + 4 + (1 if dx > 0 else 0), 37 - lift + bob, 'r' if back else 'R')
        c.rect(x + (-1 if dx < 0 else 0), 35 - lift + bob, x + 4 + (1 if dx > 0 else 0), 35 - lift + bob, 'y' if back else 'Y')
        c.rect(x + (-1 if dx < 0 else 0), 38 - lift + bob, x + 4 + (1 if dx > 0 else 0), 38 - lift + bob, 'r')
    leg(legs[1], legs[3], True)
    # torso
    c.rect(16, 19 + bob, 23, 27 + bob, 'B'); c.rect(16, 19 + bob, 16, 27 + bob, 'b')
    c.rect(18, 20 + bob, 22, 24 + bob, 'B')
    for j, row in enumerate(["YYYYY", "YCCYY", "YCYYY", "YCCYY", ".YYY."]):    # emblem (side)
        for k2, ch in enumerate(row):
            if ch == 'Y': c.px(19 + k2, 20 + bob + j, 'Y')
            elif ch == 'C': c.px(19 + k2, 20 + bob + j, 'B')
    c.rect(16, 28 + bob, 23, 28 + bob, 'Y'); c.rect(16, 29 + bob, 23, 30 + bob, 'R'); c.rect(16, 29 + bob, 16, 30 + bob, 'r')
    leg(legs[0], legs[2], False)
    # arms: swing opposite to the legs
    sw = (-3, 0, 3, 0)[i]
    c.rect(18 + sw, 20 + bob, 21 + sw, 25 + bob, 'B'); c.rect(18 + sw, 20 + bob, 18 + sw, 25 + bob, 'b')
    c.rect(18 + sw - (1 if sw < 0 else 0), 26 + bob, 21 + sw + (1 if sw > 0 else 0), 28 + bob, 'Y'); c.rect(18 + sw, 28 + bob, 21 + sw, 28 + bob, 'y')
    side_head(c, 15, 8 + bob)
    c.rect(18, 18 + bob, 19, 18 + bob, 'Y')
    c.outline(); return c


def f_fly():
    c = Cv()
    # long cape streaming behind (left), rippling
    for x in range(1, 16):
        t = (15 - x) / 14
        top = 15 + int(t * 2) + (1 if x % 4 < 2 else 0)
        bot = 24 - int(t * 1) + (2 if x % 5 < 2 else 0) + int(t * 2)
        for y in range(top, bot + 1):
            c.px(x, y, 'r' if (y in (top, bot) or x == 1) else ('p' if y == top + 2 and x % 2 else 'R'))
    # legs trailing behind, together
    c.rect(7, 19, 14, 21, 'B'); c.rect(7, 19, 14, 19, 'l'); c.rect(7, 21, 14, 21, 'b')
    c.rect(3, 18, 8, 22, 'R'); c.rect(3, 18, 3, 22, 'r'); c.rect(7, 18, 7, 22, 'Y')       # boots
    c.rect(11, 17, 16, 17, 'p')
    # torso horizontal
    c.rect(14, 16, 27, 23, 'B'); c.rect(14, 16, 27, 16, 'l'); c.rect(14, 23, 27, 23, 'b')
    c.rect(14, 22, 16, 23, 'R'); c.rect(14, 22, 16, 22, 'Y')                              # trunks + belt
    for j, row in enumerate(["YYYY", "YCCY", "YCYY", "YYYY"]):                            # emblem on the flank
        for k2, ch in enumerate(row):
            if ch == 'Y': c.px(19 + k2, 18 + j, 'Y')
            elif ch == 'C': c.px(19 + k2, 18 + j, 'B')
    # leading arm stretched out ahead + fist
    c.rect(26, 14, 34, 17, 'B'); c.rect(26, 14, 34, 14, 'l'); c.rect(33, 13, 37, 18, 'Y'); c.rect(33, 18, 37, 18, 'y'); c.px(37, 13, 'y')
    # trailing arm tucked on the flank
    c.rect(20, 23, 26, 24, 'b'); c.rect(25, 23, 27, 24, 'Y')
    # head, looking forward, slightly down
    c.rect(26, 15, 34, 24, 'S') if False else None
    side_head(c, 25, 14, 'open')
    c.outline(); return c


def f_land():
    """superhero 3-point landing: one fist + knee down, cape thrown up behind"""
    c = Cv()
    # cape flung up and back
    for k, y in enumerate(range(14, 31)):
        t = k / 16
        x0 = 6 + int(t * 3) - (2 if k % 5 == 0 else 0); x1 = 20 + int(t * 1)
        for x in range(x0, x1 + 1):
            c.px(x, y, 'r' if (x == x0 or y == 14) else ('p' if x == x0 + 3 and k % 2 == 0 else 'R'))
    for x in range(7, 20):
        if x % 3 == 0: c.px(x, 31, 'r')
    # back leg extended behind
    c.rect(9, 31, 17, 34, 'B'); c.rect(9, 31, 17, 31, 'l'); c.rect(9, 34, 17, 34, 'b')
    c.rect(5, 33, 10, 38, 'R'); c.rect(5, 38, 10, 38, 'r'); c.rect(9, 33, 9, 38, 'Y')
    # front leg: thigh forward, knee on ground
    c.rect(18, 29, 26, 33, 'B'); c.rect(18, 29, 26, 29, 'l'); c.rect(24, 30, 28, 36, 'B'); c.rect(24, 30, 24, 36, 'b')
    c.rect(22, 35, 31, 38, 'R'); c.rect(22, 35, 31, 35, 'Y'); c.rect(22, 38, 31, 38, 'r')
    # torso hunched forward
    c.rect(16, 21, 26, 30, 'B'); c.rect(16, 21, 26, 21, 'l'); c.rect(16, 30, 20, 30, 'R')
    c.rect(18, 29, 26, 29, 'Y') if False else None
    for j, row in enumerate(["YYYY", "YCCY", "YCYY", "YYYY"]):
        for k2, ch in enumerate(row):
            if ch == 'Y': c.px(19 + k2, 23 + j, 'Y')
            elif ch == 'C': c.px(19 + k2, 23 + j, 'B')
    # fist planted on the ground in front
    c.rect(26, 24, 29, 31, 'B'); c.rect(26, 24, 26, 31, 'b'); c.rect(27, 32, 32, 38, 'Y') if False else None
    c.rect(28, 32, 31, 36, 'B'); c.rect(28, 36, 33, 38, 'Y'); c.rect(28, 38, 33, 38, 'y')
    # other arm back for balance
    c.rect(12, 22, 17, 24, 'B'); c.rect(8, 22, 12, 25, 'Y')
    side_head(c, 24, 16, 'blink')
    c.outline(); return c


def f_sleep():
    """lying on his side, cape for a blanket, boots poking out, eyes shut"""
    c = Cv()
    # head on the left, hair, mask, closed eyes
    c.rect(4, 30, 13, 37, 'S'); c.rect(4, 29, 13, 31, 'H'); c.rect(3, 30, 6, 36, 'H'); c.px(10, 29, 'h')
    c.rect(4, 32, 13, 33, 'M'); c.rect(9, 33, 10, 33, 'W'); c.rect(6, 33, 7, 33, 'W') if False else None
    c.rect(9, 36, 11, 36, 's')
    # body under the cape
    c.rect(13, 29, 31, 38, 'R'); c.rect(13, 29, 31, 29, 'p'); c.rect(13, 38, 31, 38, 'r'); c.rect(13, 29, 13, 38, 'r')
    for x in range(14, 31, 3): c.rect(x, 33, x, 38, 'r')                                  # cape folds
    c.rect(13, 28, 18, 28, 'Y')                                                           # clasp
    # boots poking out
    c.rect(31, 33, 36, 38, 'R'); c.rect(31, 33, 36, 33, 'Y'); c.rect(31, 38, 36, 38, 'r'); c.rect(36, 33, 36, 38, 'r')
    # an arm resting on top of the blanket
    c.rect(14, 27, 20, 29, 'B'); c.rect(20, 27, 23, 29, 'Y')
    c.outline(); return c


FRAMES = [
    ('idle',        lambda: f_idle(0, 'open')),
    ('idle2',       lambda: f_idle(1, 'open')),
    ('idle_blink',  lambda: f_idle(0, 'blink')),
    ('idle2_blink', lambda: f_idle(1, 'blink')),
    ('walk1',       lambda: f_walk(0)),
    ('walk2',       lambda: f_walk(1)),
    ('walk3',       lambda: f_walk(2)),
    ('walk4',       lambda: f_walk(3)),
    ('fly',         f_fly),
    ('flex',        f_flex),
    ('land',        f_land),
    ('happy',       f_happy),
    ('sleep',       f_sleep),
]


def png_b64(im):
    b = io.BytesIO(); im.save(b, 'PNG', optimize=True); return base64.b64encode(b.getvalue()).decode('ascii')


def write_js(path, imgs):
    lines = ['// GENERATED by scripts/gen_hero.py - Captain Cram 16-bit frames (40x40, 1x; sampled with NEAREST). Do not edit by hand.', 'window.HERO_ART = {']
    for name, im in imgs:
        lines.append('  %s: "data:image/png;base64,%s",' % (name, png_b64(im)))
    lines.append('};')
    open(path, 'w', encoding='utf8').write('\n'.join(lines) + '\n')


def write_sheet(path, imgs, scale=4, cols=7):
    pad, label_h = 10, 14
    cell_w, cell_h = W * scale + pad, H * scale + pad + label_h
    rows = (len(imgs) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cell_w + pad, rows * cell_h + pad), (40, 44, 60, 255))
    d = ImageDraw.Draw(sheet)
    for i, (name, im) in enumerate(imgs):
        cx, cy = pad + (i % cols) * cell_w, pad + (i // cols) * cell_h
        # checkerboard so transparency / silhouette is readable
        for yy in range(0, H * scale, 8):
            for xx in range(0, W * scale, 8):
                col = (74, 80, 104, 255) if ((xx // 8 + yy // 8) % 2 == 0) else (62, 67, 90, 255)
                d.rectangle([cx + xx, cy + yy, cx + xx + 7, cy + yy + 7], fill=col)
        sheet.alpha_composite(im.resize((W * scale, H * scale), Image.NEAREST), (cx, cy))
        d.text((cx + 2, cy + H * scale + 2), name, fill=(235, 238, 250, 255))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert('RGB').save(path)


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    imgs = [(n, fn().image()) for n, fn in FRAMES]
    sheet_only = '--sheet-only' in sys.argv
    write_sheet(os.path.join(root, 'graphify-out', 'hero-sheet.png'), imgs)
    if not sheet_only:
        write_js(os.path.join(root, 'src', 'renderer', 'art-hero.js'), imgs)
    print('wrote %d frames' % len(imgs), 'colours:', len(PAL))


if __name__ == '__main__':
    main()
