from __future__ import annotations

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

SOURCE_ROOT = DESIGN / "card-art" / "source"
CONFIG_PATH = DESIGN / "card-art" / "art-config.json"
OUTPUT_ROOT = ROOT / "subpackages"
OUTPUT_SIZE = (512, 608)
QUALITY = 84


def build_set(set_id: str, config: dict[str, object]) -> dict[str, object]:
    source_dir = SOURCE_ROOT / set_id
    if not source_dir.is_dir():
        raise FileNotFoundError(source_dir)
    package_name = str(config.get("package") or f"card-art-{set_id}")
    card_ids = [str(card_id).lower() for card_id in config.get("cards", [])]
    package_dir = OUTPUT_ROOT / package_name
    image_dir = package_dir / "images"
    image_dir.mkdir(parents=True, exist_ok=True)
    entry = package_dir / "game.js"
    if not entry.exists():
        entry.write_text('"use strict";\n', encoding="utf-8")
    for stale in image_dir.glob("*.jpg"):
        if stale.stem.lower() not in card_ids:
            stale.unlink()
    cards: dict[str, str] = {}
    total_bytes = 0
    for card_id in card_ids:
        candidates = [source_dir / f"{card_id}{suffix}" for suffix in (".png", ".jpg", ".jpeg", ".webp")]
        source = next((candidate for candidate in candidates if candidate.is_file()), None)
        if source is None:
            raise FileNotFoundError(f"Missing source art for {set_id}/{card_id}")
        destination = image_dir / f"{card_id}.jpg"
        with Image.open(source) as image:
            rgb = image.convert("RGB")
            if rgb.size != OUTPUT_SIZE:
                rgb = rgb.resize(OUTPUT_SIZE, Image.Resampling.LANCZOS)
            rgb.save(destination, "JPEG", quality=QUALITY, optimize=True, subsampling=1)
        cards[card_id] = destination.relative_to(ROOT).as_posix()
        total_bytes += destination.stat().st_size
    manifest = {
        "setId": set_id,
        "package": package_name,
        "size": list(OUTPUT_SIZE),
        "quality": QUALITY,
        "cards": cards,
        "totalBytes": total_bytes,
    }
    manifest_path = OUTPUT_ROOT / package_name / "art-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    for set_id, set_config in config.get("sets", {}).items():
        manifest = build_set(str(set_id), set_config)
        print(
            "card-art-package-ok",
            manifest["package"],
            f"cards={len(manifest['cards'])}",
            f"bytes={manifest['totalBytes']}",
        )


if __name__ == "__main__":
    main()
