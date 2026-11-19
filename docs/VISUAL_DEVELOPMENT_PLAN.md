# 《卤蛋传说》视觉升级开发计划

> 本文档是视觉升级工作的持续维护账本。每次实现、素材生成、测试或需求确认后，都应同步更新阶段状态、证据、风险和下一步。

## 1. 长期 Goal

```text
/goal 将“卤蛋传说”微信小游戏持续升级为与设计原图一致、可长期维护的高质量美术版本：主界面保留 Logo、卤蛋角色、月球、城堡、浮岛、云层和底部场景，以独立精细 UI 覆盖可交互内容；逐页统一视觉语言、手机安全区适配和 Canvas 性能。卡牌必须使用普通银白、稀有蓝、史诗紫、传说橙及对应闪卡框，卡框素材本身是完整且唯一的稀有度颜色表达，程序不得在右上稀有度圆槽再次叠加实心色。完成度以持续维护的视觉计划、素材清单、图鉴/卡牌详情/抽卡/起手换牌审阅图、开发者工具预览包、交互回归、JavaScript/JSON 检查、资源尺寸透明区与加载检查为证据；保持云存档、抽卡、签到、商店、邮箱、任务、牌组及 PVE 战斗逻辑和数据兼容，不覆盖用户原始素材，不重新拆分主背景中的 Logo、角色和场景。每轮选择当前验收差距最大的视觉或流畅度问题，实施后更新证据、风险和下一步；若有效路径耗尽或需要用户审美决策，停止并记录已尝试方案、证据、具体阻塞点和所需输入。
```

## 2. 已确认的视觉决策

- 游戏名称：`卤蛋传说`；英文名：`LU DAN LEGEND`。
- 设计原图：`design/58a2a44f-5d36-4f99-a73e-ea56cbc02cc4.png`。
- 主界面完整背景必须保留：Logo、卤蛋角色、月球、城堡、浮岛、云层、底部平台与花草。
- 主界面完整背景必须移除：微信胶囊、玩家信息、资源栏、三张卡池、抽卡按钮、全部功能按钮、云存档按钮及其文字。
- Logo、角色和场景不再拆成多个运行时图层；它们合并为一张主背景。
- 可交互 UI 继续使用独立素材覆盖；按钮外区域必须为真正的干净底色或透明边缘，不允许携带截图背景块。
- 云存档入口和星骸遗响限时角标属于独立 UI 覆盖素材；背景中不保留它们的旧截图区域。
- 当前优先修复：`30_battle.png`、`31_battle_history.png`。
- 现有素材只是候选，不因已经分层而自动视为合格；实际接入时按视觉效果、分辨率和适配结果决定保留、修复或使用 `imagegen` 重制。
- 卡框颜色是完整卡牌的唯一稀有度色标：右上圆槽保留卡框素材原貌，程序不得再绘制稀有度实心圆覆盖它；卡牌外的列表、筛选与紧凑战斗卡仍可使用颜色辅助识别。

## 3. 工作边界

### 允许修改

- `game.js` 中的 Canvas 绘制、图片预载、布局与交互命中区。
- `design/` 中的设计原图、候选图、生成图、审阅图和素材清单。
- 新增运行时美术目录，例如 `assets/ui/`、`assets/backgrounds/`。
- 本计划、素材台账、测试记录及必要的构建辅助脚本。

### 必须保持

- 云存档、用户 OpenID 隔离及现有云数据库结构。
- 抽卡、签到、商店、邮箱、任务、成就、图鉴、工坊、牌组和 PVE 对战规则。
- 已存在的卡牌、卡包、资源数量、概率和奖励逻辑。
- 原始设计图与用户保留素材；新版本使用新文件名，确认后再替换引用。

## 4. 阶段计划

| 阶段 | 内容 | 状态 | 完成证据 |
|---|---|---|---|
| P0 | 固化 Goal、开发计划和素材台账 | 已完成 | 本文档、Goal 状态 |
| P1 | 生成无 UI 的完整主背景，修复对战按钮素材 | 已完成 | imagegen 背景、按钮 v2、尺寸检查、审阅图 |
| P2 | 建立图片预载与自适应绘制框架 | 已完成 | 单次预载、失败降级、三段式背景适配、三尺寸审阅图 |
| P3 | 主界面美术接入与交互命中区重构 | 跳过（按用户决定） | 主界面美术实现与静态审阅已保留；不再安排本阶段入口人工回归 |
| P4 | 对战准备、战斗、对战记录视觉升级 | 已完成 | `docs/P4_AUDIT.md`；页面视觉、交互、胜负平结算、关键词、日志、记录查询、900 次重绘和开发者工具预览均通过；真机自然对局复核并入 P7 |
| P5 | 其余页面统一视觉语言 | 已完成 | 服务页双尺寸审阅图、购买/领取/滚动/返回自动化、云端事务与开发者工具预览均通过；真机触控复核并入 P7 |
| P6 | 性能、内存、包体和兼容性优化 | 已完成 | 600 次切页、900 次战场重绘、失败图片缓存、三设备矩阵、DPR 封顶、资源与包体预算及开发者工具预览均通过 |
| P7 | 最终视觉验收与发布清单 | 进行中 | `docs/P7_MANUAL_ACCEPTANCE_RUNBOOK.md`；自动回归、云数据兼容、异常状态、设备矩阵、资源预算已通过；剩余真机视觉与触控验收 |

## 5. P1 素材任务

### 主背景

- 输入：设计原图。
- 输出建议：`design/generated/home-background-clean-v1.png`。
- 画布比例：保持原图 `941 × 1672`。
- 保留：Logo、角色、月球、城堡、浮岛、云层、底部平台和花草。
- 删除并自然补全背景：微信胶囊、玩家与资源栏、卡池、抽卡按钮、功能按钮、云存档按钮。
- 删除区域必须延续周围星空、云雾、地面和建筑结构，不允许模糊矩形、复制纹理断层、残字或按钮幽灵。

