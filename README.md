# 卤蛋传说 CCG 微信小游戏

从零开始制作的原生 Canvas 卡牌游戏。玩家数据、卡牌配置、抽卡、签到、金币商店、邮件、任务、成就、工坊和召唤记录均使用微信云开发。

## 当前功能

- 三个卡池：基础召唤池、混合召唤池、星骸遗响限定池。
- 动态卡包：基础卡牌包与星骸遗响；图鉴筛选由云数据库自动生成。
- 抽卡概率：普通 70%、稀有 20%、史诗 7.5%、传说 2.5%。
- 十连无史诗/传说时，第十张按史诗 95%、传说 5% 保底。
- 每个卡池独立 40 抽传说硬保底，进度保存云端但不在界面显示。
- 新用户获得 100 张抽卡券和 1000 金币；旧账号通过全服补偿邮件领取 1000 金币。
- 商店支持使用 100 金币购买 1 张抽卡券，单次可购买 1–99 张。
- 全服邮件支持金币、抽卡券、星尘、指定卡牌和指定稀有度随机卡牌，可单领或一键领取。
- 每日任务、每周任务和分阶段成就均由云端统计、判定和发奖。
- 七日签到：50 抽、随机史诗、10 抽、20 抽、20 抽、随机传说、50 抽；完成后每日 5 抽。
- 签到按北京时间自然日刷新，断签不重置首轮进度。
- 云端工坊：分解、普通卡制作、三张同名普通卡合成闪耀卡。
- 每位用户云端最多保存最近 2000 批召唤记录，客户端展示最近 100 批。
- 云配置加载失败时锁定数据功能，不使用本地旧配置或本地存档。

## 云数据库集合

首次运行 `initGameData` 会尝试创建并初始化：

- `cards`：卡牌定义。
- `cardSets`：卡包定义与发布顺序。
- `cardPools`：卡池定义、包含卡包及开放状态。
- `gameConfig`：概率、保底、工坊与签到规则。
- `gameSaves`：以用户 `openid` 为文档 ID 的玩家数据。
- `drawLogs`：抽卡和签到赠卡记录。
- `taskConfigs`：每日、每周、全勤和成就配置。
- `globalMails`：全服邮件配置。
- `mailClaims`：玩家邮件领取记录；邮件软删除后仍保留。

建议为 `drawLogs` 创建组合索引：`userId` 升序、`createdAt` 降序。日志清理还会使用 `userId` 升序、`createdAt` 升序，可按云控制台提示补充对应索引。`battleLogs` 需要创建 `userId` 升序、`finishedAt` 降序的组合索引，用于对战记录和最近 100 场清理。

## 云函数部署

在微信开发者工具中为 `cloudfunctions` 根目录选择环境，然后依次上传并部署：

1. `initGameData`
2. `gameData`
3. `drawCards`
4. `dailySignIn`
5. `workshop`
6. `drawHistory`
7. `gameServices`
8. `adminGame`
9. `deckService`
10. `battleGame`

全部选择“上传并部署：云端安装依赖”。旧的 `saveGame` 云函数已经不再使用，可在线上云函数列表中删除。

## 初始化云端配置

1. 在 `initGameData` 云函数配置中添加环境变量 `INIT_SECRET`，值使用你自己的随机密钥。
2. 在云开发控制台进入 `initGameData` 的「版本与配置」→ `$LATEST` →「配置」→「高级配置」，将超时时间从默认 3 秒调整为 20 秒。
3. 重新部署函数后，在开发者工具中调用一次：

```json
{}
```

默认安全模式不会重置玩家存档、收藏、牌组、邮件领取记录或对战记录。它会同步 74 张卡牌的最终费用、攻血、关键词和效果字段，因此本次卡牌改版使用 `{}` 即可生效。

需要强制覆盖配置时调用：

```json
{
  "force": true,
  "secret": "与 INIT_SECRET 相同的值"
}
```

初始化成功后再编译小游戏。卡池开放状态可以在 `cardPools` 中修改，例如将 `star-remnant.enabled` 设置为 `false`；客户端仍显示该卡池，但抽卡云函数会拒绝抽取。

本次 74 张卡牌与对战升级部署顺序：

