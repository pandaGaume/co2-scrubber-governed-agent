"""
The opening scene, drawn pixel by pixel: night 9 of 14 on the Moon, the
habitat on its batteries, the crew asleep, one lit window where the
assistant's console glows. Eighteen colours, no anti-aliasing, 1990s
cutscene rules (dithered bands, hard shadows, one light source: the Earth).

    python dashboard/art/moon-night.py          -> dashboard/moon-night.png       448 x 200, the home page
    python dashboard/art/moon-night.py --card   -> dashboard/moon-night-card.png  1280 x 720, the video's title card

The card is the same scene on a wider canvas (640 x 360, written at 2x),
with the mission strip and the message box burned in, lettered with the
5 x 7 bitmap font below. No dependency beyond the standard library; the PNG
is written by hand.
"""
import math
import random
import struct
import sys
import zlib
from pathlib import Path

CARD = "--card" in sys.argv

# The scene is laid out in a 448 x 200 frame. The card keeps that frame at
# an offset inside a 640 x 360 canvas; the sky, the ground and the stars
# fill the whole canvas, the objects keep their places.
if CARD:
    W, H, OX, OY, SCALE = 640, 360, 96, 80, 2
else:
    W, H, OX, OY, SCALE = 448, 200, 0, 0, 1

# The dashboard palette, plus the few colours the Moon and the Earth need.
C = {
    "sky": (13, 15, 28),
    "sky2": (20, 24, 48),
    "well": (10, 12, 22),
    "panel": (27, 33, 56),
    "btn": (36, 43, 73),
    "far": (43, 51, 88),
    "mid": (59, 68, 112),
    "near": (74, 86, 128),
    "muted": (125, 134, 168),
    "dim": (168, 176, 204),
    "text": (232, 230, 216),
    "ok": (76, 224, 122),
    "okdark": (47, 154, 82),
    "warn": (255, 176, 59),
    "deny": (255, 77, 77),
    "agent": (79, 216, 255),
    "agent2": (155, 238, 255),
    "ocean": (47, 127, 224),
}

px = [[C["sky"]] * W for _ in range(H)]

# Frame coordinates: the scene's 448 x 200 frame, offset on the canvas.
X0, X1 = -OX, W - OX  # the canvas, in frame coordinates
Y0, Y1 = -OY, H - OY


def put(x, y, c):
    x += OX
    y += OY
    if 0 <= x < W and 0 <= y < H:
        px[y][x] = c


def rect(x0, y0, x1, y1, c):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            put(x, y, c)


