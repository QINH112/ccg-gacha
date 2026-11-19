from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

BACKGROUND = ROOT / "assets" / "backgrounds" / "battle-imagegen-v1.jpg"
OUTPUT = DESIGN / "review"
COLORS = {
    "common": ("#222b43e8", "#8993aa", "#d5dae7"),
    "rare": ("#173b61e8", "#55a9f3", "#82c7ff"),
    "epic": ("#49256be8", "#b76de5", "#dda2ff"),
    "legendary": ("#70461de8", "#e8bb5e", "#ffdb7e"),
}


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"), Path("C:/Windows/Fonts/simhei.ttf")]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=max(7, size))
    return ImageFont.load_default()


def cover(width: int, height: int) -> Image.Image:
    source = Image.open(BACKGROUND).convert("RGB")
    scale = max(width / source.width, height / source.height)
    scaled = source.resize((round(source.width * scale), round(source.height * scale)), Image.Resampling.LANCZOS)
    left = (scaled.width - width) // 2
    top = (scaled.height - height) // 2
    canvas = scaled.crop((left, top, left + width, top + height)).convert("RGBA")
    return Image.alpha_composite(canvas, Image.new("RGBA", (width, height), "#050b252c"))


def text(draw: ImageDraw.ImageDraw, xy: tuple[float, float], value: str, size: int, color: str = "white", anchor: str = "mm", bold: bool = False) -> None:
    draw.text(xy, value, fill=color, font=font(size, bold), anchor=anchor)


def panel(draw: ImageDraw.ImageDraw, rect: tuple[float, float, float, float], fill: str, outline: str, radius: int = 8) -> None:
    draw.rounded_rectangle(rect, radius=radius, fill=fill, outline=outline, width=1)


def mini_card(draw: ImageDraw.ImageDraw, x: float, y: float, width: float, height: float, name: str, stats: str, rarity: str, cost: int, selected: bool = False) -> None:
    fill, border, accent = COLORS[rarity]
    panel(draw, (x, y, x + width, y + height), fill, "#f5dc78" if selected else border, 7)
    text(draw, (x + 9, y + 10), str(cost), 9, "#83d7ff", bold=True)
    cx, cy, size = x + width / 2, y + height * .28, min(16, width * .28)
    draw.polygon(((cx, cy - size), (cx + size * .22, cy - size * .22), (cx + size, cy), (cx + size * .22, cy + size * .22), (cx, cy + size), (cx - size * .22, cy + size * .22), (cx - size, cy), (cx - size * .22, cy - size * .22)), fill=accent)
    text(draw, (x + width / 2, y + height * .55), name, 7, "#fff", bold=True)
    text(draw, (x + width / 2, y + height * .78), stats, 9, "#f2f0ff", bold=True)


