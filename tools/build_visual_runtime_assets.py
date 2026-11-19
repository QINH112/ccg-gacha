from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

SOURCE = DESIGN / "58a2a44f-5d36-4f99-a73e-ea56cbc02cc4.png"
LAYERS = DESIGN / "layers"
GENERATED = DESIGN / "generated"
IMAGEGEN_BACKGROUND = GENERATED / "home-background-clean-imagegen-v1.png"
RUNTIME_BACKGROUNDS = ROOT / "assets" / "backgrounds"
RUNTIME_UI = ROOT / "assets" / "ui" / "home"
CARD_FRAME_DIR = ROOT / "assets" / "ui" / "cards"

CARD_FRAMES = {
    "common": "card-frame-common-v1.png",
    "rare": "card-frame-rare-v1.png",
    "epic": "card-frame-epic-v1.png",
    "legendary": "card-frame-legendary-v1.png",
    "commonShiny": "card-frame-common-shiny-v1.png",
    "rareShiny": "card-frame-rare-shiny-v1.png",
    "epicShiny": "card-frame-epic-shiny-v1.png",
    "legendaryShiny": "card-frame-legendary-shiny-v1.png",
}

HOME_ASSETS = {
    "player": "11_player_info_bar.png",
    "ticket": "12_ticket_resource_bar.png",
    "coin": "13_coin_resource_bar.png",
    "dust": "14_dust_resource_bar.png",
    "poolBase": "15_pool_base.png",
    "poolMixed": "16_pool_mixed.png",
    "poolStarRemnant": "17_pool_star_remnant.png",
    "drawSingle": "18_draw_single.png",
    "drawFive": "19_draw_five.png",
    "drawTen": "20_draw_ten.png",
    "sign": "21_daily_signin.png",
    "history": "22_draw_history.png",
    "collection": "23_collection.png",
    "workshop": "24_workshop.png",
    "shop": "25_shop.png",
    "mail": "26_mail.png",
    "tasks": "27_daily_tasks.png",
    "achievements": "28_achievements.png",
    "decks": "29_decks.png",
    "battle": "30_battle-v2.png",
    "battleHistory": "31_battle_history-v2.png",
    "cloudSave": "32_cloud_save_button.png",
    "limited": "33_limited_badge.png",
}


def add_rect(mask: np.ndarray, left: int, top: int, right: int, bottom: int) -> None:
    cv2.rectangle(mask, (left, top), (right, bottom), 255, thickness=-1)


