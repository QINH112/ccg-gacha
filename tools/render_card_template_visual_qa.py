from __future__ import annotations

from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

OUTPUT = DESIGN / "review"
FRAME_DIR = ROOT / "assets" / "ui" / "cards"
COLORS = {
    "common": (137, 147, 170),
    "rare": (85, 169, 243),
    "epic": (183, 109, 229),
    "legendary": (232, 187, 94),
}


def frame_path(item: dict) -> Path:
    rarity = item.get("rarity", "common")
    shiny = "-shiny" if item.get("shiny") else ""
    return FRAME_DIR / f"card-frame-{rarity}{shiny}-v1.png"


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), max(7, int(size)))
    return ImageFont.load_default()


def fit_text(draw: ImageDraw.ImageDraw, value: str, max_width: float, size: int, bold: bool = False) -> str:
    result = str(value)
    typeface = font(size, bold)
    while len(result) > 1 and draw.textbbox((0, 0), result, font=typeface)[2] > max_width:
        result = result[:-2] + "…"
    return result


def wrapped(draw: ImageDraw.ImageDraw, value: str, max_width: float, size: int, max_lines: int) -> list[str]:
    result: list[str] = []
    line = ""
    typeface = font(size)
    for char in str(value):
        candidate = line + char
        if line and draw.textbbox((0, 0), candidate, font=typeface)[2] > max_width:
            result.append(line)
            line = char
            if len(result) == max_lines:
                break
        else:
            line = candidate
    if len(result) < max_lines and line:
        result.append(line)
    return result