1. 上传并部署 `battleGame`，选择“云端安装依赖”。
2. 上传并部署 `initGameData`，选择“云端安装依赖”。
3. 手动调用一次 `initGameData`，参数使用 `{}`，不要使用 `force`。
4. 返回值应包含 `"cards":74` 和 `"migratedCards":74`；若少于 74，检查 `cards` 集合是否缺少文档。
5. 在 `cards` 集合抽查 `c014` 应为 3费 3/1 冲锋，`s020` 应为 9费 8/8 且包含 `trigger-deathrattles` 效果。
6. 旧的未结束对局仍保存旧卡牌快照；测试新版前建议在对战准备界面放弃旧对局并重新开始。

已有玩家存档不会被覆盖，卡牌 ID 也没有改变，因此收藏数量和现有牌组引用会保留。

新增对战相关集合：

- `playerDecks`：每名玩家的 5 个牌组槽位。
- `aiDecks`：PVE 系统预设牌组。
- `battleGames`：玩家当前未结束或最近结束的对局状态。
- `battleLogs`：最近 100 场 PVE 对战记录。
- `balanceNotices`：卡牌平衡调整公告历史；每次发布使用新的唯一 ID。

卡牌费用、攻血和效果现在全部使用人工确认的最终设计，不再按照自动公式计算。当前平衡调整计划与验收记录位于 `docs/CARD_BALANCE_ANNOUNCEMENT_PLAN.md`。需要临时调整线上单张卡牌时可调用 `adminGame`：

```json
{
  "action": "updateCard",
  "secret": "你的 INIT_SECRET",
  "id": "c001",
  "data": {
    "cost": 1,
    "attack": 1,
    "health": 3,
    "playable": true,
    "keywords": [],
    "effects": [],
    "rulesText": ""
  }
}
```

界面中文关键词与数据字段对应：`guard` 城墙、`charge` 冲锋、`rush` 突袭、`shield` 护盾、`lifesteal` 吸血、`deathrattle` 亡语、`battlecry` 入场、`aura` 光环。对局创建后使用卡牌属性快照，线上修改只影响新对局。

## 卡牌美术与插画

原创空白卡框原稿位于 `assets/ui/cards/card-frame-original-v1.png`。游戏运行时会根据卡牌的 `rarity` 与 `shiny` 自动选择普通银白、稀有蓝、史诗紫、传说橙四种卡框及其闪卡版本，共 8 张，均位于 `assets/ui/cards/`。高分辨率 ImageGen 配色参考保存在 `design/generated/card-frames/`，运行时版本可执行以下命令重建：

```powershell
py tools/build_card_frame_variants.py
```

文件映射为 `card-frame-{common|rare|epic|legendary}-v1.png`；闪卡在稀有度后增加 `-shiny`。构建脚本始终以原稿的透明轮廓为准，因此不会改变蛋形插画窗口、费用、稀有度、效果区及攻血位置。

给卡牌增加插画时：

> 素材目录位置：`design/` 默认是**本工程同级目录** `D:\kaifa\design`（不在游戏仓库内，因此不会进包）。所有工具通过 `tools/design_root.py` / `tools/design-root.js` 解析素材根目录，顺序为 `ASTRAL_DESIGN_DIR` 环境变量 → 工程内 `design/` → 同级 `../design`。下文所有 `design/...` 路径都相对该素材根目录。

1. 将母版放进 `design/card-art/source/<卡包ID>/`，文件名必须是卡牌 ID；推荐母版尺寸 `1024 × 1216`。
2. 在 `design/card-art/art-config.json` 的对应卡包中加入准备发布的卡牌 ID。只有显式列入该文件的图片才会进入本地分包；**未列入的卡牌 ID 会在下次构建时连同已生成的 JPG 一起被删除**。
3. 执行 `py tools/build_card_art_subpackages.py`，生成 `512 × 608` JPG 运行版和分包清单。
4. `initGameData` 会根据卡牌的 `set` 和 `id` 自动生成 `artPath`，客户端也会按相同规则提供离线映射。例如基础包 `c001` 的路径为：

```json
{
  "artPath": "subpackages/card-art-base/images/c001.jpg"
}
```

分包配置位于 `game.json`。接入后执行 `py tools/validate_card_art_subpackages.py` 检查发布清单、图片尺寸、卡牌数据路径和分包配置是否一致。

5. 重新部署 `initGameData` 后使用安全参数 `{}` 同步；现有卡牌会自动迁移新的 `artPath`，也可以通过 `adminGame.updateCard` 修改单张卡。
6. 客户端会自动按需预载并裁切到蛋形卡图窗口；多张卡使用同一路径只加载一次。图片缺失或加载失败时自动回退为原来的 `element` 符号，不影响抽卡、牌组或战斗。
7. 如果未来启用卡牌种类文字，可填写 `cardTypeLabel`，例如 `"随从"`；为空时底部中央槽位保持空白。

