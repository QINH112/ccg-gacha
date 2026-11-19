#!/usr/bin/env python3
"""云函数结构校验：部署前必须全部满足，否则微信开发者工具上传会失败或运行时报错。

检查项：
1. `cloudfunctions/` 下每个目录都必须有 `index.js` 与 `package.json`（空的残留目录也算错误）。
2. 每个 `package.json` 的 dependencies 必须声明 `wx-server-sdk`。
3. 每个 `index.js` 必须导出 `exports.main`（云函数入口）。
4. 客户端 `utils/storage.js` 里 `callFunction("name", ...)` 引用的函数必须真实存在。
5. 客户端引用的函数名必须落在云函数目录集合内（防止改名后漏改客户端）。
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLOUD = ROOT / "cloudfunctions"
STORAGE = ROOT / "utils" / "storage.js"


def main() -> int:
    failures = []
    if not CLOUD.is_dir():
        print("cloudfunctions-validate-failed: 缺少 cloudfunctions 目录")
        return 1

    dirs = sorted(path for path in CLOUD.iterdir() if path.is_dir())
    if not dirs:
        failures.append("cloudfunctions 下没有任何云函数目录")

    functions = {}
    for directory in dirs:
        name = directory.name
        index = directory / "index.js"
        package = directory / "package.json"
        if not index.is_file():
            failures.append(f"{name}: 缺少 index.js（空的残留目录？）")
        else:
            source = index.read_text(encoding="utf-8", errors="replace")
            if "exports.main" not in source:
                failures.append(f"{name}: index.js 未导出 exports.main")
        if not package.is_file():
            failures.append(f"{name}: 缺少 package.json")
        else:
            try:
                manifest = json.loads(package.read_text(encoding="utf-8"))
            except json.JSONDecodeError as error:
                failures.append(f"{name}: package.json 不是合法 JSON（{error}）")
                manifest = {}
            dependencies = manifest.get("dependencies") or {}
            if "wx-server-sdk" not in dependencies:
                failures.append(f"{name}: package.json 未声明 wx-server-sdk 依赖")
        functions[name] = index

    referenced = set()
    if STORAGE.is_file():
        source = STORAGE.read_text(encoding="utf-8")
        referenced = set(re.findall(r'callFunction\(\s*"([A-Za-z0-9_]+)"', source))
        missing = sorted(name for name in referenced if name not in functions)
        if missing:
            failures.append("客户端调用了不存在的云函数：" + ", ".join(missing))
    else:
        failures.append("缺少 utils/storage.js，无法核对客户端调用名")

    if failures:
        print("cloudfunctions-validate-failed")
        for item in failures:
            print(f"- {item}")
        return 1

    print(f"cloudfunctions-validate-ok functions={len(functions)} referenced={len(referenced)}")
    print("  " + ", ".join(sorted(functions)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
