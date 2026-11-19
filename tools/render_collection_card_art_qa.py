from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

OUTPUT = DESIGN / "review"
BACKGROUND = ROOT / "assets" / "backgrounds" / "battle-imagegen-v1.jpg"
MASK = ROOT / "assets" / "ui" / "cards" / "card-art-mask-v1.png"
FRAME_ROOT = ROOT / "assets" / "ui" / "cards"
ART_ROOT = ROOT / "subpackages" / "card-art-base" / "images"
CARDS = [
    ("c001", "星尘学徒", "common", 1, 1, 2, "汇聚微弱星尘，开启星界旅途。", 4, 0),
    ("c002", "月影侍从", "common", 1, 2, 1, "在月光边缘悄然守望。", 0, 1),
    ("c003", "星环守卫", "common", 2, 1, 3, "城墙", 1, 0),
    ("c004", "虚空萤火", "common", 2, 2, 3, "微光也能照亮虚空。", 5, 0),
    ("c005", "彗星信使", "common", 2, 2, 1, "冲锋", 1, 0),
    ("c006", "星界药师", "common", 3, 2, 4, "入场：为你的英雄恢复 2 点生命。", 3, 0),
    ("c007", "小飞鼠", "common", 3, 3, 4, "可爱小飞鼠。", 3, 0),
    ("c008", "星尘蝶", "common", 2, 1, 2, "亡语：抽 1 张牌。", 1, 0),
    ("c009", "碎岩星偶", "common", 3, 2, 3, "护盾", 2, 0),
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc")
    return ImageFont.truetype(str(path), size)


def fit_text(draw: ImageDraw.ImageDraw, value: str, maximum: float, size: int, bold: bool = False) -> str:
    result = value
    current = font(size, bold)
    while result and draw.textlength(result, font=current) > maximum:
        result = result[:-1]
    return result if result == value else result[:-1] + "…"


def compose_card(data: tuple, width: int, height: int, use_shiny: bool) -> Image.Image:
    card_id, name, rarity, cost, attack, health, rules, normal, shiny = data
    frame_name = f"card-frame-{rarity}{'-shiny' if use_shiny else ''}-v1.png"
    frame = Image.open(FRAME_ROOT / frame_name).convert("RGBA").resize((width, height), Image.Resampling.LANCZOS)
    art = Image.open(ART_ROOT / f"{card_id}.jpg").convert("RGB")
    mask = Image.open(MASK).convert("RGBA").resize((width, height), Image.Resampling.LANCZOS).getchannel("A")
    art_x, art_y, art_w, art_h = int(width * .22), int(height * .075), int(width * .57), int(height * .45)
    zoom = 1.15
    scale = max(art_w / art.width, art_h / art.height) * zoom
    crop_w, crop_h = art_w / scale, art_h / scale
    left = (art.width - crop_w) / 2
    top = (art.height - crop_h) * .34
    art = art.crop((left, top, left + crop_w, top + crop_h)).resize((art_w, art_h), Image.Resampling.LANCZOS)
    art_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    art_layer.paste(art.convert("RGBA"), (art_x, art_y))
    masked = Image.composite(art_layer, Image.new("RGBA", (width, height)), mask)
    result = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    result.alpha_composite(masked)
    result.alpha_composite(frame)
    draw = ImageDraw.Draw(result)
    draw.text((width * .177, height * .195), str(cost), fill="#3b3150", font=font(max(11, int(width * .095)), True), anchor="mm")
    draw.text((width * .5, height * .59), fit_text(draw, name, width * .68, max(9, int(width * .078)), True), fill="#483544", font=font(max(9, int(width * .078)), True), anchor="mm")
    draw.text((width * .245, height * .655), fit_text(draw, rules, width * .52, max(7, int(width * .047))), fill="#533f4c", font=font(max(7, int(width * .047))), anchor="la")
    draw.text((width * .207, height * .813), str(attack), fill="#fff1c9", font=font(max(11, int(width * .09)), True), anchor="mm")
    draw.text((width * .798, height * .813), str(health), fill="#ffd5dc", font=font(max(11, int(width * .09)), True), anchor="mm")
    return result


def render(width: int, height: int) -> Path:
    background = Image.open(BACKGROUND).convert("RGB")
    scale = max(width / background.width, height / background.height)
    resized = background.resize((round(background.width * scale), round(background.height * scale)), Image.Resampling.LANCZOS)
    canvas = resized.crop(((resized.width - width) // 2, (resized.height - height) // 2, (resized.width + width) // 2, (resized.height + height) // 2)).convert("RGBA")
    overlay = Image.new("RGBA", canvas.size, (5, 9, 31, 70))
    canvas.alpha_composite(overlay)
    draw = ImageDraw.Draw(canvas)
    draw.text((16, 68), "‹", fill="#f3edff", font=font(29), anchor="lm")
    draw.text((48, 66), "星界卡牌图鉴", fill="#f3edff", font=font(24, True), anchor="lm")
    draw.text((48, 91), "已收集 8 / 72 种", fill="#aab0d1", font=font(10), anchor="lm")
    filter_top = 108
    search_right = width - 90
    draw.rounded_rectangle((12, filter_top, search_right, filter_top + 36), radius=9, fill="#1b2345e8", outline="#586694")
    draw.text((24, filter_top + 18), "搜索名称 / ID / 规则 / 关键词", fill="#8f99bc", font=font(9), anchor="lm")
    draw.rounded_rectangle((width - 82, filter_top, width - 12, filter_top + 36), radius=9, fill="#6756a8", outline="#8978ca")
    draw.text((width - 47, filter_top + 18), "筛选", fill="white", font=font(11, True), anchor="mm")
    columns, gap, margin = 3, 7, 12
    card_width = int((width - margin * 2 - gap * (columns - 1)) / columns)
    card_height = int(card_width * 1.5)
    start = filter_top + 46
    entries = []
    for item in CARDS[:5]:
        entries.append((item, False, "普通", item[-2]))
        entries.append((item, True, "闪卡", item[-1]))
    for index, (item, shiny_variant, label, count) in enumerate(entries):
        x = margin + index % columns * (card_width + gap)
        y = start + index // columns * (card_height + 27)
        card = compose_card(item, card_width, card_height, shiny_variant)
        canvas.alpha_composite(card, (x, y))
        draw.text((x + card_width / 2, y + card_height + 11), f"{label} {count}", fill="#ffe39a" if shiny_variant else "#d1d6e9", font=font(8), anchor="mm")
    output = OUTPUT / f"collection-card-art-restored-{width}x{height}.png"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, optimize=True)
    return output


def main() -> None:
    outputs = [render(375, 812), render(430, 932)]
    print(json.dumps([path.relative_to(ROOT).as_posix() for path in outputs], ensure_ascii=False))


if __name__ == "__main__":
    main()
