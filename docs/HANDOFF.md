# 交接与当前状态（2026-11-19）

> 这份文件回答一个问题：**现在停在哪、下一步该谁动手**。细节分别在 `docs/DECISION_LOG.md`、`docs/BATTLE_DRAG_UPGRADE_PLAN.md` §13、`docs/UI_OVERLAY_RULES.md`。

## 一、已完成并验证（本地）

| 问题 | 根因 | 修复位置 |
| --- | --- | --- |
| 换牌后弹「起手换牌阶段已结束」 | 确认按钮可连点，第二次请求到达时 phase 已变 | `game.js` 按钮加 `!state.battlePending` 防重；服务端 `mulliganAction()` 幂等 |
| 攻击敌方英雄报「攻击目标无效」 | 客户端英雄目标 `id:"ai"` 与服务端 `id:"hero"` 不匹配 | 服务端英雄只校验 `type`，客户端下发 `targetId="hero"` |
| 敌方随从进墓地后显示「墓 0」 | 请求失败时回滚到 `battleConfirmed` 快照，把刚落墓的记录抹掉 | 失败改为 `resyncBattle()` 重新拉取；引擎测试双向断言 |
| 战斗内整屏「遮罩」 | `battleFlash` 的 13% 浅色闪光层只在 280ms 窗口内绘制，最后一帧落进窗口后没有定时重绘，蒙版永久残留 | 先加接力式过期重绘（D20/D22），用户复测确认消失后**按用户要求整体移除该效果**（D24） |
| 墓地高亮不褪 | 同上：`flashUntil` 没有定时重绘 | `detectGraveyardChange()` 补 740ms 重绘（D23） |
| 错误提示占据大量屏幕 | 三处 `wx.showModal` 全屏弹窗 | 战斗内改为 `battleNotice` 内联提示，2.6s 自动消失 |

防护：`tools/validate_ui_overlay_rules.py` 静态校验（全屏填充必须可追踪 / 调度器必须接力 / 限时高亮必须挂定时器 / 切屏必须 `resetOverlays()`）；`tools/smoke_game_interactions.js` 运行时断言（连闪两次必须清除）。

## 二、等你动手的事（2026-11-19 最新）

1. **真机验收：已完成 29/29**。2026-11-19 用户在 vivo x200s 上逐条点过（`py tools/p7_evidence_status.py` → `devices=29 passed=29 pending=0`），包括 B8「手牌与场上卡外围无底板边框」。之后任何客户端改动都要挑相关条目重测。
2. **Q4：不合法牌组要不要硬拒绝保存？** 文档 §7.4 写「不合法则拒绝保存」，实际实现是「允许保存但标 `valid:false`、不可开战」，客户端提示「已保存未完成牌组」。这是可用性选择，需要你拍板。见 `docs/DECISION_LOG.md`。
3. **卡牌平衡 7 条**：`docs/CARD_DESIGN_PLAN.md` §5 仍留 7 条 `[ ]`，都是「每张卡的人工审查」「同费用卡优劣关系」「斩杀上限审查」这类需要人判断的项，代码只能提供数据。
4. **图鉴还显示 72 张≠代码 74 张**：`cloudfunctions/initGameData/index.js` 里已有 74 张（`e009` 沉默之墙、`l004` 万籁归寂），但云端 `cards` 集合还是旧的 72 条。在微信开发者工具里对 `initGameData` 做一次「云端测试」（参数 `{}`，默认安全模式不会动玩家存档），它会同步全部 74 张卡；随后重新编译，图鉴即显示 `已收集 X / 74 种`。
5. **发版前**：把 `game.js:32` 的 `DEVELOPMENT_RESET_ENABLED` 改 false，再跑 `node tools/validate_release_readiness.js --release`（当前会提示这一条）。步骤见 `docs/RELEASE_CHECKLIST.md`。

已结案、不用再管的：Q1（分解不二次确认）、Q2（非闪上限 9 张）、Q3（闪卡不设上限）、素材白边（不处理）、首次提交（已完成）、云函数上传与预览（用户已解决）。

## 二·补、本轮补上的自动化（2026-11-19）

