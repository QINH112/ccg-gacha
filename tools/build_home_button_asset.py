#!/usr/bin/env python
"""Build the "adjust announcement" home-menu button from the game's own tile.

Pipeline
1. Take an existing 4-character home tile (default: 每日签到) and dissolve its
   icon + label with a diffusion fill, so the indigo glass frame and rim light
   stay pixel-identical to the shipped buttons.
2. Cut the ComfyUI icon out of its chroma-key background, grade it, and drop it
   on the tile with a soft contact shadow.
3. Render the Chinese label with a system font at 4x and downsample, so the
   strokes are clean at 152x141.

Usage:
  D:/ComfyUI-venv/Scripts/python.exe tools/build_home_button_asset.py \
      --icon _gen/raw/megaphone-green_1101.png --label 调整公告 --out _gen/button
"""
import argparse
import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, "assets", "ui", "home", "sign.png")
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_NOTO = r"C:\Windows\Fonts\Noto Sans SC Bold (TrueType).otf"

# Interior of the tile that gets rebuilt. Keeps the outer 10 px rim intact.
ERASE = (14, 12, 140, 132)  # left, top, right(exclusive), bottom(exclusive)


def diffuse_fill(rgb: np.ndarray, mask: np.ndarray, iterations: int = 260) -> np.ndarray:
    """Rebuild the masked region from the untouched side bands of the tile.

    The shipped tiles are a vertical indigo gradient with a soft top-left
    sheen, so the left and right margins of every row describe the background
    almost exactly. Interpolating between them keeps the fill seamless.
    """
    height, width = mask.shape
    filled = rgb.astype(np.float32).copy()

    left_slice = slice(18, 29)
    right_slice = slice(125, 137)
    for y in range(height):
        left = np.median(rgb[y, left_slice], axis=0)
        right = np.median(rgb[y, right_slice], axis=0)
        row_xs = np.where(mask[y])[0]
        if not len(row_xs):
            continue
        span = max(1, right_slice.stop - left_slice.start)
        weights = ((row_xs - left_slice.start) / span)[:, None]
        filled[y, row_xs] = left * (1 - weights) + right * weights

    # Smooth the stitched band, then feather it into the untouched rim.
    smooth = np.asarray(Image.fromarray(np.clip(filled, 0, 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(2.4)), dtype=np.float32)
    feather = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(1.6)), dtype=np.float32)[..., None] / 255.0
    filled = filled * (1 - feather) + smooth * feather

    # A whisper of grain so the fill does not band against the AI artwork.
    noise = np.random.default_rng(7).normal(0, 0.8, size=(height, width, 1))
    return np.clip(filled + noise * mask[..., None], 0, 255)


def cutout_green(image: Image.Image) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]

    # Chroma key: anything clearly greener than it is red/blue is background.
    key = (g > 55) & (g - np.maximum(r, b) > 8)
    subject = ~key

    # Keep only the connected blob nearest the center, dropping stray props.
    mask = Image.fromarray((subject * 255).astype(np.uint8)).copy()
    width, height = mask.size
    seed = None
    for radius in range(0, max(width, height) // 2, 6):
        for dx, dy in ((0, 0), (radius, 0), (-radius, 0), (0, radius), (0, -radius)):
            x, y = width // 2 + dx, height // 2 + dy
            if 0 <= x < width and 0 <= y < height and mask.getpixel((x, y)) == 255:
                seed = (x, y)
                break
        if seed:
            break
    if seed:
        ImageDraw.floodfill(mask, seed, 128, thresh=0)
        keep = np.asarray(mask) == 128
    else:
        keep = subject

    alpha = np.where(keep, 255, 0).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(1.0)))

    # Pull the green key spill out of the fringe.
    fringe = (alpha > 0) & (alpha < 255)
    rgb[..., 1] = np.where(fringe, np.minimum(rgb[..., 1], (rgb[..., 0] + rgb[..., 2]) / 2), rgb[..., 1])

    rgba = np.dstack((np.clip(rgb, 0, 255).astype(np.uint8), alpha))
    cut = Image.fromarray(rgba, "RGBA")
    bbox = cut.getbbox()
    return cut.crop(bbox) if bbox else cut


def cutout_white(image: Image.Image) -> Image.Image:
    """Fallback for icons rendered on a plain white background."""
    rgba = image.convert("RGBA")
    rgb = np.asarray(rgba, dtype=np.int16)[..., :3]
    near_white = np.all(rgb >= 244, axis=2).astype(np.uint8) * 255
    flood = Image.fromarray(near_white).copy()
    width, height = flood.size
    for seed in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1),
                 (width // 2, 0), (0, height // 2), (width - 1, height // 2), (width // 2, height - 1)]:
        if flood.getpixel(seed) == 255:
            ImageDraw.floodfill(flood, seed, 128, thresh=12)
    background = np.asarray(flood) == 128
    alpha = np.where(background, 0, 255).astype(np.uint8)
    alpha = np.asarray(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.8)))
    out = np.dstack((np.asarray(rgba)[..., :3], alpha))
    cut = Image.fromarray(out, "RGBA")
    bbox = cut.getbbox()
    return cut.crop(bbox) if bbox else cut


