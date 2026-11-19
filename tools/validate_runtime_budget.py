from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "assets" / "ui" / "home" / "manifest.json"
GAME = ROOT / "game.js"
PREVIEW_CANDIDATES = [
    ROOT / "design" / "review" / "preview-info-all-card-art.json",
    ROOT / "design" / "review" / "preview-info-card-art-c001-c005.json",
    ROOT / "design" / "review" / "preview-info-card-frame-rarities.json",
    ROOT / "design" / "review" / "preview-info-final2.json",
    ROOT / "design" / "review" / "preview-info-p6-stability.json",
    ROOT / "design" / "review" / "preview-info-p5-services.json",
    ROOT / "design" / "review" / "preview-info-p4-final.json",
    ROOT / "design" / "review" / "preview-info-p4-results.json",
    ROOT / "design" / "review" / "preview-info-p4.json",
    ROOT / "design" / "review" / "preview-info-final.json",
    ROOT / "design" / "review" / "preview-info-original-card-frame.json",
]
MAX_RUNTIME_ART_BYTES = 2_500_000
MAX_MAIN_PACKAGE_BYTES = 4_000_000
MAX_TOTAL_PREVIEW_BYTES = 20_000_000
MAX_IMAGE_PIXELS = 2_000_000


def main() -> None:
    game_source = GAME.read_text(encoding="utf-8")
    if "Math.min(2,info.pixelRatio||1)" not in game_source:
        raise SystemExit("runtime-budget-failed: Canvas DPR is not capped at 2")
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    paths: set[Path] = set()
    for key in ("background", "battleBackground"):
        paths.add(ROOT / manifest[key])
    if manifest.get("cardArtMask"):
        paths.add(ROOT / manifest["cardArtMask"]["path"])
    for card_frame in manifest.get("cardFrames", {}).values():
        if isinstance(card_frame, dict) and card_frame.get("path"):
            paths.add(ROOT / card_frame["path"])
    for item in manifest.get("assets", {}).values():
        if isinstance(item, dict):
            relative = item.get("path") or item.get("file")
            if relative:
                paths.add(ROOT / relative)
    total_bytes = 0
    largest = ("", 0, 0, 0)
    for path in sorted(paths):
        if not path.exists():
            raise SystemExit(f"runtime-budget-failed: missing {path.relative_to(ROOT)}")
        size = path.stat().st_size
        total_bytes += size
        with Image.open(path) as image:
            pixels = image.width * image.height
            if pixels > MAX_IMAGE_PIXELS:
                raise SystemExit(f"runtime-budget-failed: image too large {path.relative_to(ROOT)} {image.width}x{image.height}")
            if size > largest[3]:
                largest = (str(path.relative_to(ROOT)), image.width, image.height, size)
    if total_bytes > MAX_RUNTIME_ART_BYTES:
        raise SystemExit(f"runtime-budget-failed: art bytes {total_bytes}>{MAX_RUNTIME_ART_BYTES}")
    preview_bytes = 0
    preview_main_bytes = 0
    preview_subpackages: list[tuple[str, int]] = []
    preview_info = next((path for path in PREVIEW_CANDIDATES if path.exists()), None)
    if preview_info:
        preview = json.loads(preview_info.read_text(encoding="utf-8"))
        size_info = preview.get("size", {})
        preview_bytes = int(size_info.get("total", 0))
        packages = size_info.get("packages", [])
        preview_main_bytes = next((int(item.get("size", 0)) for item in packages if item.get("name") == "main"), preview_bytes)
        preview_subpackages = [
            (str(item.get("name", "subpackage")), int(item.get("size", 0)))
            for item in packages
            if item.get("name") not in {"TOTAL", "main"}
        ]
        if preview_main_bytes > MAX_MAIN_PACKAGE_BYTES:
            raise SystemExit(f"runtime-budget-failed: main package {preview_main_bytes}>{MAX_MAIN_PACKAGE_BYTES}")
        if preview_bytes > MAX_TOTAL_PREVIEW_BYTES:
            raise SystemExit(f"runtime-budget-failed: total preview {preview_bytes}>{MAX_TOTAL_PREVIEW_BYTES}")
    print(
        "runtime-budget-ok",
        f"dpr<=2 art={total_bytes}/{MAX_RUNTIME_ART_BYTES}",
        f"previewTotal={preview_bytes}/{MAX_TOTAL_PREVIEW_BYTES}",
        f"main={preview_main_bytes}/{MAX_MAIN_PACKAGE_BYTES}",
        f"subpackages={','.join(f'{name}:{size}' for name,size in preview_subpackages) or 'none'}",
        f"largest={largest[0]}:{largest[1]}x{largest[2]}:{largest[3]}B",
    )


if __name__ == "__main__":
    main()
