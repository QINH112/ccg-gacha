"""校验覆盖层（遮罩）规范是否被遵守。

规则来源：docs/UI_OVERLAY_RULES.md
- 战斗内卡牌详情不得绘制全屏遮罩，只能用面板承托。
- battleAction() 提交云端操作前必须清除覆盖层状态。
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "game.js"
DOC = ROOT / "docs" / "UI_OVERLAY_RULES.md"

failures: list[str] = []

source = GAME.read_text(encoding="utf-8")


def function_body(name: str) -> str:
    start = source.find(f"function {name}(")
    if start < 0:
        raise SystemExit(f"ui-overlay-rule-failed: function {name} not found")
    depth = 0
    index = source.find("{", start)
    begin = index
    while index < len(source):
        char = source[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[begin:index + 1]
        index += 1
    raise SystemExit(f"ui-overlay-rule-failed: unbalanced braces in {name}")


detail = function_body("renderCardDetail")
if 'state.screen==="battle"' not in detail:
    failures.append("renderCardDetail 缺少战斗内特殊分支（不得对战斗画面绘制全屏遮罩）")
unconditional = re.search(r'ctx\.fillStyle=[^;]*;ctx\.fillRect\(0,0,W,H\);', detail)
if unconditional and 'state.screen==="battle"' not in detail[:unconditional.start()]:
    failures.append("renderCardDetail 在战斗分支之前就绘制了全屏遮罩")
switch_block = source[source.find("function switchScreen"):source.find("function switchScreen")+400]
if "resetOverlays()" not in switch_block:
    failures.append("switchScreen 未调用 resetOverlays()，切屏会残留覆盖层")
if "function resetOverlays(" not in source:
    failures.append("缺少 resetOverlays() 统一清理入口")


if "box(6," in detail:
    failures.append("renderCardDetail 战斗中不应给卡牌加面板/边框（2026-11-19 用户要求去掉矩形框）")
if 'holdLabel("松手关闭"' not in detail:
    failures.append("战斗内详情必须用 holdLabel 绘制文字（无面板承托时靠描边保证可读）")

action = function_body("battleAction")
for flag in ("showCardDetail", "detailHold", "battleSkillDetail"):
    if flag not in action.split("\n")[0]:
        failures.append(f"battleAction 首行未清除覆盖层状态 {flag}")

# 规则：任何全屏 fillRect 要么是背景绘制（bg / serviceBg / drawBattleBackground），
# 要么必须在 200 字符内先登记 traceOverlay(name)，否则遮罩会脱离追踪清单。
BACKGROUND_FUNCS = {"bg", "serviceBg", "drawBattleBackground"}
for match in re.finditer(r"fillRect\(0,(?:0|top),W,(?:H|H-top)\)", source):
    index = match.start()
    window = source[max(0, index - 220):index]
    if "traceOverlay(" in window:
        continue
    enclosing = None
    for name in re.finditer(r"function ([A-Za-z0-9_]+)\(", source[:index]):
        body_start = source.find("{", name.end())
        if body_start < 0:
            continue
        depth = 0
        cursor = body_start
        end = None
        while cursor < len(source):
            if source[cursor] == "{":
                depth += 1
            elif source[cursor] == "}":
                depth -= 1
                if depth == 0:
                    end = cursor
                    break
            cursor += 1
        if end is not None and body_start < index < end:
            enclosing = name.group(1)
    if enclosing in BACKGROUND_FUNCS:
        continue
    line = source.count("\n", 0, index) + 1
    failures.append(f"game.js:{line} 全屏 fillRect 既未登记 traceOverlay 也不在背景函数中（enclosing={enclosing}）")

# 战斗页禁止闪光蒙层（用户已明确不要该效果）
if "#e8d77a22" in source or "battleFlash" in source:
    failures.append("战斗页闪光蒙层已按用户要求移除，代码中不应再出现 battleFlash / #e8d77a22")

if not DOC.exists():
    failures.append("docs/UI_OVERLAY_RULES.md 缺失")
else:
    text = DOC.read_text(encoding="utf-8")
    for needle in ("renderCardDetail", "战斗界面", "battleAction"):
        if needle not in text:
            failures.append(f"docs/UI_OVERLAY_RULES.md 缺少条目：{needle}")

if failures:
    for item in failures:
        print(f"- {item}")
    print(f"ui-overlay-rules-failed failures={len(failures)}")
    sys.exit(1)

print("ui-overlay-rules-ok detail=battle-panel battleAction=clears")
