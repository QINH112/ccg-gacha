# 决策纪要（Decision Log）

> 记录用户拍板过的产品/流程决策，避免同一问题反复讨论。新决策追加在末尾，注明日期与影响文档。

## 2026-11-19

| # | 议题 | 决策 | 影响 |
| --- | --- | --- | --- |
| 1 | 卡牌稀有度 / 名称 / 卡包归属是否允许调整（`CARD_DESIGN_PLAN.md` §9 第 3 条） | **默认不调整**：只改数值与规则文本，ID / 名称 / 稀有度 / 卡包归属锁定；确需调整必须单独立项并同步 `design/card-art/art-config.json` | `CARD_DESIGN_PLAN.md` §9 |
| 2 | 关键词规则基线（§9 第 1 条） | **沿用 v0.2 候选稿**，不再重议 | `CARD_DESIGN_PLAN.md` §9 |
| 3 | 星骸遗响核心机制（§9 第 4 条） | **沿用 A+B 混合**（亡语残响为主 + 残骸防线为辅），不再重议 | `CARD_DESIGN_PLAN.md` §9 |
| 4 | 「自动化授权未完成」这类过时说法 | **保留原文，就地加实测批注**，不删历史记录 | `VISUAL_ACCEPTANCE_CHECKLIST.md`、`P4_AUDIT.md` |
| 5 | 包体体积口径不一 | **以工具输出为唯一口径**，README 新增权威表；其它数字视作历史 | `README.md` |
| 6 | 三个旧冒烟测试坐标失效 | **按新入口坐标修好**（已删 `卡牌工坊` 路由并加注释，`smoke_device_matrix.js` 已通过） | `tools/smoke_device_matrix.js` |
| 7 | 1000 局平衡模拟 | **不做**，改为后续依据真实玩家数据调整 | `CARD_DESIGN_PLAN.md` |
| 8 | `DEVELOPMENT_RESET_ENABLED` 上线开关 | **开发期保持 `true`**，上线前由我提醒并改为 `false`，发布审计保留该 blocker | `P7_MANUAL_ACCEPTANCE_RUNBOOK.md` |
| 9 | 三张素材瑕疵（c008 / r008 / s007） | **继续放着**，不阻塞验收；用户主动要求时再修 | `CARD_ART_INTEGRATION.md` |
| 10 | 模拟器截图证据 | **不再补录**，P7 只认真机证据 | `P7_DEVICE_ACCEPTANCE_CHECKLIST.md` |

| 11 | 遮罩仍在真机复现 | **先加控制台追踪定位**（`[overlay] <name> screen=<screen>`），不靠猜 | `game.js` `traceOverlay()`、`docs/UI_OVERLAY_RULES.md` §3.1 |


## 2026-11-19 用户确认（抽卡与结果页）

| # | 决策 | 结论 | 落地 |
| --- | --- | --- | --- |
| Q5 | 抽卡是否可能出闪卡 | **每张卡独立 3% 判定**（`gameConfig.shinyRate=3`）。40 抽保底与十连保底的那张也按 3% 判定，保底只保证稀有度 | `cloudfunctions/drawCards/index.js` 的 `addCard(player,card,shiny)`；闪卡计入 `shinyCount` 与 `collectionHistory.shinyIds`，并累加 `metrics.shinyGained` |
| Q6 | 单抽结果页的矩形外框 | **去掉**，只显示卡面本身（与战斗卡同因：`miniCard` 没传 `transparentOuter`） | `game.js` 的 `renderResults()` |
| Q7 | 五连 / 十连的符号缩略图 | **改成 3 列网格完整卡面**（每张约 104–110px 宽）。原因是 `drawCardTemplate` 在 `w<82` 时走 compact 分支只画符号，五列并排每张仅 ~60px | `game.js` 新增 `resultsLayout(count)`，导出给 `tools/test_draw_results_layout.js` 断言卡宽 ≥ 82 |
| Q8 | 闪卡的视觉区分 | 用现成的**彩虹卡框 + 「闪」角标**，不加任何闪光/蒙层动画（沿用 D24 的教训） | `drawCardTemplate` 已有 `card.shiny` 分支；结果页补 `闪` 角标 |

## 2026-11-19 用户确认（对局金币奖励）

| # | 决策 | 结论 | 落地 |
| --- | --- | --- | --- |
| Q9 | 胜利奖励 | **随机 80–120 金币**（每次独立随机取整） | `cloudfunctions/battleGame/index.js` 的 `BATTLE_REWARD.win` |
| Q10 | 失败奖励 | **随机 20–40 金币**；双方同时死亡（平局）按失败档发 | `BATTLE_REWARD.loss`；`grantBattleReward` 里 `tier` 区分 win/draw/loss |
| Q11 | 认输 / 超时 / 中途退出 | 也按失败档发，但**对局时长必须超过 30 秒**（`duration <= 30000` 不发，`reason:"duration"`） | `BATTLE_REWARD.minDurationMs` |
| Q12 | 每日上限 | 战斗金币**每日最多 2000**，超出部分截断（`reason:"cap"`），计数在 `metrics.daily.values.battleCoin` | `BATTLE_REWARD.dailyCap` |
| Q13 | 结算界面 | 显示本局收益「+N 金币」；不满足条件时显示「对局不足 30 秒，无金币」/「今日战斗金币已达上限」 | `game.js` 的 `renderBattle()` 结算面板 |
| Q14 | 金币用途 | 不变：商店 100 金币 = 1 张抽卡券 | 无需改动 |