### 对战按钮

- `30_battle.png`：保留完整按钮轮廓、剑图标和“对战”文字；按钮外全部清理。
- `31_battle_history.png`：保留完整按钮轮廓、卷轴时钟图标和“对战记录”文字；按钮外全部清理。
- 输出为新版本文件，旧素材在验收前不覆盖。
- 两个按钮的圆角、外发光、阴影、色温、字号和图标尺度应与同排按钮一致。

## 6. 高标准验收

### 视觉一致性

- 主界面整体观感与设计原图一致，不出现临时 Canvas 方框风格与精细美术素材混搭的割裂感。
- 同级按钮的尺寸、间距、圆角、阴影、光泽、文字基线和图标视觉重量一致。
- 不出现明显白边、脏边、锯齿、背景残片、残字、压缩色带或不自然修补区域。
- 中文不得由图像生成模型重新拼写；需要精确文字时优先使用原素材或程序绘制。
- UI 在常见窄屏、标准屏和长屏上不遮挡微信胶囊，不越过安全区，不因缩放而失真。

### 交互与功能

- 每个视觉按钮的点击命中区与可见轮廓一致，不能误触相邻按钮。
- 横滑卡池、页面滚动、长按卡牌、对战倒计时、弹窗和返回逻辑保持正常。
- 主界面全部入口、抽卡、商店购买、邮箱领取、签到、牌组编辑和完整 PVE 对局完成回归。
- 云端数据及不同账号隔离行为不受视觉改造影响。

### 性能与稳定性

- 图片只预载一次并复用，不在每帧创建图片对象或重复解码。
- 加载中、加载失败和低性能设备均有可用降级显示，不出现黑屏或无法点击。
- 页面切换和横向/纵向滚动无明显持续掉帧；长时间对战不出现不断增长的图片或定时器资源。
- 控制主包资源体积；超大图片在视觉无损前提下压缩并记录尺寸。

### 工程验证

- `node --check game.js` 通过。
- `game.json`、`project.config.json`、`project.private.config.json` 可解析。
- `git diff --check` 通过，且不改动无关用户文件。
- 所有运行时图片存在、尺寸正确、路径大小写一致，并有素材清单。
- 每个关键页面至少保存一张验收截图，并在本文档记录日期、设备尺寸与结论。

## 7. P7 验收进展（2026-11-18）

- 修复重新进入小游戏仍保留卡池选择的问题；进入期间选择保持，重新进入后清空，云端各卡池保底值不受影响。
- 为召唤记录补充空状态，并验证空邮箱、空召唤/对战记录、无可用牌组的提示。
- 关闭卡池保持可选中，抽卡时由前端立即提示“该卡池暂未开放”，云函数继续作为最终校验。
- 新增 `DEVELOPMENT_RESET_ENABLED` 发布开关；开发阶段保持 `true`，正式上线前改为 `false` 即可同时移除入口显示与命中区。
- 新增 `tools/test_cloud_data_compatibility.js`，验证不同 OpenID 隔离、重复加载不丢资源/卡牌、牌组与未结束对局恢复、72 张卡牌旧收藏兼容、各卡池保底独立。
- 新增 `tools/smoke_pool_session_state.js`、`tools/smoke_closed_pool.js` 和 `tools/smoke_home_state.js`，并强化 `tools/smoke_home_routes.js` 的异常状态断言。
- 使用 `py tools/render_home_visual_qa.py` 重新生成 `320×568`、`375×812`、`393×852`、`430×932` 主页证据；使用 `py tools/render_card_template_visual_qa.py` 生成单抽/十连结果证据；`tools/write_p7_evidence.js` 输出 `design/review/p7-evidence-manifest.json`，记录尺寸、文件大小和 SHA-256。
- 完整自动回归通过：服务页、卡牌、牌组、战斗、900 次战场刷新、600 次页面切换、三设备矩阵、运行时资源和预览包预算。
- 新增 `tools/validate_release_readiness.js`，检查小游戏配置、P7 证据清单、关键回归脚本和开发重置开关；当前审计通过，但明确输出真机与开发者工具授权两个外部验收阻塞项。
- 待完成：真机主界面、卡牌详情、自然对局、触控手感和 15 分钟流畅度验收；模拟器证据需重新补录。
- 2026-11-19 复核「自动化授权」：本机 CLI 实际可用，无需再人工授权。`cli islogin` 返回 `{"login":true}`，`cli auto --project D:\kaifa\astral-ccg-gacha --auto-port 9420` 返回 `{"autoPort":9420}` 并识别 AppID `wxa7b371c950f257b6`，服务端口记录在 `User Data\...\Default\.ide`（`39310`）。真正的限制仍是自动化 SDK 读不到纯 Canvas 帧，因此模拟器证据只能走 Developer Tools 窗口级截图，不能用 automator 直接抓帧。

## 7. 素材台账

