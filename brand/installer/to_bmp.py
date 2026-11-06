"""Converts the rendered PNGs to the 24-bit BMPs NSIS expects.

Usage: python brand/installer/to_bmp.py
Writes src-tauri/installer/sidebar.bmp and header.bmp.
"""
from pathlib import Path

from PIL import Image

here = Path(__file__).parent
out = here.parent.parent / "src-tauri" / "installer"
out.mkdir(parents=True, exist_ok=True)

for name in ("sidebar", "header"):
    img = Image.open(here / f"{name}.png").convert("RGB")
    img.save(out / f"{name}.bmp", format="BMP")
    print(name, img.size)
