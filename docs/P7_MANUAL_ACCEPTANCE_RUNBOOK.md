# P7 真机与开发者工具验收手册

本手册只覆盖自动化无法替代的项目：真实触控、自然对局和长时间运行。执行结果应填写到 `docs/VISUAL_ACCEPTANCE_CHECKLIST.md`，并把截图放入 `design/review/`。不要把静态审阅图当作真机验收结果。

当前发布候选已由微信开发者工具 CLI 成功解析并生成预览包：`design/review/preview-qr-final2.png`，工具报告包体 `2,744,554 B`。这只能证明项目可编译和打包，不能代替下述真机验收。

## 1. 运行前检查

1. 在微信开发者工具打开当前工程，确认 `compileType` 为 `game`，并选择正确云环境。
2. 确认 `battleGame`、`deckService`、`gameData`、`gameServices`、`initGameData` 已部署。
3. 在项目根目录执行：

   ```powershell
   node tools/validate_release_readiness.js
   ```

4. 开发测试阶段保留 `game.js` 中 `DEVELOPMENT_RESET_ENABLED = true`；正式上线前改为 `false`，重新运行发布审计。

## 2. 真机必测流程

### 主界面与服务页

- 进入主页，确认微信胶囊不遮挡标题、资源栏和入口按钮。
- 依次点击商店、邮箱、每日任务、成就、卡牌图鉴、牌组、对战和对战记录。
- 在邮箱、任务、成就页面测试一键领取；确认领取后红点和按钮状态刷新。
- 在图鉴、召唤记录、对战记录中上下滑动到末尾，再返回主页。

### 卡牌交互

- 在图鉴或战斗手牌上长按约 0.5 秒，确认完整卡牌详情居中显示。
- 点击详情卡牌外区域关闭；确认详情层不会穿透触发底层按钮。
- 在起手换牌中点击一张或多张卡，确认出现醒目的 Canvas 红色大叉，确认按钮数量同步。

### 自然对局

1. 进入“对战”，选择一副正好 20 张的牌组和任意难度。
2. 完成起手换牌，至少打出一张卡、攻击一次、使用一次英雄技能或通用技能、结束一回合。
3. 完成一场胜利或失败对局；确认结算层显示结果、牌组、难度和回合数。
4. 返回对战准备，再打开对战记录，确认新记录只出现一次且字段完整。
5. 若中途退出，重新进入对战，确认出现“继续对战 / 放弃旧对局”。

### 稳定性与触控

- 连续操作主页、横滑卡池、横滑战斗手牌、打开/关闭详情和滚动服务页约 15 分钟。
- 记录是否出现黑屏、卡顿、重复弹窗、点击穿透、图片重新闪烁或 Canvas 不响应。
- 至少在一台窄屏和一台长屏设备复核；记录设备型号、系统版本、基础库版本和结果。

## 3. 截图命名

使用统一命名，避免历史文件名造成误判：

```text
manual-p7-home-<device>-<date>.png
manual-p7-card-detail-<device>-<date>.png
manual-p7-mulligan-<device>-<date>.png
manual-p7-battle-active-<device>-<date>.png
manual-p7-battle-result-<device>-<date>.png
manual-p7-battle-history-<device>-<date>.png
```

每张截图旁边记录：设备、分辨率、系统、基础库、是否真机、操作步骤和结果。

## 4. 判定规则

- 逐条执行版清单（带编号、预期结果、记录表）：`docs/P7_DEVICE_ACCEPTANCE_CHECKLIST.md`，真机验收一律以它为准。

- 战斗内不得出现整屏遮罩，规则与清单见 `docs/UI_OVERLAY_RULES.md`。

- 所有必测项通过且无 P0/P1 问题：可将 P7 标记为完成候选。
- 只完成开发者工具截图：只能标记“模拟器通过”，不能代替真机触控和长时间稳定性。
- 发现功能回归时，先保留截图和日志，回退 P7 状态，不修改历史通过证据。

## 5. 模拟器窗口级截图工具（2026-11-19）

小游戏没有 page 体系，`miniprogram-automator` 对游戏项目的 `systemInfo` / `screenshot` 全部超时，因此模拟器证据改为**窗口级截图**：

```bash
# 抓微信开发者工具主窗口（自动选最大可见窗口），输出到 D:\kaifa\design\review\
powershell -NoProfile -ExecutionPolicy Bypass -File tools/capture_devtools_window.ps1 \
  -OutFile "D:\kaifa\design\review\p7-simulator-home.png"

# 向窗口注入点击 / 拖动（坐标是窗口相对）
powershell -NoProfile -ExecutionPolicy Bypass -File tools/click_devtools_window.ps1 -Points "1400,737"
powershell -NoProfile -ExecutionPolicy Bypass -File tools/click_devtools_window.ps1 -Drag "1250,600;1250,300"
```

已确认的限制：

- 两个 `.ps1` 必须保存为 **UTF-8 with BOM**，否则 Windows PowerShell 5.1 按 GBK 解析中文参数直接报语法错。
- 截图用 `PrintWindow` + `PW_RENDERFULLCONTENT`，能拿到模拟器真实渲染帧（不是白屏）；`design/review/p7-simulator-home.png` 即以此产出。
- **脚本合成点击无法驱动模拟器**：`SetCursorPos` 能把光标移到目标位置（已回读验证），但 `mouse_event` 的按下/抬起事件不会送达 Electron 画布，点击前后画面差异 0.0%；提权重启 IDE 后依然如此。因此"点开某个界面再截图"这一步必须由人工点击完成，脚本只负责截图（可用 2 秒间隔连拍，事后挑帧）。
- 若 IDE 是从既有实例复用的高权限进程，需先 `cli quit` 再用 `explorer.exe "D:\software\微信web开发者工具\微信开发者工具.exe"` 以当前用户身份启动，`cli open --project D:\kaifa\astral-ccg-gacha` 重新打开工程。

## 6. 真机证据登记

真机截图按 `manual-p7-<编号>-<机型>-<日期>.png` 命名放入 `design/review/`，执行 `node tools/write_p7_evidence.js` 后会被登记到 `p7-evidence-manifest.json` 的 `deviceEvidence`；`validate_release_readiness.js` 输出中的 `device=N` 即为已登记数量。