| 检查 | 挡什么问题 |
| --- | --- |
| `tools/test_card_data_integrity.js` | 卡牌关键词与 `rulesText` 不一致、效果用错引擎词汇 |
| `tools/test_shared_constants.js` | 同名上限/牌组张数/战斗常量在四处各写一遍，改一处漏一处 |
| `tools/test_draw_pity.js` | 第 40 抽保底、十连保底、抽卡失败分支 |
| `tools/test_signin_cycle.js` | 7 天签到循环、每日一次、循环结束后转每日奖励 |
| `tools/test_workshop_rules.js` | 合成/分解/星尘/闪耀/调整窗口返还原价 |
| `tools/test_deck_rules.js` | 牌组 20 张、同名上限、库存按版本校验（普通与闪卡不能互补） |
| `tools/test_admin_crud.js` | 管理端邮件/任务/公告/发奖/改卡的写入契约 |
| `tools/validate_cloudfunctions.py` | 空的云函数目录、缺 `wx-server-sdk`、客户端调不存在的函数 |
| `tools/validate_package_limits.py` | 主包超 4MB、合计超 30MB |
| `tools/validate_tool_inventory.py` | 工具脚本与 `docs/TOOLS.md` 清单脱节 |
| `tools/validate_docs_consistency.py` | 文档引用不存在的脚本、卡牌数量口径不一致、孤儿文档、把旧数字写成当前口径 |
| `tools/test_deck_save.js` | 牌组存档与库存按版本校验、清空槽位、非法槽位 |
| `tools/test_legacy_account.js` | 旧存档迁移丢库存/星尘/牌组/战绩，或重复补票 |
| `tools/smoke_collection_navigation.js` | 图鉴进出、开合详情、滚动越界、覆盖层残留 |
| `tools/test_battle_snapshot.js` | 改动库存/牌组会影响已开始的对局 |
| `tools/test_ai_behavior.js` | AI 不打脸、越城墙、有能量不出牌、能斩杀不斩、超战场上限 |
| `tools/test_collection_layout.js` | 图鉴三列网格、列间距、标签成对、命中区越界 |
| `tools/test_workshop_ui.js` | 工坊按钮文案、分解不弹确认、合成扣星尘、闪耀置灰 |
| `tools/smoke_render_budget.js` | 战场压满时单帧渲染开销（stub canvas，不含 GPU） |
| `tools/check_card_art_edges.py` | 母版四周白边（当前 `sure=3 borderline=1`） |
| `tools/p7_evidence_status.py` | 真机验收还剩哪几条、截图是否配对 |

## 二·补 素材边框的现状（2026-11-19 第 29–30 轮）

- 检测：`py tools/check_card_art_edges.py` → `checked=94 sure=3 borderline=1`。明确白边是 `base/c008.png`（四边）、`base/r008.png`（上下）、`star-remnant/s008.png`（上，**本轮新发现**）；临界是 `base/c025.png`（左右，亮度 205–208）。
- 修法已备好但**没有动原始母版**：`py tools/trim_card_art_edges.py --ids c008,r008,s008,c025 --sheet` 生成到 `design/generated/edge-trimmed/`，前后对比图 `design/review/edge-trimmed-before-after.png`。裁掉的像素分别是 c008 25/29/31/29、r008 47/48/0/0、s008 24/3/0/0、c025 0/0/29/27；对裁后结果重跑检测是 `sure=0 borderline=0`。
- 你只要说「采纳」，我就把四张拷进 `design/card-art/source/` 并重新构建两个分包；不想采纳就保持现状（不影响发布）。
- `star-remnant/s007.png` 的右下残笔无法用亮度规则判定（边缘 std 87.2 是全库最高，但正常满幅画面 std 也在 77–86），只能靠重绘。
- 包体影响实测：四张裁边母版重建后运行时 JPG 合计 `+18,769 B`（基础包 +16.7KB、星骸包 +2.1KB），可忽略。

## 二·补2 两项已结案（2026-11-19 用户拍板）

- **Q3 闪卡上限 → 不设上限**。代码保持现状（`shinyEnabled = normal>=3`、服务端只校验 3 张普通卡、无 `shinyLimit`）；`CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md` §7.3 那三条已按「无上限」改写为已确认。
- **素材白边 → 不要管**。`design/generated/edge-trimmed/` 的四张裁边候选保留备查，不替换原始母版、不重建分包。

## 二·补3 牌组编辑器改版（2026-11-19，已完成）

用户要求「让新玩家一眼看懂怎么组卡」。改版已落地并回归通过（提交 `f509bd6`、`aeff2e6`、`8f4d127`、`0b02b67`）：

