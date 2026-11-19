from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

BACKGROUND = ROOT / "assets" / "backgrounds" / "battle-imagegen-v1.jpg"
OUTPUT = DESIGN / "review"


def font(size: int, bold: bool = False):
    candidates = [
        Path("C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
    ]
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
    canvas.alpha_composite(Image.new("RGBA", (width, height), "#05091f55"))
    return canvas


def text(draw, xy, value, size, color="#fff", anchor="la", bold=False):
    draw.text(xy, value, fill=color, font=font(size, bold), anchor=anchor)


def panel(draw, rect, fill="#111a39e8", outline="#6473a5", radius=10):
    draw.rounded_rectangle(rect, radius=radius, fill=fill, outline=outline, width=1)


def button(draw, rect, title, enabled=True, accent=False):
    fill = "#725bb6ee" if accent else "#45568fdd" if enabled else "#252d4add"
    outline = "#e4ca83" if accent else "#9aa9e0" if enabled else "#555d79"
    draw.rounded_rectangle(rect, radius=9, fill=fill, outline=outline, width=1)
    text(draw, ((rect[0] + rect[2]) // 2, (rect[1] + rect[3]) // 2), title, 13, "#fff" if enabled else "#8991ab", "mm", True)


def sigil(draw, x, y, size, color):
    draw.polygon(((x, y - size), (x + size * .22, y - size * .22), (x + size, y), (x + size * .22, y + size * .22), (x, y + size), (x - size * .22, y + size * .22), (x - size, y), (x - size * .22, y - size * .22)), fill=color)


def header(draw, width, title, subtitle):
    top = 100
    text(draw, (23, top + 19), "‹", 31, "#eee8ff", "mm")
    text(draw, (50, top + 15), title, 23, "#f6f1ff", "lm", True)
    text(draw, (50, top + 39), subtitle, 10, "#ccd2e8")
    return top + 55


def render_page(width: int, height: int, page: str) -> Path:
    canvas = cover(width, height)
    draw = ImageDraw.Draw(canvas, "RGBA")
    if page == "shop":
        top = header(draw, width, "商店", "金币 1300 · 抽卡券 134")
        panel(draw, (16, top + 18, width - 16, top + 208), "#151b38ee", "#9ba9e0")
        text(draw, (width / 2, top + 53), "抽卡券", 24, anchor="mm", bold=True)
        text(draw, (width / 2, top + 82), "每张可进行 1 次召唤", 11, "#d4d9eb", "mm")
        text(draw, (width / 2, top + 116), "100 金币 / 张", 18, "#f1d082", "mm", True)
        button(draw, (40, top + 148, width - 40, top + 192), "选择购买数量", True, True)
        text(draw, (width / 2, top + 240), "金币与抽卡券均由云端结算", 10, "#aeb7d8", "mm")
    elif page == "mail":
        top = header(draw, width, "邮箱", "2 封可领取邮件")
        button(draw, (12, top, width - 12, top + 38), "一键领取", True, True)
        for i, (title, reward) in enumerate((("11.17奖励", "随机史诗卡×1 · 9999金币 · 99券"), ("测试邮件", "1 抽卡券"))):
            y = top + 48 + i * 134
            panel(draw, (12, y, width - 12, y + 126))
            text(draw, (26, y + 20), title, 14, anchor="lm", bold=True)
            text(draw, (width - 26, y + 20), "11/17 · 剩余30天", 9, "#aeb7d8", "rm")
            text(draw, (26, y + 46), "系统奖励邮件", 10, "#d1d6e9")
            text(draw, (26, y + 76), reward, 10, "#efd181")
            button(draw, (width - 94, y + 66, width - 14, y + 104), "领取", True)
    elif page in ("tasks", "achievements"):
        title = "每日与每周任务" if page == "tasks" else "星界成就"
        subtitle = "按北京时间刷新" if page == "tasks" else "分阶段领取，每个阶段独立奖励"
        top = header(draw, width, title, subtitle)
        button(draw, (12, top, width - 12, top + 38), "一键领取", True, True)
        if page == "tasks":
            button(draw, (12, top + 48, (width - 18) / 2, top + 82), "每日任务", True)
            button(draw, ((width + 6) / 2, top + 48, width - 12, top + 82), "每周任务", True)
        for i, (name, progress, reward) in enumerate((("完成一次召唤", "10 / 10", "5券"), ("登录游戏", "1 / 1", "100金币"), ("收集普通卡", "18 / 30", "10券"))):
            y = top + (94 if page == "tasks" else 48) + i * 98
            panel(draw, (12, y, width - 12, y + 91), "#111a39e8", "#d2b968" if i == 0 else "#6473a5")
            text(draw, (25, y + 18), name, 13, anchor="lm", bold=True)
            text(draw, (25, y + 43), progress, 10, "#efd27e" if i == 0 else "#b9c2da")
            text(draw, (25, y + 70), reward, 10, "#efd181")
            button(draw, (width - 94, y + 27, width - 14, y + 65), "领取" if i == 0 else "未完成", i == 0)
    elif page == "decks":
        top = header(draw, width, "我的牌组", "最多保存 5 副牌组 · 每副 20 张")
        for i in range(5):
            y = top + i * 87
            panel(draw, (12, y, width - 12, y + 78), "#111a39e8", "#d4bd69" if i == 0 else "#6473a5")
            text(draw, (26, y + 21), f"牌组 {i + 1}", 15, anchor="lm", bold=True)
            text(draw, (26, y + 47), "20 / 20 · 星界洞察" if i == 0 else "0 / 20 · 星界洞察", 10, "#efd17e" if i == 0 else "#b9c2da")
            text(draw, (width - 102, y + 21), "可用" if i == 0 else "未完成", 10, "#8fe0b7" if i == 0 else "#dc9c9c", "mm")
            button(draw, (width - 102, y + 37, width - 14, y + 68), "编辑" if i == 0 else "新建", True)
    elif page == "collection":
        top = header(draw, width, "星界卡牌图鉴", "已收集 18 / 72 种")
        button(draw, (12, top, width - 12, top + 36), "卡包筛选：全部卡包", True)
        cols = 3
        gap = 7
        card_w = (width - 24 - gap * (cols - 1)) / cols
        card_h = card_w * 1.5
        for i in range(9):
            x = 12 + (i % cols) * (card_w + gap)
            y = top + 46 + (i // cols) * (card_h + 27)
            panel(draw, (x, y, x + card_w, y + card_h), "#20284bdd", "#b76de5" if i % 4 == 0 else "#8993aa", 7)
            sigil(draw, x + card_w / 2, y + 28, 12, "#dda2ff")
            text(draw, (x + card_w / 2, y + card_h * .53), "星骸卡牌", 9, anchor="mm", bold=True)
            text(draw, (x + card_w / 2, y + card_h + 11), "1 / 闪 0", 8, "#d1d6e9", "mm")
    elif page == "forge":
        top = header(draw, width, "卡牌工坊", "星尘 780 · 所有卡包通用")
        for i in range(5):
            y = top + i * 104
            panel(draw, (12, y, width - 12, y + 96), "#11172bee", "#b76de5" if i == 0 else "#6473a5")
            sigil(draw, 45, y + 34, 14, "#dda2ff")
            text(draw, (65, y + 18), "星骸巨像", 13, anchor="lm", bold=True)
            text(draw, (65, y + 38), "史诗 · 普通 1 · 闪耀 0", 9, "#d1d6e9")
            text(draw, (65, y + 58), "分解 +100 星尘", 9, "#efd181")
            button(draw, (width - 138, y + 23, width - 82, y + 59), "分解", True)
            button(draw, (width - 76, y + 23, width - 14, y + 59), "闪耀", True)
    else:
        top = header(draw, width, "召唤记录", "最近 100 批 · 云端最多保存 2000 批")
        for i, (pool, draw_type, rarity) in enumerate((("基础召唤池", "十连", "史诗"), ("星骸遗响", "单抽", "普通"), ("混合召唤池", "五连", "稀有"))):
            y = top + i * 73
            panel(draw, (12, y, width - 12, y + 66), "#111a39e8")
            text(draw, (24, y + 19), pool, 13, anchor="lm", bold=True)
            text(draw, (24, y + 42), f"{draw_type} · 最高 {rarity}", 10, "#d1d6e9")
            text(draw, (width - 24, y + 19), "2026/11/17", 9, "#aeb7d8", "rm")
    output = OUTPUT / f"service-{page}-{width}x{height}.png"
    OUTPUT.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, optimize=True)
    return output


def main() -> None:
    for width, height in ((375, 812), (430, 932)):
        for page in ("shop", "mail", "tasks", "achievements", "decks", "collection", "forge", "history"):
            print(render_page(width, height, page).relative_to(ROOT))


if __name__ == "__main__":
    main()
