from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "ui" / "home" / "poolStarRemnant.png"
DESTINATION = ROOT / "assets" / "ui" / "home" / "poolStarRemnant-clean.png"


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    rgba = np.asarray(image)
    height, width = rgba.shape[:2]
    mask = np.zeros((height, width), dtype=np.uint8)
    points = np.array([[
        [round(width * 0.70), 0],
        [width - 1, 0],
        [width - 1, round(height * 0.19)],
        [round(width * 0.88), round(height * 0.16)],
        [round(width * 0.76), round(height * 0.10)],
    ]], dtype=np.int32)
    cv2.fillPoly(mask, points, 255)
    rgb = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2BGR)
    repaired = cv2.inpaint(rgb, mask, 9, cv2.INPAINT_TELEA)
    repaired_rgb = cv2.cvtColor(repaired, cv2.COLOR_BGR2RGB)
    result = np.dstack((repaired_rgb, rgba[:, :, 3]))
    Image.fromarray(result, "RGBA").save(DESTINATION, optimize=True)
    print(f"cleaned {SOURCE.name} -> {DESTINATION.name} {width}x{height}")


if __name__ == "__main__":
    main()