| 素材 | 当前状态 | 处理策略 | 目标路径 |
|---|---|---|---|
| 原始主界面设计 | 保留 | 仅作参考与编辑输入 | `design/58a2a44f-5d36-4f99-a73e-ea56cbc02cc4.png` |
| 主界面完整背景 | 已落盘并接入 | 内置 `imagegen` 精细移除 UI；运行时使用高质量 JPEG，设计源保留 PNG | `assets/backgrounds/home-clean-imagegen-v1.jpg` |
| 玩家信息与资源栏 | 候选 | 接入前检查文字、边缘和缩放 | `design/layers/11-14*.png` |
| 卡池与抽卡按钮 | 候选 | 接入前检查原坐标与不同屏幕适配 | `design/layers/15-20*.png` |
| 第一排功能按钮 | 已接入主页 | 白底设计源转换为透明、紧裁切运行时 PNG | `assets/ui/home/sign.png` 等 |
| 第二排功能按钮 | 已接入主页 | “对战/对战记录”使用 v2 清理版，其余使用紧裁切运行时 PNG | `assets/ui/home/mail.png` 等 |
| 云存档按钮 | 候选 | 检查文案与正式上线隐藏策略 | `design/layers/32_cloud_save_button.png` |
| 云存档按钮运行时版 | 已接入 | 使用独立 PNG 覆盖主背景，保留开发阶段重置入口命中区 | `assets/ui/home/cloudSave.png` |
| 星骸遗响限时角标 | 已保留候选 | 当前卡池素材已自带角标，运行时不重复叠加；未来换成无角标卡池素材后再启用 | `assets/ui/home/limited.png` |
| 原创卡牌框 | 已生成并接入 | 以用户手绘结构为唯一构图依据，通过 `imagegen` 生成无文字、透明外底与透明蛋形画窗的原创卡框；不使用 `design/card-template` 中由第三方游戏卡图处理得到的候选素材 | `assets/ui/cards/card-frame-original-v1.png` |
| 稀有度与闪卡卡框 | 已生成并接入 | 普通稀有度银白、稀有蓝、史诗紫、传说橙各一张，并为四种稀有度提供克制虹彩箔光闪卡；运行时按 `rarity + shiny` 自动选择 | `assets/ui/cards/card-frame-*-v1.png` |
| 全部卡牌立绘 | 已完成 | 74 张母版按卡包保存，通过显式发布清单压缩为 `512 × 608` JPG；基础包 54 张进入 `card-art-base`，星骸遗响 20 张进入 `card-art-star-remnant` | `subpackages/card-art-*/images/` |

## 8. 每轮维护模板

### 执行记录

- 日期：
- 本轮目标：
- 修改文件：
- 新增/生成素材：
- 使用的生成提示词：
- 验证命令：
- 截图与设备尺寸：
- 结果：通过 / 部分通过 / 未通过
- 遗留问题：
- 下一步：

## 9. 变更日志

### 2026-11-17

- 创建长期 Goal。
- 确认主背景保留 Logo、角色和完整场景，删除全部可交互 UI 与微信胶囊。
- 确认不再把月球、城堡、浮岛、云层和角色拆为运行时独立图片。
- 确认优先修复“对战”和“对战记录”素材。
- 创建本开发计划，P0 进入进行中。
- P0 完成，P1 开始执行。
- 使用 `imagegen` 生成完整主背景预览：保留 Logo、角色和场景，移除全部交互 UI；当前工具结果未提供可写入工作区的本地文件，因此只记为预览，不作为完成证据。
- 主背景生成提示词归档：

```text
Use case: precise-object-edit
Asset type: production background for a portrait WeChat mini-game home screen
Input image: original 941x1672 “卤蛋传说” home-screen design.
Keep exactly: complete logo, egg mascot, moon, castle, floating islands, clouds, starry sky, bottom platform and flowers.
Remove completely: WeChat capsule, player/resource bars, summon pools, draw buttons, function buttons and cloud-save button.
Reconstruct removed regions naturally; preserve composition, palette and painterly fantasy style; no ghost text, rectangular patches or duplicated architecture.
```

- 新增 `tools/clean_white_background_assets.py`，从白底素材中保留最大连通主体并移除背景碎片。
- 输出 `design/layers/30_battle-v2.png`：`941 × 1672`，仅剩 1 个主体连通区域，目视检查通过。
- 输出 `design/layers/31_battle_history-v2.png`：`941 × 1672`，主体外无可见背景块，目视检查通过。
- 原始 `30_battle.png` 与 `31_battle_history.png` 未覆盖，便于对比和回退。
- 新增 `tools/build_visual_runtime_assets.py`：将用户保留的白底分层图转换为透明、紧裁切的运行时素材，并维护 `assets/ui/home/manifest.json`。
- 内置 `imagegen` 第二次编辑成功；从当前会话记录无损导出生成结果到 `design/generated/home-background-clean-imagegen-v1.png`。
- 生成图实际为 `941 × 1671`，非破坏性补齐为设计基准 `941 × 1672`，保存 `design/generated/home-background-clean-imagegen-v1-941x1672.png`。
- 运行时背景保存为 `assets/backgrounds/home-clean-imagegen-v1.jpg`：`941 × 1672`、约 `403 KB`；主页活跃运行时美术总量约 `1.37 MB`。
- `game.js` 新增主页素材单次预载、加载失败降级、透明素材绘制和图片命中区；旧 Canvas 主页保留为背景加载失败时的降级界面。
- 背景使用三段式纵向延展：顶部 Logo/角色/城堡与底部平台等比缩放，仅中间云海吸收长屏高度，避免人物和建筑纵向变形。
- 主界面已接入：完整背景、玩家条、三张卡池、11 个功能入口；抽卡按钮、资源数量、卡池选中/开放状态和红点继续动态绘制。
- 抽卡券、金币、星尘和抽卡按钮复用设计稿原生图标区域，避免系统 emoji 在不同手机上产生风格和基线差异。
- 美术版主页只有在整组素材全部预载成功后启用；任一文件失败时完整回退旧 Canvas 主页，不产生不可见可点击区域。
- 新增 `tools/render_home_visual_qa.py`，生成三种常见尺寸的静态合成审阅图：
  - `design/review/home-375x812.png`
  - `design/review/home-393x852.png`
  - `design/review/home-430x932.png`
