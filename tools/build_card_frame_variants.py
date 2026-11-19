from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "ui" / "cards" / "card-frame-original-v1.png"
OUTPUT = ROOT / "assets" / "ui" / "cards"

RARITIES = {
    "common": {"hue": 158, "saturation": 24, "value_gain": 1.16, "value_add": 18},
    "rare": {"hue": 154, "saturation": 184, "value_gain": 1.08, "value_add": 8},
    "epic": None,
    "legendary": {"hue": 17, "saturation": 188, "value_gain": 1.09, "value_add": 10},
}

GLINTS = [(72, 132, 10), (443, 148, 11), (248, 376, 14), (42, 431, 8), (467, 432, 8), (112, 286, 7), (398, 286, 7)]


def rarity_mask(image: Image.Image) -> np.ndarray:
    rgba = np.asarray(image.convert("RGBA"))
    hsv = np.asarray(image.convert("RGB").convert("HSV"))
    hue, saturation = hsv[..., 0], hsv[..., 1]
    alpha = rgba[..., 3]
    return (alpha > 8) & (hue >= 145) & (hue <= 205) & (saturation >= 38)


def recolor(source: Image.Image, rarity: str) -> Image.Image:
    if rarity == "epic":
        return source.copy()
    hsv = np.asarray(source.convert("RGB").convert("HSV")).copy()
    mask = rarity_mask(source)
    config = RARITIES[rarity]
    hsv[..., 0][mask] = config["hue"]
    original_saturation = hsv[..., 1][mask].astype(np.float32)
    if rarity == "common":
        hsv[..., 1][mask] = np.clip(original_saturation * 0.18 + config["saturation"], 10, 52).astype(np.uint8)
    else:
        hsv[..., 1][mask] = np.clip(original_saturation * 0.72 + config["saturation"] * 0.45, 90, 220).astype(np.uint8)
    value = hsv[..., 2][mask].astype(np.float32)
    hsv[..., 2][mask] = np.clip(value * config["value_gain"] + config["value_add"], 0, 255).astype(np.uint8)
    rgb = Image.fromarray(hsv, "HSV").convert("RGB")
    rgb.putalpha(source.getchannel("A"))
    return rgb


def star(draw: ImageDraw.ImageDraw, x: int, y: int, radius: int, color: tuple[int, int, int, int]) -> None:
    draw.polygon([(x, y - radius), (x + 2, y - 2), (x + radius, y), (x + 2, y + 2), (x, y + radius), (x - 2, y + 2), (x - radius, y), (x - 2, y - 2)], fill=color)


def shiny(base: Image.Image, rarity: str) -> Image.Image:
    rgba = np.asarray(base.convert("RGBA")).astype(np.float32)
    mask = rarity_mask(base)
    height, width = mask.shape
    yy, xx = np.mgrid[0:height, 0:width]
    hue = ((xx * 0.42 + yy * 0.18) % 255).astype(np.uint8)
    saturation = np.full((height, width), 205 if rarity != "common" else 155, dtype=np.uint8)
    value = np.full((height, width), 255, dtype=np.uint8)
    rainbow = np.asarray(Image.fromarray(np.dstack([hue, saturation, value]), "HSV").convert("RGB")).astype(np.float32)
    wave = (np.sin((xx + yy * 0.58) / 25.0) + 1.0) * 0.5
    strength = (0.25 if rarity == "common" else 0.32) + wave * (0.18 if rarity == "common" else 0.24)
    for channel in range(3):
        rgba[..., channel][mask] = rgba[..., channel][mask] * (1 - strength[mask]) + rainbow[..., channel][mask] * strength[mask]
    rgba[..., :3][mask] = np.clip(rgba[..., :3][mask] * 1.12 + 8, 0, 255)
    result = Image.fromarray(rgba.astype(np.uint8), "RGBA")

    foil = Image.new("RGBA", result.size)
    foil_draw = ImageDraw.Draw(foil)
    foil_colors = [
        (90, 225, 255, 78),
        (157, 119, 255, 74),
        (255, 117, 210, 70),
        (255, 226, 116, 72),
    ]
    for index, offset in enumerate(range(-360, 640, 92)):
        foil_draw.polygon(
            [(offset, 0), (offset + 54, 0), (offset + 470, height), (offset + 416, height)],
            fill=foil_colors[index % len(foil_colors)],
        )
    foil.putalpha(Image.composite(foil.getchannel("A"), Image.new("L", result.size), base.getchannel("A")))
    result = Image.alpha_composite(result, foil)

    edge = base.getchannel("A").filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(1.4))
    edge_glow = Image.new("RGBA", result.size, (174, 232, 255, 0))
    edge_glow.putalpha(edge.point(lambda value: min(150, value * 2)))
    result = Image.alpha_composite(result, edge_glow)

    glow = Image.new("RGBA", result.size)
    glow_draw = ImageDraw.Draw(glow)
    glow_color = {
        "common": (224, 245, 255, 175),
        "rare": (104, 223, 255, 190),
        "epic": (240, 134, 255, 190),
        "legendary": (255, 214, 105, 205),
    }[rarity]
    for x, y, radius in GLINTS:
        star(glow_draw, x, y, radius, glow_color)
    star(glow_draw, 434, 142, 18, (255, 255, 255, 235))
    star(glow_draw, 434, 142, 10, glow_color)
    blurred = glow.filter(ImageFilter.GaussianBlur(5))
    result = Image.alpha_composite(result, blurred)
    result = Image.alpha_composite(result, glow)
    result.putalpha(base.getchannel("A"))
    return result


def save_optimized(image: Image.Image, path: Path) -> None:
    palette = image.quantize(colors=224, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    palette.save(path, optimize=True)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    if source.size != (512, 768):
        raise SystemExit(f"Unexpected source size: {source.size}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for rarity in RARITIES:
        base = recolor(source, rarity)
        save_optimized(base, OUTPUT / f"card-frame-{rarity}-v1.png")
        save_optimized(shiny(base, rarity), OUTPUT / f"card-frame-{rarity}-shiny-v1.png")
    print("card-frame-variants-ok common rare legendary + four shiny")


if __name__ == "__main__":
    main()