全部 74 张卡牌的接入状态、新拓展包操作和本次真实包体记录见 `docs/CARD_ART_INTEGRATION.md`。

卡框、卡牌插画和运行时美术的检查命令：

```powershell
py tools/validate_visual_assets.py
py tools/validate_runtime_budget.py
node tools/smoke_card_art_loading.js
node tools/smoke_home_capsule.js
node tools/test_balance_notice_accuracy.js
node tools/test_workshop_rules.js
node tools/test_deck_rules.js
node tools/test_card_data_integrity.js
node tools/test_shared_constants.js
node tools/validate_release_readiness.js
```

`smoke_home_capsule.js` 把微信胶囊底边设成极端值 200，断言主界面所有可点入口都在它下方；`test_balance_notice_accuracy.js` 逐字段比对平衡公告的 `after` 与权威卡牌数据，防止「改了卡忘了改公告」；`test_card_data_integrity.js` 审计全部卡牌的关键词/规则文本/效果词汇是否自洽；`test_shared_constants.js` 钉住跨文件常量（同名上限、牌组 20 张、手牌/战场/法力/英雄血量、闪耀消耗 3、非闪合成上限 9）——这些数值同时写在 `initGameData` 的 settings、`battleGame`/`deckService`/`workshop` 云函数和 `game.js` 里，改一处漏一处会立刻失败。

不要使用 `design/card-template` 中的旧候选卡框作为线上素材；该目录仅保留早期研究过程，运行时使用的是依据用户手绘结构生成的原创卡框。

## 管理邮件和任务

`adminGame` 与 `initGameData` 共用云函数环境变量 `INIT_SECRET`。所有管理员调用都必须传入 `secret`。

创建或修改邮件：

```json
{
  "action": "upsertMail",
  "secret": "你的 INIT_SECRET",
  "data": {
    "id": "mail-example",
    "title": "活动奖励",
    "body": "感谢参与活动",
    "recipientScope": "all-during-validity",
    "expiresAt": 1795968000000,
    "rewards": [
      { "type": "coin", "amount": 500 },
      { "type": "ticket", "amount": 5 }
    ]
  }
}
```

`recipientScope` 可用 `existing-users`（发布时已有玩家）或 `all-during-validity`（有效期内注册玩家也可领取）。停用、恢复和软删除分别调用 `disableMail`、`enableMail`、`deleteMail` 并传入邮件 `id`。

创建或修改任务使用 `upsertTask`；任务类型为 `daily`、`weekly`、`daily-bonus`、`weekly-bonus` 或 `achievement`。停用、恢复和软删除分别使用 `disableTask`、`enableTask`、`deleteTask`。每日/每周修改在下一周期使用新快照，成就修改立即生效。

给指定玩家直接发放资源时使用：

```json
{
  "action": "grant",
  "secret": "你的 INIT_SECRET",
  "openid": "玩家完整 OPENID",
  "rewards": [
    { "type": "coin", "amount": 1000 },
    { "type": "randomCard", "rarity": "epic", "amount": 1 }
  ]
}
```

不要直接修改 `gameSaves` 中的资源字段，否则不会同步累计获得量和任务/成就进度。

## 发布卡牌调整公告

主界面“调整公告”由云数据库集合 `balanceNotices` 配置。玩家进入时默认打开最新启用公告，也可查看历史公告；打开最新公告详情后，已读 ID 会写入该玩家的 `gameSaves.uiState.lastReadBalanceNoticeId`，因此红点可跨设备同步。

建议采用两阶段发布：

1. 修改卡牌前调用 `adminGame.upsertBalanceNotice`，使用新公告 ID 并设置 `enabled:false`。管理员的每项调整只提交 `cardId`、计划 `after` 和 `note`；后端从当前卡牌与配置自动固化 `name`、`before`、`originalCraftCost`、`originalShinyCraftCost` 和 `artPath`。
2. 使用 `adminGame.updateCard` 更新所有目标卡牌，或部署 `initGameData` 后使用安全参数 `{}` 同步权威卡牌设计。
3. 在云数据库确认目标卡牌的费用、攻击、生命、关键词、规则文字已经正确。
4. 调用 `adminGame.enableBalanceNotice` 正式启用草稿。服务器先校验每张卡当前云端的 `cost`、`attack`、`health`、`keywords`、`rulesText` 与公告 `after` 一致，同时校验公告 `artPath` 与当前卡牌一致且符合对应卡牌 ID 的分包 JPG 路径；不一致时拒绝启用并保留草稿。校验通过后，首次启用将 `publishedAt` 与不可变 `firstEnabledAt` 写为同一个服务端时间；该时间同时作为公告排序、玩家红点和 30 天原价分解窗口起点。
5. 重新进入游戏，验证新公告红点、右侧立绘、最新详情、历史列表和实际卡牌数据一致。