- 三张审阅图目视通过：主要元素完整、无白边和截图背景块、底部平台保留、不同长宽比下无明显场景拉伸。
- `project.config.json` 上传包排除 `design/`、`docs/`、`tools/` 和两个旧背景候选，避免设计源与测试证据进入小游戏主包。
- 验证通过：`node --check game.js`、JSON 解析、全部运行时图片可读、`git diff --check`。
- 新增 `tools/smoke_game_runtime.js`；使用最小微信 API/Canvas 桩加载完整 `game.js`，输出 `game-runtime-smoke-ok`。
- 早期检查的常见微信开发者工具 CLI 路径未找到；随后确认实际安装路径为 `D:\software\微信web开发者工具\cli.bat`。自动化 SDK 仍无法读取纯 Canvas 页面帧，因此采用开发者工具真实窗口截图与人工点击作为 P4 模拟器证据，不以静态合成图替代最终真机结论。
- 使用内置 `imagegen` 生成无文字、无 UI 的星界战场背景，导出为 `design/generated/battle-background-imagegen-v1.png`，运行时版本为 `assets/backgrounds/battle-imagegen-v1.jpg`（`941 × 1672`）。
- 新增通用 `tools/export_latest_imagegen.js`，可按生成提示词片段从本地会话记录导出最近一次内置 imagegen PNG，避免生成结果只停留在预览。
- 战场背景已接入对战准备、起手换牌、实际战斗和对战记录；页面数据结构、按钮 ID、命中区和云函数调用保持不变。
- 运行时路由烟雾测试通过：模拟云配置加载后依次进入对战准备和对战记录，确认调用 `deckService:list`、`battleGame:status`、`battleGame:history`。
- 主页与战场素材故障隔离：战场背景缺失时仅对战页回退渐变背景，不会迫使主页回退旧版。
- 战斗布局改为底部锚定：玩家场面、英雄栏、技能、手牌和认输/结束回合按钮随底部安全区布局，长屏额外空间用于中央战场，不再留下大片无效空白。
- 新增对战视觉审阅图：
  - `design/review/battle-setup-375x812.png`
  - `design/review/battle-setup-430x932.png`
  - `design/review/battle-history-375x812.png`
  - `design/review/battle-history-430x932.png`
  - `design/review/battle-board-375x812.png`
  - `design/review/battle-board-430x932.png`
- 商店、邮箱、每日/每周任务、成就、牌组、牌组编辑器、图鉴、工坊、召唤记录统一使用星界战场背景和半透明面板层，不改页面数据、按钮 ID、滚动逻辑或云函数调用。
- 普通服务页页头（商店、邮箱、任务、成就、图鉴、工坊、牌组和记录）统一改用 `homeContentTop()`，与对战页保持同一顶部安全区，避免微信胶囊区域遮挡标题、返回按钮或顶部操作按钮。
- 本轮回归通过：`node --check game.js`、`node tools/smoke_game_runtime.js`、运行时图片路径/文件存在性检查、主页/对战/战场静态审阅脚本、`git diff --check`；运行时烟雾测试仍确认 `gameData:load`、`gameServices:dashboard`、`deckService:list`、`battleGame:status`、`battleGame:history` 路由。
- 新增 `tools/validate_visual_assets.py`，统一检查主页背景、战场背景、26 个运行时素材的路径、尺寸、可读性和 `game.js` 美术引用；当前使用 `py tools/validate_visual_assets.py` 通过：`files=26`、`gameReferences=23`、总计约 `2.18 MB`。
- 资源清单新增 `battleBackground`，后续替换战场背景时不再依赖隐含路径；`assets/ui/home/manifest.json` 与生成脚本保持一致。
- 本机 `python` 命令是 WindowsApps 占位符，执行 Python 工具请使用 `py`；这不是项目运行时问题。
- 新增 `tools/smoke_game_interactions.js`，在最小微信 Canvas 桩中模拟进入对战、起手换牌和长按手牌；通过 `game-interaction-smoke-ok`，确认调用 `battleGame:status`、`battleGame:mulligan`，并确认卡牌详情提示文字已渲染。
- 新增 `tools/render_service_visual_qa.py`，生成商店、邮箱、每日/每周任务、成就、牌组、图鉴、工坊、召唤记录在 `375 × 812` 与 `430 × 932` 下的静态审阅图；统一验证背景、顶部安全区、半透明面板和滚动内容的视觉边界。
- 新增 `tools/smoke_home_routes.js`，覆盖主页 11 个入口（签到、召唤记录、图鉴、工坊、商店、邮箱、任务、成就、牌组、对战、对战记录）；通过 `home-routes-smoke-ok`，确认入口命中区和对应云函数路由仍可到达。
- 复核发现 `cloudSave` 与 `limited` 虽已生成但此前未进入主页绘制；云存档按钮现已接入 `HOME_ART_PATHS`、原设计坐标和主页渲染，并保留 `reset` 命中区。检查发现当前 `poolStarRemnant.png` 已自带高质量“限定”角标，因此停止额外绘制 `limited.png`，避免重复角标；独立角标文件保留，待未来替换为无角标卡池素材时再启用。
- 修复后资源验证通过：`files=26`、`gameReferences=23`、总计约 `2.18 MB`；主页四尺寸静态审阅图已重新生成。
- 全量检查再次通过：主页/对战路由烟雾测试、`node --check game.js`、工具脚本语法、JSON 解析、背景 `941 × 1672`、26 个运行时图片全部可读、`git diff --check`。

### 2026-11-18