def build_clean_background() -> Path:
    image = cv2.imread(str(SOURCE), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(SOURCE)

    height, width = image.shape[:2]
    full_mask = np.zeros((height, width), dtype=np.uint8)
    top_mask = np.zeros_like(full_mask)

    top_regions = [
        (646, 25, 940, 124),
        (22, 238, 298, 329),
        (345, 242, 940, 330),
    ]
    lower_regions = [
        (15, 596, 928, 970),
        (19, 974, 923, 1123),
        (17, 1128, 928, 1475),
        (242, 1518, 702, 1642),
    ]

    for region in top_regions:
        add_rect(top_mask, *region)
        add_rect(full_mask, *region)
    for region in lower_regions:
        add_rect(full_mask, *region)

    small_width = max(1, width // 4)
    small_height = max(1, height // 4)
    small_image = cv2.resize(image, (small_width, small_height), interpolation=cv2.INTER_AREA)
    small_mask = cv2.resize(full_mask, (small_width, small_height), interpolation=cv2.INTER_NEAREST)
    small_fill = cv2.inpaint(small_image, small_mask, 9, cv2.INPAINT_TELEA)
    broad_fill = cv2.resize(small_fill, (width, height), interpolation=cv2.INTER_CUBIC)

    detailed_top = cv2.inpaint(image, top_mask, 11, cv2.INPAINT_TELEA)
    candidate_fill = broad_fill.copy()
    candidate_fill[top_mask > 0] = detailed_top[top_mask > 0]

    feather = cv2.GaussianBlur(full_mask, (0, 0), 4.5).astype(np.float32) / 255.0
    feather = feather[..., None]
    result = np.clip(
        image.astype(np.float32) * (1.0 - feather)
        + candidate_fill.astype(np.float32) * feather,
        0,
        255,
    ).astype(np.uint8)

    GENERATED.mkdir(parents=True, exist_ok=True)
    RUNTIME_BACKGROUNDS.mkdir(parents=True, exist_ok=True)
    design_output = GENERATED / "home-background-clean-v1.png"
    runtime_output = RUNTIME_BACKGROUNDS / "home-clean-v1.png"
    cv2.imwrite(str(design_output), result, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    cv2.imwrite(str(runtime_output), result, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    return design_output


def publish_imagegen_background() -> Path:
    if not IMAGEGEN_BACKGROUND.exists():
        raise FileNotFoundError(IMAGEGEN_BACKGROUND)
    image = Image.open(IMAGEGEN_BACKGROUND).convert("RGB")
    target_size = (941, 1672)
    if image.size != target_size:
        resized = image.resize((target_size[0], target_size[1] - 1), Image.Resampling.LANCZOS)
        fitted = Image.new("RGB", target_size)
        fitted.paste(resized, (0, 0))
        fitted.paste(resized.crop((0, resized.height - 1, resized.width, resized.height)), (0, target_size[1] - 1))
        image = fitted
    design_output = GENERATED / "home-background-clean-imagegen-v1-941x1672.png"
    runtime_output = RUNTIME_BACKGROUNDS / "home-clean-imagegen-v1.jpg"
    design_output.parent.mkdir(parents=True, exist_ok=True)
    runtime_output.parent.mkdir(parents=True, exist_ok=True)
    image.save(design_output, optimize=True)
    image.save(runtime_output, quality=94, subsampling=0, optimize=True, progressive=True)
    return design_output


def border_connected_white(rgb: np.ndarray) -> np.ndarray:
    height, width = rgb.shape[:2]
    white = np.all(rgb >= 248, axis=2)
    background = np.zeros((height, width), dtype=np.uint8)
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        if white[0, x]:
            queue.append((0, x))
        if white[height - 1, x]:
            queue.append((height - 1, x))
    for y in range(height):
        if white[y, 0]:
            queue.append((y, 0))
        if white[y, width - 1]:
            queue.append((y, width - 1))

    while queue:
        y, x = queue.popleft()
        if background[y, x] or not white[y, x]:
            continue
        background[y, x] = 1
        if y > 0:
            queue.append((y - 1, x))
        if y + 1 < height:
            queue.append((y + 1, x))
        if x > 0:
            queue.append((y, x - 1))
        if x + 1 < width:
            queue.append((y, x + 1))

    return background.astype(bool)


def make_runtime_asset(source: Path, destination: Path) -> dict[str, object]:
    source_image = Image.open(source).convert("RGB")
    rgb = np.asarray(source_image)
    background = border_connected_white(rgb)
    alpha = np.where(background, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.55)
    ys, xs = np.where(alpha > 3)
    if not len(xs):
        raise ValueError(f"No visible pixels found in {source}")

    padding = 4
    left = max(0, int(xs.min()) - padding)
    top = max(0, int(ys.min()) - padding)
    right = min(source_image.width, int(xs.max()) + padding + 1)
    bottom = min(source_image.height, int(ys.max()) + padding + 1)
    rgba = np.dstack((rgb, alpha))[top:bottom, left:right]
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(destination, optimize=True)
    return {
        "path": destination.relative_to(ROOT).as_posix(),
        "source": source.relative_to(ROOT).as_posix(),
        "sourceRect": [left, top, right - left, bottom - top],
        "width": right - left,
        "height": bottom - top,
    }


def build_runtime_ui() -> Path:
    RUNTIME_UI.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, object] = {
        "designSize": [941, 1672],
        "background": "assets/backgrounds/home-clean-imagegen-v1.jpg",
        "battleBackground": "assets/backgrounds/battle-imagegen-v1.jpg",
        "cardArtMask": {
            "path": "assets/ui/cards/card-art-mask-v1.png",
            "width": 512,
            "height": 768,
        },
        "cardFrames": {
            key: {
                "path": (CARD_FRAME_DIR / filename).relative_to(ROOT).as_posix(),
                "width": 512,
                "height": 768,
            }
            for key, filename in CARD_FRAMES.items()
        },
        "assets": {},
    }
    assets = manifest["assets"]
    assert isinstance(assets, dict)
    for asset_id, filename in HOME_ASSETS.items():
        source = LAYERS / filename
        if not source.exists():
            raise FileNotFoundError(source)
        destination = RUNTIME_UI / f"{asset_id}.png"
        assets[asset_id] = make_runtime_asset(source, destination)

    manifest_path = RUNTIME_UI / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest_path


def main() -> None:
    background = publish_imagegen_background()
    manifest = build_runtime_ui()
    print(f"background={background.relative_to(ROOT)}")
    print(f"manifest={manifest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