发布公告示例：

```json
{
  "action": "upsertBalanceNotice",
  "secret": "你的 INIT_SECRET",
  "data": {
    "id": "balance-20261118-01",
    "title": "卡牌平衡调整",
    "summary": "三张卡牌完成数值与关键词调整",
    "version": 1,
    "publishedAt": 1794950400000,
    "enabled": false,
    "changes": [
      {
        "cardId": "c001",
        "name": "星尘学徒",
        "artPath": "subpackages/card-art-base/images/c001.jpg",
        "originalCraftCost": 40,
        "originalShinyCraftCost": 120,
        "before": { "cost": 1, "attack": 1, "health": 2, "keywords": [], "rulesText": "" },
        "after": { "cost": 1, "attack": 1, "health": 3, "keywords": [], "rulesText": "" },
        "note": "生命值提高 1 点。"
      }
    ]
  }
}
```

规则：

- 每次公告必须使用新的唯一 `id`，例如 `balance-YYYYMMDD-序号`。
- 公告必须先以 `enabled:false` 创建不可见草稿，完成卡牌更新和云端核验后再调用 `enableBalanceNotice`。
- 同一公告的 `changes[]` 中 `cardId` 必须唯一；重复卡牌会导致草稿创建失败。
- `after` 必须相对服务器读取的 `before` 至少改变费用、攻击、生命、关键词集合或规则文字中的一项；完全无变化的卡牌会导致草稿创建失败。
- 已发布公告默认不可覆盖；需要纠错时发布一个新公告，保留历史记录。
- 草稿中可预填 `publishedAt` 作为计划时间，但首次调用 `enableBalanceNotice` 时服务器会将其覆盖为实际启用的毫秒时间戳；公告按该时间降序排列，相同时间戳时按 ID 稳定排序。
- `before` 和 `after` 必须保存完整快照，不能依赖当前 `cards` 数据反推历史数值。
- 每个 `changes[]` 项必须保存调整前完整合成成本 `originalCraftCost`，以及闪卡原价 `originalShinyCraftCost`（通常为前者的 3 倍）；30 天原价分解依赖这些不可变字段。
- 每个 `changes[]` 项必须保存发布时立绘路径 `artPath`，通常直接复制目标卡牌的 `artPath`；公告详情在调整卡片右侧展示该立绘。
- 公告立绘保持原比例并居中 cover 裁剪填满右侧区域，不拉伸；使用轻微圆角和靠左渐隐，避免遮挡前后对比数据。
- 窄屏仍保留立绘，最大约占调整卡片宽度 28%；空间不足时优先缩小立绘，不能覆盖左侧文字，也不改变公告的纵向卡片结构。
- 公告立绘为纯展示，不响应点击、长按或卡牌详情跳转；立绘区域仍可用于纵向滚动公告。
- 公告始终展示基础立绘，不叠加闪卡虹彩或卡框；调整规则同时适用于非闪版本和闪卡版本。
- 每张调整卡片显示由 `firstEnabledAt + 30 天` 得出的北京时间截止时间；到期后显示“原价分解已结束”。实际返还资格始终由工坊云函数按服务端时间判定。
- 公告重新启用仍显示首次启用计算出的原截止时间，过期后不得生成新期限。
- 历史公告列表显示公告级“原价分解进行中/已结束”；每张卡的具体截止时间在详情中显示。
- 同一卡被更新公告再次调整后，旧公告详情显示“原价分解已由更新调整替代”，不再显示旧窗口仍有效。
- 历史列表保持“原价分解进行中/已结束”二态；自然到期或被替代的具体原因只在详情逐卡展示。
- 立绘加载失败时仍必须显示前后数值对比，不能阻塞公告滚动、返回或关闭。
- 临时关闭公告使用 `disableBalanceNotice` 并传入 `id`；重新开启使用 `enableBalanceNotice`。
- 公告仅在第一次启用时写入实际 `publishedAt`；关闭后重新启用必须保留该时间，不得重置或延长 30 天原价分解窗口。
- 公告关闭只影响历史公告列表中的可见性，不取消已经生效的 30 天原价分解资格。
- 工坊使用 `firstEnabledAt > 0` 判断公告是否曾正式生效；草稿的 `firstEnabledAt` 为 `0`，关闭和重新启用不修改该字段。
- 同一卡在旧窗口内再次调整时，以最新一次已启用且仍有效的公告计算 30 天窗口与原价；旧公告继续展示，但不再参与分解价格计算。
- 关闭公告不会回滚卡牌数据；卡牌回滚必须另行更新卡牌并发布新的说明公告。

