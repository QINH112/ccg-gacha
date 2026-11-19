from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

try:
    from PIL import Image
except ModuleNotFoundError:
    Image = None


ROOT = Path(__file__).resolve().parents[1]
from design_root import resolve_design_root  # noqa: E402

DESIGN = resolve_design_root(ROOT)

CONFIG = DESIGN / "card-art" / "art-config.json"
GAME_JSON = ROOT / "game.json"
CARD_DATA = ROOT / "cloudfunctions" / "initGameData" / "index.js"
CLIENT = ROOT / "game.js"


def validate_image(path: Path, relative: str) -> None:
    if Image is not None:
        with Image.open(path) as image:
            if image.size != (512, 608) or image.mode != "RGB":
                raise ValueError(f"invalid runtime art: {relative} {image.size} {image.mode}")
        return
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("card-art validation requires Pillow or ffprobe")
    result = subprocess.run(
        [ffprobe, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,pix_fmt", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    stream = json.loads(result.stdout).get("streams", [{}])[0]
    if stream.get("width") != 512 or stream.get("height") != 608 or str(stream.get("pix_fmt", "")).startswith("gray"):
        raise ValueError(f"invalid runtime art: {relative} {stream}")


def main() -> None:
    game = json.loads(GAME_JSON.read_text(encoding="utf-8"))
    packages = {item["name"]: item["root"] for item in game.get("subpackages", [])}
    if CONFIG.is_file():
        config = json.loads(CONFIG.read_text(encoding="utf-8"))
    else:
        config = {"sets": {}}
        for package_name, package_root in packages.items():
            if not package_name.startswith("card-art-"):
                continue
            manifest_path = ROOT / package_root / "art-manifest.json"
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            config["sets"][manifest["setId"]] = {
                "package": package_name,
                "cards": list(manifest.get("cards", {})),
            }
    card_source = CARD_DATA.read_text(encoding="utf-8")
    client_source = CLIENT.read_text(encoding="utf-8")
    if "artPath:card.artPath || cardArtPath(card.set,card.id)" not in card_source:
        raise ValueError("card data no longer assigns generated artPath")
    if 'numberedIds("c",27)' not in client_source or 'numberedIds("e",9)' not in client_source or 'numberedIds("l",4)' not in client_source or 'numberedIds("s",20)' not in client_source:
        raise ValueError("client local card-art mapping is incomplete")
    checked = 0
    total_bytes = 0
    for set_id, set_config in config.get("sets", {}).items():
        package_name = set_config["package"]
        expected_root = f"subpackages/{package_name}"
        if packages.get(package_name) != expected_root:
            raise ValueError(f"game.json subpackage mismatch: {package_name}")
        entry_path = ROOT / expected_root / "game.js"
        if not entry_path.is_file():
            raise FileNotFoundError(f"subpackage entry missing: {entry_path.relative_to(ROOT)}")
        manifest_path = ROOT / expected_root / "art-manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        expected_cards = [str(card_id) for card_id in set_config.get("cards", [])]
        if sorted(manifest.get("cards", {})) != sorted(expected_cards):
            raise ValueError(f"manifest card list mismatch: {set_id}")
        for card_id in expected_cards:
            relative = manifest["cards"][card_id]
            path = ROOT / relative
            validate_image(path, relative)
            checked += 1
            total_bytes += path.stat().st_size
    print(f"card-art-subpackages-ok cards={checked} bytes={total_bytes}")


if __name__ == "__main__":
    main()