- 图鉴卡牌外围边框清理：截图中的蓝、紫、橙色圆角矩形并非卡框素材，而是共享卡面渲染器的降级底板描边透过透明卡框外沿显示。图鉴现在为完整原创卡框启用 `transparentOuter`，仅移除卡牌外围矩形底板与描边，保留卡框素材自身的普通稀有度银白、稀有蓝、史诗紫、传说橙和闪卡颜色表达。
- 降级策略保持安全：只有完整卡框图片已加载且卡面不是紧凑布局时才隐藏外围底板；素材加载失败时继续绘制原降级底板，避免图鉴出现空白卡。抽卡结果、卡牌详情、起手换牌、战斗手牌和场面不改变现有表现。
- 图鉴边框验收标准：卡框四角及两侧透明区直接露出星界背景，不再出现与稀有度同色的矩形包围线；卡框本体、费用、名称、效果、攻血、卡包名、拥有数量、未拥有半透明状态、点击/长按和滚动命中区保持不变。`validate_visual_assets.py` 新增防回归检查，要求图鉴显式启用透明外围模式，并要求共享渲染器仅在该模式下跳过降级底板。
- 本轮自动验证通过：`node --check game.js`、`node tools/smoke_service_interactions.js`、`node tools/smoke_service_scrolling.js`、`py tools/validate_visual_assets.py` 与相关文件 `git diff --check`；图鉴卡包循环筛选、滚动到最后一项和资源透明区规则保持正常。
- 使用内置 `imagegen` 以原始史诗紫卡框为结构参考，生成普通稀有度银白、稀有蓝、传说橙及四种稀有度闪卡的高分辨率配色参考，保存到 `design/generated/card-frames/`；原始史诗卡框未覆盖。
- 新增 `tools/build_card_frame_variants.py`，以原始 `512 × 768` 卡框的精确透明轮廓构建 8 张运行时卡框，保持卡框外部和中央蛋形插画窗透明，避免生成参考图的细微几何漂移。
- `game.js` 已按 `rarity + shiny` 自动选择卡框；主页资源清单、视觉校验、运行时预算与重建脚本均改为维护完整 8 张卡框。
- 卡框变体验证通过：33 个运行时素材均可读，8 张卡框均为 `512 × 768` 且外部与蛋形插画窗透明；运行时美术合计 `2,328,958 B`，微信开发者工具预览包 `3,284,022 B`，均低于现有预算。预览证据为 `design/review/preview-qr-card-frame-rarities.png` 与 `preview-info-card-frame-rarities.json`。
- 恢复长期视觉 Goal，并补充卡牌稀有度规则：完整卡框已自行表达普通稀有度、稀有、史诗、传说颜色，移除右上稀有度圆槽的 Canvas 二次实心着色；费用、卡名、效果、攻血、闪卡框和紧凑卡逻辑不变。静态审阅脚本同步按 `rarity + shiny` 加载实际八种运行时卡框。
- 本轮验证通过：重新生成 `card-template-detail-*`、`card-template-collection-*`、`card-template-mulligan-*` 与 `draw-results-*` 审阅图；目视确认右上圆槽保留卡框原生材质，普通稀有度银白、稀有蓝、史诗紫、传说橙可由整张卡框直接辨识。`validate_visual_assets.py` 新增防回归规则，若完整卡框绘制函数再次出现右上实心圆覆盖会直接失败；运行时、交互、卡图加载、72 张卡牌设计和包体预算测试均通过。
- 接入基础包首批立绘 `c001-c005`：保留 `1024 × 1216` PNG 母版，使用 `tools/build_card_art_subpackages.py` 生成 `512 × 608` JPG；通过 `design/card-art/art-config.json` 显式控制发布范围，避免尚未确认的图片仅因进入源目录就自动上线。客户端通过 `wx.loadSubpackage` 加载 `card-art-base` 后按 `artPath` 创建图片，云端卡牌数据和对战快照继续透传立绘路径。
- 首批立绘审阅图 `design/review/card-art-base-c001-c005.png` 目视通过，五张主体均落在蛋形安全区内。小游戏分包必须包含独立 `game.js` 入口，已由构建脚本自动维护；开发者工具真实预览成功，总包 `3,824,654 B`，其中主包 `3,286,040 B`、`card-art-base` 分包 `538,614 B`。客户端另有 `c001-c005` 本地 ID 映射，因此重新部署云端卡牌数据前也能立即显示立绘。
- 根据真机图鉴反馈调整完整卡牌排版：不修改立绘母版，只收紧蛋形显示蒙版顶部并将立绘显示区域略向下移动，隐藏超出卡框顶部的画面并利用下方空隙；卡名与效果文字同步下移，避免压在中央星扣和布带上。
- 继续针对蛋形窗口底部空旷调整运行时取景：完整卡牌立绘放大 `1.15×`，使用偏上源图焦点使人物主体在蛋形窗口中下沉并填满底部；只改变 Canvas 取景参数，不改动或重新裁切源图文件，紧凑战斗卡保持原比例。
- 修复蛋形底部黑色月牙：确认卡框真实透明开口并非标准椭圆，改用根据透明开口采样得到的上窄下宽贝塞尔蛋形路径；路径覆盖至中央星扣后方，既填满底部两侧，也阻止立绘从卡框顶部透明外区漏出。静态审阅直接读取卡框透明连通区域作为逐像素蒙版。
- 进一步定位并移除残留黑月牙：完整卡牌外层已有蛋形裁切，但通用立绘函数内部仍重复执行圆角矩形裁切，导致蛋形底部两角再次被削掉。完整卡牌现关闭内部圆角裁切与描边，仅保留真实蛋形蒙版；图鉴、详情与抽卡大卡共享该修复，其他使用通用矩形立绘的界面保持原行为。
- 采用最终可靠蒙版方案：从非闪卡框中央透明连通区自动生成独立 `assets/ui/cards/card-art-mask-v1.png`，保留半透明抗锯齿边缘。游戏通过复用的 `512 × 768` 离屏 Canvas 将立绘与该 PNG 执行 `destination-in` 合成，静态审阅脚本读取同一文件；手写贝塞尔路径不再参与有立绘卡牌的显示。