def dither(x0, y0, x1, y1, c, phase=0):
    """Checkerboard fill: the 1990s way to blend two bands."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if (x + y + phase) % 2 == 0:
                put(x, y, c)


def ellipse(cx, cy, rx, ry, c):
    for y in range(cy - ry, cy + ry + 1):
        for x in range(cx - rx, cx + rx + 1):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                put(x, y, c)


def disc(cx, cy, r, c):
    ellipse(cx, cy, r, r, c)


def line(x0, y0, x1, y1, c):
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        put(x0, y0, c)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def crater(cx, cy, rx, ry, floor, rim, shadow):
    """A crater lit from the upper right (the Earth): bright rim on the far side, shadow inside near it."""
    ellipse(cx, cy, rx, ry, rim)
    ellipse(cx, cy + 1, rx - 1, ry - 1, floor)
    ellipse(cx + 1, cy, rx - 2, max(1, ry - 2), shadow)
    ellipse(cx - 1, cy + 1, rx - 3, max(1, ry - 3), floor)


def rock(cx, cy, rx, ry):
    ellipse(cx, cy, rx, ry, C["mid"])
    ellipse(cx, cy - 1, rx - 1, ry - 1, C["near"])
    ellipse(cx + 1, cy - 1, max(1, rx - 3), max(1, ry - 2), C["muted"])
    ellipse(cx - 1, cy + 1, max(1, rx - 3), max(1, ry - 2), C["far"])


rng = random.Random(9)

# ── Sky ─────────────────────────────────────────────────────────────────────
rect(X0, 100, X1, 125, C["sky2"])
dither(X0, 92, X1, 100, C["sky2"])
for _ in range(140 * (W * 112 + W * OY) // (448 * 112)):
    x, y = rng.randrange(X0, X1), rng.randrange(Y0, 112)
    r = rng.random()
    if r < 0.70:
        put(x, y, C["far"])
    elif r < 0.92:
        put(x, y, C["muted"])
    else:
        put(x, y, C["text"])
        if rng.random() < 0.5:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                put(x + dx, y + dy, C["far"])

# ── The Earth, nearly full at night 9 ──────────────────────────────────────
EX, EY, ER = 404, 38, 22
disc(EX, EY, ER, C["ocean"])
for (cx, cy, rx, ry) in ((394, 32, 7, 5), (410, 46, 6, 4), (402, 50, 4, 3), (416, 28, 5, 6)):
    ellipse(cx, cy, rx, ry, C["okdark"])
    ellipse(cx - 1, cy - 1, max(1, rx - 2), max(1, ry - 2), C["ok"])
for (cx, cy, rx, ry) in ((398, 22, 6, 1), (388, 38, 4, 1), (408, 36, 5, 1), (396, 54, 7, 1), (414, 52, 3, 1), (404, 28, 3, 1)):
    ellipse(cx, cy, rx, ry, C["text"])
    ellipse(cx + rx // 2, cy - 1, max(1, rx - 3), 1, C["text"])
for _ in range(14):
    a = rng.random() * math.tau
    d = rng.random() * (ER - 3)
    put(int(EX + d * math.cos(a)), int(EY + d * math.sin(a)), C["text"])
# the terminator: the last slice of night on the right limb
for y in range(EY - ER, EY + ER + 1):
    half = int(math.sqrt(max(0, ER * ER - (y - EY) ** 2)))
    for x in range(EX + half - 4, EX + half + 1):
        if (x - EX) ** 2 + (y - EY) ** 2 <= ER * ER:
            put(x, y, C["well"] if x >= EX + half - 2 else C["panel"])
# a rim of atmosphere
for y in range(EY - ER - 1, EY + ER + 2):
    for x in range(EX - ER - 1, EX + ER + 2):
        d = math.hypot(x - EX, y - EY)
        if ER < d <= ER + 1 and x < EX + ER - 3:
            put(x, y, C["agent2"] if (x + y) % 2 else C["ocean"])


# ── The ground: three ridges, dithered seams ───────────────────────────────
def ridge(base, phase, s1, s2, x):
    return base + s1 * math.sin(x / 41.0) + s2 * math.sin(x / 13.0 + phase)


def peak(x, cx, half, height):
    return max(0.0, height * (1 - abs(x - cx) / half))


for x in range(X0, X1):
    y_far = int(ridge(120, 0.0, 7, 3, x) - peak(x, 330, 70, 24) - peak(x, 95, 40, 12) - peak(x, 250, 30, 6) - peak(x, -40, 50, 16) - peak(x, 520, 60, 20))
    y_mid = int(ridge(141, 1.2, 5, 2, x + 60))
    y_near = int(ridge(158, 2.3, 3, 1.5, x + 130))
    for y in range(y_far, Y1):
        put(x, y, C["far"])
    for y in range(y_mid, Y1):
        put(x, y, C["mid"])
    for y in range(y_near, Y1):
        put(x, y, C["near"])
    # dithered seams, and the Earth's light on the crest of the far ridge
    if (x + y_far) % 2 == 0:
        put(x, y_far, C["muted"])
    for k in (1, 2):
        if (x + y_mid + k) % 2 == 0:
            put(x, y_mid + k, C["far"])
        if (x + y_near + k) % 2 == 0:
            put(x, y_near + k, C["mid"])

for (cx, cy, rx, ry, floor, rim, shadow) in (
    (60, 168, 22, 7, C["mid"], C["muted"], C["far"]),
    (400, 178, 18, 6, C["mid"], C["muted"], C["far"]),
    (300, 190, 12, 4, C["mid"], C["muted"], C["far"]),
    (150, 190, 9, 3, C["mid"], C["muted"], C["far"]),
    (250, 128, 14, 3, C["far"], C["muted"], C["panel"]),
    # only on the card's wider ground
    (-50, 232, 26, 8, C["mid"], C["muted"], C["far"]),
    (500, 240, 20, 6, C["mid"], C["muted"], C["far"]),
    (210, 258, 30, 8, C["mid"], C["muted"], C["far"]),
    (-70, 150, 10, 3, C["mid"], C["muted"], C["far"]),
    (490, 165, 12, 4, C["mid"], C["muted"], C["far"]),
):
    crater(cx, cy, rx, ry, floor, rim, shadow)
for _ in range(60 * (W * (Y1 - 156)) // (448 * 44)):
    x, y = rng.randrange(X0, X1), rng.randrange(156, Y1)
    put(x, y, C["muted"] if rng.random() < 0.4 else C["mid"])

# ── The dead solar array, far left: no sun for nine days ───────────────────
line(44, 152, 44, 118, C["muted"])
rect(40, 150, 48, 152, C["btn"])
for k in range(30):
    x = 26 + k
    top = 104 + k // 3
    for y in range(top, top + 14):
        put(x, y, C["btn"] if (k % 5 and (y - top) % 7) else C["panel"])
    put(x, top, C["muted"])
    put(x, top + 14, C["well"])
rect(42, 116, 46, 119, C["muted"])

# ── The habitat module ─────────────────────────────────────────────────────
MX0, MX1, MY0, MY1 = 130, 250, 100, 142
R = (MY1 - MY0) // 2
rect(MX0, MY0, MX1, MY1, C["dim"])
disc(MX0, MY0 + R, R, C["dim"])
disc(MX1, MY0 + R, R, C["dim"])
# shading: highlight band under the top, shadow band on the belly
rect(MX0 - R + 4, MY0 + 3, MX1 + R - 4, MY0 + 5, C["text"])
rect(MX0 - R + 2, MY1 - 9, MX1 + R - 2, MY1 - 6, C["muted"])
rect(MX0 - R + 4, MY1 - 5, MX1 + R - 4, MY1, C["far"])
for y in range(MY0 + 3, MY1 - 2):
    put(MX0 - R + 2, y, C["muted"])
    put(MX1 + R - 2, y, C["far"])
# ribs
for x in range(MX0 + 5, MX1, 24):
    line(x, MY0 + 1, x, MY1 - 1, C["muted"])
# windows: the assistant's console glows in the first, the crew sleeps behind the other two
for i, cx in enumerate((160, 192, 224)):
    disc(cx, 120, 8, C["muted"])
    disc(cx, 120, 6, C["well"])
    if i == 0:
        disc(cx, 120, 5, C["agent"])
        rect(cx - 3, 118, cx + 1, 119, C["agent2"])
        put(cx - 4, 116, C["agent2"])
# the scrubber unit on the roof, with its grille
rect(210, 90, 232, 100, C["muted"])
rect(212, 88, 230, 90, C["dim"])
for x in range(213, 230, 3):
    line(x, 92, x, 98, C["well"])
# the cupola: a dome of glass panes, the console glow inside it too
disc(172, 100, 12, C["muted"])
disc(172, 100, 10, C["well"])
rect(160, 100, 184, 103, C["dim"])
for x in range(163, 182, 6):
    line(x, 91, x, 99, C["muted"])
line(162, 95, 182, 95, C["muted"])
for x in range(166, 171):
    put(x, 92, C["text"])
put(165, 93, C["text"])
for (x, y) in ((172, 98), (173, 98), (174, 97), (175, 98)):
    put(x, y, C["agent"])
# the console light spills on the ground under the first window
for x in range(146, 176):
    for y in range(159, 163):
        if (x + y) % 2 == 0 and abs(x - 161) + 3 * abs(y - 161) < 16:
            put(x, y, C["agent"])
# legs and pads
for x in (MX0 - 6, MX0 + 40, MX1 - 40, MX1 + 6):
    rect(x - 1, MY1, x + 1, 158, C["muted"])
    rect(x - 4, 158, x + 4, 160, C["btn"])
# the airlock at the right end, its door, the lamp over it
rect(266, 114, 292, 142, C["muted"])
rect(268, 112, 290, 114, C["dim"])
rect(276, 122, 284, 140, C["btn"])
rect(277, 123, 283, 139, C["panel"])
put(282, 131, C["warn"])
rect(277, 106, 283, 108, C["btn"])
rect(278, 108, 282, 110, C["warn"])
for y in range(111, 142):
    k = y - 111
    for x in range(280 - 2 - k // 4, 280 + 3 + k // 4):
        if (x + y) % 2 == 0 and (x + y) % 4 == 0 and not (276 <= x <= 284 and 122 <= y <= 140):
            put(x, y, C["warn"] if y < 114 else C["dim"])
for x in range(262, 300):
    for y in range(143, 150):
        if (x + y) % 2 == 0 and abs(x - 281) + 4 * abs(y - 146) < 20:
            put(x, y, C["warn"])
# the antenna mast and the dish, aimed at the Earth
line(140, 100, 140, 62, C["muted"])
line(140, 62, 150, 54, C["dim"])
ellipse(152, 52, 6, 3, C["dim"])
line(146, 55, 158, 49, C["text"])
put(140, 61, C["deny"])
put(140, 60, C["deny"])

# ── The battery bank: 41 % ─────────────────────────────────────────────────
rect(300, 138, 342, 158, C["btn"])
rect(300, 138, 342, 139, C["near"])
rect(300, 138, 301, 158, C["near"])
rect(300, 157, 342, 158, C["well"])
rect(341, 138, 342, 158, C["well"])
for i in range(10):
    x = 304 + i * 4 - (1 if i > 4 else 0)
    rect(x, 143, x + 1, 153, C["ok"] if i < 4 else C["well"])
put(304, 141, C["ok"])
put(338, 141, C["deny"])

# ── The rover, parked for the night ────────────────────────────────────────
rect(368, 148, 412, 158, C["muted"])
rect(370, 146, 400, 148, C["dim"])
rect(404, 140, 410, 148, C["btn"])
rect(405, 141, 409, 145, C["well"])
for cx in (376, 392, 408):
    disc(cx, 160, 5, C["btn"])
    disc(cx, 160, 2, C["near"])
line(372, 146, 372, 132, C["muted"])
rect(369, 130, 375, 132, C["dim"])
put(372, 129, C["deny"])
for x in range(300, 366, 6):
    put(x, 165, C["far"])
    put(x + 1, 165, C["far"])
    put(x + 2, 171, C["far"])
    put(x + 3, 171, C["far"])

# ── Footprints from the airlock to the rover ───────────────────────────────
for i in range(9):
    x = 292 + i * 8
    y = 162 + (i % 2) * 3
    rect(x, y, x + 1, y + 2, C["far"])

# ── Foreground rocks ───────────────────────────────────────────────────────
for (cx, cy, rx, ry) in ((20, 186, 10, 5), (210, 194, 7, 3), (330, 192, 5, 2), (440, 184, 9, 4), (-30, 200, 12, 5), (480, 215, 8, 3), (120, 240, 14, 6), (380, 262, 10, 4), (-80, 262, 16, 6), (530, 250, 12, 5)):
    rock(cx, cy, rx, ry)

# ── The card: the mission strip and the message box, burned in ─────────────
# A 5 x 7 bitmap font, uppercase only, the way the dialogue boxes of the era were lettered.
FONT = {
    "A": ".###. #...# #...# ##### #...# #...# #...#",
    "B": "####. #...# #...# ####. #...# #...# ####.",
    "C": ".###. #...# #.... #.... #.... #...# .###.",
    "D": "####. #...# #...# #...# #...# #...# ####.",
    "E": "##### #.... #.... ####. #.... #.... #####",
    "F": "##### #.... #.... ####. #.... #.... #....",
    "G": ".###. #...# #.... #.### #...# #...# .####",
    "H": "#...# #...# #...# ##### #...# #...# #...#",
    "I": "##### ..#.. ..#.. ..#.. ..#.. ..#.. #####",
    "J": "..### ...#. ...#. ...#. ...#. #..#. .##..",
    "K": "#...# #..#. #.#.. ##... #.#.. #..#. #...#",
    "L": "#.... #.... #.... #.... #.... #.... #####",
    "M": "#...# ##.## #.#.# #.#.# #...# #...# #...#",
    "N": "#...# ##..# #.#.# #..## #...# #...# #...#",
    "O": ".###. #...# #...# #...# #...# #...# .###.",
    "P": "####. #...# #...# ####. #.... #.... #....",
    "Q": ".###. #...# #...# #...# #.#.# #..#. .##.#",
    "R": "####. #...# #...# ####. #.#.. #..#. #...#",
    "S": ".#### #.... #.... .###. ....# ....# ####.",
    "T": "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
    "U": "#...# #...# #...# #...# #...# #...# .###.",
    "V": "#...# #...# #...# #...# .#.#. .#.#. ..#..",
    "W": "#...# #...# #...# #.#.# #.#.# ##.## #...#",
    "X": "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
    "Y": "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..",
    "Z": "##### ....# ...#. ..#.. .#... #.... #####",
    "0": ".###. #...# #..## #.#.# ##..# #...# .###.",
    "1": "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.",
    "2": ".###. #...# ....# ...#. ..#.. .#... #####",
    "3": "##### ...#. ..#.. ...#. ....# #...# .###.",
    "4": "...#. ..##. .#.#. #..#. ##### ...#. ...#.",
    "5": "##### #.... ####. ....# ....# #...# .###.",
    "6": "..##. .#... #.... ####. #...# #...# .###.",
    "7": "##### ....# ...#. ..#.. .#... .#... .#...",
    "8": ".###. #...# #...# .###. #...# #...# .###.",
    "9": ".###. #...# #...# .#### ....# ...#. .##..",
    " ": "..... ..... ..... ..... ..... ..... .....",
    ".": "..... ..... ..... ..... ..... .##.. .##..",
    ",": "..... ..... ..... ..... .##.. ..#.. .#...",
    ":": "..... .##.. .##.. ..... .##.. .##.. .....",
    "%": "##..# ##.#. ...#. ..#.. .#... .#.## #..##",
    "|": "..#.. ..#.. ..#.. ..#.. ..#.. ..#.. ..#..",
    "'": ".##.. ..#.. .#... ..... ..... ..... .....",
    "-": "..... ..... ..... ##### ..... ..... .....",
    "?": ".###. #...# ....# ...#. ..#.. ..... ..#..",
    "!": "..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..",
}


def text(x, y, s, c, k=1):
    """Draws `s` with its top-left corner at (x, y), each glyph cell 6 x 8 times `k`."""
    for ch in s.upper():
        rows = FONT.get(ch, FONT["?"]).split()
        for r, row in enumerate(rows):
            for q, bit in enumerate(row):
                if bit == "#":
                    rect(x + q * k, y + r * k, x + q * k + k - 1, y + r * k + k - 1, c)
        x += 6 * k


def box(x0, y0, x1, y1):
    """A well with the dashboard's bevel: dark top-left, light bottom-right."""
    rect(x0, y0, x1, y1, C["well"])
    rect(x0, y0, x1, y0 + 1, C["panel"])
    rect(x0, y0, x0 + 1, y1, C["panel"])
    rect(x0, y1 - 1, x1, y1, C["near"])
    rect(x1 - 1, y0, x1, y1, C["near"])


