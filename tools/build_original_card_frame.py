from __future__ import annotations

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

SOURCE = DESIGN / "generated" / "card-frame-original-v1.png"
OUTPUT = ROOT / "assets" / "ui" / "cards" / "card-frame-original-v1.png"
TARGET_SIZE = (512, 768)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    target_width, target_height = TARGET_SIZE
    scale = min(target_width / source.width, target_height / source.height)
    resized = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))
    left = (target_width - resized.width) // 2
    top = (target_height - resized.height) // 2
    canvas.alpha_composite(resized, (left, top))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT, optimize=True)
    print(f"{OUTPUT.relative_to(ROOT)} {canvas.width}x{canvas.height} {OUTPUT.stat().st_size}B")


if __name__ == "__main__":
    main()