def fit_icon(icon: Image.Image, box_w: int, box_h: int) -> Image.Image:
    scale = min(box_w / icon.width, box_h / icon.height)
    size = (max(1, round(icon.width * scale)), max(1, round(icon.height * scale)))
    return icon.resize(size, Image.LANCZOS)


def grade_icon(icon: Image.Image) -> Image.Image:
    """Lift saturation slightly and cool the shadows toward the tile's indigo."""
    rgba = np.asarray(icon, dtype=np.float32)
    rgb, alpha = rgba[..., :3], rgba[..., 3:4]
    luma = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    rgb = np.clip((rgb - luma[..., None]) * 1.06 + luma[..., None], 0, 255)
    shadow = np.clip(1.0 - luma / 110.0, 0, 1)[..., None]
    rgb = rgb * (1 - 0.10 * shadow) + np.array([34, 30, 74], np.float32) * 0.10 * shadow
    rgb = np.clip(rgb * 1.02 + 2, 0, 255)
    return Image.fromarray(np.dstack((rgb, alpha)).astype(np.uint8), "RGBA")


def layout(font: ImageFont.FreeTypeFont, text: str, tracking: float):
    """Draw origins for each glyph plus the total ink width."""
    origins = []
    cursor = 0.0
    for char in text:
        left, _top, _right, _bottom = font.getbbox(char)
        origins.append(cursor - left)
        cursor += font.getlength(char) + tracking
    return origins, cursor - tracking


