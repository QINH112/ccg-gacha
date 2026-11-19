# 覆盖层（遮罩）规范

> 本文件是覆盖层行为的唯一约定来源，每次新增/修改全屏覆盖层都必须同步更新这里。

## 1. 核心规则

- **战斗界面（`state.screen === "battle"`）禁止绘制全屏半透明遮罩。** 战斗是连续操作场景，任何把战场整体压暗的遮罩都会被用户视为故障（真机反馈 2026-11-19：出牌/攻击后出现整屏变暗，用户明确要求「不希望出现这个遮罩」）。
- 战斗中的临时信息一律走**局部**组件：战场内联提示（`state.battleNotice` + `battleNoticeUntil`，2.6 秒自动消失）、右侧墓地面板（`renderBattleGraveyard`）、目标高亮边框，而不是全屏蒙层。
- 非战斗界面（首页、图鉴、抽取结果、结算、卡牌详情）可以使用全屏遮罩，但必须同时提供明确的关闭入口（点卡牌外关闭 / × 按钮），且不能在战斗中被复用到战场上。

## 2. 当前全屏覆盖层清单

| 覆盖层 | 代码位置 | 是否允许在战斗中出现 | 关闭方式 |
| --- | --- | --- | --- |
| 卡牌详情 `renderCardDetail` | `game.js` 中 `renderCardDetail()` | **否**（战斗中改为面板 + 无遮罩） | 点击卡牌外 / 松手 / 任意出牌动作 |
| 技能长按详情 `battleSkillDetail` | `game.js` 渲染末尾 | 是，但只在长按技能按钮期间 | 抬手立即清除 |
| 云端处理中 `loading` | 渲染末尾 | **否**（已按 `state.screen !== "battle"` 排除） | 请求结束 |
| 抽卡/签到结果 `showResults` / `showSign` | 渲染末尾 | 否 | 确认按钮 |
| 对局结算 | `renderBattle` 内 `game.status === "finished"` | 是（战斗已结束） | 返回首页 |

## 3. 实现约束

- 战斗内展示卡牌详情时使用 `box(6, y-4, W-12, height+12, ...)` 面板承托，不叠加 `fillRect(0,0,W,H)`。
- `battleAction()` 提交任何云端操作前必须清除 `showCardDetail` / `detailHold` / `battleSkillDetail`，避免覆盖层残留到下一次渲染。
- 新增覆盖层时，先在本文档登记，再写代码；登记项必须写清「是否允许在战斗中出现」。


## 3.1 覆盖层追踪（排查用）

`game.js` 里的 `traceOverlay(name)` 会在每个全屏覆盖层**首次绘制**时打印一行：

```
[overlay] card-detail screen=battle
```

覆盖的 name：`card-detail`、`battle-finished`、`results`、`collection-filters`、`battle-skill-detail`、`loading`、`sign`。

- 排查「战斗里忽然变暗」时，在开发者工具/真机调试的控制台搜 `[overlay]`，看是否出现、以及 `screen=` 是什么。
- 战斗中出现除 `battle-finished` / `battle-skill-detail` 之外的任何一条，都是违规，要修。
- 该追踪只在每个进程内每层打印一次，不影响性能，可以长期保留。

> **2026-11-19 更新**：`battleFlash` 动作闪光层已按用户要求**整体移除**（D24）。原 §3.2 的教训仍然有效，适用于任何未来新增的限时蒙层。

## 3.2 瞬时覆盖层必须自动过期

任何「只显示很短时间」的全屏蒙层（闪光、提示闪烁等）都必须同时安排一次**过期重绘**，否则最后一帧的蒙层会永久留在画布上——画布不会自己重画。

- 反面案例：`battleFlash` 原先只在 280ms 窗口内绘制，动画结束帧落进窗口后没有任何定时器再 `render()`，13% 的浅黄蒙版就常驻在战场上（2026-11-19 真机现象）。
- 正确做法：绘制时调用统一的过期调度器 `scheduleBattleFlashExpiry()`，用独立标志位（`battleFlashClearTimer`）防止重复挂载；
- **必须接力**：定时器触发时若仍在显示窗口内（说明期间又触发了一次闪光），要重新排一次而不是直接放弃，否则旧定时器会让新一轮闪光失去过期机会；
- 证据图：`D:\kaifa\design\review\mask-diag-normal.png`（正常）与 `mask-diag-veiled.png`（残留蒙层，整片战场亮度比 1.10–1.18×）。
- 同类第三例（已修）：`detectGraveyardChange()` 给最新落墓的卡行设置 `flashUntil=Date.now()+700` 高亮，但没有任何定时重绘，高亮会一直亮着；已补 `setTimeout(...,740)` 并在面板已关闭时跳过。

## 3.3 切屏必须清空所有覆盖层

`switchScreen()` 统一调用 `resetOverlays()`，清空：`showCardDetail`、`detailCard`、`detailHold`、`detailRect`、`battleSkillDetail`、`battleNotice`/`battleNoticeUntil`、`battleGraveyard.open`、`battleFlash`。

原因：这些状态原来是「按屏渲染」的，只有在对应屏才被消费；一旦用户在覆盖层打开状态下切屏，覆盖层会跟着画到新屏上，表现为「怎么点都在遮一层」。`tools/validate_ui_overlay_rules.py` 会断言 `switchScreen` 里必须出现 `resetOverlays()`。

## 3.4 全屏 fillRect 必须可追踪

`game.js` 里任何覆盖整屏的 `fillRect(0,0,W,H)` / `fillRect(0,top,W,H-top)` 只有两种合法身份：

1. 背景绘制，且位于 `bg()`、`serviceBg()`、`drawBattleBackground()` 之内；
2. 覆盖层，且在同一行/前 220 字符内先调用了 `traceOverlay(name)`。

否则 `tools/validate_ui_overlay_rules.py` 直接失败（会打印行号与所属函数）。这条规则是 2026-11-19 `battleFlash` 残留事故的固化产物：当时那层 13% 的蒙版既没登记追踪，也没有过期机制，真机上就永久留在画面上。

### 3.5 战斗内卡牌详情不加任何承托框

战斗内长按手牌/场上随从时，只在卡牌自身模板上绘制，**不再画面板、边框或全屏蒙层**（2026-11-19 用户实测反馈：卡牌外有一层矩形框，不希望看到）。

- 文字说明（稀有度行、背景描述、松手关闭）改用 `holdLabel()`：同位置先画 1px 偏移的深色描边再画正文，保证在战场背景上仍然可读。
- 禁止项：`renderCardDetail` 的战斗分支里出现 `box(6, ...)` 或 `ctx.fillRect(0,0,W,H)` 压暗战场。
- 校验：`tools/validate_ui_overlay_rules.py` 静态断言 + `tools/smoke_game_interactions.js` 在长按松手前抓一帧填充色，断言既没有 `#0b1226ee` 面板也没有 `#02040ca8/#02040ce8` 蒙层。

## 4. 变更记录

- 2026-11-19：战斗内卡牌详情改为面板式、取消全屏遮罩；`battleAction()` 提交前清除所有覆盖层状态。真机反馈见 `docs/BATTLE_DRAG_UPGRADE_PLAN.md` §13 D18。
