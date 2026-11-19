# 《卤蛋传说》视觉与交互人工验收清单

> 微信小游戏 Canvas 不支持小程序自动化 SDK 的页面接口；当前使用开发者工具模拟器实际窗口截图与交互回归，并在需要时补充真机验收。每项通过后填写设备、日期和截图路径。

## 验收信息

- 验收日期：
- 微信开发者工具版本：
- 手机型号 / 系统：
- 微信版本：
- 屏幕尺寸：
- 验收人：

已取得的 P4 模拟器证据：

- `design/review/p4-battle-entry-real.png`
- `design/review/p4-mulligan-real.png`
- `design/review/p4-mulligan-selected-real.png`
- `design/review/p4-battle-after-layout-fix.png`

已通过的 P4 自动验证：

- `tools/smoke_game_interactions.js`：换牌、长按详情、关闭详情、认输和失败结算。
- `tools/test_battle_engine.js`：胜利、双方同时归零平局、50 完整回合上限平局，以及城墙、冲锋、突袭、护盾、吸血、入场、亡语、光环规则。
- `tools/test_battle_persistence.js`：战斗日志、记录查询、统计累加和重复写入幂等。
- `tools/test_cloud_data_compatibility.js`：不同 OpenID 数据隔离、重复进入资源/收藏/牌组/对局恢复、74 张卡牌升级兼容和三卡池独立保底。
- `tools/smoke_pool_session_state.js`：本次进入期间保留卡池选择，重新进入小游戏后必须重新选择。
- `tools/smoke_closed_pool.js`：关闭卡池仍可选中，但点击抽卡立即显示友好提示且不发起无效云请求。
- `tools/smoke_home_state.js`：未选卡池时抽卡按钮保持禁用并显示选择提示，选中后单抽调用云函数并显示可关闭结果层。
- `design/review/battle-result-win-375x812.png`、`battle-result-loss-375x812.png`、`battle-result-draw-375x812.png`：标准屏胜负平结算层。
- `design/review/battle-result-win-430x932.png`、`battle-result-loss-430x932.png`、`battle-result-draw-430x932.png`：长屏胜负平结算层。
- `node --expose-gc tools/smoke_battle_stability.js`：等价模拟 15 分钟、900 次战场刷新，检查异常与堆内存持续增长。

P4 阶段结论：开发验收通过。真机自然对局、实际触控手感和设备兼容性保留到 P7 发布前验收，不作为 P4 代码完成的阻塞项。

## 1. 主界面

- [x] Logo、卤蛋角色、月球、城堡、浮岛、云层和底部平台完整，无旧 UI 残影（`home-320x568.png`、`home-375x812.png`、`home-430x932.png`、真实模拟器主页截图）。
- [x] 玩家信息、抽卡券、金币、星尘数字清晰，不被微信右上角胶囊遮挡（主页三尺寸审阅图、真实模拟器截图）。
- [x] 三张卡池完整显示；选中边框与实际点击区域一致（`home-state-smoke.js`、`pool-session-state-smoke.js`）。
- [x] 单抽、五连、十连按钮的可用/不可用状态正确（`home-state-smoke.js`、`draw-results-1-*`、`draw-results-10-*`）。
- [x] 11 个功能入口逐一可点击，点击相邻空白不会误触（`smoke_home_routes.js`、真实模拟器主页截图）。
- [x] 红点仅出现在签到、邮箱、任务或成就确有可领取内容时（`smoke_service_interactions.js`、主页运行时映射）。
- [x] 开发阶段云存档重置入口可见且不遮挡底部安全区（主页三尺寸审阅图；正式发布开关见 `DEVELOPMENT_RESET_ENABLED`）。
- [x] 窄屏、标准屏、长屏均无拉伸、越界、裁切或大面积空白（`home-320x568.png`、`home-375x812.png`、`home-393x852.png`、`home-430x932.png`）。

截图：`design/review/manual-home-<device>-<date>.png`

## 2. 卡牌与抽卡

- [x] 卡牌左上角显示费用，右上角颜色圆正确表示稀有度（`card-template-collection-*`）。
- [x] 中央卡图位无插画时显示元素占位，有 `artPath` 时正确居中裁切（`smoke_card_art_loading.js`、`card-template-detail-*`）。
- [x] 中部卷轴能显示卡名与规则文字；长规则不会越出卡框（`card-template-detail-*`、`test_card_designs.js`）。
- [x] 左下攻击力、右下生命值清晰，未来卡牌种类位保持预留（卡牌模板审阅图）。
- [x] 单抽和十连结果卡面不重叠，十连五列布局文字仍可辨认（`draw-results-1-*`、`draw-results-10-*`）。
- [x] 长按图鉴、起手牌、战斗手牌能打开完整卡牌详情（`smoke_game_interactions.js`、`card-template-detail-*`）。
- [x] 点击详情卡牌外关闭；详情不会被胶囊或底部安全区遮挡（`smoke_game_interactions.js`、详情审阅图）。

截图：`design/review/manual-card-detail-<device>-<date>.png`

## 3. 起手换牌与战斗

