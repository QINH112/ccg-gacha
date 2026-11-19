from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
FRAME = ROOT / "assets" / "ui" / "cards" / "card-frame-common-v1.png"
OUTPUT = ROOT / "assets" / "ui" / "cards" / "card-art-mask-v1.png"


def main() -> None:
    frame = Image.open(FRAME).convert("RGBA")
    width, height = frame.size
    alpha = frame.getchannel("A")
    start = (width // 2, height // 4)
    queue = deque([start])
    seen = {start}
    while queue:
        pixel_x, pixel_y = queue.popleft()
        for neighbor in ((pixel_x - 1, pixel_y), (pixel_x + 1, pixel_y), (pixel_x, pixel_y - 1), (pixel_x, pixel_y + 1)):
            next_x, next_y = neighbor
            if not (0 <= next_x < width and 0 <= next_y < height) or neighbor in seen:
                continue
            if alpha.getpixel(neighbor) < 250:
                seen.add(neighbor)
                queue.append(neighbor)
    mask_alpha = Image.new("L", frame.size, 0)
    pixels = mask_alpha.load()
    for pixel_x, pixel_y in seen:
        pixels[pixel_x, pixel_y] = 255 - alpha.getpixel((pixel_x, pixel_y))
    mask = Image.new("RGBA", frame.size, (255, 255, 255, 0))
    mask.putalpha(mask_alpha)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    mask.save(OUTPUT, optimize=True)
    print("card-art-mask-ok", OUTPUT.relative_to(ROOT), f"pixels={len(seen)}", f"bbox={mask_alpha.getbbox()}")


if __name__ == "__main__":
    main()