`grantBattleReward` 在 `logFinished()` 里只调用一次（`battleLogs` 首插成功才发奖），所以不会重复发；奖励对象写回 `game.reward`，客户端从 `battleStatus` 拿到后渲染。

## 待用户确认

（当前无待确认项。2026-11-19 用户已就下列两项拍板，见下。）

## 2026-11-19 用户确认（Q1/Q2 结案）

| 编号 | 问题 | 用户决定 | 落地 |
| --- | --- | --- | --- |
| Q1 | 卡牌分解是否弹二次确认框 | **不要**，点了就分解 | `game.js` 的 `doWorkshop()` 去掉 `wx.showModal`，直接调 `api.workshopAction`，成功后 toast「分解「卡名」成功」 |
| Q2 | 非闪版本合成上限 | **9 张** | 服务端 `cloudfunctions/workshop/index.js` 守卫 `normalCount>=2` → `>=9`、文案改「普通卡已达到 9 张上限」；客户端 `craftEnabled` `normal<2` → `normal<9`，工坊按钮同步加 `normalCount<9` 前置条件 |

> 另：用户同时决定**移除战斗金光闪烁**（`battleFlash`），见 `docs/BATTLE_DRAG_UPGRADE_PLAN.md` D24。

## 2026-11-19 用户确认（Q3 与素材裁边结案）

| 编号 | 问题 | 用户决定 | 落地 |
| --- | --- | --- | --- |
| Q3 | 闪卡是否要有「稀有度上限」 | **不设上限**。闪卡张数不受限制，只要凑满 3 张同名普通卡就能合成一张闪卡，之后可以继续攒 | 代码**保持现状**（客户端 `shinyEnabled = normal>=3`、服务端只校验 3 张普通卡、`gameConfig` 不新增 `shinyLimit`）；`CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md` §7.3 那 3 条按「无上限」改写为已确认，不再作为待验收项 |
| — | 3 张母版白边（`c008` / `r008` / `s008`）与临界项 `c025` 要不要裁 | **不要管**，保持现状 | 裁边候选留在 `design/generated/edge-trimmed/` 备查，不替换 `design/card-art/source/` 里的原始母版，不重建分包；`check_card_art_edges.py` 仍可随时复查 |

## 待用户确认

| 编号 | 问题 | 现状 | 影响 |
| --- | --- | --- | --- |
| Q4 | 不合法牌组（超量/未满 20 张）保存时，应该「拒绝保存」还是「允许保存但不可开战」？ | 实现是**允许保存**（`deckService.save` 返回 `valid:false` + `errors`，客户端 toast「已保存未完成牌组」）；验收文档原文写的是「拒绝保存」 | `CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md` §7.4；`tools/test_deck_save.js` 按现状钉死 |

## 待办衔接

- 真机验收：按 `docs/P7_DEVICE_ACCEPTANCE_CHECKLIST.md` 的 A–F 共 29 条逐项执行；**2026-11-19 已全部通过**（`devices=29 passed=29 pending=0`，`py tools/p7_evidence_status.py`）。后续客户端改动需重测相关条目。
- 全通过后刷新证据：`node tools/write_p7_evidence.js` → `node tools/validate_release_readiness.js`。

## 验收清单结清进度（2026-11-19）

| 清单 | 起始未勾 | 现在未勾 | 说明 |
| --- | --- | --- | --- |
| `CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md` §7 | 35 | **0** | 28 条转成自动化断言，3 条按「闪卡不设上限」标不适用，其余合并入口等已由结构变更消除 |
| `CARD_DESIGN_PLAN.md` §5 | 20 | **7** | 13 条映射到 `test_card_designs` / `test_card_data_integrity` / `test_battle_engine` / `test_ai_behavior` 等；剩 7 条是人工平衡审查与逐卡确认 |
| `CARD_BALANCE_ANNOUNCEMENT_PLAN.md` | 2 | **0** | 胶囊避让与前后对比准确性两条转成 `smoke_home_capsule.js`、`test_balance_notice_accuracy.js` |
| `P7_DEVICE_ACCEPTANCE_CHECKLIST.md` | 28 | 27 | 只能真机，B7 已过 |
| `RELEASE_CHECKLIST.md` | 45 | 45 | 发版时逐条过，不预先勾选 |