- [x] 选中换牌的卡牌中央显示醒目的大号 `❌`（`card-template-mulligan-*`、`smoke_game_interactions.js`；历史真实截图另见 `docs/P4_AUDIT.md`）。
- [x] 确认起手按钮显示正确的换牌数量（`smoke_game_interactions.js`）。
- [x] 对手英雄、双方场面、玩家英雄、技能、手牌和回合按钮不重叠（`battle-board-*`、真实战场截图）。
- [x] 手牌可横向滑动；滑动不误触出牌，长按仍能查看详情（交互实现与 `smoke_game_interactions.js`）。
- [x] 手牌必须拖入己方战场指定位置出牌；普通点击、非法落点、能量不足、满场和对手回合不会提交出牌（`smoke_battle_drag_interactions.js`）。
- [x] 己方场上卡牌必须拖动撞击敌方随从或英雄攻击；普通点击不再攻击，城墙、突袭和不可攻击状态会限制目标（`smoke_battle_drag_interactions.js`、`test_battle_engine.js`）。
- [x] 战场卡牌与图鉴复用相同卡图、卡框、费用和攻血绘制路径，紧凑场景仅隐藏名称和技能文字（`smoke_battle_drag_interactions.js`；真机可读性等待用户验收）。
- [x] 城墙限制、冲锋、突袭、护盾、吸血、入场、亡语、光环展示与结算一致（`test_battle_engine.js`）。
- [x] 认输、结束回合、返回对战准备可用（`smoke_game_interactions.js`）。
- [x] 双方同时归零显示平局，50 个完整回合上限显示平局（`test_battle_engine.js`、`battle-result-draw-*`）。
- [x] 对战记录能显示胜利、失败、平局、难度、牌组和回合数（`battle-history-*`、`test_battle_persistence.js`、`docs/P4_AUDIT.md`）。

截图：`design/review/manual-mulligan-<device>-<date>.png`、`design/review/manual-battle-<device>-<date>.png`

## 4. 服务页面

- [x] 商店金币不足只显示友好提示，不暴露云函数堆栈（`smoke_service_interactions.js`）。
- [x] 邮箱、每日任务、每周任务、成就的一键领取已避开微信胶囊并通过点击回归（真机触控复核留至 P7）。
- [x] 签到弹窗 Day7 下方无多余大块空白，点击面板外能关闭（`wechat-simulator-sign-real.png`、`smoke_home_routes.js`）。
- [x] 图鉴、工坊、召唤记录、邮箱、任务、成就和牌组编辑器均可实际滚动到最后一项（`smoke_service_scrolling.js`）。
- [x] 空邮箱、空召唤/对战记录、无可用牌组、卡池未开放等异常状态文字清晰（`smoke_home_routes.js`、`smoke_closed_pool.js`）。
- [x] 服务页面返回按钮命中区已通过路由和滚动后返回回归，屏幕外滚动按钮不再抢占返回区域。

自动化视觉证据：`design/review/service-*-375x812.png`、`design/review/service-*-430x932.png`；真机截图仍使用 `design/review/manual-services-<device>-<date>.png`。

## 5. 云端与兼容性

- [x] 不同微信账号获得不同云端用户数据，不共享存档（`test_cloud_data_compatibility.js`）。
- [x] 退出并重新进入后云端资源、收藏、签到、任务、牌组和对局状态一致（`test_cloud_data_compatibility.js`；自然日真机复核仍保留）。
- [x] 重新进入必须重新选择卡池；卡池保底进度仍按卡池独立保存（`smoke_pool_session_state.js`、`test_cloud_data_compatibility.js`）。
- [x] 新版 74 张卡牌部署后旧玩家收藏 ID 不变、不丢卡、不重复发卡（`test_card_designs.js`、`test_cloud_data_compatibility.js`）。
- [x] `artPath` 插画加载失败时回退几何星纹，不黑屏、不阻塞操作，且当前进程内不重复重试。
- [x] 自动化稳定性通过：900 次战场重绘、600 次页面切换无持续内存增长或图片重复创建；15 分钟真机体感仍留至 P7。

自动化兼容性证据：`320 × 568 @3`、`375 × 812 @2`、`430 × 932 @3` 设备矩阵通过，Canvas DPR 均不超过 2；最新 P7 预览包为 `design/review/preview-qr-final2.png`，包体信息见 `preview-info-final2.json`。

发布前自动审计：`node tools/validate_release_readiness.js`。该审计会检查小游戏配置、P7 证据清单、关键回归脚本和开发重置开关，并明确列出仍需真机或开发者工具确认的项目。

## 6. 最终结论

P7 真机执行步骤、截图命名和判定规则见 `docs/P7_MANUAL_ACCEPTANCE_RUNBOOK.md`。在该手册的真实步骤完成前，不将 P7 标记为无条件完成。

- [ ] 全部必测项通过（仅剩真机自然对局、触控手感和 15 分钟流畅度复核）。
- [ ] 所有失败项均记录复现步骤、截图、设备和严重级别。
- [ ] P0/P1 问题清零；P2 问题有明确接受或修复计划。
- [x] 已确认正式上线前隐藏“重置云端存档（开发阶段）”入口；发布前将 `game.js` 的 `DEVELOPMENT_RESET_ENABLED` 改为 `false`。

结论：通过 / 有条件通过 / 不通过

遗留问题：

1. 仍需在至少一台真机完成主界面、卡牌详情、自然对局和 15 分钟触控/流畅度复核。
2. 微信开发者工具自动化授权尚未完成，新的模拟器证据需在工具中确认授权后补录。
   > **实测批注（2026-11-19，原文保留不删）**：该说法已过时。`cli islogin` 返回 `{"login":true}`，`cli auto --project ... --auto-port 9420` 直接成功且不弹授权框；真正限制是小游戏无 page 体系，`miniprogram-automator` 的 `systemInfo`/`screenshot` 会超时，脚本合成点击也无法驱动画布，因此模拟器证据只能人工点击后窗口级截图。详见 `docs/P7_MANUAL_ACCEPTANCE_RUNBOOK.md` §5。
