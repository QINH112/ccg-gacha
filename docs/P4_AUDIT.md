# P4 对战视觉与功能审计

审计日期：2026-11-18  
审计范围：对战准备、起手换牌、PVE 战斗、结算、对战记录，以及与卡牌详情相关的交互。

## 结论

P4 的代码、自动化回归和本地视觉审阅通过。P4 不再回到 P3；真机自然对局、触控手感和长时间运行属于 P7 发布前验收，不在本审计中伪装为已完成。

## 实现证据

- `game.js`：对战准备、继续/放弃旧对局、难度选择、起手换牌、大号 Canvas 红叉、长按卡牌详情、手牌横滑、出牌、攻击、英雄技能、通用技能、结束回合、认输和胜负平结算。
- `cloudfunctions/battleGame/index.js`：牌组校验、起手换牌、城墙、冲锋、突袭、护盾、吸血、入场、亡语、光环、双方同时死亡平局、50 个完整回合上限、对局持久化和日志幂等。
- `cloudfunctions/deckService/index.js`：20 张牌、稀有度数量限制、收藏数量校验和 5 个牌组槽位。

## 自动化证据

以下命令在本地工作区通过：

```powershell
node tools/smoke_game_interactions.js
node tools/test_battle_engine.js
node tools/test_battle_persistence.js
node --expose-gc tools/smoke_battle_stability.js
node tools/smoke_device_matrix.js
```

覆盖结果：

- 交互闭环：进入对战、确认换牌、长按查看详情、关闭详情、结束回合、认输、显示失败结算、返回准备页。
- 规则：13 项引擎测试，包括护盾、吸血、光环、召唤容量、亡语倍增、同时归零平局、50 回合平局、城墙、突袭、入场效果，以及 AI 突袭随从面对空场时跳过攻击。
- 持久化：认输后只写入一条 `battleLogs`，记录可查询，统计正确累加，重复写入幂等。
- 稳定性：900 次战场刷新无异常持续增长；设备矩阵覆盖 `320 × 568 @3`、`375 × 812 @2`、`430 × 932 @3`，Canvas DPR 封顶为 2。

## 视觉证据

- `design/review/battle-setup-375x812.png`
- `design/review/battle-setup-430x932.png`
- `design/review/card-template-mulligan-375x812.png`
- `design/review/card-template-mulligan-430x932.png`
- `design/review/battle-board-375x812.png`
- `design/review/battle-board-430x932.png`
- `design/review/battle-history-375x812.png`
- `design/review/battle-history-430x932.png`
- `design/review/battle-result-win-430x932.png`
- `design/review/battle-result-loss-430x932.png`
- `design/review/battle-result-draw-430x932.png`

真实开发者工具窗口截图也保存在 `design/review/p4-*.png`，用于确认实际 Canvas 布局；其中文件名保留历史记录，不把截图名称本身当作状态证明，状态以截图内容和自动化测试为准。

## 未纳入 P4 完成声明的项目

1. 至少一台真机完成自然胜负对局。
2. 真机触控手感、横滑和长按在不同系统版本复核。
3. 真机连续运行约 15 分钟。
4. 微信开发者工具自动化授权后的新鲜模拟器截图。
   > **实测批注（2026-11-19，原文保留不删）**：授权本身不是阻碍（详见 `docs/P7_MANUAL_ACCEPTANCE_RUNBOOK.md` §5），阻碍是自动化读不到纯 Canvas 帧且合成点击无效，需人工操作后窗口级截图。

以上项目已列入 `docs/VISUAL_ACCEPTANCE_CHECKLIST.md` 的 P7 发布前清单。
