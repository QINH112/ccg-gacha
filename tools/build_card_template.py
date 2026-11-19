"""Build a blank (text-free, art-free) card template from the source Hearthstone card.

Pipeline
--------
1. locate every text glyph (light filled glyph + dark outline for title / gems / race,
   dark print for the rules box) inside hand-checked region boxes;
2. erase it with a harmonic (Laplace) fill seeded by OpenCV inpainting, then restore the
   original surface grain so parchment / ribbon / gem faces stay believable;
3. clear residual ink islands that survived the first pass (tight high-contrast check);
4. rebuild the card-art window as an empty slot: opaque placeholder variant, a transparent
   alpha-window variant and a standalone window mask;
5. export slot geometry (px + normalized) as JSON for the game renderer, plus a preview.

Run with a Python that has opencv + numpy + Pillow:
    python tools/build_card_template.py
"""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

SRC = DESIGN / "card-template" / "source-hs-card.png"
OUT = DESIGN / "card-template"
DEBUG = OUT / "debug"

# box: search area for text pixels; band: tight glyph box used by the residual-ink pass.
TEXT_REGIONS = {
    "title": {"box": (106, 358, 406, 438), "band": (112, 372, 398, 432), "kind": "light",
              "method": "vertical", "clip": (108, 366, 402, 432)},
    "rules": {"box": (98, 468, 402, 604), "band": (100, 474, 400, 602), "kind": "dark"},
    "race": {"box": (200, 616, 340, 664), "band": (208, 622, 298, 660), "kind": "light", "radius": 5.0,
             "method": "vertical", "clip": (206, 620, 300, 662)},
}

BRIGHT = 205      # white glyph fill
INK = 112         # dark glyph outline
RULE_INK = 150    # printed rules text on parchment

# Each gem: search box for the digit + the ellipse that clips the search to the gem face.
GEMS = {
    "mana": {"box": (30, 72, 152, 200), "clip": (92, 137, 55, 58)},
    "attack": {"box": (46, 594, 132, 686), "clip": (89, 639, 35, 38)},
    "health": {"box": (386, 578, 462, 696), "clip": (424, 641, 30, 43)},
}

# Card-art window: the painted art fills an oval plus a strip that runs under it down to
# the title ribbon, so the slot is the union of the oval and that strip.
ART_ELLIPSE = (260.0, 227.0, 133.0, 130.0)
WINDOW_FLOOR = (261, 310, 116, 42, "ellipse")
# Painted art also bleeds into the strip between the oval ring and the title ribbon; that
# bleed is detected by its saturated red/purple hue and painted out separately.
BLEED_BAND = (132, 302, 392, 380)
WIDE_BLEED = (100, 292, 414, 380)


# --------------------------------------------------------------------------- masks
def blit(local: np.ndarray, origin: tuple[int, int], shape: tuple[int, int]) -> np.ndarray:
    full = np.zeros(shape, dtype=bool)
    x0, y0 = origin
    full[y0:y0 + local.shape[0], x0:x0 + local.shape[1]] = local
    return full


def text_mask(rgb: np.ndarray, region: dict) -> tuple[np.ndarray, tuple[int, int]]:
    x0, y0, x1, y1 = region["box"]
    patch = rgb[y0:y1, x0:x1]
    value = patch.max(axis=2)
    if region["kind"] == "dark":
        mask = value < RULE_INK
    else:
        neutral = (patch.min(axis=2) > 188) & ((value - patch.min(axis=2)) < 45)
        bright = neutral.astype(np.uint8)
        # glyph outline only: dark pixels hugging the filled glyph
        distance = cv2.distanceTransform(1 - bright, cv2.DIST_L2, 5)
        outline = (value < INK) & (distance <= region.get("radius", 9.0))
        mask = (bright > 0) | outline
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return mask.astype(bool), (x0, y0)


def gem_mask(rgb: np.ndarray, gem: dict) -> tuple[np.ndarray, tuple[int, int]]:
    """The printed digit plus its outline, clipped to the gem face."""
    x0, y0, x1, y1 = gem["box"]
    patch = rgb[y0:y1, x0:x1]
    value = patch.max(axis=2)
    low = patch.min(axis=2)
    white = ((low > 200) & ((value - low) < 60)).astype(np.uint8)
    distance = cv2.distanceTransform(1 - white, cv2.DIST_L2, 5)
    outline = (value < 95) & (distance <= 6.0)
    mask = ((white > 0) | outline).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8))
    cx, cy, rx, ry = gem["clip"]
    clip = np.zeros(mask.shape, np.uint8)
    cv2.ellipse(clip, (cx - x0, cy - y0), (rx, ry), 0, 0, 360, 1, -1)
    return (mask.astype(bool) & clip.astype(bool)), (x0, y0)


