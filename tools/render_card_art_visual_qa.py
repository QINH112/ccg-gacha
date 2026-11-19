from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

ART_DIR = ROOT / "subpackages" / "card-art-base" / "images"
FRAME = ROOT / "assets" / "ui" / "cards" / "card-frame-common-v1.png"
MASK = ROOT / "assets" / "ui" / "cards" / "card-art-mask-v1.png"
OUTPUT = DESIGN / "review" / "card-art-base-c001-c005.png"
CARDS = [
    ("c001", "星尘学徒", 1, 1, 2),
    ("c002", "月影侍从", 1, 2, 1),
    ("c003", "星环守卫", 2, 1, 3),
    ("c004", "虚空萤火", 2, 2, 3),
    ("c005", "彗星信使", 2, 2, 1),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc")
    return ImageFont.truetype(str(path), size)


def compose(card_id: str, name: str, cost: int, attack: int, health: int) -> Image.Image:
    width, height = 230, 345
    art = Image.open(ART_DIR / f"{card_id}.jpg").convert("RGB")
    frame = Image.open(FRAME).convert("RGBA").resize((width, height), Image.Resampling.LANCZOS)
    card = Image.new("RGBA", (width, height), (7, 13, 29, 255))
    art_x, art_y, art_w, art_h = int(width * .22), int(height * .075), int(width * .57), int(height * .45)
    zoom = 1.15
    focus_y = .34
    scale = max(art_w / art.width, art_h / art.height) * zoom
    crop_w, crop_h = art_w / scale, art_h / scale
    left = (art.width - crop_w) / 2
    top = (art.height - crop_h) * focus_y
    art = art.crop((left, top, left + crop_w, top + crop_h)).resize((art_w, art_h), Image.Resampling.LANCZOS)
    art_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    art_layer.paste(art.convert("RGBA"), (art_x, art_y))
    mask = Image.open(MASK).convert("RGBA").resize((width, height), Image.Resampling.LANCZOS).getchannel("A")
    card.alpha_composite(Image.composite(art_layer, Image.new("RGBA", card.size), mask))
    card.alpha_composite(frame)
    draw = ImageDraw.Draw(card)
    draw.text((int(width * .177), int(height * .195)), str(cost), fill="#3b3150", font=font(22, True), anchor="mm")
    draw.text((width // 2, int(height * .59)), name, fill="#483544", font=font(16, True), anchor="mm")
    draw.text((int(width * .207), int(height * .813)), str(attack), fill="#fff1c9", font=font(20, True), anchor="mm")
    draw.text((int(width * .798), int(height * .813)), str(health), fill="#ffd5dc", font=font(20, True), anchor="mm")
    return card


def main() -> None:
    margin, gap = 28, 20
    card_width, card_height = 230, 345
    canvas = Image.new("RGB", (margin * 2 + card_width * 3 + gap * 2, 780), "#111833")
    draw = ImageDraw.Draw(canvas)
    draw.text((canvas.width // 2, 32), "基础包立绘接入审阅 · c001-c005", fill="#f2e8ff", font=font(24, True), anchor="ma")
    for index, data in enumerate(CARDS):
        row, column = divmod(index, 3)
        x = margin + column * (card_width + gap)
        y = 80 + row * (card_height + 18)
        canvas.paste(compose(*data).convert("RGB"), (x, y))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUTPUT, quality=92, optimize=True)
    print(OUTPUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
