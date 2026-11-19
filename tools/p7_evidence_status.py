#!/usr/bin/env python3
"""P7 真机验收进度助手。

读 `docs/P7_DEVICE_ACCEPTANCE_CHECKLIST.md` 末尾的记录表（`[ ]` / `[x]`，也兼容旧的 ☐ / ☑），
再扫描 `design/review/` 下按约定命名的真机截图 `manual-p7-<编号>-<机型>-<日期>.png`，
输出「哪几条还没过、哪几条已经有截图待确认、哪几条连截图都没有」。

它只做进度统计与文件核对，不判断截图内容是否合格——那是人眼的事。

用法：
    py tools/p7_evidence_status.py            # 报告进度，总是退出 0
    py tools/p7_evidence_status.py --strict   # 还有未通过项时退出 1（给发布门禁用）
    py tools/p7_evidence_status.py --selftest # 用临时夹具自检解析逻辑
    py tools/p7_evidence_status.py --check B7 --note "预览模式下连出 5 张牌，无泛光"
    py tools/p7_evidence_status.py --uncheck B7 --note "换机型复测又出现了"
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

from design_root import resolve_design_root

ROOT = Path(__file__).resolve().parents[1]
DESIGN = resolve_design_root(ROOT)
CHECKLIST = ROOT / "docs" / "P7_DEVICE_ACCEPTANCE_CHECKLIST.md"

SECTION_ROW = re.compile(r"^\|\s*([A-F]\d)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*$")
MARK = r"(☐|☑|☒|\[\s*[xX\s]?\s*\])"
RECORD_ROW = re.compile(r"^\|\s*([A-F]\d)\s*\|\s*" + MARK + r"\s*\|\s*([^|]*)\|\s*([^|]*)\|")
SHOT_NAME = re.compile(r"manual-p7-([A-F]\d)", re.I)
SHOT_REF = re.compile(r"manual-p7-[\w.-]+\.png")


def parse_checklist(text: str):
    """把「怎么做 / 应该看到」（分组表）与通过状态（记录表）合并成一条条待办。"""
    how_want = {}
    for line in text.splitlines():
        match = SECTION_ROW.match(line.strip())
        if match and match.group(1) not in how_want:
            how_want[match.group(1)] = (match.group(2).strip(), match.group(3).strip())

    rows = []
    for line in text.splitlines():
        match = RECORD_ROW.match(line.strip())
        if match:
            entry = {
                "id": match.group(1),
                "mark": match.group(2),
                "evidence": match.group(3).strip(),
                "note": match.group(4).strip(),
            }
            entry["how"], entry["want"] = how_want.get(entry["id"], ("", ""))
            rows.append(entry)
    return rows


def scan_screenshots(review: Path):
    found: dict[str, list[str]] = {}
    if not review.is_dir():
        return found
    for path in sorted(review.glob("manual-p7-*.png")):
        match = SHOT_NAME.match(path.name)
        if match:
            found.setdefault(match.group(1).upper(), []).append(path.name)
    return found



def is_passed(mark: str) -> bool:
    """`[x]`、`[ x]`、`[x ]` 都算通过——用户手打勾时经常带空格。"""
    flat = "".join(mark.split())
    return flat in ("☑", "[x]", "[X]")


def set_rows(checklist: Path, ids, passed: bool, note=None, evidence=None) -> int:
    """把指定编号的「通过」列改成通过/未通过，可选改写备注与证据列。"""
    text = checklist.read_text(encoding="utf-8")
    lines = text.split("\n")
    wanted = {item.strip().upper() for item in ids}
    touched = []
    for index, line in enumerate(lines):
        match = RECORD_ROW.match(line.strip())
        if not match or match.group(1).upper() not in wanted:
            continue
        current_id = match.group(1).upper()
        mark = "[x]" if passed else "[ ]"
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        while len(cells) < 4:
            cells.append("")
        cells[1] = mark
        if evidence is not None:
            cells[2] = evidence
        if note is not None:
            cells[3] = note
        lines[index] = "| " + " | ".join(cells[:4]) + " |"
        touched.append(current_id)
    if not touched:
        print(f"p7-evidence-status-failed 记录表里找不到这些编号：{', '.join(sorted(wanted))}")
        return 1
    checklist.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print(f"p7-evidence-status-updated {'passed' if passed else 'pending'}={','.join(sorted(touched))}")
    missing = wanted - set(touched)
    if missing:
        print(f"  未找到（可能不是有效编号）：{', '.join(sorted(missing))}")
    return 0

def report(checklist: Path, review: Path, strict: bool) -> int:
    if not checklist.is_file():
        print(f"p7-evidence-status-failed 找不到 {checklist}")
        return 1

    rows = parse_checklist(checklist.read_text(encoding="utf-8"))
    if not rows:
        print("p7-evidence-status-failed 记录表里没解析到任何 A1..F2 行")
        return 1

    shots = scan_screenshots(review)
    passed = [row for row in rows if is_passed(row["mark"])]
    pending = [row for row in rows if not is_passed(row["mark"])]
    with_shot = [row for row in pending if shots.get(row["id"])]
    without_shot = [row for row in pending if not shots.get(row["id"])]

    dangling = []
    for row in rows:
        for name in SHOT_REF.findall(row["evidence"]):
            if not (review / name).is_file():
                dangling.append(f"{row['id']}:{name}")

    print(f"p7-evidence-status devices={len(rows)} passed={len(passed)} pending={len(pending)} "
          f"pending_with_shot={len(with_shot)} pending_without_shot={len(without_shot)}")
    print(f"  截图目录：{review}")
    print(f"  已通过：{', '.join(row['id'] for row in passed) or '（无）'}")

    if with_shot:
        print("  已有截图待你确认（看过就 --check 并写一句结论）：")
        for row in with_shot:
            print(f"    {row['id']}  {', '.join(shots[row['id']])}")
    if without_shot:
        print("  还没有截图：")
        for row in without_shot:
            hint = row["want"] or row["note"] or row["how"] or "（无备注）"
            print(f"    {row['id']}  {hint}")

    if dangling:
        print("p7-evidence-status-failed 记录表引用的截图不存在：")
        for item in dangling:
            print(f"  {item}")
        return 1

    if strict and pending:
        print(f"p7-evidence-status-incomplete 还有 {len(pending)} 条未通过")
        return 1
    return 0


FIXTURE = """# 测试清单

