#!/usr/bin/env python3
"""校验 docs/TOOLS.md 与 tools/ 实际脚本集合一致。

规则：
1. `tools/` 下每个 .js / .py 脚本都必须在 `docs/TOOLS.md` 里出现一次。
2. 文档里列出的每个 `tools/xxx` 都必须真实存在（防止删了脚本没删文档）。
3. 文档必须由生成器生成（首段包含「由 py tools/gen_tools_doc.py 生成」）。

不一致时提示重跑 `py tools/gen_tools_doc.py`。
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
DOC = ROOT / "docs" / "TOOLS.md"


def main():
    if not DOC.is_file():
        print("tool-inventory-failed: 缺少 docs/TOOLS.md，请运行 py tools/gen_tools_doc.py")
        return 1
    if not TOOLS.is_dir():
        print("tool-inventory-failed: 缺少 tools 目录")
        return 1

    text = DOC.read_text(encoding="utf-8")
    documented = set(re.findall(r"`tools/([^`]+?)`", text))
    actual = {path.name for path in TOOLS.iterdir() if path.suffix in (".js", ".py")}

    failures = []
    missing = sorted(actual - documented)
    stale = sorted(documented - actual)
    if missing:
        failures.append("以下脚本没有写进 docs/TOOLS.md：" + ", ".join(missing))
    if stale:
        failures.append("docs/TOOLS.md 列了不存在的脚本：" + ", ".join(stale))
    if "gen_tools_doc.py" not in text:
        failures.append("docs/TOOLS.md 缺少生成器说明（应写「由 py tools/gen_tools_doc.py 生成」）")

    if failures:
        print("tool-inventory-failed")
        for item in failures:
            print(f"- {item}")
        print("修复：py tools/gen_tools_doc.py")
        return 1

    print(f"tool-inventory-ok scripts={len(actual)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
