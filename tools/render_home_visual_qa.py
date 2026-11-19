from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

MANIFEST = ROOT / "assets" / "ui" / "home" / "manifest.json"
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


def rgba_asset(relative_path: str) -> Image.Image:
    return Image.open(ROOT / relative_path).convert("RGBA")


def paste_scaled(canvas: Image.Image, asset: Image.Image, rect: tuple[float, float, float, float], alpha: float = 1.0) -> None:
    x, y, width, height = rect
    scaled = asset.resize((max(1, round(width)), max(1, round(height))), Image.Resampling.LANCZOS)
    if alpha < 1:
        scaled.putalpha(scaled.getchannel("A").point(lambda value: round(value * alpha)))
    canvas.alpha_composite(scaled, (round(x), round(y)))


def rounded_panel(draw: ImageDraw.ImageDraw, rect: tuple[float, float, float, float], radius: float, fill: str, outline: str) -> None:
    x, y, width, height = rect
    draw.rounded_rectangle((x, y, x + width, y + height), radius=radius, fill=fill, outline=outline, width=1)


def centered_text(draw: ImageDraw.ImageDraw, xy: tuple[float, float], value: str, size: int, color: str, bold: bool = False) -> None:
    draw.text(xy, value, fill=color, font=font(size, bold), anchor="mm")


