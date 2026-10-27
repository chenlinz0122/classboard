"""Generate the ClassBoard icon without external assets."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
RES = ROOT / "resources"
BUILD.mkdir(exist_ok=True)
RES.mkdir(exist_ok=True)

S = 2048


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_mask(size, radius):
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


# Background gradient
bg = Image.new("RGB", (S, S))
d = ImageDraw.Draw(bg)
top = (14, 55, 46)
bottom = (25, 92, 73)
for y in range(S):
    d.line([(0, y), (S, y)], fill=lerp(top, bottom, y / (S - 1)))

# Soft glow in the upper left
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse((-S * 0.25, -S * 0.3, S * 0.75, S * 0.55), fill=(122, 196, 160, 48))
glow = glow.filter(ImageFilter.GaussianBlur(160))
bg = Image.alpha_composite(bg.convert("RGBA"), glow)

# Calendar shadow
shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle((250, 390, 1450, 1660), radius=140, fill=(0, 20, 15, 105))
shadow = shadow.filter(ImageFilter.GaussianBlur(60))
bg = Image.alpha_composite(bg, shadow)

# Calendar sheet
sheet = Image.new("RGBA", (S, S), (0, 0, 0, 0))
sd = ImageDraw.Draw(sheet)
sd.rounded_rectangle((300, 360, 1380, 1580), radius=120, fill=(247, 242, 231, 255))
# Header band
sd.rounded_rectangle((300, 360, 1380, 610), radius=120, fill=(234, 225, 207, 255))
sd.rectangle((300, 500, 1380, 610), fill=(234, 225, 207, 255))
# Binding holes
for cx in (530, 840, 1150):
    sd.rounded_rectangle((cx - 42, 300, cx + 42, 470), radius=42, fill=(36, 113, 88, 255))
    sd.rounded_rectangle((cx - 20, 330, cx + 20, 440), radius=20, fill=(247, 242, 231, 255))
# Date grid
for row in range(3):
    for col in range(4):
        x = 420 + col * 235
        y = 760 + row * 230
        sd.rounded_rectangle((x, y, x + 140, y + 92), radius=28, fill=(213, 223, 209, 255))
# A highlighted day
sd.rounded_rectangle((420, 760, 560, 852), radius=28, fill=(36, 113, 88, 255))
# Check circle
sd.ellipse((930, 1160, 1660, 1890), fill=(236, 138, 92, 255))
sd.ellipse((990, 1220, 1600, 1830), fill=(244, 154, 108, 255))
# Check mark
sd.line([(1135, 1510), (1280, 1655), (1510, 1390)], fill=(255, 250, 241, 255), width=92, joint="curve")
bg = Image.alpha_composite(bg, sheet)
# Rounded corners
bg = Image.composite(bg, Image.new("RGBA", (S, S), (0, 0, 0, 0)), rounded_mask(S, 330))

icon = bg.convert("RGBA").resize((1024, 1024), Image.LANCZOS)
icon.save(BUILD / "icon.png")
icon.resize((256, 256), Image.LANCZOS).save(RES / "icon.png")
icon.resize((64, 64), Image.LANCZOS).save(RES / "tray@2x.png")
icon.resize((32, 32), Image.LANCZOS).save(RES / "tray.png")

# Multi-size ICO
sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [icon.resize((s, s), Image.LANCZOS) for s in sizes]
frames[-1].save(BUILD / "icon.ico", format="ICO", sizes=[(s, s) for s in sizes], append_images=frames[:-1])
print("icon written", BUILD / "icon.ico", icon.size)
