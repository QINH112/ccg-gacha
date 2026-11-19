from __future__ import annotations

r"""平衡调整公告页的视觉 QA 渲染（含右侧立绘）。

与客户端 `game.js` 的 `renderBalanceNoticeDetail()` / `drawNoticeArt()` 保持同一套几何：
立绘宽 = 卡片内容宽度 × 28%，高度铺满卡片内边距，cover 裁剪，左侧渐隐。

产物写到 D:\kaifa\design\review\balance-notice-<宽>x<高>.png。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

BACKGROUND = ROOT / "assets" / "backgrounds" / "battle-imagegen-v1.jpg"
OUTPUT = DESIGN / "review"

CHANGES = [
    {
        "cardId": "c001", "name": "星尘学徒",
        "before": {"cost": 1, "attack": 1, "health": 2, "keywords": [], "rulesText": ""},
        "after": {"cost": 1, "attack": 1, "health": 3, "keywords": [], "rulesText": ""},
        "note": "生命值提高 1 点。",
    },
    {
        "cardId": "c002", "name": "月影侍从",
        "before": {"cost": 1, "attack": 2, "health": 1, "keywords": [], "rulesText": ""},
        "after": {"cost": 1, "attack": 3, "health": 1, "keywords": [], "rulesText": ""},
        "note": "攻击力提高 1 点。",
    },
    {
        "cardId": "r009", "name": "归墟歌者",
        "before": {"cost": 4, "attack": 3, "health": 3, "keywords": ["deathrattle"], "rulesText": "亡语：对所有敌方随从造成 1 点伤害。"},
        "after": {"cost": 4, "attack": 4, "health": 4, "keywords": ["guard", "deathrattle"], "rulesText": "城墙；亡语：对所有敌方随从造成 1 点伤害。"},
        "note": "攻击力和生命值各提高 1 点，并新增城墙；原亡语保持不变。",
    },
]

KEYWORD_LABEL = {"guard": "城墙", "charge": "冲锋", "rush": "突袭", "shield": "护盾", "lifesteal": "吸血", "battlecry": "入场", "deathrattle": "亡语", "aura": "光环"}


def font(size: int, bold: bool = False):
    for candidate in (Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"), Path("C:/Windows/Fonts/simhei.ttf")):
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=max(7, size))
    return ImageFont.load_default()


def text(draw, xy, value, size, color="#fff", anchor="la", bold=False):
    draw.text(xy, value, fill=color, font=font(size, bold), anchor=anchor)


def cover(width: int, height: int) -> Image.Image:
    source = Image.open(BACKGROUND).convert("RGB")
    scale = max(width / source.width, height / source.height)
    scaled = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    left = (scaled.width - width) // 2
    top = (scaled.height - height) // 2
    canvas = scaled.crop((left, top, left + width, top + height)).convert("RGBA")
    canvas.alpha_composite(Image.new("RGBA", (width, height), "#05091f55"))
    return canvas


def panel(draw, rect, fill="#111a39e8", outline="#6473a5", radius=10):
    draw.rounded_rectangle(rect, radius=radius, fill=fill, outline=outline, width=1)


def art_path(card_id: str) -> Path:
    for package in ("card-art-base", "card-art-star-remnant"):
        candidate = ROOT / "subpackages" / package / "images" / f"{card_id}.jpg"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"找不到 {card_id} 的立绘")


def draw_art(canvas: Image.Image, card_id: str, box: tuple[int, int, int, int]) -> None:
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    image = Image.open(art_path(card_id)).convert("RGB")
    scale = max(width / image.width, height / image.height)
    scaled = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.Resampling.LANCZOS)
    offset_x = (scaled.width - width) // 2
    offset_y = (scaled.height - height) // 2
    cropped = scaled.crop((offset_x, offset_y, offset_x + width, offset_y + height)).convert("RGBA")
    # 左侧渐隐：靠数据区的一边淡出，避免与文字抢读
    fade = Image.new("L", (width, height), 255)
    fade_pixels = fade.load()
    edge = max(1, int(width * 0.55))
    for x in range(edge):
        alpha = round(255 * (x / edge))
        for y in range(height):
            fade_pixels[x, y] = alpha
    mask = Image.new("L", (width, height), 0)
    radius = max(4, round(min(width, height) * 0.18))
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    inner = Image.new("L", (width, height), 0)
    inner.paste(fade, (0, 0))
    mask = Image.fromarray(__import__("numpy").minimum(__import__("numpy").array(mask), __import__("numpy").array(inner)))
    canvas.paste(cropped, (left, top), mask)


def field(draw, title, before, after, x, y, width):
    text(draw, (x, y), title, 9, "#b9c2da")
    text(draw, (x + width * 0.34, y), str(before), 10, "#dca4ad", "ma", True)
    text(draw, (x + width * 0.5, y), "→", 10, "#8f9ad0", "ma")
    text(draw, (x + width * 0.68, y), str(after), 10, "#8fe0b7", "ma", True)


def render(width: int, height: int) -> Path:
    canvas = cover(width, height)
    draw = ImageDraw.Draw(canvas, "RGBA")
    top = 100
    text(draw, (23, top + 19), "‹", 31, "#eee8ff", "mm")
    text(draw, (50, top + 15), "卡牌平衡调整", 23, "#f6f1ff", "lm", True)
    text(draw, (50, top + 39), "2026-11-18 · 3 张卡牌", 10, "#ccd2e8")

    m = 12
    panel_w = width - m * 2
    inner = panel_w - 28
    art_w = round(inner * 0.28)
    text_w = inner - art_w - 12
    row = 230
    gap = 10
    y = top + 55
    panel(draw, (m, y, m + panel_w, y + 42), "#27284bdd", "#666fa0", 9)
    text(draw, (m + 12, y + 21), "星尘学徒、月影侍从与归墟歌者完成调整。", 10, "#d9dcef", "lm")
    y += 50

    for change in CHANGES:
        panel(draw, (m, y, m + panel_w, y + row), "#1b2140ee", "#737daf", 11)
        text(draw, (m + 14, y + 20), change["name"], 15, "#fff", "lm", True)
        text(draw, (m + panel_w - 14, y + 20), change["cardId"], 9, "#929bbd", "rm")
        x = m + 14
        text(draw, (x + text_w * 0.34, y + 43), "修改前", 9, "#dca4ad", "mm", True)
        text(draw, (x + text_w * 0.68, y + 43), "修改后", 9, "#8fe0b7", "mm", True)
        before, after = change["before"], change["after"]
        field(draw, "费用", before["cost"], after["cost"], x, y + 65, text_w)
        field(draw, "攻击", before["attack"], after["attack"], x, y + 84, text_w)
        field(draw, "生命", before["health"], after["health"], x, y + 103, text_w)
        field(draw, "关键词", " ".join(KEYWORD_LABEL[item] for item in before["keywords"]) or "无", " ".join(KEYWORD_LABEL[item] for item in after["keywords"]) or "无", x, y + 122, text_w)
        text(draw, (x, y + 144), "效果", 9, "#9da7ca")
        text(draw, (x + 42, y + 139), f"前：{before['rulesText'] or '无'}", 8, "#d0b8c0")
        text(draw, (x + 42, y + 179), f"后：{after['rulesText'] or '无'}", 8, "#b9dcc9")
        text(draw, (x, y + 218), change["note"], 8, "#efd181")
        draw_art(canvas, change["cardId"], (x + text_w + 13, y + 10, x + text_w + 13 + art_w, y + row - 10))
        y += row + gap

    output = OUTPUT / f"balance-notice-{width}x{height}.png"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, optimize=True)
    return output


def main() -> None:
    for width, height in ((375, 812), (430, 932)):
        print(render(width, height))


if __name__ == "__main__":
    main()
