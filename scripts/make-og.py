#!/usr/bin/env python3
"""Generate the 1200x630 share image (og:image) for the dashboard.

Brand kit: ground #12100E, maroon #3A1420 glow, cream #EFE9E2 type,
magenta #E74079 accent (one italic phrase), Instrument Serif headlines,
Inter Tight body, mono for the address. The pixel-grid motif is drawn
as rounded squares in the kit's spirit (the kit's own mark files live
in the brand-kit gist, which we do not vendor).
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter

F = '/tmp/brk-fonts/'
SERIF = F + 'InstrumentSerif-Regular.ttf'
SERIF_IT = F + 'InstrumentSerif-Italic.ttf'
TIGHT_SB = F + 'InterTight-SemiBold.ttf'
MONO = F + 'IBMPlexMono-Regular.ttf'

W, H = 1200, 630
GROUND = (18, 16, 14)
MAROON = (58, 20, 32)
CREAM = (239, 233, 226)
PAPER = (255, 246, 232)
MUTED = (176, 167, 157)
MAGENTA = (231, 64, 121)
SALMON = (217, 160, 151)

img = Image.new('RGB', (W, H), GROUND)

# Maroon glow, top-right corner.
glow = Image.new('RGB', (W, H), (0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([620, -320, 1420, 420], fill=MAROON)
glow = glow.filter(ImageFilter.GaussianBlur(140))
img = Image.blend(img, Image.blend(img, glow, 0.85), 0.9)
d = ImageDraw.Draw(img, 'RGBA')

# Pixel-grid motif, top-left (4x4 rounded squares).
cell, gap, x0, y0 = 34, 8, 72, 64
pattern = [
    [CREAM, PAPER, MAGENTA, None],
    [PAPER, MAGENTA, CREAM, None],
    [MAGENTA, CREAM, PAPER, CREAM],
    [None, PAPER, CREAM, MAGENTA],
]
for r in range(4):
    for c in range(4):
        col = pattern[r][c]
        if col is None:
            continue
        x, y = x0 + c * (cell + gap), y0 + r * (cell + gap)
        d.rounded_rectangle([x, y, x + cell, y + cell], radius=8, fill=col)

# Eyebrow.
mono = ImageFont.truetype(MONO, 30)
d.text((72, 268), 'TASKMARKET  ·  LIVE MARKET VISUALIZER', font=mono, fill=MUTED)

# Headline, Instrument Serif.
serif = ImageFont.truetype(SERIF, 92)
serif_it = ImageFont.truetype(SERIF_IT, 92)
d.text((70, 310), 'What is happening on', font=serif, fill=CREAM)
d.text((70, 408), 'Taskmarket, ', font=serif, fill=CREAM)
w1 = d.textlength('Taskmarket, ', font=serif)
d.text((70 + w1, 408), 'right now.', font=serif_it, fill=MAGENTA)

# Bottom rule + address.
d.line([(72, 556), (1128, 556)], fill=(69, 62, 55), width=2)
d.text((72, 578), 'taskmarket.dev', font=ImageFont.truetype(MONO, 32), fill=CREAM)
tight = ImageFont.truetype(TIGHT_SB, 28)
right = 'Tempo  ·  Base  ·  updated hourly'
d.text((1128 - d.textlength(right, font=tight), 582), right, font=tight, fill=MUTED)

img.save('/home/hatch/workspace/taskmarket/brk611an-visualizer/og.png', optimize=True)
print('wrote og.png')
