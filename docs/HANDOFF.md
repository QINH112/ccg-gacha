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

## 二、等你动手的三件事

1. **重新预览 + 重传云函数**：客户端改了什么必须重新「预览」扫码才上手机；`cloudfunctions/workshop`（合成上限改 9 张）需要重新上传，否则手机上仍是 2 张上限。
2. **Q3 未决**：闪卡要不要做稀有度上限？当前代码**完全没有闪卡上限**（只受「3 张普通卡」约束，`gameConfig` 里也没有 `shinyLimit` 字段）。验收清单里 3 条依赖这个答案，见 `docs/CARD_COLLECTION_WORKSHOP_MERGE_PLAN.md` §7.3 与 `docs/DECISION_LOG.md`。
3. **真机外观验收（17 条）与 3 张素材瑕疵**：真机项见 `docs/P7_DEVICE_ACCEPTANCE_CHECKLIST.md`（B 组已过，剩余是工坊/图鉴布局与对局手感）；素材瑕疵 `base/c008`、`base/r008`、`star-remnant/s007` 需启动 ComfyUI 重绘，按你的要求先放着。

~~是否首次提交~~ **已完成**：2026-11-19 首次完整提交 `aa26e5f`，220 个文件、233 个受控文件、`.git` 约 15MB；此后改动可回滚。

Q1（分解不弹二次确认）、Q2（非闪合成上限 9 张）已于 2026-11-19 拍板并落地，见 `docs/DECISION_LOG.md`。

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

## 二·补 素材边框的现状（2026-11-19 第 29–30 轮）

- 检测：`py tools/check_card_art_edges.py` → `checked=94 sure=3 borderline=1`。明确白边是 `base/c008.png`（四边）、`base/r008.png`（上下）、`star-remnant/s008.png`（上，**本轮新发现**）；临界是 `base/c025.png`（左右，亮度 205–208）。
- 修法已备好但**没有动原始母版**：`py tools/trim_card_art_edges.py --ids c008,r008,s008,c025 --sheet` 生成到 `design/generated/edge-trimmed/`，前后对比图 `design/review/edge-trimmed-before-after.png`。裁掉的像素分别是 c008 25/29/31/29、r008 47/48/0/0、s008 24/3/0/0、c025 0/0/29/27；对裁后结果重跑检测是 `sure=0 borderline=0`。
- 你只要说「采纳」，我就把四张拷进 `design/card-art/source/` 并重新构建两个分包；不想采纳就保持现状（不影响发布）。
- `star-remnant/s007.png` 的右下残笔无法用亮度规则判定（边缘 std 87.2 是全库最高，但正常满幅画面 std 也在 77–86），只能靠重绘。
- 包体影响实测：四张裁边母版重建后运行时 JPG 合计 `+18,769 B`（基础包 +16.7KB、星骸包 +2.1KB），可忽略。

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