def render_label(text: str, font_path: str, tile_w: int, tile_h: int,
                 center: tuple[float, float], target_width: int,
                 scale: int = 4, outline: float = 1.0, body_stroke: float = 0.3,
                 tracking: float = 1.6, outline_color=(42, 35, 84),
                 outline_offset: float = 0.8) -> Image.Image:
    big = Image.new("RGBA", (tile_w * scale, tile_h * scale), (0, 0, 0, 0))

    # Pick the font size whose glyph run (including tracking) matches the
    # reference label width.
    size = 12
    for candidate in range(14, 44):
        font = ImageFont.truetype(font_path, candidate * scale)
        _origins, total = layout(font, text, tracking * scale)
        if total >= target_width * scale:
            size = candidate
            break
    font = ImageFont.truetype(font_path, size * scale)
    origins, total = layout(font, text, tracking * scale)

    # Vertical placement from the tallest glyph.
    ascent_top = min(font.getbbox(char)[1] for char in text)
    descent_bottom = max(font.getbbox(char)[3] for char in text)
    ink_height = descent_bottom - ascent_top
    x0 = center[0] * scale - total / 2
    y0 = center[1] * scale - ink_height / 2 - ascent_top

    def draw_chars(layer: Image.Image, fill, stroke: float, dx: float, dy: float):
        pen = ImageDraw.Draw(layer)
        for char, origin in zip(text, origins):
            pen.text((x0 + origin + dx, y0 + dy), char, font=font, fill=fill,
                     stroke_width=max(0, round(stroke * scale)), stroke_fill=fill)

    # 1. soft drop shadow
    shadow = Image.new("RGBA", big.size, (0, 0, 0, 0))
    draw_chars(shadow, (14, 10, 34, 185), 0.4, 0, 2.2)
    big.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(1.5 * scale)))

    # 2. dark outline, nudged down like the sticker edge on the shipped tiles
    draw_chars(big, outline_color + (255,), outline, 0, outline_offset)

    # 3. white body with a faint cool gradient toward the baseline
    body = Image.new("RGBA", big.size, (0, 0, 0, 0))
    draw_chars(body, (255, 255, 255, 255), body_stroke, 0, 0)
    body_mask = body.split()[3]
    grad_pixels = np.zeros((big.height, big.width, 4), dtype=np.uint8)
    ys = np.linspace(0, 1, big.height)[:, None]
    shade = np.clip(1.0 - (ys - 0.6) * 0.45, 0.8, 1.0)
    grad_pixels[..., 0] = (255 * shade).astype(np.uint8)
    grad_pixels[..., 1] = (250 * shade).astype(np.uint8)
    grad_pixels[..., 2] = 255
    grad_pixels[..., 3] = 255
    big.paste(Image.fromarray(grad_pixels, "RGBA"), (0, 0), body_mask)

    return big.resize((tile_w, tile_h), Image.LANCZOS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--icon", required=True)
    parser.add_argument("--label", default="调整公告")
    parser.add_argument("--font", default=FONT_BOLD)
    parser.add_argument("--out", default=os.path.join(ROOT, "_gen", "button"))
    parser.add_argument("--variant", default="v1")
    parser.add_argument("--icon-width", type=int, default=104)
    parser.add_argument("--icon-height", type=int, default=82)
    parser.add_argument("--icon-center", default="76,52")
    parser.add_argument("--label-center", default="76,114")
    parser.add_argument("--label-width", type=int, default=90)
    parser.add_argument("--label-outline", type=float, default=1.0)
    parser.add_argument("--label-stroke", type=float, default=0.3)
    parser.add_argument("--label-tracking", type=float, default=1.6)
    parser.add_argument("--cutout", choices=("auto", "green", "white"), default="auto")
    parser.add_argument("--keep", action="store_true", help="skip icon, only rebuild label")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    template = Image.open(TEMPLATE).convert("RGBA")
    width, height = template.size

    rgb = np.asarray(template.convert("RGB"), dtype=np.float32)
    alpha = np.asarray(template)[..., 3]
    mask = np.zeros((height, width), dtype=bool)
    left, top, right, bottom = ERASE
    mask[top:bottom, left:right] = True
    rebuilt = diffuse_fill(rgb, mask)

    tile = Image.fromarray(np.dstack((np.clip(rebuilt, 0, 255).astype(np.uint8), alpha)), "RGBA")

    # Soft halo behind the icon so the center reads as lit, like the other tiles.
    if not args.keep:
        halo = Image.new("L", tile.size, 0)
        radius = 58
        ImageDraw.Draw(halo).ellipse((76 - radius, 48 - radius, 76 + radius, 48 + radius), fill=255)
        halo = halo.filter(ImageFilter.GaussianBlur(16)).point(lambda value: int(value * 0.22))
        glow = Image.new("RGBA", tile.size, (150, 158, 226, 255))
        glow.putalpha(halo)
        tile = Image.alpha_composite(tile, glow)

    preview = tile.copy()
    if not args.keep:
        source = Image.open(args.icon)
        mode = args.cutout
        if mode == "auto":
            probe = np.asarray(source.convert("RGB"), dtype=np.float32)
            border = np.concatenate([probe[0], probe[-1], probe[:, 0], probe[:, -1]])
            greenish = (border[:, 1] - np.maximum(border[:, 0], border[:, 2]) > 8).mean()
            mode = "green" if greenish > 0.5 else "white"
        cut = cutout_green(source) if mode == "green" else cutout_white(source)
        cut = grade_icon(cut)
        cut = fit_icon(cut, args.icon_width, args.icon_height)
        cx, cy = [float(value) for value in args.icon_center.split(",")]
        px, py = round(cx - cut.width / 2), round(cy - cut.height / 2)

        # contact shadow under the icon
        shadow = Image.new("RGBA", tile.size, (0, 0, 0, 0))
        shadow_cut = Image.new("RGBA", tile.size, (0, 0, 0, 0))
        shadow_cut.paste((10, 8, 30, 150), (px + 1, py + 3), cut)
        shadow = shadow_cut.filter(ImageFilter.GaussianBlur(3.4))
        tile.alpha_composite(shadow)
        tile.alpha_composite(cut, (px, py))

    label_center = tuple(float(value) for value in args.label_center.split(","))
    text = render_label(args.label, args.font, width, height, label_center, args.label_width,
                        outline=args.label_outline, body_stroke=args.label_stroke,
                        tracking=args.label_tracking)
    tile.alpha_composite(text)

    output = os.path.join(args.out, f"adjust-announcement-{args.variant}.png")
    tile.save(output)
    preview = tile
    preview.resize((width * 4, height * 4), Image.LANCZOS).save(
        os.path.join(args.out, f"adjust-announcement-{args.variant}@4x.png"))

    meta = {
        "output": output,
        "template": os.path.relpath(TEMPLATE, ROOT).replace("\\", "/"),
        "label": args.label,
        "font": os.path.basename(args.font),
        "icon": os.path.relpath(args.icon, ROOT).replace("\\", "/") if not args.keep else None,
        "size": [width, height],
        "icon_width": args.icon_width,
        "icon_height": args.icon_height,
        "icon_center": args.icon_center,
        "label_center": args.label_center,
        "label_width": args.label_width,
    }
    with open(os.path.join(args.out, f"adjust-announcement-{args.variant}.json"), "w", encoding="utf-8") as handle:
        json.dump(meta, handle, ensure_ascii=False, indent=2)
    print("OUTPUT", output)


if __name__ == "__main__":
    main()
