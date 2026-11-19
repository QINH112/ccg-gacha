from __future__ import annotations

import json
import re
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "assets" / "ui" / "home" / "manifest.json"
GAME_PATH = ROOT / "game.js"


def check_file(relative_path: str, label: str) -> tuple[int, int, int]:
    path = ROOT / relative_path
    if not path.is_file():
        raise FileNotFoundError(f"{label}: {relative_path}")
    with Image.open(path) as image:
        image.load()
        width, height = image.size
    return width, height, path.stat().st_size


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    design_width, design_height = manifest["designSize"]
    checked: list[tuple[str, int, int, int]] = []

    for key in ("background", "battleBackground"):
        relative_path = manifest.get(key)
        if not relative_path:
            raise ValueError(f"manifest missing {key}")
        width, height, size = check_file(relative_path, key)
        if (width, height) != (design_width, design_height):
            raise ValueError(f"{key} has {width}x{height}, expected {design_width}x{design_height}")
        checked.append((key, width, height, size))

    mask_entry = manifest.get("cardArtMask")
    if not isinstance(mask_entry, dict):
        raise ValueError("manifest missing cardArtMask")
    width, height, size = check_file(mask_entry["path"], "cardArtMask")
    if (width, height) != (mask_entry["width"], mask_entry["height"]):
        raise ValueError("cardArtMask size mismatch")
    with Image.open(ROOT / mask_entry["path"]) as image:
        mask_alpha = image.convert("RGBA").getchannel("A")
        if mask_alpha.getpixel((width // 2, height // 4)) < 200 or mask_alpha.getpixel((0, 0)) != 0:
            raise ValueError("cardArtMask alpha is invalid")
    checked.append(("cardArtMask", width, height, size))

    card_frames = manifest.get("cardFrames")
    if not isinstance(card_frames, dict) or len(card_frames) != 8:
        raise ValueError("manifest must define eight cardFrames")
    for key, card_frame in card_frames.items():
        width, height, size = check_file(card_frame["path"], f"cardFrame.{key}")
        expected = (card_frame["width"], card_frame["height"])
        if (width, height) != expected:
            raise ValueError(f"cardFrame.{key} has {width}x{height}, expected {expected[0]}x{expected[1]}")
        with Image.open(ROOT / card_frame["path"]) as image:
            alpha = image.convert("RGBA").getchannel("A")
            if alpha.getpixel((0, 0)) != 0 or alpha.getpixel((width // 2, height // 4)) != 0:
                raise ValueError(f"cardFrame.{key} outside or artwork window is not transparent")
        checked.append((f"cardFrame.{key}", width, height, size))

    for key, entry in manifest["assets"].items():
        width, height, size = check_file(entry["path"], key)
        expected = (entry["width"], entry["height"])
        if (width, height) != expected:
            raise ValueError(f"{key} has {width}x{height}, manifest expects {expected[0]}x{expected[1]}")
        checked.append((key, width, height, size))

    source = GAME_PATH.read_text(encoding="utf-8")
    original_template_match = re.search(
        r"function drawOriginalCardTemplate\([\s\S]+?return true;\s*\}",
        source,
    )
    if not original_template_match:
        raise ValueError("drawOriginalCardTemplate not found")
    original_template = original_template_match.group(0)
    if 'ctx.arc(x+w*.805,y+h*.195' in original_template or 'fillStyle=p.accent+"dd"' in original_template:
        raise ValueError("full card frame rarity socket must not receive a Canvas color overlay")
    if "drawMaskedCardArt(card,x,y,w,h)" not in original_template:
        raise ValueError("full card artwork must use the shared bitmap mask")
    collection_match = re.search(r"function renderCollection\(\)[\s\S]+?scrollBar\(start\);\s*\}", source)
    if not collection_match:
        raise ValueError("renderCollection not found")
    collection_source = collection_match.group(0)
    if "cols=3" not in collection_source or "cardH=cw*1.5" not in collection_source:
        raise ValueError("collection must use three-column full-size card frames")
    if "half=(cw-3)/2" in collection_source or "x+half+3" in collection_source:
        raise ValueError("collection must not split normal and shiny cards into half-width cells")
    if 'cards.flatMap(card=>[{card:{...card,shiny:false}' not in collection_source or '{card:{...card,shiny:true}' not in collection_source:
        raise ValueError("collection must create separate full-size normal and shiny entries")
    if "miniCard(entry.card,x,y,cw,cardH,{transparentOuter:true})" not in collection_source:
        raise ValueError("collection entries must render the full original frame without an outer fallback border")
    if 'text(`${entry.label} ${entry.count}`' not in collection_source:
        raise ValueError("collection must label each full-size normal and shiny entry")
    touch_end_match = re.search(r"wx\.onTouchEnd\(e=>\{[\s\S]+?activate\(t\.clientX,t\.clientY\);\}\);", source)
    if not touch_end_match or 'state.screen==="collection"' not in touch_end_match.group(0) or "openCardDetail(target.card)" not in touch_end_match.group(0):
        raise ValueError("collection cards must open their detail view on a single tap")
    template_match = re.search(r"function drawCardTemplate\([\s\S]+?ctx\.restore\(\);\s*\}", source)
    if not template_match or "if(!transparentOuter)box(" not in template_match.group(0):
        raise ValueError("drawCardTemplate must gate the fallback border behind transparentOuter")
    referenced_paths = sorted(set(re.findall(r'"(assets/(?:backgrounds|ui/(?:home|cards))/[^"\\]+)"', source)))
    for relative_path in referenced_paths:
        if not (ROOT / relative_path).is_file():
            raise FileNotFoundError(f"game.js reference missing: {relative_path}")

    total_bytes = sum(size for _, _, _, size in checked)
    print(f"visual-assets-ok files={len(checked)} gameReferences={len(referenced_paths)} bytes={total_bytes}")
    for label, width, height, size in checked:
        print(f"{label}: {width}x{height} {size}B")


if __name__ == "__main__":
    main()
