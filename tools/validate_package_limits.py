#!/usr/bin/env python3
"""微信小游戏代码包体积校验（平台硬限制）。

平台规则（官方文档 https://developers.weixin.qq.com/minigame/dev/guide/base-ability/code-package.html）：
  - 主包不超过 4 MB
  - 主包 + 所有分包不超过 30 MB

本脚本按真实打包口径计算，而不是简单累加目录：
  - 跳过 `subpackages/` 下的所有分包（它们单独计数）
  - 跳过 `cloudfunctions/`（云函数经开发者工具单独上传，不进代码包）
  - 跳过 `project.config.json` 的 `packOptions.ignore` 里列出的目录与文件
  - 跳过仓库元数据（`.git`、`node_modules`）

用法：py tools/validate_package_limits.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN_LIMIT = 4 * 1024 * 1024
TOTAL_LIMIT = 30 * 1024 * 1024
WARN_RATIO = 0.9

ALWAYS_SKIP_DIRS = {".git", "node_modules"}
SKIP_DIRS = {"subpackages", "cloudfunctions"} | ALWAYS_SKIP_DIRS


def collect_ignores(config):
    ignores = config.get("packOptions", {}).get("ignore", []) or []
    folders, files = set(), set()
    for item in ignores:
        value = str(item.get("value", "")).strip("/")
        if not value:
            continue
        if item.get("type") == "folder":
            folders.add(value)
        elif item.get("type") == "file":
            files.add(value)
    return folders, files


def is_ignored(relative, folders, files):
    if relative.as_posix() in files:
        return True
    return any(relative.as_posix() == folder or relative.as_posix().startswith(folder + "/") for folder in folders)


def walk():
    folders, files = set(), set()
    config_path = ROOT / "project.config.json"
    if config_path.is_file():
        try:
            folders, files = collect_ignores(json.loads(config_path.read_text(encoding="utf-8")))
        except json.JSONDecodeError as error:
            print(f"package-limits-failed: project.config.json 不是合法 JSON（{error}）")
            raise SystemExit(1)

    main_bytes, total_bytes, subpackage_bytes = 0, 0, {}
    biggest = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        parts = relative.parts
        if any(part in ALWAYS_SKIP_DIRS for part in parts):
            continue
        size = path.stat().st_size
        if parts[0] == "subpackages":
            group = parts[1] if len(parts) > 1 else "subpackages"
            subpackage_bytes[group] = subpackage_bytes.get(group, 0) + size
            total_bytes += size
            continue
        if parts[0] in SKIP_DIRS:
            continue
        if is_ignored(relative, folders, files):
            continue
        main_bytes += size
        total_bytes += size
        biggest.append((size, relative.as_posix()))

    return main_bytes, total_bytes, subpackage_bytes, sorted(biggest, reverse=True)[:5], folders, files


def megabytes(value):
    return value / (1024 * 1024)


def main():
    main_bytes, total_bytes, subpackage_bytes, biggest, folders, files = walk()
    failures = []
    if main_bytes > MAIN_LIMIT:
        failures.append(f"主包 {megabytes(main_bytes):.2f} MB 超过 4 MB 上限")
    if total_bytes > TOTAL_LIMIT:
        failures.append(f"主包+分包合计 {megabytes(total_bytes):.2f} MB 超过 30 MB 上限")
    skip_note = ""
    ignored = sorted(folders) + sorted(files)
    if ignored:
        skip_note = "（已按 packOptions.ignore 排除：" + "、".join(ignored) + "）"

    if failures:
        print("package-limits-failed")
        for failure in failures:
            print(f"- {failure}")
        return 1

    ratio = main_bytes / MAIN_LIMIT
    print(f"package-limits-ok main={main_bytes} ({megabytes(main_bytes):.2f}/{megabytes(MAIN_LIMIT):.0f} MB, {ratio:.0%}) "
          f"total={total_bytes} ({megabytes(total_bytes):.2f}/{megabytes(TOTAL_LIMIT):.0f} MB){skip_note}")
    for name, size in sorted(subpackage_bytes.items(), key=lambda item: -item[1]):
        print(f"  subpackage {name}: {megabytes(size):.2f} MB")
    print("  主包最大文件：")
    for size, relative in biggest:
        print(f"    {megabytes(size):.2f} MB  {relative}")
    if ratio > WARN_RATIO:
        print(f"package-limits-warn: 主包已用 {ratio:.0%}，接近 4 MB 上限")
    return 0


if __name__ == "__main__":
    sys.exit(main())