# --------------------------------------------------------------------------- fills
def harmonic_fill(image: np.ndarray, mask: np.ndarray, iterations: int = 1200, radius: int = 5) -> np.ndarray:
    if not mask.any():
        return image
    ys, xs = np.nonzero(mask)
    y0, y1 = max(int(ys.min()) - 2, 0), min(int(ys.max()) + 3, image.shape[0])
    x0, x1 = max(int(xs.min()) - 2, 0), min(int(xs.max()) + 3, image.shape[1])
    sub = image[y0:y1, x0:x1].astype(np.float32).copy()
    local = mask[y0:y1, x0:x1]
    seed = cv2.inpaint(np.clip(sub, 0, 255).astype(np.uint8), local.astype(np.uint8) * 255, radius, cv2.INPAINT_TELEA)
    u = seed.astype(np.float32)
    weight = local[..., None].astype(np.float32)
    for _ in range(iterations):
        average = (
            np.roll(u, 1, axis=0) + np.roll(u, -1, axis=0) +
            np.roll(u, 1, axis=1) + np.roll(u, -1, axis=1)
        ) * 0.25
        u = u * (1.0 - weight) + average * weight
    result = image.copy()
    result[y0:y1, x0:x1] = np.clip(u, 0, 255).astype(np.uint8)
    return result


def poisson_fill(image: np.ndarray, mask: np.ndarray, donor_offset: tuple[int, int],
                 iterations: int = 1400) -> np.ndarray:
    """Seamless clone of a clean donor patch: the fill inherits the donor's own gradients.

    The boundary still comes from the real pixels around the hole, so there is no seam, and
    unlike a Laplace fill the interior keeps the donor's painted texture and shading.
    """
    if not mask.any():
        return image
    dy, dx = donor_offset
    donor = np.roll(image, (dy, dx), axis=(0, 1)).astype(np.float32)
    grad_x = np.roll(donor, -1, axis=1) - donor
    grad_y = np.roll(donor, -1, axis=0) - donor
    divergence = (np.roll(grad_x, 1, axis=1) - grad_x) + (np.roll(grad_y, 1, axis=0) - grad_y)

    seed = harmonic_fill(image, mask, iterations=260)
    u = seed.astype(np.float32)
    weight = mask[..., None].astype(np.float32)
    for _ in range(iterations):
        average = (
            np.roll(u, 1, axis=0) + np.roll(u, -1, axis=0) +
            np.roll(u, 1, axis=1) + np.roll(u, -1, axis=1)
        ) * 0.25
        u = u * (1.0 - weight) + (average - divergence * 0.25) * weight
    result = image.copy()
    result[mask] = np.clip(u[mask], 0, 255).astype(np.uint8)
    return result


def find_donor(mask: np.ndarray, region: tuple[int, int, int, int], radius: int = 90) -> tuple[int, int]:
    """Pick a shift whose source patch is entirely outside the text mask."""
    x0, y0, x1, y1 = region
    height, width = mask.shape
    best = (0, -24)
    best_score = -1.0
    for dy in range(-radius, radius + 1, 6):
        for dx in range(-radius, radius + 1, 6):
            if abs(dy) < 6 and abs(dx) < 6:
                continue
            sy0, sx0 = y0 + dy, x0 + dx
            sy1, sx1 = y1 + dy, x1 + dx
            if sy0 < 0 or sx0 < 0 or sy1 > height or sx1 > width:
                continue
            patch = mask[sy0:sy1, sx0:sx1]
            score = 1.0 - patch.mean() - 0.002 * (abs(dy) + abs(dx))
            if score > best_score:
                best_score = score
                best = (dy, dx)
    return best


