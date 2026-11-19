# 意见反馈（2026-11-20）

开发阶段收集玩家问题的入口。入口只在**邮箱页标题行右侧的小按钮**，不占主界面空间。

## 需求决策（三轮确认，Q37–Q50）

| 编号 | 问题 | 用户决定 |
| --- | --- | --- |
| Q37 | 入口放哪 | 邮箱页标题行右侧小按钮 |
| Q38 | 是否分类 | 要，5 类：BUG/故障、建议、体验问题、平衡/数值、其他 |
| Q39 | 联系方式 | 选填，不校验格式，最长 40 字 |
| Q40 | 截图 | 要，最多 1 张，压缩后再传 |
| Q41 | 提交频率 | 每人每天最多 1 条 |
| Q42 | 玩家能否看自己的历史 | 能，同一页分「写反馈 / 我的反馈」两段 |
| Q43 | 开发者在哪里看 | 只看云开发控制台的 `feedbacks` 集合 |
| Q44 | 自动附上下文 | 要：版本、机型、系统、当前页面、对局 ID |
| Q45 | 正文长度 | 5–200 字 |
| Q46 | 每日额度重置 | 北京时间自然日 0 点 |
| Q47 | 能否删除 | 能，删除要二次确认，且**不返还当天次数** |
| Q48 | 玩家是否看到处理状态 | 不显示 |
| Q49 | 提交成功后 | 留在反馈页，切到「我的反馈」并清空草稿 |
| Q50 | 截图上传失败 | 阻断提交，让玩家重试或去掉截图 |

隐私说明固定一行：「联系方式仅用于回访，不会公开；截图只用于定位问题。」提交失败不消耗当天额度（只有落库成功才计数）。

## 数据（集合 `feedbacks`）

```
userId  type  typeLabel  content  contact  imageFileID
context{version,model,system,screen,battleId}
dateKey status:"pending"  deleted:false  createdAt  updatedAt
```

- `dateKey` 是北京时间自然日（`Date.now()+8h` 的 ISO 日期切片，与签到同口径）。
- 每天额度按 `where({userId,dateKey}).count()` 判断，超限抛「今天已经提交过反馈了，明天再来吧」。
- 删除是软删（`deleted:true`），玩家侧 `mine` 只查自己的未删记录。
- 截图存 `cloud://` 文件 ID，上传路径 `feedback/<时间戳>-<随机>.jpg`，客户端压缩到宽 ≤1080、quality 0.82。
- 截图**只能从相册选**（`wx.chooseImage({ sourceType: ["album"] })`），不弹相机；超过 **10MB** 直接提示换一张（`wx.getFileSystemManager().getFileInfo` 读大小）。
- 图片尺寸用 `wx.createImage()` 读（小游戏基础库里没有 `wx.getImageInfo`，用它会报 `wx.getImageInfo is not a function`）。
- 字数不足时：计数器显示 `2/200（至少 5 字）`，提交按钮置灰并显示「还差 N 个字」。

## 保留期与自动清理

反馈**只保留 7 天**，到期由云函数定时触发器真删（数据库记录 + 云存储截图一起删），开发期不堆数据。

- `mine` 只返回 7 天内的记录（`createdAt >= now - 7 天`）。
- `cleanup` action：按 `createdAt` 升序取最多 100 条过期记录，逐条 `doc(id).remove()`，再 `cloud.deleteFile({ fileList })` 删截图；返回 `{removed, files, cutoff}`，日志打 `feedback-cleanup`。
- `cloudfunctions/feedbackService/config.json` 声明定时触发器：每天 **04:00（Asia/Shanghai）** 触发一次（cron `0 0 4 * * * *`）。事件没有 `action` 且 `Type === "Timer"` 时直接走 `cleanup`。
- 单次最多清 100 条；如果积压更多，第二天继续清。
- 文档里也给了 `{action:"cleanup"}`，可以手动在云开发控制台「云端测试」触发一次。

## 云函数

`cloudfunctions/feedbackService`（新增），`action`：

- `submit`：`type/content/contact/imageFileID/context`
- `mine`：返回 `{items, submittedToday}`，按时间倒序，最多 30 条
- `remove`：`{id}` 软删

## 测试

```bash
node tools/test_feedback_service.js   # 9 个服务端用例
node tools/test_feedback_ui.js        # 3 种尺寸的 UI 回归
node tools/render_feedback.js 375x812 # 写反馈页样张
node tools/render_feedback.js 375x812 mine  # 我的反馈样张
```

样张：`design/review/feedback-375x812.png`、`feedback-mine-375x812.png`。

## 部署顺序

1. 开发者工具里「上传并部署」`cloudfunctions/feedbackService`（首次部署前先在云开发控制台建 `feedbacks` 集合，权限选「仅创建者可读写」）。
2. 因为新增了 `config.json` 定时触发器，上传时选「上传并部署：云端安装依赖」后，右键该云函数选「上传触发器」，确认控制台里出现 `feedbackCleanup`。
2. 重新「预览」扫码，邮箱页右上角出现「意见反馈」。
