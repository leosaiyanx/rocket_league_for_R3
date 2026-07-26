#!/usr/bin/env python3
"""Draw the app icons (no source art needed).

    python3 tools/make_icons.py
"""
import math
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "icons")
os.makedirs(OUT, exist_ok=True)

BG_TOP = (12, 18, 40)
BG_BOT = (4, 6, 16)
ORANGE = (255, 138, 60)
GOLD = (255, 210, 74)
BLUE = (61, 165, 255)
CYAN = (140, 230, 255)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_icon(size, maskable=False):
    S = size * 4                      # supersample, then downscale
    img = Image.new("RGB", (S, S), BG_BOT)
    d = ImageDraw.Draw(img, "RGBA")

    # background gradient
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(BG_TOP, BG_BOT, y / S))

    # glow behind everything
    cx, cy = S * 0.5, S * 0.56
    for r in range(int(S * 0.46), 0, -max(1, S // 220)):
        t = r / (S * 0.46)
        a = int(46 * (1 - t) ** 2)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(60, 120, 220, a))

    pad = S * (0.20 if maskable else 0.10)
    inner = S - pad * 2

    # pitch ellipse
    d.ellipse([pad * 0.7, cy - inner * 0.20, S - pad * 0.7, cy + inner * 0.30],
              fill=(18, 58, 42, 235), outline=(120, 235, 180, 190), width=max(2, S // 150))

    # ball: hexed sphere, up and slightly left
    br = inner * 0.185
    bx, by = S * 0.40, cy - inner * 0.30
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=(244, 248, 255))

    def pentagon(px, py, pr, rot):
        pts = [(px + math.cos(rot + i * 2 * math.pi / 5) * pr,
                py + math.sin(rot + i * 2 * math.pi / 5) * pr) for i in range(5)]
        d.polygon(pts, fill=(34, 42, 62))

    pentagon(bx, by, br * 0.34, -math.pi / 2)                 # centre panel
    for k in range(5):                                        # ring of panels,
        a = -math.pi / 2 + k * 2 * math.pi / 5                # kept apart so the
        pentagon(bx + math.cos(a) * br * 0.70,                # white seams show
                 by + math.sin(a) * br * 0.70,
                 br * 0.235, a + math.pi / 2)
    d.ellipse([bx - br, by - br, bx + br, by + br],
              outline=(150, 210, 255, 220), width=max(2, S // 190))

    # car: a chunky wedge, nose to the right
    w, h = inner * 0.52, inner * 0.20
    x0, y0 = S * 0.40, cy + inner * 0.06
    body = [
        (x0, y0 + h * 0.55), (x0 + w * 0.10, y0 - h * 0.30),
        (x0 + w * 0.62, y0 - h * 0.46), (x0 + w, y0 - h * 0.02),
        (x0 + w, y0 + h * 0.55),
    ]
    d.polygon(body, fill=BLUE)
    d.polygon([(x0 + w * 0.16, y0 - h * 0.26), (x0 + w * 0.56, y0 - h * 0.40),
               (x0 + w * 0.72, y0 - h * 0.10), (x0 + w * 0.20, y0 - h * 0.06)],
              fill=(20, 34, 58))
    d.polygon([(x0 + w * 0.04, y0 + h * 0.10), (x0 + w * 0.98, y0 + h * 0.10),
               (x0 + w * 0.98, y0 + h * 0.26), (x0 + w * 0.04, y0 + h * 0.26)],
              fill=ORANGE)
    for wx in (0.22, 0.80):
        wr = h * 0.42
        d.ellipse([x0 + w * wx - wr, y0 + h * 0.34 - wr,
                   x0 + w * wx + wr, y0 + h * 0.34 + wr], fill=(16, 17, 24))
        d.ellipse([x0 + w * wx - wr * 0.45, y0 + h * 0.34 - wr * 0.45,
                   x0 + w * wx + wr * 0.45, y0 + h * 0.34 + wr * 0.45], fill=ORANGE)

    # boost flame off the back
    for i, (sc, col) in enumerate([(1.0, (255, 190, 70, 210)), (0.62, (255, 240, 190, 235))]):
        fl = [(x0 + w * 0.02, y0 - h * 0.16), (x0 - w * (0.34 * sc), y0 + h * 0.06),
              (x0 + w * 0.02, y0 + h * 0.30)]
        d.polygon(fl, fill=col)

    # speed streaks
    for i in range(3):
        yy = cy - inner * 0.02 + i * inner * 0.10
        d.line([(S * 0.06, yy), (S * 0.06 + inner * (0.20 - i * 0.045), yy)],
               fill=(*CYAN, 170), width=max(2, S // 130))

    return img.resize((size, size), Image.LANCZOS)


for name, size, mask in [
    ("favicon-32.png", 32, False),
    ("icon-180.png", 180, False),
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-maskable-512.png", 512, True),
]:
    p = os.path.join(OUT, name)
    draw_icon(size, mask).save(p)
    print("wrote", p)