def add_texture(image: np.ndarray, mask: np.ndarray, bands=((0.9, 12.0, 1.0), (3.2, 5.0, 0.55)),
                seed: int = 3) -> np.ndarray:
    """Copy real detail (paper fibre, mottling, metal grain) onto the filled area.

    A flat fill carries only low frequencies, so the patched area reads as airbrushed. The
    detail layers are zero-mean, clipped and mirrored-tiled: crisp without block seams.
    """
    source = image.astype(np.float32)
    height, width = mask.shape
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return image
    rng = np.random.default_rng(seed)
    shift_y, shift_x = int(rng.integers(6, 18)), int(rng.integers(6, 18))
    patch = np.zeros_like(source)
    for sigma, clip, weight in bands:
        detail = np.clip(source - cv2.GaussianBlur(source, (0, 0), sigma), -clip, clip)
        shifted = np.roll(detail, (shift_y, shift_x), axis=(0, 1))
        tile = np.concatenate([shifted, shifted[::-1, :]], axis=0)
        tile = np.concatenate([tile, tile[:, ::-1]], axis=1)
        patch += weight * np.tile(
            tile, (height // tile.shape[0] + 1, width // tile.shape[1] + 1, 1))[:height, :width]
    soft = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 1.0)[..., None]
    return np.clip(source + patch * soft, 0, 255).astype(np.uint8)


def smooth_in_mask(image: np.ndarray, mask: np.ndarray, sigma_x: float, sigma_y: float) -> np.ndarray:
    """Blend the filled pixels towards a smooth version (removes interpolation streaks)."""
    blurred = cv2.GaussianBlur(image.astype(np.float32), (0, 0), sigmaX=sigma_x, sigmaY=sigma_y)
    alpha = cv2.GaussianBlur(mask.astype(np.float32), (0, 0), 1.0)[..., None]
    mixed = image.astype(np.float32) * (1.0 - alpha) + blurred * alpha
    return np.clip(mixed, 0, 255).astype(np.uint8)


def directional_fill(image: np.ndarray, mask: np.ndarray, axis: int = 0) -> np.ndarray:
    """Interpolate along one axis; keeps a ribbon's / plate's shading without long smears."""
    if axis == 0:
        return directional_fill(np.transpose(image, (1, 0, 2)), np.transpose(mask, (1, 0)), axis=1).transpose(1, 0, 2)
    out = image.astype(np.float32).copy()
    height, width = mask.shape
    columns = np.arange(width)
    for y in range(height):
        row = mask[y]
        if not row.any():
            continue
        known = np.nonzero(~row)[0]
        if len(known) < 2:
            continue
        for channel in range(3):
            values = out[y, :, channel]
            out[y, row, channel] = np.interp(columns[row], known, values[known])
    return np.clip(out, 0, 255).astype(np.uint8)


def erase_directional(image: np.ndarray, mask: np.ndarray, axis: int = 1, grow: int = 5,
                      smooth: tuple[float, float] = (8.0, 1.4)) -> np.ndarray:
    grown = cv2.dilate(mask.astype(np.uint8), np.ones((grow, grow), np.uint8)).astype(bool)
    filled = directional_fill(image, grown, axis=axis)
    filled = smooth_in_mask(filled, grown, *smooth)
    return add_texture(filled, grown)


def erase(image: np.ndarray, mask: np.ndarray, iterations: int = 1200, grow: int = 5) -> np.ndarray:
    kernel = np.ones((grow, grow), np.uint8)
    grown = cv2.dilate(mask.astype(np.uint8), kernel).astype(bool)
    return add_texture(harmonic_fill(image, grown, iterations=iterations), grown)


def remove_residual_ink(image: np.ndarray, band: tuple[int, int, int, int], rounds: int = 3,
                        threshold: float = 34.0) -> np.ndarray:
    """Erase high-contrast leftovers of glyphs that survived the first mask."""
    x0, y0, x1, y1 = band
    for _ in range(rounds):
        patch = image[y0:y1, x0:x1]
        median = cv2.medianBlur(patch, 11)
        diff = np.abs(patch.astype(np.int16) - median.astype(np.int16)).max(axis=2)
        leftover = diff > threshold
        leftover = cv2.morphologyEx(leftover.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
        if leftover.sum() < 12:
            break
        mask = blit(leftover.astype(bool), (x0, y0), image.shape[:2])
        image = erase(image, mask, iterations=500, grow=3)
    return image


# --------------------------------------------------------------------------- window
def art_window_mask(shape: tuple[int, int]) -> np.ndarray:
    """Oval opening plus the flat-bottomed part the title ribbon cuts across."""
    mask = np.zeros(shape, dtype=np.uint8)
    cx, cy, rx, ry = ART_ELLIPSE
    cv2.ellipse(mask, (int(round(cx)), int(round(cy))), (int(round(rx)), int(round(ry))), 0, 0, 360, 255, -1)
    if WINDOW_FLOOR[4] == "rect":
        cv2.rectangle(mask, (WINDOW_FLOOR[0], WINDOW_FLOOR[1]), (WINDOW_FLOOR[2], WINDOW_FLOOR[3]), 255, -1)
    else:
        cv2.ellipse(mask, (WINDOW_FLOOR[0], WINDOW_FLOOR[1]), (WINDOW_FLOOR[2], WINDOW_FLOOR[3]), 0, 0, 360, 255, -1)
    mask = cv2.GaussianBlur(mask, (0, 0), 1.1)
    return mask


def art_bleed_mask(rgb: np.ndarray) -> np.ndarray:
    """Everything in the strip under the oval except the metal ring, plus art colour that
    spills wider than the strip."""
    x0, y0, x1, y1 = BLEED_BAND
    patch = rgb[y0:y1, x0:x1]
    value = patch.max(axis=2).astype(np.int16)
    low = patch.min(axis=2).astype(np.int16)
    saturation = value - low
    red, green, blue = patch[:, :, 0].astype(np.int16), patch[:, :, 1].astype(np.int16), patch[:, :, 2].astype(np.int16)
    ring = ((value > 118) & (saturation < 30)) | (
        (value > 150) & (saturation > 32) & (saturation < 105) & (red >= green) & (green >= blue))
    ring = cv2.morphologyEx(ring.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    inner = ~ring.astype(bool)

    wx0, wy0, wx1, wy1 = WIDE_BLEED
    wide = rgb[wy0:wy1, wx0:wx1].astype(np.int16)
    wred, wgreen, wblue = wide[:, :, 0], wide[:, :, 1], wide[:, :, 2]
    wvalue = wide.max(axis=2)
    wsaturation = wvalue - wide.min(axis=2)
    art = ((wred > 85) & (wred - wblue > 45) & (wgreen <= wblue + 16)) | (
        (wsaturation > 40) & (wvalue < 150) & (wred >= wgreen))
    art = cv2.morphologyEx(art.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    art = cv2.dilate(art, np.ones((5, 5), np.uint8)).astype(bool)

    mask = blit(inner.astype(bool), (x0, y0), rgb.shape[:2])
    mask |= blit(art, (wx0, wy0), rgb.shape[:2])
    return mask


def empty_slot(image: np.ndarray, mask: np.ndarray, base_dark=(33, 28, 30), center=(72, 63, 65)) -> np.ndarray:
    """Paint a flat, softly lit placeholder inside the art window."""
    height, width = image.shape[:2]
    cx, cy, rx, ry = ART_ELLIPSE
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    norm = np.clip(np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2), 0, 1)[..., None]
    color = np.array(center, np.float32) * (1.0 - norm) + np.array(base_dark, np.float32) * norm
    top_light = np.clip(1.0 - (yy - (cy - ry)) / (1.8 * ry), 0, 1)[..., None]
    color = color + top_light * np.array([18, 16, 17], np.float32) * (1.0 - norm)
    shadow = np.clip((norm[..., 0] - 0.68) / 0.32, 0, 1)[..., None] * 0.55
    color = color * (1.0 - shadow)
    rng = np.random.default_rng(5)
    color = color + rng.normal(0.0, 2.0, size=(height, width, 1)).repeat(3, axis=2)
    color = np.clip(color, 0, 255).astype(np.uint8)
    alpha = (mask.astype(np.float32) / 255.0)[..., None]
    return np.clip(image.astype(np.float32) * (1.0 - alpha) + color.astype(np.float32) * alpha, 0, 255).astype(np.uint8)


# --------------------------------------------------------------------------- slots
def detect_card_bounds(rgba: np.ndarray) -> dict:
    alpha = rgba[:, :, 3]
    opaque = alpha > 250
    row_coverage = opaque[:, 70:430].mean(axis=1)
    rows = np.nonzero(row_coverage > 0.97)[0]
    top, bottom = int(rows.min()), int(rows.max())
    col_coverage = opaque[top:bottom, :].mean(axis=0)
    cols = np.nonzero(col_coverage > 0.97)[0]
    return {"left": int(cols.min()), "top": top, "right": int(cols.max()), "bottom": bottom}


def slots_json(bounds: dict) -> dict:
    width = bounds["right"] - bounds["left"] + 1
    height = bounds["bottom"] - bounds["top"] + 1

    def rel(box):
        x0, y0, x1, y1 = box
        return {
            "x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0,
            "nx": round((x0 - bounds["left"]) / width, 4),
            "ny": round((y0 - bounds["top"]) / height, 4),
            "nw": round((x1 - x0) / width, 4),
            "nh": round((y1 - y0) / height, 4),
        }

    cx, cy, rx, ry = ART_ELLIPSE
    art = {
        "shape": "ellipse", "cx": cx, "cy": cy, "rx": rx, "ry": ry,
        "x": int(cx - rx), "y": int(cy - ry), "w": int(2 * rx), "h": int(2 * ry),
        "nx": round((cx - rx - bounds["left"]) / width, 4),
        "ny": round((cy - ry - bounds["top"]) / height, 4),
        "nw": round(2 * rx / width, 4),
        "nh": round(2 * ry / height, 4),
    }
    return {
        "source": "design/card-template/source-hs-card.png",
        "size": {"w": 512, "h": 776},
        "card": {**bounds, "w": width, "h": height},
        "slots": {
            "art": art,
            "mana": {**rel((44, 84, 152, 202)), "align": "center", "baseline": 168, "fontSize": 68},
            "title": {**rel((112, 372, 398, 432)), "align": "center", "baseline": 420, "fontSize": 34},
            "rules": {**rel((104, 474, 396, 602)), "align": "left", "lineHeight": 44, "fontSize": 27},
            "race": {**rel((208, 622, 298, 660)), "align": "center", "baseline": 654, "fontSize": 24},
            "attack": {**rel((46, 596, 134, 684)), "align": "center", "baseline": 676, "fontSize": 62},
            "health": {**rel((388, 586, 460, 684)), "align": "center", "baseline": 674, "fontSize": 60},
        },
    }


# --------------------------------------------------------------------------- preview
def draw_demo(blank: np.ndarray, slots: dict) -> Image.Image:
    """Preview only: shows how the empty template behaves once a card is filled in."""
    canvas = Image.new("RGBA", (512, 776), (0, 0, 0, 0))
    canvas.alpha_composite(Image.fromarray(blank, "RGBA"))
    draw = ImageDraw.Draw(canvas)
    faces = Path(r"C:\Windows\Fonts")
    heavy = faces / "msyhbd.ttc"
    regular = faces / "msyh.ttc"

    def font(path: Path, size: int):
        try:
            return ImageFont.truetype(str(path), size)
        except OSError:
            return ImageFont.load_default()

    def centered(text, box, size, path=heavy, fill="#f7f2e6", stroke=2):
        f = font(path, size)
        x0, y0, x1, y1 = box
        draw.text(((x0 + x1) / 2, (y0 + y1) / 2), text, font=f, anchor="mm",
                  fill=fill, stroke_width=stroke, stroke_fill="#241608")

    centered("3", (44, 84, 152, 202), 70)
    centered("2", (46, 596, 134, 684), 64)
    centered("7", (388, 586, 460, 684), 62)
    centered("星骸守门人", (112, 372, 398, 432), 33)
    centered("恶魔", (208, 622, 298, 660), 23, regular, "#2a1c0c", 1)

    rules_font = font(regular, 25)
    lines = ["战吼：抽一张星骸牌，", "使其费用减少（1）。", "若手牌已满，改为", "获得 2 点护甲值。"]
    for index, line in enumerate(lines):
        left, top, right, bottom = draw.textbbox((0, 0), line, font=rules_font)
        draw.text(((104 + 396 - (right - left)) / 2 - left, 484 + index * 31 - top),
                  line, font=rules_font, fill="#2b2118")
    return canvas


def make_preview(original: Image.Image, blank: np.ndarray, demo: Image.Image) -> None:
    width, height = 512, 776
    sheet = Image.new("RGB", (width * 3 + 80, height + 40), "#e8e6e1")
    for index, image in enumerate((original, Image.fromarray(blank, "RGBA"), demo)):
        tile = Image.new("RGB", (width, height), "#cfd3d8")
        tile.paste(image, (0, 0), image)
        sheet.paste(tile, (20 + index * (width + 20), 20))
    sheet.save(DEBUG / "preview.png")


def main() -> None:
    DEBUG.mkdir(parents=True, exist_ok=True)
    rgba = np.asarray(Image.open(SRC).convert("RGBA"), dtype=np.uint8)
    rgb = rgba[:, :, :3].copy()
    shape = rgb.shape[:2]

    masks: dict[str, np.ndarray] = {}
    for name, region in TEXT_REGIONS.items():
        local, origin = text_mask(rgb, region)
        masks[name] = blit(local, origin, shape)
    for name, gem in GEMS.items():
        local, origin = gem_mask(rgb, gem)
        masks[name] = blit(local, origin, shape)

    overlay = rgb.copy()
    colors = {"title": (255, 0, 255), "rules": (0, 255, 0), "race": (255, 128, 0),
              "mana": (0, 200, 255), "attack": (255, 255, 0), "health": (255, 0, 0)}
    for name, mask in masks.items():
        overlay[mask] = colors.get(name, (255, 0, 255))
    Image.fromarray(overlay, "RGB").save(DEBUG / "mask-overlay.png")
    Image.fromarray(cv2.GaussianBlur(overlay, (0, 0), 0.01), "RGB").save(DEBUG / "mask-overlay-raw.png")

    working = rgb.copy()
    for name in ("mana", "attack", "health"):
        working = erase(working, masks[name], iterations=900, grow=3)
        print(f"erased {name}: {int(masks[name].sum())} px")
    for name, region in TEXT_REGIONS.items():
        if region.get("method") == "vertical":
            cx0, cy0, cx1, cy1 = region["clip"]
            tight = masks[name].copy()
            tight[:cy0] = False
            tight[cy1:] = False
            tight[:, :cx0] = False
            tight[:, cx1:] = False
            grown = cv2.dilate(tight.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
            working = directional_fill(working, grown, axis=0)
            working = smooth_in_mask(working, grown, 3.0, 0.6)
            working = add_texture(working, grown)
        else:
            working = erase(working, masks[name], iterations=1400, grow=5)
        working = remove_residual_ink(working, region["band"])
        print(f"erased {name}: {int(masks[name].sum())} px")

    bounds = detect_card_bounds(rgba)
    window = art_window_mask(shape)

    # Art bleeds past the oval ring into the strip above the title ribbon. Paint the oval
    # with a flat frame tone first so the diffusion pulls frame colour, not more art.
    oval = (window > 128)
    rough = working.copy()
    cx, cy = int(ART_ELLIPSE[0]), int(ART_ELLIPSE[1])
    cv2.ellipse(rough, (cx, cy), (int(ART_ELLIPSE[2]), int(ART_ELLIPSE[3])), 0, 0, 360, (108, 88, 70), -1)
    bleed = art_bleed_mask(rgb)
    working = erase(rough, bleed, iterations=700, grow=3)
    Image.fromarray(np.where(bleed[..., None], (255, 0, 255), working).astype(np.uint8), "RGB").save(
        DEBUG / "bleed-overlay.png")

    Image.fromarray(working, "RGB").save(DEBUG / "working-after-bleed.png")
    slot_filled = empty_slot(working, window)
    Image.fromarray(np.dstack([slot_filled, rgba[:, :, 3]]), "RGBA").save(OUT / "card-blank.png", "PNG", optimize=True)

    open_alpha = (rgba[:, :, 3].astype(np.float32) * (1.0 - window.astype(np.float32) / 255.0)).astype(np.uint8)
    Image.fromarray(np.dstack([slot_filled, open_alpha]), "RGBA").save(OUT / "card-blank-open-window.png", "PNG", optimize=True)

    Image.fromarray(np.dstack([np.full(shape, 255, np.uint8)] * 3 + [window]), "RGBA").save(
        OUT / "card-art-window-mask.png", "PNG", optimize=True)

    data = slots_json(bounds)
    (OUT / "slots.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    make_preview(Image.open(SRC).convert("RGBA"), np.dstack([slot_filled, rgba[:, :, 3]]), draw_demo(
        np.dstack([slot_filled, rgba[:, :, 3]]), data))
    print("card bounds", bounds)
    print("done")


if __name__ == "__main__":
    main()
