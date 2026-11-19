# 发布检查单（上传体验版 / 正式版前逐条过）

> 这份是**顺序执行**的清单，每一步都有可复制的命令。自动化能查的都做成命令了，剩下标「人眼」的必须你自己看。
> 相关文档：`docs/HANDOFF.md`（当前状态）、`docs/P7_DEVICE_ACCEPTANCE_CHECKLIST.md`（真机项）、`docs/TOOLS.md`（全部工具清单）。

工作目录统一为 `D:\kaifa\astral-ccg-gacha`。

> **本清单已实测（2026-11-19）**：45 条命令按顺序全跑一遍，**全部通过，总耗时 13.7 秒**。
> 同时验证了发布审计开关：把 `game.js` 的 `DEVELOPMENT_RESET_ENABLED` 临时改成 `false` 后，
> `node tools/validate_release_readiness.js --release` 输出 `release-readiness-ok mode=release evidence=36 device=2 blockers=2`（比开发档少一个 blocker），改回 `true` 后文件哈希一致、`git status` 干净。

---

## 0. 起手

```bash
cd /d/kaifa/astral-ccg-gacha
git status --short          # 应为空；有未提交改动先决定是否提交
git log --oneline -1
```

- [ ] 工作区干净，或者你清楚这一版包含哪些未提交改动

---

## 1. 素材（只有改了卡图才需要）

母版放 `D:\kaifa\design\card-art\source\<卡包ID>\<卡牌ID>.png`，然后：

1. 卡牌 ID 写进 `D:\kaifa\design\card-art\art-config.json`
2. 执行构建：

```bash
py tools/build_card_art_subpackages.py
py tools/validate_card_art_subpackages.py
py tools/validate_visual_assets.py
py tools/validate_runtime_budget.py
```

- [ ] `validate_card_art_subpackages` 的 `cards=` 等于当前卡牌总数（现在是 74）
- [ ] **未列入 `art-config.json` 的 ID，下次构建会被从分包里删掉**——加卡时别忘了

---

## 2. 全量自动化

```bash
# 校验类
py tools/validate_visual_assets.py
py tools/validate_ui_overlay_rules.py
py tools/validate_runtime_budget.py
py tools/validate_card_art_subpackages.py
py tools/validate_cloudfunctions.py
py tools/validate_package_limits.py
py tools/validate_tool_inventory.py

# 契约 / 规则测试（两个稳定性冒烟必须带 --expose-gc）
node --expose-gc tools/test_battle_engine.js
node --expose-gc tools/test_card_data_integrity.js
node --expose-gc tools/test_shared_constants.js
node --expose-gc tools/test_draw_pity.js
node --expose-gc tools/test_signin_cycle.js
node --expose-gc tools/test_workshop_rules.js
node --expose-gc tools/test_deck_rules.js
node --expose-gc tools/test_admin_crud.js
node --expose-gc tools/test_cloud_security.js
node --expose-gc tools/test_cloud_data_compatibility.js
node --expose-gc tools/test_collection_filters.js
node --expose-gc tools/test_balance_notices.js
node --expose-gc tools/test_balance_notice_accuracy.js
node --expose-gc tools/test_card_designs.js
node --expose-gc tools/test_game_services.js
node --expose-gc tools/test_battle_persistence.js

# 界面 / 交互冒烟
node --expose-gc tools/smoke_game_runtime.js
node --expose-gc tools/smoke_game_interactions.js
node --expose-gc tools/smoke_home_routes.js
node --expose-gc tools/smoke_home_state.js
node --expose-gc tools/smoke_home_capsule.js
node --expose-gc tools/smoke_battle_drag_interactions.js
node --expose-gc tools/smoke_battle_stability.js
node --expose-gc tools/smoke_navigation_stability.js
node --expose-gc tools/smoke_device_matrix.js
node --expose-gc tools/smoke_render_budget.js
node --expose-gc tools/smoke_balance_notice_states.js
node --expose-gc tools/smoke_closed_pool.js
node --expose-gc tools/smoke_pool_session_state.js
node --expose-gc tools/smoke_service_interactions.js
node --expose-gc tools/smoke_service_scrolling.js
node --expose-gc tools/smoke_card_art_loading.js
```