- 根据卡牌模板草图，新增共享 Canvas 卡面渲染器：费用固定在左上角，稀有度使用右上角色圆，中央保留卡图位，效果文字写入中部卷轴区域，攻击力/血量分别位于左下/右下，底部中央预留未来卡牌种类位。
- 图鉴、抽卡结果、战斗手牌/场面、长按卡牌详情已统一调用同一套卡面布局；小尺寸手牌自动切换紧凑布局，换牌选中状态继续显示大号 `❌`，长按逻辑和命中区保持不变。
- 中央卡图位优先读取卡牌 `artPath`（兼容 `imagePath` / `art`）并自动按需预载；没有独立插画或图片加载失败时使用 `element` 作为兼容占位。已有 `rulesText` / `description` 自动显示为效果文字，不需要修改云端抽卡、牌组或战斗数据结构。
- 卡牌模板回归通过：`node --check game.js`、`node tools/smoke_game_runtime.js`、`node tools/smoke_game_interactions.js`、`node tools/smoke_home_routes.js`、`py tools/validate_visual_assets.py`、主页/服务页/战场静态审阅和 `git diff --check`。
- 新增 `tools/render_card_template_visual_qa.py`，为 `375 × 812` 与 `430 × 932` 生成大卡详情、图鉴三卡并排、起手换牌三卡审阅图；审阅确认费用/稀有度圆/中央卡图位/效果卷轴/攻击血量和大号 `❌` 均在卡面内，没有越界。
- 卡面素材接入采用“数据优先、素材可选”方案：当前卡牌没有独立插画字段时使用 `element` 占位；新增插画只需填写卡图路径，不会改变现有抽卡、牌组、战斗或云存档接口。
- 卡图字段兼容已落地：卡牌可选 `artPath`（兼容 `imagePath` / `art`），前端自动按需预载并裁切到中央卡图区域；PVE `snapshot` / token 快照同步透传 `artPath` 与 `cardTypeLabel`，现有卡牌未填字段时保持元素占位和原战斗表现。
- P6 已开始：Canvas 像素倍率限制为最高 `2`，避免 3×/4× DPR 设备产生过高画布内存；主页素材和可选卡图的加载完成事件使用下一帧合并重绘，减少启动期间连续整屏绘制。
- 新增 `tools/validate_runtime_budget.py`，检查 DPR 上限、运行时美术总量、单图像素量和微信预览包体；预算分别为运行时美术 `≤2.5 MB`、单图 `≤200 万像素`、预览包 `≤4 MB`。
- 复核 `docs/CARD_DESIGN_PLAN.md`，确认既有 72 张最终卡面与 3 张衍生随从已经本地实施；2026-11-19 起新增卡牌、新类型与沉默机制继续维护在该文档。历史专项验证为 `node tools/test_card_designs.js`（72 cards, 3 tokens）和 `node tools/test_battle_engine.js`（13 个核心场景）。
- 新增 `docs/VISUAL_ACCEPTANCE_CHECKLIST.md`，把真实开发者工具/真机必须检查的主页、卡面、起手换牌、完整战斗、服务页、云端兼容与 15 分钟稳定性整理为可勾选清单和截图命名规范。
- 新增 `tools/smoke_card_art_loading.js`，在 4× DPR 模拟环境中验证多张卡共享同一 `artPath` 时只创建一次图片资源，并确认主页预载与卡图按需加载可共存。
- 审计 `design/card-template/README.md` 后确认旧候选卡框来源于第三方游戏卡图处理，不作为最终运行时素材。使用内置 `imagegen` 按用户手绘结构生成全新原创卡框，源图保存为 `design/generated/card-frame-original-v1.png`，运行时透明 PNG 为 `assets/ui/cards/card-frame-original-v1.png`（`512 × 768`、约 `388 KB`）。
- 原创卡框生成提示词要点：保留蛋形透明卡图窗、左上费用底座、右上稀有度圆、中央布带和星形扣、下半羊皮纸效果区、左右攻血口袋、底部预留卡种槽；采用卤蛋传说蓝紫星城风格；无文字、无数字、无 Logo、无角色、透明卡外区域；明确禁止模仿或复用任何现有卡牌游戏框架。
- `game.js` 已按“卡图/元素占位 → 原创卡框 → 动态费用/稀有度/卡名/效果/攻血/卡种”顺序绘制。大卡、图鉴、抽卡结果和起手换牌使用完整卡框；场面与战斗手牌的小尺寸卡继续使用轻量紧凑布局。
- 新增 `tools/build_original_card_frame.py`，可从保留的生成源非破坏性重建 `512 × 768` 运行时版本；`manifest.json`、视觉素材验证和性能预算均已纳入卡框。当前运行时美术合计约 `2.18 MB`，仍低于 `2.5 MB` 预算。
- 微信开发者工具 CLI 已使用原创卡框重新生成预览包：`design/review/preview-qr-original-card-frame.png` 与 `preview-info-original-card-frame.json`；总包体 `2,739,507 B`（约 `2.6 MB`），低于当前 `4 MB` 预算。
- 起手换牌选中标记改为 Canvas 直接绘制的粗红色大叉，避免系统 `❌` emoji 在不同安卓字体下变成方框或尺寸不一致。

### 当前阻塞与下一步