def render(width: int, height: int, suffix: str) -> Path:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    scale_x = width / 941
    scale_y = height / 1672
    ui_scale = width / 941
    top_cut, bottom_cut = 720, 1350
    top_height = top_cut * ui_scale
    bottom_height = (1672 - bottom_cut) * ui_scale
    middle_height = max(1, height - top_height - bottom_height)
    middle_scale = middle_height / (bottom_cut - top_cut)

    def ui_y(source_y: float) -> float:
        if source_y >= bottom_cut:
            return height - (1672 - source_y) * ui_scale
        if source_y >= top_cut:
            return top_height + (source_y - top_cut) * middle_scale
        return source_y * ui_scale

    background = Image.open(ROOT / manifest["background"]).convert("RGB")
    scale = width / 941
    top_cut, bottom_cut = 720, 1350
    top_height = round(top_cut * scale)
    bottom_height = round((1672 - bottom_cut) * scale)
    middle_height = height - top_height - bottom_height
    canvas = Image.new("RGBA", (width, height))
    top_slice = background.crop((0, 0, 941, top_cut)).resize((width, top_height), Image.Resampling.LANCZOS)
    middle_slice = background.crop((0, top_cut, 941, bottom_cut)).resize((width, middle_height), Image.Resampling.LANCZOS)
    bottom_slice = background.crop((0, bottom_cut, 941, 1672)).resize((width, bottom_height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(top_slice.convert("RGBA"), (0, 0))
    canvas.alpha_composite(middle_slice.convert("RGBA"), (0, top_height))
    canvas.alpha_composite(bottom_slice.convert("RGBA"), (0, height - bottom_height))
    draw = ImageDraw.Draw(canvas, "RGBA")
    assets = manifest["assets"]

    def rect(key: str) -> tuple[float, float, float, float]:
        source = assets[key]["sourceRect"]
        return source[0] * ui_scale, ui_y(source[1]), source[2] * ui_scale, source[3] * ui_scale

    paste_scaled(canvas, rgba_asset(assets["player"]["path"]), rect("player"))
    draw.text((31 * scale_x, 331 * scale_y), "云端账号 · qa-player", fill="#b8f1d7", font=font(round(11 * scale_x), True))
    draw.text((31 * scale_x, 351 * scale_y), "累计召唤 128", fill="#d4d9f0", font=font(round(10 * scale_x)))

    pill_y = 257 * scale_y
    pill_h = max(28, 52 * scale_y)
    pill_gap = 10 * scale_x
    pill_x = 350 * scale_x
    pill_w = (width - pill_x - 20 * scale_x - pill_gap * 2) / 3
    for index, (icon, value, label) in enumerate((("券", "99", "抽卡券"), ("●", "1600", "金币"), ("✦", "780", "星尘"))):
        x = pill_x + index * (pill_w + pill_gap)
        rounded_panel(draw, (x, pill_y, pill_w, pill_h), pill_h / 2, "#293572dd", "#a4b0ecaa")
        icon_key = ("ticket", "coin", "dust")[index]
        icon_asset = rgba_asset(assets[icon_key]["path"]).crop((0, 0, 58, 48))
        paste_scaled(canvas, icon_asset, (x + 3, pill_y + 3, pill_h - 6, pill_h - 6))
        draw.text((x + pill_h * .83, pill_y + pill_h * .16), value, fill="white", font=font(round(pill_h * .3), True))
        draw.text((x + pill_h * .83, pill_y + pill_h * .57), label, fill="#cbd4ff", font=font(round(pill_h * .14)))

    pool_keys = ("poolBase", "poolMixed", "poolStarRemnant")
    pool_top = 619 * scale_y
    pool_bottom = 958 * scale_y
    pool_height = pool_bottom - pool_top
    pool_gap = 8 * scale_x
    pool_width = (width - 56 * scale_x - pool_gap * 2) / 3
    for index, key in enumerate(pool_keys):
        source = assets[key]["sourceRect"]
        natural_ratio = source[2] / source[3]
        target_height = min(pool_height, pool_width / natural_ratio)
        target_rect = (28 * scale_x + index * (pool_width + pool_gap), pool_top + (pool_height - target_height) / 2, pool_width, target_height)
        paste_scaled(canvas, rgba_asset(assets[key]["path"]), target_rect)
        if index == 0:
            x, y, target_width, target_height = target_rect
            draw.rounded_rectangle((x, y, x + target_width, y + target_height), radius=12, outline="#ffe19b", width=2)

    draw_y = 992 * scale_y
    draw_h = max(42, 108 * scale_y)
    draw_gap = 12 * scale_x
    draw_margin = 38 * scale_x
    draw_w = (width - draw_margin * 2 - draw_gap * 2) / 3
    for index, (title, count) in enumerate((("单抽", 1), ("五连", 5), ("十连", 10))):
        x = draw_margin + index * (draw_w + draw_gap)
        fill = "#e5b878" if count == 10 else "#5365a7"
        outline = "#ffe3a7" if count == 10 else "#aeb8f3"
        rounded_panel(draw, (x, draw_y, draw_w, draw_h), draw_h / 2, fill, outline)
        ticket_icon = rgba_asset(assets["ticket"]["path"]).crop((0, 0, 58, 48))
        paste_scaled(canvas, ticket_icon, (x + draw_w * .12, draw_y + draw_h * .24, draw_h * .48, draw_h * .48))
        centered_text(draw, (x + draw_w * .58, draw_y + draw_h * .38), title, round(draw_h * .28), "#fff", True)
        centered_text(draw, (x + draw_w * .58, draw_y + draw_h * .72), f"消耗 {count}", round(draw_h * .16), "#e7e9ff")

    runtime_menu_rects = {
        "sign": (27, 1148, 135, 125),
        "history": (178, 1148, 132, 125),
        "collection": (327, 1148, 134, 125),
        "workshop": (478, 1148, 130, 125),
        "shop": (628, 1148, 137, 125),
        "adjustAnnouncement": (779, 1148, 135, 125),
        "mail": (35, 1315, 132, 141),
        "tasks": (187, 1315, 135, 141),
        "achievements": (344, 1315, 132, 141),
        "decks": (501, 1315, 130, 141),
        "battle": (658, 1315, 121, 141),
        "battleHistory": (810, 1315, 116, 141),
    }

    def runtime_rect(key: str) -> tuple[float, float, float, float]:
        source = runtime_menu_rects[key]
        return source[0] * ui_scale, ui_y(source[1]), source[2] * ui_scale, source[3] * ui_scale

    menu_keys = ("sign", "history", "collection", "workshop", "shop", "adjustAnnouncement", "mail", "tasks", "achievements", "decks", "battle", "battleHistory")
    for key in menu_keys:
        paste_scaled(canvas, rgba_asset(assets[key]["path"]), runtime_rect(key))
    announcement_rect = runtime_rect("adjustAnnouncement")
    dot_radius = max(3, round(8 * ui_scale))
    dot_x = announcement_rect[0] + announcement_rect[2] - 8 * ui_scale
    dot_y = announcement_rect[1] + 8 * ui_scale
    draw.ellipse((dot_x - dot_radius, dot_y - dot_radius, dot_x + dot_radius, dot_y + dot_radius), fill="#ff566d")

    centered_text(draw, (width / 2, 1492 * scale_y), "当前卡池：基础召唤池", max(8, round(11 * scale_x)), "#ffe09a", True)
    reset_asset = rgba_asset(assets["cloudSave"]["path"])
    paste_scaled(canvas, reset_asset, rect("cloudSave"))

    output = OUTPUT / f"home-{suffix}.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, optimize=True)
    return output


def main() -> None:
    for width, height, suffix in ((320, 568, "320x568"), (375, 812, "375x812"), (393, 852, "393x852"), (430, 932, "430x932")):
        print(render(width, height, suffix).relative_to(ROOT))


if __name__ == "__main__":
    main()
