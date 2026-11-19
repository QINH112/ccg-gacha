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

## 二、等你动手的两件事

1. **重新预览 + 重传云函数**：客户端改了什么必须重编译才能上手机；`cloudfunctions/workshop`（合成上限改 9 张）需要重新上传。
2. **是否首次提交**：`docs/`、`tools/`、`assets/`、`subpackages/`、`cloudfunctions/battleGame/`、`cloudfunctions/deckService/` 目前全部 untracked，没有任何版本历史。

Q1（分解不弹二次确认）、Q2（非闪合成上限 9 张）已于 2026-11-19 拍板并落地，见 `docs/DECISION_LOG.md`。

## 三、常用命令

```bash
cd D:\kaifa\astral-ccg-gacha
node --expose-gc tools/test_battle_engine.js        # 24 个引擎用例
node --expose-gc tools/smoke_battle_drag_interactions.js   # 15 个拖拽场景
node --expose-gc tools/smoke_game_interactions.js   # 含遮罩/闪光回归
py tools/validate_ui_overlay_rules.py               # 覆盖层规范
node tools/validate_release_readiness.js            # 发布前体检
node tools/write_p7_evidence.js                     # 登记真机截图
```

## 四、素材与目录约定

- 素材母版/生成图/QA 截图只写 `D:\kaifa\design`，游戏目录只接收构建脚本产出的运行时版本
- 卡图发布：母版 → `design/card-art/art-config.json` → `py tools/build_card_art_subpackages.py`；**未列入 art-config 的 ID 下次构建会被删除**
- 包体上限 30MB，当前口径见 `README.md`「包体体积的权威口径」
