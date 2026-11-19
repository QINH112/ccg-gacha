#!/usr/bin/env python3
"""卡牌母版「白边 / 浅色边」检测。

卡牌立绘母版在 `D:\\kaifa\\design\\card-art\\source\\<卡包>\\<卡牌ID>.png`。
生成图常见两种边框瑕疵：

1. **白边**：图上下或左右被补了一条亮白色带（例如 `base/r008.png` 上下约 245 亮度）。
2. **浅色边**：四边整体偏亮，像蒙了一层雾（例如 `base/c008.png` 四边都是 232 左右）。

判定用「边缘带」统计：取每边 1.5% 宽度的一条，算亮度均值、标准差、亮像素占比。
纯色亮带 → 均值高、标准差极小、亮像素接近 100%；正常画面边缘会有结构（标准差大）。

第三类瑕疵（笔画残留，如 `star-remnant/s007.png`）没法用这个指标稳定区分——
它和「画面本身画到边缘」的图分不开，只能靠人眼看。

用法：
    py tools/check_card_art_edges.py            # 报告，退出 0
    py tools/check_card_art_edges.py --fail     # 有白边/浅色边时退出 1（发布前门禁）
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageStat

from design_root import resolve_design_root

ROOT = Path(__file__).resolve().parents[1]
DESIGN = resolve_design_root(ROOT)
SOURCE = DESIGN / "card-art" / "source"

BAND_RATIO = 0.015
WHITE_MEAN = 200.0        # 亮带下限（低于这个基本是正常画面）
SURE_MEAN = 220.0         # 明确白边（≈纸白）
WHITE_STD = 3.0           # 标准差要极小：纯色带
WHITE_BRIGHT = 95.0       # 200 以上像素占比

EDGES = ("top", "bottom", "left", "right")


def band_boxes(width: int, height: int, band: int):
    return {
        "top": (0, 0, width, band),
        "bottom": (0, height - band, width, height),
        "left": (0, 0, band, height),
        "right": (width - band, 0, width, height),
    }


def edge_stats(image: Image.Image, band: int):
    stats = {}
    for name, box in band_boxes(image.width, image.height, band).items():
        gray = image.crop(box).convert("L")
        histogram = gray.histogram()
        total = sum(histogram) or 1
        stats[name] = {
            "mean": round(ImageStat.Stat(gray).mean[0], 1),
            "std": round(ImageStat.Stat(gray).stddev[0], 1),
            "bright": round(sum(histogram[200:]) / total * 100, 1),
        }
    return stats


def is_white_edge(stat) -> bool:
    return stat["mean"] >= WHITE_MEAN and stat["std"] <= WHITE_STD and stat["bright"] >= WHITE_BRIGHT


def severity(stat) -> str:
    """mean ≥ 220 视为明确白边；200–220 之间只报「临界」，交给人眼判断（浅色背景也可能命中）。"""
    return "sure" if stat["mean"] >= SURE_MEAN else "borderline"


def inspect(path: Path):
    image = Image.open(path).convert("RGB")
    band = max(2, int(round(min(image.size) * BAND_RATIO)))
    stats = edge_stats(image, band)
    flagged = {name: value for name, value in stats.items() if is_white_edge(value)}
    return image.size, band, stats, flagged


def main() -> int:
    parser = argparse.ArgumentParser(description="卡牌母版白边检测")
    parser.add_argument("--fail", action="store_true", help="发现问题时退出 1")
    parser.add_argument("--source", default=str(SOURCE), help="母版目录")
    args = parser.parse_args()

    source = Path(args.source)
    if not source.is_dir():
        print(f"card-art-edges-failed 找不到母版目录 {source}")
        return 1

    images = sorted(source.glob("*/*.png"))
    if not images:
        print(f"card-art-edges-failed {source} 下没有 PNG")
        return 1

    sure, borderline = [], []
    for path in images:
        size, band, stats, flagged = inspect(path)
        if not flagged:
            continue
        entry = (path, size, band, flagged)
        if any(severity(value) == "sure" for value in flagged.values()):
            sure.append(entry)
        else:
            borderline.append(entry)

    print(f"card-art-edges checked={len(images)} sure={len(sure)} borderline={len(borderline)} "
          f"band={BAND_RATIO * 100:.1f}% rule=mean>={WHITE_MEAN:.0f}&std<={WHITE_STD}&bright>={WHITE_BRIGHT:.0f}%")
    for title, group in (("明确白边（mean ≥ 220）", sure), ("临界（mean 200–220，需人眼判断）", borderline)):
        if not group:
            continue
        print(f"  {title}：")
        for path, size, band, flagged in group:
            detail = ", ".join(
                f"{name}(mean={value['mean']},std={value['std']},bright={value['bright']}%,{severity(value)})"
                for name, value in flagged.items()
            )
            print(f"    {path.parent.name}/{path.name} {size[0]}x{size[1]} band={band}px -> {detail}")

    if sure or borderline:
        print("提示：白边/浅色边在成品卡面上会变成一道亮框，需要重绘或裁切。见 docs/CARD_ART_INTEGRATION.md「已知素材瑕疵」。")
        return 1 if args.fail else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
