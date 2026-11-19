#!/usr/bin/env python3
"""文档一致性校验：文档里引用的脚本必须存在、卡牌数量口径必须与代码一致、文档不能变成孤儿。

跑法：py tools/validate_docs_consistency.py
可当门禁用：有任一问题退出码为 1。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
TOOLS = ROOT / "tools"
# 工作区级的 AGENTS.md 在仓库外一层（仓库内可能没有）
AGENTS = [candidate for candidate in (ROOT / "AGENTS.md", ROOT.parent / "AGENTS.md") if candidate.exists()]

FAILURES: list[str] = []
NOTES: list[str] = []


def fail(message: str) -> None:
    FAILURES.append(message)


def tool_names_from(text: str) -> set[str]:
    """抓文档里出现的 tools 脚本名（含 `tools/xxx.py` 与裸文件名）。"""
    names: set[str] = set()
    for match in re.finditer(r"tools/([A-Za-z0-9_]+\.(?:py|js|ps1|md))", text):
        names.add(match.group(1))
    return names


def check_tool_references() -> int:
    """1. 文档里引用的每个 tools/ 脚本都必须真实存在。"""
    checked = 0
    for path in sorted(DOCS.glob("*.md")) + [ROOT / "README.md"] + AGENTS:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for name in sorted(tool_names_from(text)):
            checked += 1
            if not (TOOLS / name).exists() and not (DOCS / name).exists():
                fail(f"{path.name}: 引用了不存在的脚本 tools/{name}")
    return checked


def load_card_counts() -> tuple[int, int, int]:
    """卡牌数量以数据测试的输出为准（唯一口径，避免文档再和代码对不上）。"""
    import subprocess

    try:
        output = subprocess.run(
            ["node", "tools/test_card_designs.js"],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=120,
        ).stdout
    except (OSError, subprocess.SubprocessError) as error:  # pragma: no cover
        fail(f"无法运行 tools/test_card_designs.js：{error}")
        return (0, 0, 0)
    match = re.search(r"(\d+) cards", output)
    if not match:
        fail("tools/test_card_designs.js 输出里没有卡牌总数")
        return (0, 0, 0)
    total = int(match.group(1))
    # 基础包/星骸遗响的数量直接数分包里的运行时图片
    base = len(list((ROOT / "subpackages" / "card-art-base" / "images").glob("*.jpg")))
    remnant = len(list((ROOT / "subpackages" / "card-art-star-remnant" / "images").glob("*.jpg")))
    if not base or not remnant:
        fail("分包图片数量为 0，无法核对基础包/星骸遗响口径")
    return (total, base, remnant)


def check_card_counts() -> None:
    total, base, remnant = load_card_counts()
    if not total:
        return
    # README 的包体口径表里必须写对总数
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    if f"（{total} 张）" not in readme and f"{total} 张卡牌" not in readme:
        fail(f"README.md 没有出现当前卡牌总数 {total}")
    # CARD_ART_INTEGRATION 的接入进度必须是 当前总数/当前总数
    integration = (DOCS / "CARD_ART_INTEGRATION.md").read_text(encoding="utf-8")
    if f"{total}/{total}" not in integration:
        fail(f"docs/CARD_ART_INTEGRATION.md 没有出现 {total}/{total} 的立绘接入进度")
    if f"{base} 张立绘" not in integration:
        fail(f"docs/CARD_ART_INTEGRATION.md 没有出现基础包 {base} 张")
    NOTES.append(f"卡牌口径 total={total} base={base} star-remnant={remnant}")


def check_orphan_docs() -> None:
    """3. 每份文档都要能从 README 或另一份文档点进去，避免「写了没人看」。"""
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    linked: set[str] = set()
    for path in DOCS.glob("*.md"):
        linked.add(path.name)
    for path in DOCS.glob("*.md"):
        if path.name in readme:
            continue
        referenced_elsewhere = any(
            path.name in other.read_text(encoding="utf-8")
            for other in list(DOCS.glob("*.md")) + AGENTS
            if other != path
        )
        if not referenced_elsewhere:
            fail(f"docs/{path.name} 没有被 README 或任何其它文档引用（孤儿文档）")
    NOTES.append(f"文档共 {len(linked)} 份")


def check_history_markers() -> None:
    """4. 明确标注为历史/过时的章节不能还被当成当前事实使用。

    规则很窄，只查两种会被误读的句式：`当前共 72 张`、`现在有 52 张`。
    """
    total, _, _ = load_card_counts()
    pattern = re.compile(r"(当前|现在|目前)[^。\n]{0,6}?(\d{2})\s*张")
    for path in sorted(DOCS.glob("*.md")):
        for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            for match in pattern.finditer(line):
                value = int(match.group(2))
                if value in (72, 52) and value != total:
                    fail(f"docs/{path.name}:{line_no} 仍把 {value} 张写成当前口径：{line.strip()[:60]}")


def main() -> int:
    checked = check_tool_references()
    check_card_counts()
    check_orphan_docs()
    check_history_markers()

    if FAILURES:
        print("docs-consistency-failed")
        for item in FAILURES:
            print(f"  - {item}")
        return 1

    for note in NOTES:
        print(f"  {note}")
    print(f"docs-consistency-ok tools-referenced={checked}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
