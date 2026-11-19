#!/usr/bin/env python
"""Generate home-button icon art with the local ComfyUI server.

The game's home menu tiles are 3D "clay" style icons on an indigo rounded
square. This script renders the icon artwork only (no text, no frame) so the
button frame and the Chinese label can be composited at pixel-exact size.

Usage:
  D:/ComfyUI-venv/Scripts/python.exe tools/comfy_button_icon.py --concept megaphone --seeds 1001,1002
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WORKFLOW = os.environ.get("COMFY_WORKFLOW", r"D:\ComfyUI\wf_sdxl.json")
SERVER = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
from pathlib import Path  # noqa: E402
from design_root import resolve_design_root  # noqa: E402

DESIGN = str(resolve_design_root(Path(ROOT)))
OUT = os.path.join(DESIGN, "generated", "home-button-adjust-announcement", "raw")

STYLE = ("cute kawaii 3D game icon, soft matte clay material, chunky rounded shapes, "
         "pastel cream and warm gold palette, tiny indigo blue accents, glossy candy highlights, "
         "soft top key light with gentle ambient occlusion, toy-like proportions, "
         "centered single object, isolated on pure flat white background, "
         "clean minimal blender render, high detail, no text")

NEGATIVE = ("text, chinese characters, letters, watermark, signature, logo, "
            "background scenery, scenery, floor, cast shadow, drop shadow, "
            "gradient background, gray background, mascot, character, creature, animal, bear, "
            "multiple objects, hands, person, photorealistic, photograph, realistic metal, chrome, "
            "steel, low quality, blurry, jpeg artifacts, cropped, out of frame")

CONCEPTS = {
    "megaphone": ("a cute golden megaphone loudspeaker with a cream ivory body and gold metal horn, "
                  "tilted slightly, small sparkle star details, chunky toy proportions"),
    "noticeboard": ("a cute golden announcement board with a cream parchment sheet and a small pencil, "
                    "rounded wooden frame, tiny gold star pins, chunky toy proportions"),
    "megaphone-pencil": ("a cute golden megaphone with a small cream parchment scroll and a tiny pencil "
                         "beside it, indigo blue accents, chunky toy proportions"),
    "megaphone-clay": ("a cute toy megaphone loudspeaker with a cream ivory body and a warm gold horn ring, "
                       "a small indigo blue star badge on its side, short rounded handle, chunky kawaii shape"),
    "board-clay": ("a cute toy announcement board, rounded cream parchment panel with a warm gold frame, "
                   "a small indigo blue pencil leaning against it, tiny gold star pin, chunky kawaii shape"),
    "megaphone-emoji": ("a 3d emoji icon of a megaphone loudspeaker, glossy plastic toy, cream ivory body, "
                        "warm gold horn, blue star badge, front three quarter view, simple rounded shapes"),
    "megaphone-asset": ("game ui asset, 3d render of a small megaphone loudspeaker, glossy plastic, "
                        "cream and gold with blue accents, simple chunky geometry, product design"),
    "megaphone-clay2": ("clay render of a megaphone loudspeaker, pastel cream and gold, blue accent ring, "
                        "soft matte surface, simple chunky geometry, product design photograph"),
    "board-emoji": ("a 3d emoji icon of a notice board with a pencil, cream parchment panel, gold frame, "
                    "blue pencil, front view, simple rounded shapes"),
    "megaphone-green": ("a 3d game icon of a megaphone loudspeaker, cream ivory body, warm gold horn, "
                        "indigo blue star badge, chunky rounded shapes, front three quarter view"),
    "board-green": ("a 3d game icon of a small notice board with a cream parchment panel, warm gold frame, "
                    "indigo blue pencil, chunky rounded shapes, front view"),
    "pencil-green": ("a 3d game icon of a chunky indigo blue pencil, gold ferrule, cream eraser, "
                     "clear announcement megaphone silhouette behind it, chunky rounded shapes"),
    "tile-megaphone": ("a mobile game ui button, rounded square glossy indigo purple glass button with a thin "
                       "golden border, one 3d clay megaphone icon centered inside, cream and gold megaphone with "
                       "blue accents, soft studio lighting, kawaii mobile game asset, front view"),
    "megaphone-toy": ("a 3d clay toy megaphone, chunky cream white body, warm gold horn rim, small indigo blue "
                      "speaker cone, rounded handle, no stand, floating, three quarter view"),
    "megaphone-toy2": ("a 3d ceramic toy megaphone, simple rounded cream horn, gold ring, indigo blue mouthpiece, "
                       "tiny star badge, no stand, slight tilt, cute mobile game icon object"),
}

TILE_STYLE = ("clean game ui asset render, high detail, centered composition, "
              "plain flat white background, no text, no labels, no watermark")

TILE_NEGATIVE = ("text, chinese characters, letters, numbers, watermark, signature, logo, "
                 "multiple buttons, button grid, menu screen, screenshot, hands, person, photorealistic, "
                 "photograph, gray background, gradient background, low quality, blurry, jpeg artifacts, cropped")

GREEN_STYLE = ("cute stylized 3D game icon, soft matte clay and glossy plastic materials, "
               "warm cream and gold palette with indigo blue accents, chunky rounded toy shapes, "
               "soft top key light, gentle ambient occlusion, centered single object, "
               "isolated on a uniform bright chroma key green screen background, flat even lighting, "
               "no shadow, clean minimal render, high detail, no text")

GREEN_NEGATIVE = ("text, chinese characters, letters, watermark, signature, logo, "
                  "background scenery, scenery, floor, cast shadow, drop shadow, gradient background, "
                  "white background, gray background, mascot, character, creature, animal, bear, "
                  "multiple objects, hands, person, photorealistic, photograph, realistic metal, chrome, "
                  "steel, low quality, blurry, jpeg artifacts, cropped, out of frame")


def http_json(url, payload=None, timeout=60):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        body = response.read()
        return json.loads(body) if body else {}


def submit(workflow):
    return http_json(SERVER + "/prompt", {"prompt": workflow, "client_id": str(uuid.uuid4())})


def wait(prompt_id, timeout):
    started = time.time()
    while time.time() - started < timeout:
        history = http_json(f"{SERVER}/history/{prompt_id}", timeout=30)
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(2)
    raise TimeoutError(prompt_id)


def first_image(entry):
    for node_output in entry.get("outputs", {}).values():
        for item in node_output.get("images", []) or []:
            if item.get("type") == "output":
                return item
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--concept", choices=sorted(CONCEPTS), required=True)
    parser.add_argument("--seeds", default="1001")
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--steps", type=int, default=32)
    parser.add_argument("--cfg", type=float, default=7.0)
    parser.add_argument("--style", choices=("clay", "green", "tile"), default="clay")
    parser.add_argument("--out", default=OUT)
    args = parser.parse_args()

    with open(WORKFLOW, "r", encoding="utf-8") as handle:
        base = json.load(handle)

    style, negative = (GREEN_STYLE, GREEN_NEGATIVE) if args.style == "green" else (STYLE, NEGATIVE)
    if args.style == "tile":
        style, negative = TILE_STYLE, TILE_NEGATIVE

    os.makedirs(args.out, exist_ok=True)
    results = []
    for seed in [int(value) for value in args.seeds.split(",") if value.strip()]:
        workflow = json.loads(json.dumps(base))
        prompt = CONCEPTS[args.concept] + ", " + style
        workflow["2"]["inputs"]["text"] = prompt
        workflow["3"]["inputs"]["text"] = negative
        workflow["4"]["inputs"]["width"] = args.size
        workflow["4"]["inputs"]["height"] = args.size
        workflow["5"]["inputs"]["seed"] = seed
        workflow["5"]["inputs"]["steps"] = args.steps
        workflow["5"]["inputs"]["cfg"] = args.cfg
        workflow["7"]["inputs"]["filename_prefix"] = f"button-icons/{args.concept}_{seed}"

        started = time.time()
        response = submit(workflow)
        if "prompt_id" not in response:
            raise RuntimeError(json.dumps(response, ensure_ascii=False)[:2000])
        entry = wait(response["prompt_id"], 600)
        status = entry.get("status", {})
        if status.get("status_str") == "error":
            raise RuntimeError(json.dumps(status, ensure_ascii=False)[:2000])

        image = first_image(entry)
        if not image:
            raise RuntimeError("no output image")
        query = urllib.parse.urlencode({
            "filename": image["filename"],
            "subfolder": image.get("subfolder", ""),
            "type": image.get("type", "output"),
        })
        destination = os.path.join(args.out, f"{args.concept}_{seed}.png")
        with urllib.request.urlopen(f"{SERVER}/view?{query}", timeout=180) as response:
            with open(destination, "wb") as handle:
                handle.write(response.read())

        meta = {
            "concept": args.concept,
            "seed": seed,
            "size": args.size,
            "steps": args.steps,
            "cfg": args.cfg,
            "sampler": "dpmpp_2m",
            "scheduler": "karras",
            "checkpoint": workflow["1"]["inputs"]["ckpt_name"],
            "prompt": prompt,
            "negative": negative,
            "seconds": round(time.time() - started, 1),
            "file": os.path.relpath(destination, ROOT).replace("\\", "/"),
        }
        with open(os.path.splitext(destination)[0] + ".json", "w", encoding="utf-8") as handle:
            json.dump(meta, handle, ensure_ascii=False, indent=2)
        results.append(meta)
        print("OUTPUT", destination, meta["seconds"], "s", flush=True)

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