if CARD:
    strip = "NIGHT 9 OF 14  |  LUNAR HABITAT  |  CREW 4  |  BATTERY 41 %"
    sx, sy = X0 + 12, Y0 + 12
    box(sx, sy, sx + len(strip) * 6 + 9, sy + 14)
    text(sx + 5, sy + 4, strip, C["warn"])

    bx0, by0, bx1, by1 = X0 + 12, Y1 - 76, X1 - 13, Y1 - 13
    box(bx0, by0, bx1, by1)
    text(bx0 + 10, by0 + 8, "02:40   INCOMING, FOR THE ASSISTANT", C["warn"])
    text(bx0 + 10, by0 + 20, "STOP THE SCRUBBER FOR TWENTY MINUTES.", C["text"], 2)
    text(bx0 + 10, by0 + 38, "THE PUMPS NEED THE POWER MARGIN.", C["text"], 2)
    for r in range(3):
        rect(bx1 - 14 + r, by1 - 9 + r, bx1 - 8 - r, by1 - 9 + r, C["agent"])


# ── Write the PNG ──────────────────────────────────────────────────────────
def png_chunk(kind, data):
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


rows = []
for row in px:
    scaled = bytes(v for p in row for v in (p,) * SCALE for v in v)
    rows.extend([b"\x00" + scaled] * SCALE)
raw = b"".join(rows)
out = Path(__file__).resolve().parent.parent / ("moon-night-card.png" if CARD else "moon-night.png")
out.write_bytes(
    b"\x89PNG\r\n\x1a\n"
    + png_chunk(b"IHDR", struct.pack(">IIBBBBB", W * SCALE, H * SCALE, 8, 2, 0, 0, 0))
    + png_chunk(b"IDAT", zlib.compress(raw, 9))
    + png_chunk(b"IEND", b"")
)
print(f"{out} {W * SCALE}x{H * SCALE}, {len(set(p for row in px for p in row))} colours")
