from pathlib import Path
from typing import Iterable, Sequence

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

OUT = DESIGN / "layers"
SOURCE_SCENE = DESIGN / "58a2a44f-5d36-4f99-a73e-ea56cbc02cc4.png"
SOURCE_ELEMENTS = DESIGN / "888e4947-e79b-40fe-92e8-724414c96caf.png"
SIZE = (941, 1672)


def clamp(value: int) -> int:
    return max(0, min(255, value))


def white_mask(image: Image.Image, threshold: int = 8) -> Image.Image:
    array = np.asarray(image.convert("RGB"), dtype=np.int16)
    distance = np.max(255 - array, axis=2)
    alpha = np.clip((distance - 2) * 18, 0, 255).astype(np.uint8)
    alpha[distance <= threshold // 2] = 0
    return Image.fromarray(alpha, "L").filter(ImageFilter.GaussianBlur(0.35))


def paste_masked(canvas: Image.Image, source: Image.Image, box: Sequence[int], mask: Image.Image) -> None:
    x, y, right, bottom = box
    canvas.paste(source.crop((x, y, right, bottom)), (x, y), mask)


def extract_white_source(source: Image.Image, box: Sequence[int], filename: str, dest_box=None, threshold: int = 8) -> Image.Image:
    canvas = Image.new("RGB", SIZE, "white")
    crop = source.crop(box).convert("RGB")
    mask = white_mask(crop, threshold)
    x, y, right, bottom = dest_box or box
    target_size = (right - x, bottom - y)
    if crop.size != target_size:
        crop = crop.resize(target_size, Image.Resampling.LANCZOS)
        mask = mask.resize(target_size, Image.Resampling.LANCZOS)
    canvas.paste(crop, (x, y), mask)
    path = OUT / filename
    canvas.save(path, "PNG", optimize=True)
    return canvas


def polygon_mask(points: Iterable[tuple[int, int]], feather: int = 2) -> Image.Image:
    mask = Image.new("L", SIZE, 0)
    ImageDraw.Draw(mask).polygon(list(points), fill=255)
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def region_mask(points: Iterable[tuple[int, int]], predicate, feather: int = 2) -> Image.Image:
    polygon = np.asarray(polygon_mask(points, 0), dtype=np.uint8)
    scene = np.asarray(SCENE, dtype=np.uint8)
    selected = predicate(scene)
    mask = Image.fromarray(np.where((polygon > 0) & selected, 255, 0).astype(np.uint8), "L")
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    return mask


def extract_scene_region(source: Image.Image, filename: str, points, predicate=lambda rgb: True) -> Image.Image:
    canvas = Image.new("RGB", SIZE, "white")
    mask = region_mask(points, predicate)
    canvas.paste(source, (0, 0), mask)
    canvas.save(OUT / filename, "PNG", optimize=True)
    return canvas


def make_sky_background(filename: str) -> Image.Image:
    stops = [
        (0, np.array([8, 22, 55], dtype=float)),
        (430, np.array([34, 53, 105], dtype=float)),
        (930, np.array([48, 61, 118], dtype=float)),
        (1420, np.array([39, 48, 93], dtype=float)),
        (1671, np.array([10, 18, 45], dtype=float)),
    ]
    array = np.zeros((SIZE[1], SIZE[0], 3), dtype=np.float32)
    for index in range(len(stops) - 1):
        y0, color0 = stops[index]
        y1, color1 = stops[index + 1]
        for y in range(y0, y1 + 1):
            amount = (y - y0) / max(1, y1 - y0)
            array[y, :, :] = color0 * (1 - amount) + color1 * amount
    yy, xx = np.mgrid[0:SIZE[1], 0:SIZE[0]]
    glow = np.exp(-(((xx - 760) / 430) ** 2 + ((yy - 470) / 620) ** 2))[:, :, None]
    array += glow * np.array([12, 18, 38], dtype=float)
    vignette = np.clip(((xx - SIZE[0] / 2) / (SIZE[0] / 2)) ** 2 * 18, 0, 18)[:, :, None]
    array -= vignette
    canvas = Image.fromarray(np.clip(array, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(canvas)
    rng = np.random.default_rng(1127)
    for _ in range(150):
        x = int(rng.integers(10, SIZE[0] - 10))
        y = int(rng.integers(8, 760))
        radius = int(rng.choice([1, 1, 1, 2]))
        brightness = int(rng.integers(125, 225))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(brightness - 18, brightness - 10, brightness))
    canvas.save(OUT / filename, "PNG", optimize=True)
    return canvas


def make_cloud_layer(filename: str) -> Image.Image:
    rgba = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    soft = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(soft)
    clusters = [
        [( -95, 300, 105, 470), (-25, 278, 160, 452), (55, 330, 190, 480)],
        [(205, 474, 395, 625), (292, 445, 500, 625), (405, 500, 590, 650)],
        [(700, 178, 835, 342), (770, 155, 945, 360), (850, 230, 1010, 430)],
        [(430, 530, 620, 686), (565, 495, 790, 690), (720, 500, 1015, 700)],
    ]
    for group_index, group in enumerate(clusters):
        for ellipse_index, ellipse in enumerate(group):
            alpha = 92 + ellipse_index * 13
            color = (147 + group_index * 5, 164 + group_index * 5, 222 + group_index * 3, alpha)
            draw.ellipse(ellipse, fill=color)
    soft = soft.filter(ImageFilter.GaussianBlur(26))
    rgba.alpha_composite(soft)
    detail = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    detail_draw = ImageDraw.Draw(detail)
    for group in clusters:
        for ellipse in group:
            inset = 18
            detail_draw.ellipse((ellipse[0] + inset, ellipse[1] + inset, ellipse[2] - inset, ellipse[3] - inset), fill=(181, 193, 237, 48))
    rgba.alpha_composite(detail.filter(ImageFilter.GaussianBlur(18)))
    canvas = Image.new("RGB", SIZE, "white")
    canvas.paste(rgba.convert("RGB"), (0, 0), rgba.getchannel("A"))
    canvas.save(OUT / filename, "PNG", optimize=True)
    return canvas


def make_ui_mask(elements: Image.Image, specs) -> np.ndarray:
    mask = Image.new("L", SIZE, 0)
    for source_box, dest_box in specs:
        crop = elements.crop(source_box).convert("RGB")
        alpha = white_mask(crop)
        left, top, right, bottom = dest_box
        alpha = alpha.resize((right - left, bottom - top), Image.Resampling.LANCZOS)
        mask.paste(ImageChops_lighter(mask.crop(dest_box), alpha), (left, top))
    result = np.asarray(mask, dtype=np.uint8).copy()
    cv2.ellipse(result, (792, 73), (142, 50), 0, 0, 360, 255, -1)
    return cv2.dilate(result, np.ones((7, 7), np.uint8), iterations=1)


def ImageChops_lighter(a: Image.Image, b: Image.Image) -> Image.Image:
    return Image.fromarray(np.maximum(np.asarray(a), np.asarray(b)).astype(np.uint8), "L")


def clean_scene(source: Image.Image, ui_mask: np.ndarray) -> Image.Image:
    bgr = cv2.cvtColor(np.asarray(source), cv2.COLOR_RGB2BGR)
    cleaned = cv2.inpaint(bgr, ui_mask, 9, cv2.INPAINT_TELEA)
    return Image.fromarray(cv2.cvtColor(cleaned, cv2.COLOR_BGR2RGB), "RGB")


def extract_with_mask(source: Image.Image, filename: str, mask: np.ndarray) -> Image.Image:
    canvas = Image.new("RGB", SIZE, "white")
    soft = Image.fromarray(mask.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.4))
    canvas.paste(source, (0, 0), soft)
    canvas.save(OUT / filename, "PNG", optimize=True)
    return canvas


def polygon_array(points) -> np.ndarray:
    mask = np.zeros((SIZE[1], SIZE[0]), dtype=np.uint8)
    cv2.fillPoly(mask, [np.asarray(points, dtype=np.int32)], 255)
    return mask


def make_contact_sheet(files: list[Path]) -> None:
    thumb_w, thumb_h = 188, 334
    cols = 4
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows * (thumb_h + 28)), "#d9d9d9")
    draw = ImageDraw.Draw(sheet)
    for index, path in enumerate(files):
        image = Image.open(path).convert("RGB")
        image.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        x = (index % cols) * thumb_w
        y = (index // cols) * (thumb_h + 28)
        sheet.paste(image, (x, y))
        draw.text((x + 4, y + thumb_h + 4), path.stem[:26], fill="#111")
    sheet.save(OUT / "_contact-sheet.png", "PNG", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.png"):
        old.unlink()

    scene = Image.open(SOURCE_SCENE).convert("RGB")
    elements = Image.open(SOURCE_ELEMENTS).convert("RGB")
    global SCENE
    SCENE = scene

    ui_specs = [
        ((20, 35, 510, 302), (34, 60, 390, 216)), ((550, 35, 885, 318), (72, 395, 290, 550)),
        ((25, 330, 305, 420), (31, 250, 278, 317)), ((342, 330, 526, 420), (355, 257, 532, 315)),
        ((530, 330, 739, 420), (547, 257, 724, 315)), ((744, 330, 930, 420), (743, 257, 920, 315)),
        ((22, 455, 329, 854), (28, 620, 333, 951)), ((335, 455, 637, 854), (344, 624, 619, 951)),
        ((642, 450, 925, 854), (634, 623, 914, 951)), ((24, 883, 329, 1017), (39, 991, 329, 1102)),
        ((335, 883, 637, 1017), (339, 991, 620, 1102)), ((638, 883, 925, 1017), (628, 991, 904, 1102)),
        ((23, 1065, 194, 1225), (39, 1145, 187, 1281)), ((212, 1065, 379, 1225), (214, 1145, 361, 1281)),
        ((395, 1065, 563, 1225), (390, 1145, 538, 1281)), ((578, 1065, 747, 1225), (567, 1145, 715, 1281)),
        ((759, 1065, 930, 1225), (744, 1145, 904, 1281)), ((14, 1262, 163, 1425), (37, 1318, 169, 1455)),
        ((174, 1262, 323, 1425), (192, 1318, 325, 1455)), ((333, 1262, 482, 1425), (349, 1318, 481, 1455)),
        ((491, 1262, 641, 1425), (506, 1318, 638, 1455)), ((650, 1262, 800, 1425), (663, 1318, 796, 1455)),
        ((806, 1262, 941, 1425), (815, 1318, 936, 1455)), ((220, 1490, 724, 1602), (263, 1541, 677, 1625)),
    ]
    ui_mask = make_ui_mask(elements, ui_specs)
    cleaned_scene = clean_scene(scene, ui_mask)
    scene_array = np.asarray(cleaned_scene)

    # Scene layers: original coordinates, with UI shapes removed before masking.
    make_sky_background("01_background_stars_and_atmosphere.png")
    moon_canvas = Image.new("RGB", SIZE, "white")
    moon_layer = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    moon_pixels = np.zeros((SIZE[1], SIZE[0], 4), dtype=np.uint8)
    yy, xx = np.mgrid[0:SIZE[1], 0:SIZE[0]]
    center_x, center_y, radius = 832, 105, 318
    distance = np.sqrt((xx - center_x) ** 2 + (yy - center_y) ** 2)
    alpha = np.clip((radius + 6 - distance) * 18, 0, 210)
    light = np.clip(1 - distance / radius, 0, 1)
    moon_pixels[:, :, 0] = np.clip(72 + light * 46, 0, 255)
    moon_pixels[:, :, 1] = np.clip(91 + light * 50, 0, 255)
    moon_pixels[:, :, 2] = np.clip(158 + light * 42, 0, 255)
    texture = 8 * np.sin(xx / 43) * np.cos(yy / 57)
    for channel in range(3):
        moon_pixels[:, :, channel] = np.clip(moon_pixels[:, :, channel].astype(np.int16) + texture.astype(np.int16), 0, 255)
    moon_pixels[:, :, 3] = alpha.astype(np.uint8)
    moon_layer = Image.fromarray(moon_pixels, "RGBA").filter(ImageFilter.GaussianBlur(1.2))
    moon_canvas.paste(moon_layer.convert("RGB"), (0, 0), moon_layer.getchannel("A"))
    moon_canvas.save(OUT / "02_moon_planet_glow.png", "PNG", optimize=True)

    castle_shape = polygon_array([(404, 451), (438, 405), (477, 387), (503, 339), (526, 352), (545, 281), (568, 333), (590, 231), (611, 320), (634, 169), (654, 324), (682, 246), (704, 338), (731, 298), (755, 379), (792, 397), (838, 452), (814, 510), (453, 510)])
    castle_pixels = (np.sum(scene_array, axis=2) > 280) & ((np.max(scene_array, axis=2) - np.min(scene_array, axis=2)) < 150)
    extract_with_mask(cleaned_scene, "03_floating_castle.png", np.where((castle_shape > 0) & castle_pixels, 255, 0))

    castle_island = polygon_array([(397, 438), (847, 437), (861, 486), (826, 518), (765, 533), (722, 556), (653, 578), (571, 574), (488, 551), (426, 510)])
    extract_with_mask(cleaned_scene, "04_castle_floating_island.png", castle_island)

    left_island = polygon_array([(0, 505), (55, 492), (139, 501), (226, 509), (321, 529), (389, 568), (385, 615), (324, 647), (0, 638)])
    extract_with_mask(cleaned_scene, "05_left_floating_island.png", left_island)

    make_cloud_layer("06_cloud_layers.png")

    islands = np.maximum.reduce([
        polygon_array([(373, 539), (398, 526), (421, 538), (410, 568), (390, 578)]),
        polygon_array([(755, 459), (831, 446), (915, 468), (913, 522), (874, 578), (827, 590), (790, 548)]),
        polygon_array([(894, 370), (941, 373), (941, 449), (916, 442)]),
    ])
    island_pixels = np.sum(scene_array, axis=2) < 510
    extract_with_mask(cleaned_scene, "07_distant_floating_islands.png", np.where((islands > 0) & island_pixels, 255, 0))

    bottom = polygon_array([(0, 1439), (119, 1455), (233, 1480), (369, 1491), (494, 1481), (624, 1465), (760, 1453), (941, 1438), (941, 1672), (0, 1672)])
    extract_with_mask(cleaned_scene, "08_bottom_platform_and_flowers.png", bottom)

    # Clean white-background UI and mascot layers come from the prepared reference image.
    extract_white_source(elements, (20, 35, 510, 302), "09_logo.png", (34, 60, 390, 216))
    extract_white_source(elements, (550, 35, 885, 318), "10_character.png", (72, 395, 290, 550))
    extract_white_source(elements, (25, 330, 305, 420), "11_player_info_bar.png", (31, 250, 278, 317))
    extract_white_source(elements, (342, 330, 526, 420), "12_ticket_resource_bar.png", (355, 257, 532, 315))
    extract_white_source(elements, (530, 330, 739, 420), "13_coin_resource_bar.png", (547, 257, 724, 315))
    extract_white_source(elements, (744, 330, 930, 420), "14_dust_resource_bar.png", (743, 257, 920, 315))

    # Card-pool panels, summon controls, and menu buttons remain individual full-canvas layers.
    extract_white_source(elements, (22, 455, 329, 854), "15_pool_base.png", (28, 620, 333, 951))
    extract_white_source(elements, (335, 455, 637, 854), "16_pool_mixed.png", (344, 624, 619, 951))
    extract_white_source(elements, (642, 450, 925, 854), "17_pool_star_remnant.png", (634, 623, 914, 951))
    extract_white_source(elements, (24, 883, 329, 1017), "18_draw_single.png", (39, 991, 329, 1102))
    extract_white_source(elements, (335, 883, 637, 1017), "19_draw_five.png", (339, 991, 620, 1102))
    extract_white_source(elements, (638, 883, 925, 1017), "20_draw_ten.png", (628, 991, 904, 1102))

    first_row = [
        ("21_daily_signin.png", (23, 1065, 194, 1225), (39, 1145, 187, 1281)),
        ("22_draw_history.png", (212, 1065, 379, 1225), (214, 1145, 361, 1281)),
        ("23_collection.png", (395, 1065, 563, 1225), (390, 1145, 538, 1281)),
        ("24_workshop.png", (578, 1065, 747, 1225), (567, 1145, 715, 1281)),
        ("25_shop.png", (759, 1065, 930, 1225), (744, 1145, 904, 1281)),
    ]
    second_row = [
        ("26_mail.png", (14, 1262, 163, 1425), (37, 1318, 169, 1455)),
        ("27_daily_tasks.png", (174, 1262, 323, 1425), (192, 1318, 325, 1455)),
        ("28_achievements.png", (333, 1262, 482, 1425), (349, 1318, 481, 1455)),
        ("29_decks.png", (491, 1262, 641, 1425), (506, 1318, 638, 1455)),
        ("30_battle.png", (650, 1262, 800, 1425), (663, 1318, 796, 1455)),
        ("31_battle_history.png", (806, 1262, 941, 1425), (815, 1318, 936, 1455)),
    ]
    for filename, box, dest_box in first_row + second_row:
        extract_white_source(elements, box, filename, dest_box)
    extract_white_source(elements, (220, 1490, 724, 1602), "32_cloud_save_button.png", (263, 1541, 677, 1625))
    extract_white_source(elements, (825, 446, 930, 530), "33_limited_badge.png", (835, 615, 928, 705))

    files = sorted(path for path in OUT.glob("*.png") if path.name != "_contact-sheet.png")
    make_contact_sheet(files)
    readme = OUT / "README.txt"
    readme.write_text(
        "卤蛋传说首页分层素材\n"
        "每个 PNG 均为 941x1672，纯白底，元素保持原画布坐标。\n"
        "01-08 为场景层，09-33 为清晰 UI/角色层。\n"
        "图层按文件名数字顺序对应首页元素；_contact-sheet.png 用于快速预览。\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
