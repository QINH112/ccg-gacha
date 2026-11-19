from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

BACKGROUND = ROOT / "assets" / "backgrounds" / "battle-imagegen-v1.jpg"
OUTPUT = DESIGN / "review"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
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
    return scaled.crop((left, top, left + width, top + height)).convert("RGBA")


def panel(draw: ImageDraw.ImageDraw, rect: tuple[int, int, int, int], fill: str = "#111a39dd", outline: str = "#7480ad") -> None:
    draw.rounded_rectangle(rect, radius=10, fill=fill, outline=outline, width=1)


def text(draw: ImageDraw.ImageDraw, xy: tuple[int, int], value: str, size: int, color: str = "white", anchor: str = "la", bold: bool = False) -> None:
    draw.text(xy, value, fill=color, font=font(size, bold), anchor=anchor)


def button(draw: ImageDraw.ImageDraw, rect: tuple[int, int, int, int], title: str, enabled: bool = True, accent: bool = False) -> None:
    fill = "#8c73ddee" if accent else "#45568fdd" if enabled else "#252d4add"
    outline = "#d8c17a" if accent else "#9aa9e0" if enabled else "#555d79"
    draw.rounded_rectangle(rect, radius=9, fill=fill, outline=outline, width=1)
    text(draw, ((rect[0] + rect[2]) // 2, (rect[1] + rect[3]) // 2), title, 14, "white" if enabled else "#8991ab", "mm", True)


def render_setup(width: int, height: int) -> Path:
    canvas = cover(width, height)
    overlay = Image.new("RGBA", (width, height), "#050b2538")
    canvas = Image.alpha_composite(canvas, overlay)
    draw = ImageDraw.Draw(canvas, "RGBA")
    header_top = 110
    top = header_top + 55
    text(draw, (23, header_top + 19), "‹", 31, "#eee8ff", "mm")
    text(draw, (50, header_top + 15), "PVE 对战", 23, "#f6f1ff", "lm", True)
    text(draw, (50, header_top + 39), "选择完整牌组与电脑难度", 10, "#ccd2e8", "lm")
    text(draw, (14, top + 9), "选择牌组", 12, "#ebe7f5", "la", True)
    y = top + 24
    for index in range(5):
        chosen = index == 0
        panel(draw, (12, y, width - 12, y + 39), "#4b4179e8" if chosen else "#111a39dd", "#dec878" if chosen else "#6470a0")
        text(draw, (24, y + 14), f"牌组 {index + 1}", 11, bold=True)
        text(draw, (24, y + 30), "20/20 · 星界洞察" if index < 2 else "牌组不可用", 8, "#cdd3e8" if index < 2 else "#d89898")
        y += 46
    y += 8
    text(draw, (14, y), "难度", 12, "#ebe7f5", bold=True)
    y += 15
    gap = 5
    button_width = (width - 24 - gap * 2) // 3
    for index, label in enumerate(("简单", "普通", "困难")):
        left = 12 + index * (button_width + gap)
        button(draw, (left, y, left + button_width, y + 36), label, True, index == 1)
    y += 50
    button(draw, (12, y, width - 12, y + 47), "开始对战", True, True)
    output = OUTPUT / f"battle-setup-{width}x{height}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, optimize=True)
    return output


def render_history(width: int, height: int) -> Path:
    canvas = cover(width, height)
    overlay = Image.new("RGBA", (width, height), "#050b2548")
    canvas = Image.alpha_composite(canvas, overlay)
    draw = ImageDraw.Draw(canvas, "RGBA")
    header_top = 110
    top = header_top + 55
    text(draw, (23, header_top + 19), "‹", 31, "#eee8ff", "mm")
    text(draw, (50, header_top + 15), "对战记录", 23, "#f6f1ff", "lm", True)
    text(draw, (50, header_top + 39), "最近 100 场 PVE 对局", 10, "#ccd2e8", "lm")
    rows = (("胜利", "普通", "群星旅团", 12, "#79c39f"), ("失败", "困难", "星骸远征", 18, "#a96373"), ("平局", "简单", "群星旅团", 50, "#8992ba"))
    y = top
    for result, difficulty, deck, turns, color in rows:
        panel(draw, (12, y, width - 12, y + 70), "#111a39e8", color)
        text(draw, (24, y + 20), f"{result} · {difficulty}", 14, bold=True)
        text(draw, (24, y + 47), f"{deck} · {turns} 回合", 10, "#d0d5eb")
        text(draw, (width - 23, y + 20), "2026/11/17 21:30", 8, "#aeb7d8", "ra")
        y += 78
    output = OUTPUT / f"battle-history-{width}x{height}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, optimize=True)
    return output


def main() -> None:
    for width, height in ((375, 812), (430, 932)):
        print(render_setup(width, height).relative_to(ROOT))
        print(render_history(width, height).relative_to(ROOT))


if __name__ == "__main__":
    main()