def button(draw: ImageDraw.ImageDraw, rect: tuple[float, float, float, float], title: str, enabled: bool = True) -> None:
    panel(draw, rect, "#6756a8dd" if enabled else "#242940dd", "#8978ca" if enabled else "#454b64", 8)
    text(draw, ((rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2), title, 11, "#fff" if enabled else "#747b94", bold=True)


def render(width: int, height: int, result: str | None = None) -> Path:
    canvas = cover(width, height)
    draw = ImageDraw.Draw(canvas, "RGBA")
    top = 110
    margin = 8
    text(draw, (29, top + 8), "‹ 暂离", 10, "#ddd6ff", "mm", True)
    text(draw, (width / 2, top + 8), "普通 · 你的回合", 10, "#d7dcf0")
    text(draw, (width - margin, top + 8), "72s", 11, "#f3efff", "rm", True)
    panel(draw, (width / 2 - 55, top + 20, width / 2 + 55, top + 60), "#182044dd", "#f5dc78", 19)
    text(draw, (width / 2, top + 40), "星界守卫  24/30", 13, bold=True)
    text(draw, (width / 2, top + 67), "手牌 4 · 牌库 12 · 能量 6/6", 9, "#d1d6e9")

    enemy_y = top + 82
    bottom_button_top = height - 47
    hand_bottom = bottom_button_top - 44
    desired_hand_height = max(60, min(90, height * .105))
    target_own_y = hand_bottom - desired_hand_height - 56 - 83
    own_y = max(enemy_y + 101, target_own_y)
    gap = 5
    card_width = min(52, (width - 80 - gap * 6) / 7)
    card_height = 70
    enemy_cards = (("暮影狼", "3/2", "common", 2), ("星骸祭司", "3/4", "rare", 4), ("亡星歌姬", "5/7", "epic", 6))
    total = len(enemy_cards) * card_width + (len(enemy_cards) - 1) * gap
    x0 = (width - total) / 2
    for index, card in enumerate(enemy_cards):
        mini_card(draw, x0 + index * (card_width + gap), enemy_y, card_width, card_height, *card)
    text(draw, (width / 2, enemy_y + 83), "— 星界战场 —", 9, "#c8cde2")

    own_cards = (("晶蚀兽", "2/3", "common", 3), ("裂隙猎手", "5/2", "rare", 4))
    total = len(own_cards) * card_width + (len(own_cards) - 1) * gap
    x0 = (width - total) / 2
    for index, card in enumerate(own_cards):
        mini_card(draw, x0 + index * (card_width + gap), own_y, card_width, card_height, *card, selected=index == 0)

    hero_y = own_y + 83
    panel(draw, (margin, hero_y, width - 92, hero_y + 48), "#182044dd", "#7280ad", 12)
    text(draw, (margin + 12, hero_y + 15), "你  26/30", 13, "#fff", "lm", True)
    text(draw, (margin + 12, hero_y + 34), "能量 6+0/6 · 牌库 13", 9, "#d1d6e9", "lm")
    button(draw, (width - 80, hero_y, width - 8, hero_y + 22), "星界冲击")
    button(draw, (width - 80, hero_y + 26, width - 8, hero_y + 48), "抽 2 张")

    hand_y = hero_y + 56
    hand_height = max(54, min(desired_hand_height, hand_bottom - hand_y))
    hand_cards = (("遗迹执掌者", "7/4", "epic", 6), ("亡星歌姬", "5/7", "epic", 6), ("星骸苔藓", "1/4", "common", 3), ("锈蚀卫偶", "2/2", "common", 2))
    for index, card in enumerate(hand_cards):
        mini_card(draw, 8 + index * 62, hand_y, 58, hand_height, *card, selected=index == 1)

    button(draw, (margin, height - 47, 80, height - 18), "认输")
    button(draw, (width - 94, height - 47, width - 8, height - 18), "结束回合")
    if result:
        labels = {
            "win": ("胜利", "星光回应了你的召唤", "#f0d578"),
            "loss": ("失败", "整顿牌组，再次挑战", "#e18a9b"),
            "draw": ("平局", "双方的力量归于寂静", "#b9abef"),
        }
        title, subtitle, color = labels[result]
        overlay = Image.new("RGBA", (width, height), "#030611cf")
        canvas = Image.alpha_composite(canvas, overlay)
        draw = ImageDraw.Draw(canvas, "RGBA")
        result_width, result_height = min(318, width - 32), 212
        result_x, result_y = (width - result_width) / 2, max(top + 36, (height - result_height) / 2)
        panel(draw, (result_x, result_y, result_x + result_width, result_y + result_height), "#191737f5", color, 18)
        cx, cy = width / 2, result_y + 34
        draw.polygon(((cx, cy - 13), (cx + 3, cy - 3), (cx + 13, cy), (cx + 3, cy + 3), (cx, cy + 13), (cx - 3, cy + 3), (cx - 13, cy), (cx - 3, cy - 3)), fill=color)
        text(draw, (width / 2, result_y + 73), title, 34, color, bold=True)
        text(draw, (width / 2, result_y + 105), subtitle, 11, "#e4e0f4", bold=True)
        text(draw, (width / 2, result_y + 132), "测试牌组 · 普通 · 12 回合", 9, "#aeb7d3")
        button(draw, (result_x + 24, result_y + 154, result_x + result_width - 24, result_y + 194), "返回对战准备")
    suffix = f"battle-result-{result}" if result else "battle-board"
    output = OUTPUT / f"{suffix}-{width}x{height}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, optimize=True)
    return output


def main() -> None:
    for width, height in ((375, 812), (430, 932)):
        print(render(width, height).relative_to(ROOT))
        for result in ("win", "loss", "draw"):
            print(render(width, height, result).relative_to(ROOT))


if __name__ == "__main__":
    main()