- 左侧收藏变成 2 列立绘网格，点卡面加一张；右上角显示「已用/同名上限」；右下绿点表示还有库存。
- 右侧当前牌组按费用排序，点「普通 N」/「闪卡 N」各减一张。
- 标题行原地显示「已选 N / 20」；下方为 1–10 费法力曲线（柱顶显示张数）。
- 搜索复用图鉴口径；「全部卡牌」打开多选筛选面板（卡包/稀有度/费用）。
- 一键补满按当前筛选与同名上限补到 20；满 20 再点直接提示，不自动替换。
- 空牌组/空筛选都有引导文案；「清空」需二次确认。

说明文档 `docs/DECK_EDITOR_REDESIGN.md`（含 Q18–Q28 决策表、像素布局、测试清单）。

仍待用户拍板的三件事：① 卡面是否加「闪」按钮直接加闪卡 ② 右侧每行是否加小卡图 ③「我的牌组」列表页是否也改封面+曲线。

## 三、常用命令

要发版时不用记顺序，直接走 [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md)（7 步，45 条可复制命令）。

```bash
cd D:\kaifa\astral-ccg-gacha
node --expose-gc tools/test_battle_engine.js        # 24 个引擎用例
node --expose-gc tools/smoke_battle_drag_interactions.js   # 15 个拖拽场景
node --expose-gc tools/smoke_game_interactions.js   # 含遮罩/闪光回归
py tools/validate_ui_overlay_rules.py               # 覆盖层规范
node tools/validate_release_readiness.js            # 发布前体检
node tools/write_p7_evidence.js                     # 登记真机截图
py tools/p7_evidence_status.py                       # 真机验收还差哪几条
```

## 四、素材与目录约定

- 素材母版/生成图/QA 截图只写 `D:\kaifa\design`，游戏目录只接收构建脚本产出的运行时版本
- 卡图发布：母版 → `design/card-art/art-config.json` → `py tools/build_card_art_subpackages.py`；**未列入 art-config 的 ID 下次构建会被删除**
- 包体硬限制：主包 ≤ 4MB、主包+分包合计 ≤ 30MB；当前主包 2.91MB（73%）、合计 10.33MB，以 `py tools/validate_package_limits.py` 为准

## 二·补4 进入战斗报 -504002（2026-11-20 排查）

用户点「开始对战」时弹 `-1: cloud.callFunction:fail Error: errCode: -504002`。

- 本地已用 `tools/test_battle_start.js` 端到端跑通 `battleGame` 的 `action:"start"`（真实 `validateDeck`/`expandDeck`/`cleanAiDeck`），说明**代码路径本身没问题**，`-504002` 是线上运行时抛错。
- 已加固：`start()` 在读取存档后先做三项防御（存档不存在 / `inventory` 不是数组 / `cards` 为空），并把 `cleanAiDeck` 结果校验为 20 张，坏数据时给出中文原因而不是裸 `TypeError`。
- 客户端 `cloudError()` 增加错误码映射：`-504002/-504003…` → 「云函数执行异常（-504002），请查看云开发日志」，`-1: cloud.callFunction:fail` → 「云端调用失败，请稍后重试」。
- **下一步需要用户**：微信开发者工具 → 云开发 → 云函数 → `battleGame` → 日志，把点「开始对战」那一秒的红色报错行发我；若有多条，优先看含 `TypeError` 或 `document not found` 的。

### 真因与修复（2026-11-20，云函数日志确认）

日志：`ERROR Result: Error: 该随从当前不能攻击 at performAttack → aiTurn → processTimeout → start`。

- 触发链：上一局超时未结算 → 用户点「开始对战」→ `start()` 先调 `processTimeout(existing)` → 其中的 `aiTurn()` 用 `for(const minion of [...ai.board])` **快照**遍历；前一次攻击的亡语/连锁把后面顺位的己方随从打死（`resolveDeaths` 已从 `ai.board` 移除）后，循环仍拿旧对象调 `performAttack` → 服务端按 id 找不到人 → 抛错 → 整个 `start` 失败 → 客户端只看到 `-504002`。
- 修复一：攻击循环改成每轮按 `instanceId` 从**当前** `ai.board` 重新取随从，取不到就跳过。
- 修复二：`start()` 里 `processTimeout` 包 try/catch，结算失败时把残留对局标为 `expired` 并继续开新局（并打 `battle-start-timeout-failed` 日志），不再让一个坏残留局堵死入口。
- 回归：`tools/test_battle_start.js` 增至两段——正常开局 + 「残留对局结算抛错仍能开新局」（`board: null` 制造 TypeError，断言 `battle-start-recovery-ok`）。
