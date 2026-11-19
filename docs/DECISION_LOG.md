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


## 待用户确认

（当前无待确认项。2026-11-19 用户已就下列两项拍板，见下。）

## 2026-11-19 用户确认（Q1/Q2 结案）

| 编号 | 问题 | 用户决定 | 落地 |
| --- | --- | --- | --- |
| Q1 | 卡牌分解是否弹二次确认框 | **不要**，点了就分解 | `game.js` 的 `doWorkshop()` 去掉 `wx.showModal`，直接调 `api.workshopAction`，成功后 toast「分解「卡名」成功」 |
| Q2 | 非闪版本合成上限 | **9 张** | 服务端 `cloudfunctions/workshop/index.js` 守卫 `normalCount>=2` → `>=9`、文案改「普通卡已达到 9 张上限」；客户端 `craftEnabled` `normal<2` → `normal<9`，工坊按钮同步加 `normalCount<9` 前置条件 |

> 另：用户同时决定**移除战斗金光闪烁**（`battleFlash`），见 `docs/BATTLE_DRAG_UPGRADE_PLAN.md` D24。

## 待办衔接

- 真机验收：按 `docs/P7_DEVICE_ACCEPTANCE_CHECKLIST.md` 的 A–F 共 29 条逐项执行。
- 全通过后刷新证据：`node tools/write_p7_evidence.js` → `node tools/validate_release_readiness.js`。