## A. 分组

| 编号 | 怎么做 | 应该看到 |
| --- | --- | --- |
| A1 | 做一 | 看到一 |
| A2 | 做二 | 看到二 |

## 记录表

| 编号 | 通过 | 现象 / 截图 | 备注 |
| --- | --- | --- | --- |
| A1 | [x] | 正常 | |
| A2 | [ ] | | |
"""


def selftest() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        review = base / "review"
        review.mkdir()
        checklist = base / "checklist.md"
        checklist.write_text(FIXTURE, encoding="utf-8")

        code = report(checklist, review, strict=False)
        assert code == 0, f"无截图时不应失败，实际 {code}"

        (review / "manual-p7-A2-375x812-20261119.png").write_bytes(b"png")
        print("-- 补一张 A2 截图后 --")
        code = report(checklist, review, strict=False)
        assert code == 0, f"有截图时不应失败，实际 {code}"

        (review / "manual-p7-A2-375x812-20261119.png").unlink()
        checklist.write_text(FIXTURE.replace("| A2 | [ ] | | |", "| A2 | [ ] | manual-p7-A2-gone.png | |"), encoding="utf-8")
        code = report(checklist, review, strict=False)
        assert code == 1, f"引用不存在的截图应返回 1，实际 {code}"

        checklist.write_text(FIXTURE, encoding="utf-8")
        code = report(checklist, review, strict=True)
        assert code == 1, f"--strict 有未通过项应返回 1，实际 {code}"

        checklist.write_text(FIXTURE.replace("| A2 | [ ] | | |", "| A2 | [x] | 正常 | |"), encoding="utf-8")
        code = report(checklist, review, strict=True)
        assert code == 0, f"全部通过时 --strict 应返回 0，实际 {code}"

        # --check / --uncheck 往返
        checklist.write_text(FIXTURE, encoding="utf-8")
        code = set_rows(checklist, ["A2"], True, note="自检勾选")
        assert code == 0, f"--check 应返回 0，实际 {code}"
        text_after = checklist.read_text(encoding="utf-8")
        assert "| A2 | [x] |" in text_after and "自检勾选 |" in text_after, "勾选后记录表没更新"
        code = set_rows(checklist, ["A2"], False, note="自检撤销")
        assert code == 0, f"--uncheck 应返回 0，实际 {code}"
        text_after = checklist.read_text(encoding="utf-8")
        assert "| A2 | [ ] |" in text_after and "自检撤销 |" in text_after, "撤销后记录表没还原"

    print("p7-evidence-status-selftest-ok cases=5")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="P7 真机验收进度")
    parser.add_argument("--strict", action="store_true", help="有未通过项时退出 1")
    parser.add_argument("--selftest", action="store_true", help="用临时夹具自检")
    parser.add_argument("--checklist", default=str(CHECKLIST), help="清单路径（默认仓库内文档）")
    parser.add_argument("--review", default=str(DESIGN / "review"), help="截图目录")
    parser.add_argument("--check", help="把编号标成通过，逗号分隔，如 B7 或 B1,B7")
    parser.add_argument("--uncheck", help="把编号标回未通过，逗号分隔")
    parser.add_argument("--note", help="同时写入备注列")
    parser.add_argument("--evidence", help="同时写入现象/截图列")
    args = parser.parse_args()

    if args.selftest:
        return selftest()
    if args.check or args.uncheck:
        ids = (args.check or args.uncheck).split(",")
        return set_rows(Path(args.checklist), ids, bool(args.check), args.note, args.evidence)
    return report(Path(args.checklist), Path(args.review), args.strict)


if __name__ == "__main__":
    sys.exit(main())
