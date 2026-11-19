#!/usr/bin/env python3
"""裁掉卡牌母版边缘的纯色白带（非 AI，可复核）。

背景：`base/c008.png`、`base/r008.png`、`star-remnant/s008.png` 这类母版在成品卡面上会
露出一道亮框。白带本身不包含画面信息，可以直接裁掉再把剩余部分缩回原尺寸。

**不覆盖原始母版**：结果一律写到 `design/generated/edge-trimmed/<卡包>/<卡牌ID>.png`，
你看过满意再决定是否替换。原始母版在 `design/card-art/source/` 下没有版本历史，覆盖即丢失。

用法：
    py tools/trim_card_art_edges.py                 # 只处理检出白边的母版
    py tools/trim_card_art_edges.py --ids c008,r008 # 只处理指定 ID
    py tools/trim_card_art_edges.py --sheet         # 额外生成前后对比图
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageStat

from design_root import resolve_design_root

ROOT = Path(__file__).resolve().parents[1]
DESIGN = resolve_design_root(ROOT)
SOURCE = DESIGN / "card-art" / "source"
OUTPUT = DESIGN / "generated" / "edge-trimmed"
SHEET = DESIGN / "review" / "edge-trimmed-before-after.png"

WHITE_MEAN = 200.0
WHITE_STD = 6.0
MAX_TRIM_RATIO = 0.08  # 单边最多裁掉 8%，防止误裁整幅画面


def row_is_white(image: Image.Image, index: int, axis: str) -> bool:
    line = image.crop((0, index, image.width, index + 1)) if axis == "row" else image.crop((index, 0, index + 1, image.height))
    gray = line.convert("L")
    stats = ImageStat.Stat(gray)
    return stats.mean[0] >= WHITE_MEAN and stats.stddev[0] <= WHITE_STD


def measure_trim(image: Image.Image):
    limit = int(min(image.size) * MAX_TRIM_RATIO)
    trims = {"top": 0, "bottom": 0, "left": 0, "right": 0}

    while trims["top"] < limit and row_is_white(image, trims["top"], "row"):
        trims["top"] += 1
    while trims["bottom"] < limit and row_is_white(image, image.height - 1 - trims["bottom"], "row"):
        trims["bottom"] += 1
    while trims["left"] < limit and row_is_white(image, trims["left"], "col"):
        trims["left"] += 1
    while trims["right"] < limit and row_is_white(image, image.width - 1 - trims["right"], "col"):
        trims["right"] += 1
    return trims


def trim(path: Path, dest: Path):
    image = Image.open(path).convert("RGB")
    trims = measure_trim(image)
    if not any(trims.values()):
        return None
    box = (trims["left"], trims["top"], image.width - trims["right"], image.height - trims["bottom"])
    cropped = image.crop(box).resize(image.size, Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    cropped.save(dest, "PNG")
    return image, cropped, trims


def build_sheet(entries, dest: Path):
    if not entries:
        return None
    thumb = (240, 285)
    padding = 12
    columns = 2
    rows = len(entries)
    width = padding + columns * (thumb[0] + padding)
    height = padding + rows * (thumb[1] + 28)
    sheet = Image.new("RGB", (width, height), (18, 20, 26))
    draw = ImageDraw.Draw(sheet)
    for row, (label, before, after, trims) in enumerate(entries):
        y = padding + row * (thumb[1] + 28)
        draw.text((padding, y), f"{label}  trim={trims}", fill=(210, 214, 230))
        y += 16
        for column, img in enumerate((before, after)):
            small = img.copy()
            small.thumbnail(thumb)
            x = padding + column * (thumb[0] + padding)
            sheet.paste(small, (x, y))
            draw.text((x, y + small.height + 2), "before" if column == 0 else "after", fill=(160, 168, 190))
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest)
    return dest


def main() -> int:
    parser = argparse.ArgumentParser(description="裁掉母版边缘纯白带")
    parser.add_argument("--ids", default="", help="只处理这些 ID，逗号分隔")
    parser.add_argument("--source", default=str(SOURCE))
    parser.add_argument("--output", default=str(OUTPUT))
    parser.add_argument("--sheet", action="store_true", help="生成前后对比图")
    args = parser.parse_args()

    source = Path(args.source)
    if not source.is_dir():
        print(f"edge-trim-failed 找不到母版目录 {source}")
        return 1

    wanted = {item.strip() for item in args.ids.split(",") if item.strip()}
    output = Path(args.output)

    entries, skipped = [], []
    for path in sorted(source.glob("*/*.png")):
        if wanted and path.stem not in wanted:
            continue
        result = trim(path, output / path.parent.name / path.name)
        if result is None:
            skipped.append(path)
            continue
        before, after, trims = result
        entries.append((f"{path.parent.name}/{path.name}", before, after, trims))
        print(f"  {path.parent.name}/{path.name} -> {output / path.parent.name / path.name}  "
              f"top={trims['top']} bottom={trims['bottom']} left={trims['left']} right={trims['right']}")

    print(f"edge-trim-ok trimmed={len(entries)} untouched={len(skipped)} out={output}")
    if args.sheet:
        sheet = build_sheet(entries, SHEET)
        if sheet:
            print(f"  对比图：{sheet}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
