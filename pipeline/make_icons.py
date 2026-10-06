"""Draw the app icon (no book art in public files): a scarlet metro line with a 45° bend and one
porcelain interchange ring on midnight enamel. Rendered 4x and downsampled for clean edges."""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"
ENAMEL, PORCELAIN, SCARLET, COBALT = (11, 18, 48), (244, 241, 234), (232, 38, 47), (58, 115, 255)


def icon(size: int, maskable: bool = False) -> Image.Image:
    S = size * 4
    im = Image.new("RGB", (S, S), ENAMEL)
    d = ImageDraw.Draw(im)
    u = S / 100  # work in percent of the canvas; content stays inside the maskable safe zone
    w = 9 * u
    # cobalt line, quieter, crossing behind
    d.line([(50 * u, -5 * u), (50 * u, 105 * u)], fill=COBALT, width=int(w * 0.8))
    # scarlet line: horizontal, 45° bend, horizontal (the diagram's only allowed angles)
    pts = [(-5 * u, 64 * u), (30 * u, 64 * u), (50 * u, 44 * u), (105 * u, 44 * u)]
    d.line(pts, fill=SCARLET, width=int(w), joint="curve")
    # stations
    for x, y in [(18 * u, 64 * u), (78 * u, 44 * u)]:
        r = 5.5 * u
        d.ellipse([x - r, y - r, x + r, y + r], fill=ENAMEL, outline=PORCELAIN, width=int(2.6 * u))
    # interchange ring at the crossing
    r = 12 * u
    d.ellipse([50 * u - r, 44 * u - r, 50 * u + r, 44 * u + r], fill=ENAMEL, outline=PORCELAIN, width=int(4.2 * u))
    return im.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    icon(180).save(OUT / "apple-touch-icon.png")
    icon(192).save(OUT / "icon-192.png")
    icon(512).save(OUT / "icon-512.png")
    print("icons written to", OUT)