- [ ] 全部通过（失败会以非 0 退出码或 `-failed` 结尾）
- [ ] 说明：`smoke_card_art_loading.js` 输出里的 `failed=1` 是**故意植的**（它塞了一张指向 `assets/cards/missing.png` 的卡，断言加载器只报一次失败且不影响其它图），不是真故障

---

## 3. 发布审计（会卡住带开发按钮上线）

```bash
node tools/validate_release_readiness.js            # 开发档：要求 DEVELOPMENT_RESET_ENABLED = true
node tools/validate_release_readiness.js --release  # 发布档：要求 = false
```

- [ ] 开发档通过（默认）
- [ ] **正式发布前**把 `game.js:32` 的 `const DEVELOPMENT_RESET_ENABLED = true;` 改成 `false`，再让 `--release` 通过
- [ ] 开发档实测输出：`release-readiness-ok mode=development evidence=36 device=2 blockers=3`
- [ ] 关掉开关后 `--release` 实测输出：`release-readiness-ok mode=release evidence=36 device=2 blockers=2`（少掉的正是开关那条 blocker）
- [ ] 现在如果直接跑 `--release`，应当只报 `release audit: DEVELOPMENT_RESET_ENABLED must be false before shipping`——这是预期，说明开关还没关

---

## 4. 包体（平台硬限制）

```bash
py tools/validate_package_limits.py
```

- [ ] 主包 ≤ 4 MB（当前 2.91 MB，73%）
- [ ] 主包 + 分包合计 ≤ 30 MB（当前 10.33 MB，34%）
- [ ] 主包接近 90% 会打印 `package-limits-warn`：新增主包资源前先跑一次

---

## 5. 云函数（改过才需要）

```bash
py tools/validate_cloudfunctions.py
```

- [ ] 输出 `cloudfunctions-validate-ok functions=10`
- [ ] 在开发者工具里按顺序「上传并部署：云端安装依赖」：`initGameData` → `gameData` → `drawCards` → `dailySignIn` → `workshop` → `drawHistory` → `gameServices` → `adminGame` → `deckService` → `battleGame`
- [ ] 线上云函数列表里如果还有旧的 `saveGame`，删掉（本地已移除）

---

## 6. 客户端 / 真机

- [ ] 开发者工具编译无报错（小程序模式）
- [ ] 点「预览」扫码，在手机上过 `docs/P7_DEVICE_ACCEPTANCE_CHECKLIST.md`
- [ ] 重点回归：换牌只响应一次、攻击敌方英雄、敌方随从进墓地后「墓」计数、战斗内出牌不再有泛光/蒙层
- [ ] 需要留证据时：`node tools/write_p7_evidence.js` 扫描 `D:\kaifa\design\review\` 下的 `manual-p7-*.png` 写进证据清单
- [ ] 看还差哪几条：`py tools/p7_evidence_status.py`（截图按 `manual-p7-<编号>-<机型>-<日期>.png` 命名，脚本会按编号归类）

---

## 7. 收尾

```bash
node tools/validate_release_readiness.js --release   # 开关关掉之后应通过
git add -A && git commit -m "发布 vX.Y"
```

- [ ] 数据迁移：`initGameData` 重复执行是幂等的，但**不要**在玩家有存档时随意改 `migrationVersion` 逻辑（见 `test_cloud_data_compatibility.js`）
- [ ] 管理端公告/邮件：发布后用 `adminGame` 的 `upsertBalanceNotice` / `upsertMail`，已发布公告不可覆盖，要更正请用新 ID

---

## 已知需要人眼确认的项（自动化到不了）

| 项 | 为什么自动化不了 |
| --- | --- |
| 工坊/图鉴布局、按钮位置 | 纯 Canvas 手绘，模拟器自动化读不到帧（`miniprogram-automator` 对小游戏 `screenshot` 直接超时） |
| 触控手感、拖拽跟手程度 | 需要真实触摸事件与设备性能 |
| 15 分钟连续对局流畅度 | 需要真机长跑 |
| 3 张素材瑕疵（`base/c008`、`base/r008`、`star-remnant/s007`） | 需 ComfyUI 重绘，按用户要求暂缓 |
| 闪卡稀有度上限（Q3） | 产品决策未定，代码里当前无上限 |
