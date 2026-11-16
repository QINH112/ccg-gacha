# 星界召唤 CCG 微信小游戏

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

建议为 `drawLogs` 创建组合索引：`userId` 升序、`createdAt` 降序。日志清理还会使用 `userId` 升序、`createdAt` 升序，可按云控制台提示补充对应索引。

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

全部选择“上传并部署：云端安装依赖”。旧的 `saveGame` 云函数已经不再使用，可在线上云函数列表中删除。

## 初始化云端配置

1. 在 `initGameData` 云函数配置中添加环境变量 `INIT_SECRET`，值使用你自己的随机密钥。
2. 在云开发控制台进入 `initGameData` 的「版本与配置」→ `$LATEST` →「配置」→「高级配置」，将超时时间从默认 3 秒调整为 20 秒。
3. 重新部署函数后，在开发者工具中调用一次：

```json
{}
```

默认安全模式只补充缺失数据，不覆盖已有配置。

需要强制覆盖配置时调用：

```json
{
  "force": true,
  "secret": "与 INIT_SECRET 相同的值"
}
```

初始化成功后再编译小游戏。卡池开放状态可以在 `cardPools` 中修改，例如将 `star-remnant.enabled` 设置为 `false`；客户端仍显示该卡池，但抽卡云函数会拒绝抽取。

本次升级后需要再次调用一次 `initGameData`（默认安全模式 `{}`），创建邮件、任务集合并写入首批默认任务和旧玩家金币补偿邮件。已有玩家存档不会被覆盖。

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

## 数据安全

客户端只调用具体业务云函数，不能覆盖完整玩家存档。购买、邮件领取、任务领取、抽卡券扣除、随机卡牌、保底、签到、工坊库存检查和日志写入均在云函数内执行。

当前开发阶段首页保留“重置云端存档”入口，正式发布前应从 `game.js` 中移除该入口。