存量首期公告 `balance-20261118-01` 允许执行一次受控迁移，仅补齐 `c001`、`c002`、`r009` 的 `artPath`、`originalCraftCost` 与 `originalShinyCraftCost`。迁移必须保留原 `publishedAt`、启用状态和前后快照，重复执行应保持幂等，冲突时停止而不是覆盖。该公告的原价分解窗口仍固定为北京时间 `2026-11-18 12:00:00` 至 `2026-12-18 12:00:00`，迁移不延长期限。

## 数据安全

非闪版本的 9 张限制只用于“合成此卡”按钮。抽卡、邮件、任务或其他奖励可使库存超过 9 张；超出部分必须保留并允许逐张分解，不得自动截断或回收。

闪卡版本按稀有度 3/2/2/1 的限制只用于“闪耀”操作。其他途径可使闪卡库存超过该值；超出部分必须保留、允许继续获得并逐张分解，不得自动截断或回收。

分解和闪耀不检查已保存牌组占用；即使操作后库存不足以覆盖牌组中的卡牌数量，资源操作仍允许完成。

闪耀消耗牌组所需的非闪版本后，不会自动把牌组记录替换成新获得的闪卡版本；相关牌组将因版本库存不足而无法开始新对战。

分解按钮点击后直接执行，不显示二次确认弹窗；即使会导致牌组库存不足，也不显示额外警告。

“合成此卡”和“闪耀”同样直接执行，不显示二次确认；成功后立即刷新云端返回的库存与星尘，失败时显示具体原因。

库存不足的已保存牌组不能开始新对战；开始前必须提示缺少的卡牌名称、版本和数量。已经开始的对局继续使用原快照，不受后续库存变化影响。

库存不足的旧牌组可以原样保留并退出；再次保存时必须重新通过库存与稀有度携带上限校验。失败时拒绝保存并列出缺卡，不自动删卡或替换版本。

牌组库存按版本分别校验：非闪版本与闪卡版本不能互相替代；同一卡的两个版本合计仍受普通/稀有/史诗/传说稀有度 3/2/2/1 携带上限约束。

客户端只调用具体业务云函数，不能覆盖完整玩家存档。购买、邮件领取、任务领取、抽卡券扣除、随机卡牌、保底、签到、工坊库存检查和日志写入均在云函数内执行。

当前开发阶段首页保留“重置云端存档”入口，正式发布前应从 `game.js` 中移除该入口。

## 窗口级截图（P7 证据）

`tools/capture_devtools_window.ps1` 抓取微信开发者工具主窗口（含模拟器画面），默认输出到 `D:\kaifa\design\review\`：

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/capture_devtools_window.ps1 -OutFile "D:\kaifa\design\review\p7-simulator-home.png"
```

小游戏没有 page 体系，`miniprogram-automator` 的 `systemInfo`/`screenshot` 对小游戏项目会超时，因此模拟器证据只能走窗口级截图；脚本需 UTF-8 BOM 才能在 Windows PowerShell 5.1 下正确解析中文参数。

## 包体体积的权威口径（2026-11-19）

包体相关的数字一律以工具输出为准，文档其它位置出现的其它数字视为历史记录：

| 指标 | 权威来源 | 当前值 |
| --- | --- | --- |
| 运行时美术资源 | `py tools/validate_runtime_budget.py` 的 `art=` | `2,363,116 B`（上限 `2,500,000 B`） |
| 卡牌立绘双分包 | `py tools/validate_card_art_subpackages.py` 的 `bytes=` | `7,775,214 B`（74 张：基础 54 + 星骸 20） |

- 微信小游戏总包上限 30MB，当前主包 + 双分包合计远低于上限。
- `tools/validate_runtime_budget.py` 里的 `previewTotal` / `main` 在有分包时可能显示 0，这是脚本的统计口径问题，不代表包体为空；判断包体请用上表两个数字。

## 当前状态

交接说明与待办见 `docs/HANDOFF.md`；产品决策记录见 `docs/DECISION_LOG.md`。