- 当前无素材生成阻塞；内置 `imagegen` 结果已从会话记录导出并进入项目。
- 已发现并记录本机人工验收限制：小程序自动化 SDK 无法读取纯 Canvas 帧；因此没有把静态合成图冒充真实模拟器截图，改用 Windows 窗口级截图保留开发者工具真实画面。
- 2026-11-18 已通过 Windows 自动化精确定位标题为“卤蛋传说”的开发者工具窗口并取得真实 P4 截图；该方法可验证页面视觉和布局，但完整胜负链路、真机长时运行仍需人工验收。
- 根据用户决定，停止 P3 主界面入口人工回归，将后续工作切换到 P4 对战准备、起手换牌、完整战斗和对战记录。
- P4 真实模拟器验收已取得开发者工具窗口截图：`design/review/p4-battle-entry-real.png`（对战准备）、`design/review/p4-mulligan-real.png`（起手换牌）、`design/review/p4-mulligan-selected-real.png`（选牌后进入战场）、`design/review/p4-battle-after-layout-fix.png`（布局修复后战场）。
- 真实画面确认原创卡框已用于起手牌和战斗手牌，费用、稀有度、效果、攻击力和生命值均随卡框显示；起手页标题、75 秒提示和确认按钮未被胶囊遮挡。
- P4 真实画面发现战斗底部布局在不同开发者工具预览视口下过于贴近底部，已将战斗手牌底部锚定到“结束回合/认输”按钮上方并保留 44px 间距，同时同步交互烟雾测试坐标。
- `node tools/smoke_game_interactions.js` 在底部布局修复后重新通过，并覆盖“确认换牌 → 长按卡牌详情 → 关闭详情 → 确认认输 → 显示失败结算”交互闭环；P4 静态对战准备、对战记录和战场审阅图已重新生成。
- 新增 `tools/test_battle_persistence.js`，以本地内存数据库验证认输后只写入一条 `battleLogs`、对战记录可查询、玩家统计正确累加且重复调用保持幂等。
- `tools/test_battle_engine.js` 已覆盖攻击致胜、双方同时归零平局、第 50 个完整回合结束后强制平局，以及 AI 突袭随从面对空场时无合法目标的处理，共 13 项战斗规则测试。
- P4 静态审阅图确认 `battle-setup-*`、`battle-board-*`、`battle-history-*` 在 375/430 宽度下无背景切割残片，标题、记录卡片、场面、手牌和底部按钮保持安全区内。
- P4 开发验收已完成：自动化覆盖自然胜负规则、认输结算、日志、统计、对战记录查询、结束回合、返回链路和 900 次持续重绘；真机自然对局手感与设备兼容性统一并入 P7 发布前复核。
- 已找到并验证本机开发者工具 CLI：`D:\software\微信web开发者工具\cli.bat`。执行 `preview --project D:\kaifa\astral-ccg-gacha --qr-format image --qr-output design/review/preview-qr-final.png --info-output design/review/preview-info-final.json` 成功，生成真实预览包，总包体 `2,180,882 B`（约 `2.1 MB`）。这证明项目可被开发者工具正常解析和编译；Canvas 视觉和点击仍需在工具内人工查看。
- 当前待验收：P7 发布前使用至少一台真机完成自然胜负、结束回合连续操作、服务页触控/滚动、结算后返回和 15 分钟稳定性复核；P3 主界面入口回归不再列入当前阶段。
- 下一步优先级：完成 P7 真机验收手册中的自然对局、触控、服务页滚动和长时间稳定性复核；不回退到用户已跳过的 P3。
- P4 预览包已通过开发者工具 CLI 生成：`design/review/preview-qr-p4.png` 与 `design/review/preview-info-p4.json`，总包体 `2,740,033 B`，说明当前工程可正常打包。
- P4 结算层已升级为统一星界风格结果面板，胜利、失败、平局分别使用金色、玫红和淡紫强调色，并显示牌组、难度和完整回合数；星芒改为 Canvas 几何绘制，避免跨平台字体方框。
- 新增 6 张结算视觉证据：`battle-result-win-*`、`battle-result-loss-*`、`battle-result-draw-*`，覆盖 375×812 与 430×932；遮罩下保留暗化战场背景，按钮保持安全区内。
- `tools/smoke_game_interactions.js` 已继续覆盖“结束回合 → 认输结算 → 返回对战准备 → 重新读取对局状态”，云函数调用顺序验证通过。
- 更新后的 P4 预览包已通过开发者工具 CLI 生成：`design/review/preview-qr-p4-results.png` 与 `design/review/preview-info-p4-results.json`，总包体 `2,741,348 B`。
- 新增 `tools/smoke_battle_stability.js`；使用 `node --expose-gc` 无等待模拟 15 分钟每秒战场刷新，共执行 900 次重绘，强制回收后堆内存仅增加约 `184 KB`，未发现持续增长或渲染异常。
- `project.config.json` 已确认排除 `design/`、`docs/`、`tools/`，开发计划、视觉证据与测试脚本不会进入正式小游戏包。
- 结算层已阻断底层命中区与卡牌长按，结果面板出现时只允许点击“返回对战准备”，交互烟雾测试验证无穿透。
- 无独立插画的卡牌不再直接绘制系统 emoji；改为按卡牌 ID 稳定生成四类 Canvas 几何星纹，消除开发者工具和安卓设备上可能出现的字体方框，同时保留卡牌间视觉差异。
- 战斗规则测试增至 13 项，覆盖城墙强制攻击、突袭首回合不可攻击英雄、入场效果触发，以及 AI 突袭随从面对空场时跳过攻击；换牌烟雾测试包含“更换 N 张牌”数量文字验证。
- P4 最终候选预览包已通过开发者工具 CLI 生成：`design/review/preview-qr-p4-final.png` 与 `design/review/preview-info-p4-final.json`，总包体 `2,743,116 B`，低于当前 `4 MB` 预算。
- P5 将图鉴的卡包筛选从“所有卡包平分一行”改为单个循环筛选器；自动化使用 8 个卡包验证，未来继续增加拓展包时不会因按钮过窄而变形。
- 新增 `tools/smoke_service_interactions.js`，覆盖金币不足友好提示且不调用云端购买、邮箱一键领取、每日/每周任务一键领取、成就一键领取及多拓展包循环筛选。
- 新增 `tools/test_game_services.js`，使用内存数据库执行真实 `gameServices` 事务路径，覆盖购买、金币不足、邮件去重与幂等、每日/每周奖励、前置成就阶段及最终红点状态。
- 云端服务回归发现无可领奖励时 `redDots.tasks` 可能返回 `null`；已在 `cloudfunctions/gameServices/index.js` 固定为布尔值，避免前端红点状态类型漂移。
- 新增 `tools/smoke_service_scrolling.js`，使用 36 张卡、20 条召唤记录、12 封邮件、12 项任务和 12 项成就验证图鉴、工坊、召唤记录、邮箱、任务、成就、牌组编辑器均能实际滑动到最后一项。
- 长列表回归发现滚动后的屏幕外召唤记录会抢占顶部返回按钮；已新增裁剪命中区，并同步修复工坊与牌组编辑器中的滚动按钮，屏幕外内容不再响应点击。
- 服务页视觉审阅图已重新生成：`service-shop/mail/tasks/achievements/decks/collection/forge/history-*`，覆盖 `375 × 812` 与 `430 × 932`；图鉴和工坊占位符统一使用 Canvas 几何星纹，不依赖 emoji 字体。
- P5 预览包已通过开发者工具 CLI 生成：`design/review/preview-qr-p5-services.png` 与 `design/review/preview-info-p5-services.json`，总包体 `2,743,831 B`，低于 `4 MB` 预算。
- P5 全量回归通过：运行时、主页路由、服务交互、服务滚动、卡图加载、72 张卡配置、13 项战斗规则、对战日志、服务事务、900 次战场重绘、资源验证和包体预算全部通过。
- P6 修复卡牌插画失败后在每次前后台刷新中重复创建图片的问题；失败路径现于当前进程内只尝试一次，仍保持几何星纹降级显示，应用重启或新版本发布后会重新尝试。
- `tools/smoke_card_art_loading.js` 现覆盖共享图片只加载一次、失败图片只尝试一次以及连续 5 次 `onShow` 刷新不重复创建图片。
- 新增 `tools/smoke_navigation_stability.js`；执行 600 次服务页进入/返回后，图片对象保持 23 个不增加，强制回收后堆内存仅增长约 `419 KB`。
- 新增 `tools/smoke_device_matrix.js`；`320 × 568 @3`、`375 × 812 @2`、`430 × 932 @3` 三种设备运行通过，高 DPR 设备的 Canvas 实际尺寸继续按 DPR 2 封顶。
- P6 最终回归再次通过：服务页、对战、云端事务、长列表、图片生命周期、设备矩阵、600 次切页、900 次战场刷新、资源完整性和预算检查均无错误。
- P6 预览包已通过开发者工具 CLI 生成：`design/review/preview-qr-p6-stability.png` 与 `design/review/preview-info-p6-stability.json`，总包体 `2,743,930 B`，低于 `4 MB` 预算。
- 2026-11-18 P7 发布候选重新通过微信开发者工具 CLI 预览：`design/review/preview-qr-final2.png` 与 `preview-info-final2.json`，工具报告总包体 `2,744,554 B`，低于 `4 MB` 预算；该次命令实际返回成功并识别小游戏 AppID `wxa7b371c950f257b6`。
- 下一阶段 P7 只保留真机才能可靠判断的项目：触控手感、低端机帧率、前后台切换、自然完整对局、服务页长列表操作和至少 15 分钟实际运行；P3 仍按用户决定跳过。
- 2026-11-18 完成全部卡牌立绘接入：基础包 52 张、星骸遗响 20 张，共 72 张。`art-config.json` 继续作为显式发布白名单，构建脚本生成两个本地图片分包；初始化卡牌数据和客户端离线映射均按卡包自动派生 `artPath`。微信开发者工具真实预览成功，总包 `10,927,246 B`，其中主包 `3,297,718 B`、基础立绘分包 `5,422,436 B`、星骸立绘分包 `2,207,092 B`。详细维护流程见 `docs/CARD_ART_INTEGRATION.md`。
- 2026-11-18 图鉴交互调整为单击卡牌立即打开详情；其他需要保留单击操作的页面继续使用长按查看。详情卡启用透明外层模式，移除原创卡框外侧额外的矩形容器边框，关闭提示统一为“点击卡牌外关闭”。
- 2026-11-19 文档数量核对：素材目录迁出仓库后（`D:\kaifa\design`），工具脚本改为经 `tools/design_root.py` / `tools/design-root.js` 解析素材根；同时把仍按旧总量的当前状态表述改为 74 张（基础包 54 + 星骸遗响 20），`art-config.json` 补入 `e009`、`l004` 并重新生成两个图片分包。历史章节中的 72 张/52 张保留为阶段记录，`docs/CARD_DESIGN_PLAN.md` 顶部已加当前数据事实说明。
- 2026-11-18 修复图鉴与卡牌工坊合并后产生的视觉回退：非闪版本/闪卡版本半宽双格导致宽度低于完整卡阈值，渲染器退化为紧凑几何占位。图鉴现固定三列，非闪版本与闪卡版本各占一个完整卡位；闪卡版本始终使用对应稀有度闪卡框，不会因非闪版本存在而隐藏。视觉证据与 Goal 执行记录见 `docs/CARD_ART_INTEGRATION.md`。
