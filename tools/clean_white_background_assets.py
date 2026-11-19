from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

LAYERS = DESIGN / "layers"


def clean_largest_component(source_name: str, output_name: str) -> None:
    source_path = LAYERS / source_name
    image = Image.open(source_path).convert("RGB")
    array = np.asarray(image, dtype=np.uint8)
    distance = np.max(255 - array, axis=2)
    binary = (distance > 8).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if count <= 1:
        raise RuntimeError(f"未找到可保留的按钮主体：{source_path}")

    main_label = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    component = np.where(labels == main_label, 255, 0).astype(np.uint8)
    component = cv2.dilate(component, np.ones((3, 3), np.uint8), iterations=1)
    soft_mask = Image.fromarray(component, "L").filter(ImageFilter.GaussianBlur(0.45))

    output = Image.new("RGB", image.size, "white")
    output.paste(image, (0, 0), soft_mask)
    output.save(LAYERS / output_name, "PNG", optimize=True)


def main() -> None:
    clean_largest_component("30_battle.png", "30_battle-v2.png")
    clean_largest_component("31_battle_history.png", "31_battle_history-v2.png")


if __name__ == "__main__":
    main()
