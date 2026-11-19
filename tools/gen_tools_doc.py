#!/usr/bin/env python3
"""生成 docs/TOOLS.md：把 tools/ 下的脚本按用途分组列出来。

配合 `tools/validate_tool_inventory.py` 使用：新加脚本后重跑本脚本，校验器会检查
文档与实际脚本集合是否一致，避免「加了一堆脚本但没人知道怎么跑」。

用法：py tools/gen_tools_doc.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
TARGET = ROOT / "docs" / "TOOLS.md"

GROUPS = [
    ("提交前必跑（校验与契约测试）", ("validate_", "test_", "smoke_")),
    ("素材构建（生成运行时资源，产物写入游戏目录）", ("build_", "extract_", "clean_")),
    ("视觉 QA 渲染（截图写入 D:\\kaifa\\design\\review）", ("render_",)),
    ("证据与窗口抓取（P7 真机证据）", ("write_", "capture_", "click_", "export_")),
    ("素材生成辅助（ComfyUI 等）", ("comfy_", "design_")),
]

RUN_NOTES = {
    "smoke_battle_stability.js": "需要 `node --expose-gc`",
    "smoke_navigation_stability.js": "需要 `node --expose-gc`",
}


def describe(path):
    """取脚本头部的说明：Python 用模块 docstring 首句，JS 用首段 // 注释。"""
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix == ".py":
        match = re.search(r'"""(.+?)"""', text, re.S)
        if match:
            for line in match.group(1).strip().splitlines():
                line = line.strip()
                if line:
                    return line
        return ""
    for line in text.splitlines()[:12]:
        stripped = line.strip()
        if stripped.startswith("//"):
            body = stripped.lstrip("/").strip()
            if body:
                return body
        elif stripped and stripped != '"use strict";':
            break
    return ""


def main():
    if not TOOLS.is_dir():
        print("gen-tools-doc-failed: 缺少 tools 目录")
        return 1
    scripts = sorted(path for path in TOOLS.iterdir() if path.suffix in (".js", ".py"))
    lines = [
        "# 工具清单",
        "",
        "本文件由 `py tools/gen_tools_doc.py` 生成；`py tools/validate_tool_inventory.py` 会检查它与 `tools/` 实际内容是否同步。",
        "新加脚本后重跑生成器，不要手改本文件。",
        "",
    ]
    grouped = set()
    for title, prefixes in GROUPS:
        bucket = [path for path in scripts if path.name.startswith(prefixes)]
        if not bucket:
            continue
        grouped.update(path.name for path in bucket)
        lines.append(f"## {title}")
        lines.append("")
        for path in bucket:
            note = describe(path)
            suffix = f" —— {note}" if note else ""
            run = RUN_NOTES.get(path.name, "")
            run_suffix = f"（{run}）" if run else ""
            lines.append(f"- `tools/{path.name}`{suffix}{run_suffix}")
        lines.append("")

    rest = [path for path in scripts if path.name not in grouped]
    if rest:
        lines.append("## 其他")
        lines.append("")
        for path in rest:
            note = describe(path)
            suffix = f" —— {note}" if note else ""
            lines.append(f"- `tools/{path.name}`{suffix}")
        lines.append("")

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"tools-doc-generated scripts={len(scripts)} target=docs/TOOLS.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
