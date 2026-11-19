#!/usr/bin/env python
"""把 docs/RELEASE_CHECKLIST.md 里的 bash 代码块逐条跑一遍。

为什么需要它：发布检查单有 40+ 条命令，手工复制粘贴很容易漏一条，
而漏掉的那条往往正是会卡住发版的（比如包体超限、云函数结构）。

规则：
- 只执行 ```bash 代码块里的命令，按文档顺序执行
- 跳过 `cd xxx`（脚本自己已经在仓库根目录跑）
- 命中危险名单（rm / git push / git reset / npm install …）直接跳过并提示，
  避免「跑检查单」变成「改环境」
- 任何一条非 0 退出，最后汇总失败并 exit 1

跑法：
  py tools/run_release_checklist.py           # 真跑
  py tools/run_release_checklist.py --dry     # 只打印命令
  py tools/run_release_checklist.py --json    # 输出机器可读结果
"""

import argparse
import json
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "RELEASE_CHECKLIST.md"

DANGEROUS = (
    "rm ", "rmdir", "del ", "git push", "git reset", "git checkout", "git clean",
    "npm install", "npm i ", "pip install", "mv ", "format", "shutdown",
)


SWITCH = "const DEVELOPMENT_RESET_ENABLED = true;"


def reset_switch_enabled():
    """开发重置开关是否还开着；开着时 --release 审计必然报 1 条 blocker（预期）。"""
    try:
        source = (ROOT / "game.js").read_text(encoding="utf-8")
    except OSError:
        return False
    return SWITCH in source


def commands():
    text = DOC.read_text(encoding="utf-8")
    blocks = re.findall(r"```bash\n(.*?)```", text, re.S)
    items = []
    for block in blocks:
        for raw in block.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("cd "):
                continue
            if not re.match(r"^(py |node |git |npm |pnpm |curl )", line):
                continue
            items.append(line)
    return items


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    items = commands()
    failures, skipped, expected, results = [], [], [], []
    started = time.time()

    for command in items:
        if any(token in command for token in DANGEROUS):
            skipped.append(command)
            print(f"SKIP  {command}")
            continue
        if "--release" in command and not args.dry and reset_switch_enabled():
            skipped.append(command)
            expected.append(command)
            print(f"EXPECTED-FAIL  {command}  (开发开关仍为 true，发布前才关)")
            continue
        if args.dry:
            print(f"DRY   {command}")
            continue
        begun = time.time()
        completed = subprocess.run(
            command, cwd=ROOT, shell=True, capture_output=True, text=True,
            encoding="utf-8", errors="replace",
        )
        elapsed = time.time() - begun
        tail = (completed.stdout or completed.stderr or "").strip().splitlines()
        summary = tail[-1] if tail else ""
        ok = completed.returncode == 0
        results.append({"command": command, "ok": ok, "elapsed": round(elapsed, 2), "output": summary})
        print(f"{'OK  ' if ok else 'FAIL'}  {command}  ({elapsed:.1f}s)")
        if not ok:
            failures.append({"command": command, "output": "\n".join(tail[-8:])})

    elapsed = time.time() - started
    if args.dry:
        print(f"\nchecklist_dry_run={len(items)} skip={len(skipped)}")
        return 0

    print()
    for item in failures:
        print(f"FAILED {item['command']}")
        print(item["output"])
        print()

    if args.json:
        print(json.dumps({"run": len(results), "fail": len(failures), "elapsed": round(elapsed, 1), "results": results}, ensure_ascii=False))

    print(f"checklist_run={len(results)} fail={len(failures)} skip={len(skipped)} expected_fail={len(expected)} elapsed={elapsed:.1f}s")
    if failures:
        print("checklist_failed")
        return 1
    print("checklist_ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