def card(draw: ImageDraw.ImageDraw, item: dict, rect: tuple[int, int, int, int], compact: bool = False, selected: bool = False) -> None:
    x, y, right, bottom = rect
    w, h = right - x, bottom - y
    accent = COLORS[item["rarity"]]
    if compact:
        draw.rounded_rectangle(rect, radius=max(5, int(w * .08)), fill="#20283e", outline="#f5dc78" if selected else accent, width=2)
        center_y = y + int(h * .37)
        draw.ellipse((x + int(w * .23), center_y - int(w * .25), x + int(w * .77), center_y + int(w * .25)), fill="#0b1428", outline=accent, width=1)
        text(draw, (x + w // 2, center_y), item["element"], max(13, int(w * .33)), accent, "mm", True)
        text(draw, (x + int(w * .16), y + int(h * .10)), str(item["cost"]), max(8, int(w * .15)), "#8bdcff", "mm", True)
        draw.ellipse((x + int(w * .84) - max(5, int(w * .12)), y + int(h * .10) - max(5, int(w * .12)), x + int(w * .84) + max(5, int(w * .12)), y + int(h * .10) + max(5, int(w * .12))), fill=accent)
        text(draw, (x + w // 2, y + int(h * .72)), fit_text(draw, item["name"], w - 8, max(7, int(w * .12)), True), max(7, int(w * .12)), "white", "mm", True)
        text(draw, (x + int(w * .18), y + int(h * .90)), str(item["attack"]), max(8, int(w * .14)), "#f7e5a8", "mm", True)
        text(draw, (x + int(w * .82), y + int(h * .90)), str(item["health"]), max(8, int(w * .14)), "#ffb0b0", "mm", True)
        return
    art_layer = Image.new("RGBA", draw._image.size, (0, 0, 0, 0))
    art_draw = ImageDraw.Draw(art_layer, "RGBA")
    art_box = (x + int(w * .22), y + int(h * .075), x + int(w * .79), y + int(h * .525))
    art_draw.ellipse(art_box, fill="#11192d", outline=(*accent, 180), width=max(1, int(w * .008)))
    text(art_draw, (x + int(w * .505), y + int(h * .275)), item["element"], max(20, int(w * .20)), accent, "mm", True)
    draw._image.alpha_composite(art_layer)
    frame = Image.open(frame_path(item)).convert("RGBA").resize((w, h), Image.Resampling.LANCZOS)
    draw._image.alpha_composite(frame, (x, y))
    text(draw, (x + int(w * .177), y + int(h * .195)), str(item["cost"]), max(12, int(w * .095)), "#3b3150", "mm", True)
    text(draw, (x + int(w * .5), y + int(h * .59)), fit_text(draw, item["name"], int(w * .68), max(9, int(w * .078)), True), max(9, int(w * .078)), "#483544", "mm", True)
    effect_lines = wrapped(draw, item["effect"], int(w * .52), max(7, int(w * .047)), 4 if h >= 350 else 2)
    for index, line in enumerate(effect_lines):
        text(draw, (x + int(w * .505), y + int(h * .655) + index * max(10, int(h * .035))), line, max(7, int(w * .047)), "#533f4c", "mm")
    text(draw, (x + int(w * .207), y + int(h * .813)), str(item["attack"]), max(11, int(w * .09)), "#fff1c9", "mm", True)
    text(draw, (x + int(w * .798), y + int(h * .813)), str(item["health"]), max(11, int(w * .09)), "#ffd5dc", "mm", True)


def text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, size: int, color: str, anchor: str = "la", bold: bool = False) -> None:
    draw.text(xy, value, fill=color, font=font(size, bold), anchor=anchor)


def make_detail(width: int, height: int) -> Path:
    canvas = Image.new("RGBA", (width, height), "#0b1020")
    draw = ImageDraw.Draw(canvas)
    item = {"name": "遗迹执掌者", "rarity": "epic", "cost": 7, "attack": 7, "health": 4, "element": "🔐", "effect": "入场：查看一张牌。光环：你的其他卡牌获得护盾。"}
    card_width = min(330, width - 48)
    card_height = int(card_width * 1.48)
    x = (width - card_width) // 2
    y = 82
    card(draw, item, (x, y, x + card_width, y + card_height))
    text(draw, (width // 2, y + card_height + 25), "史诗 · 星骸遗响 · 入场 · 光环", 11, "#f1d681", "mm", True)
    text(draw, (width // 2, y + card_height + 50), "长按查看 · 点击卡牌外关闭", 9, "#8f97b8", "mm")
    output = OUTPUT / f"card-template-detail-{width}x{height}.png"
    canvas.save(output, optimize=True)
    return output


def make_grid(width: int, height: int) -> Path:
    canvas = Image.new("RGBA", (width, height), "#151b38")
    draw = ImageDraw.Draw(canvas)
    cards = [
        {"name": "残星浮游虫", "rarity": "common", "cost": 1, "attack": 1, "health": 2, "element": "⋆", "effect": "在冷却的星骸缝隙间漂流觅食。"},
        {"name": "古星舵手", "rarity": "rare", "cost": 3, "attack": 3, "health": 5, "element": "🧭", "effect": "亡语：将一张星界航标置入手牌。"},
        {"name": "寂灭星神", "rarity": "legendary", "cost": 9, "attack": 9, "health": 8, "element": "✠", "effect": "入场：对敌方英雄造成 2 点伤害。"},
    ]
    gap = 8
    card_width = (width - 24 - gap * 2) // 3
    card_height = int(card_width * 1.58)
    for index, item in enumerate(cards):
        x = 12 + index * (card_width + gap)
        card(draw, item, (x, 90, x + card_width, 90 + card_height))
    text(draw, (width // 2, 38), "图鉴卡面 · 费用 / 稀有度 / 效果 / 攻击 / 血量", 12, "#e8e2ff", "mm", True)
    output = OUTPUT / f"card-template-collection-{width}x{height}.png"
    canvas.save(output, optimize=True)
    return output


def make_mulligan(width: int, height: int) -> Path:
    canvas = Image.new("RGBA", (width, height), "#151b38")
    draw = ImageDraw.Draw(canvas)
    text(draw, (width // 2, 38), "起手换牌 · 选中显示大号 ❌", 13, "#f4edff", "mm", True)
    cards = [
        {"name": "星骸祭司", "rarity": "rare", "cost": 3, "attack": 3, "health": 4, "element": "📜", "effect": "诵读早已消亡星辰的墓志铭。"},
        {"name": "遗迹执掌者", "rarity": "epic", "cost": 7, "attack": 7, "health": 4, "element": "🔐", "effect": "入场：查看一张牌。"},
        {"name": "亡星歌姬", "rarity": "epic", "cost": 5, "attack": 5, "health": 7, "element": "🎵", "effect": "光环：你的其他卡牌获得护盾。"},
    ]
    gap = 7
    card_width = min(105, (width - 24 - gap * 2) // 3)
    card_height = min(168, int(height * .34))
    total = card_width * 3 + gap * 2
    left = (width - total) // 2
    for index, item in enumerate(cards):
        x = left + index * (card_width + gap)
        selected = index == 1
        card(draw, item, (x, 82, x + card_width, 82 + card_height), compact=False, selected=selected)
        if selected:
            draw.rounded_rectangle((x + 2, 84, x + card_width - 2, 80 + card_height), radius=5, fill="#6e1329aa", outline="#f5dc78", width=2)
            center_x, center_y = x + card_width // 2, 82 + card_height // 2
            cross = min(55, int(card_width * .5))
            offset = int(cross * .32)
            stroke = max(6, int(cross * .18))
            draw.line((center_x - offset, center_y - offset, center_x + offset, center_y + offset), fill="#ff4564", width=stroke)
            draw.line((center_x + offset, center_y - offset, center_x - offset, center_y + offset), fill="#ff4564", width=stroke)
    output = OUTPUT / f"card-template-mulligan-{width}x{height}.png"
    canvas.save(output, optimize=True)
    return output


def make_results(width: int, height: int) -> list[Path]:
    outputs: list[Path] = []
    cards = [
        {"name": "残星浮游虫", "rarity": "common", "cost": 1, "attack": 1, "health": 2, "element": "⋆", "effect": ""},
        {"name": "星骸祭司", "rarity": "rare", "cost": 3, "attack": 3, "health": 4, "element": "📜", "effect": ""},
        {"name": "遗迹执掌者", "rarity": "epic", "cost": 7, "attack": 7, "health": 4, "element": "🔐", "effect": ""},
        {"name": "寂灭星神", "rarity": "legendary", "cost": 9, "attack": 9, "health": 8, "element": "✠", "effect": ""},
        {"name": "亡星歌姬", "rarity": "epic", "cost": 5, "attack": 5, "health": 7, "element": "🎵", "effect": ""},
    ]
    for count in (1, 10):
        canvas = Image.new("RGBA", (width, height), "#050712")
        draw = ImageDraw.Draw(canvas, "RGBA")
        margin, panel_y, panel_h = 14, 28, height - 44
        draw.rounded_rectangle((margin, panel_y, width - margin, panel_y + panel_h), radius=16, fill="#242850", outline="#6d5aac", width=2)
        text(draw, (margin + 18, panel_y + 30), "十连" if count == 10 else "单抽", 19, "#f1e7ff", "lm", True)
        cols = 1 if count == 1 else 5
        gap = 5
        max_w = 170 if count == 1 else width - margin * 2 - 24
        card_w = max_w if cols == 1 else (max_w - gap * (cols - 1)) // cols
        card_h = 250 if cols == 1 else min(int(card_w * 1.7), (panel_h - 130 - gap) // 2)
        grid_w = cols * card_w + gap * (cols - 1)
        grid_x = (width - grid_w) // 2
        grid_y = panel_y + 58
        for index in range(count):
            item = cards[index % len(cards)]
            x = grid_x + (index % cols) * (card_w + gap)
            y = grid_y + (index // cols) * (card_h + gap)
            card(draw, item, (x, y, x + card_w, y + card_h), compact=card_h < 112)
        draw.rounded_rectangle((margin + 16, panel_y + panel_h - 46, width - margin - 16, panel_y + panel_h - 12), radius=9, fill="#6756a8", outline="#8978ca", width=1)
        text(draw, (width // 2, panel_y + panel_h - 29), "收下卡牌", 13, "#fff", "mm", True)
        output = OUTPUT / f"draw-results-{count}-{width}x{height}.png"
        canvas.convert("RGB").save(output, optimize=True)
        outputs.append(output)
    return outputs


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for width, height in ((375, 812), (430, 932)):
        print(make_detail(width, height).relative_to(ROOT))
        print(make_grid(width, height).relative_to(ROOT))
        print(make_mulligan(width, height).relative_to(ROOT))
        for output in make_results(width, height):
            print(output.relative_to(ROOT))


if __name__ == "__main__":
    main()
