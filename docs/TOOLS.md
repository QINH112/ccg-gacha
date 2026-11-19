# 工具清单

本文件由 `py tools/gen_tools_doc.py` 生成；`py tools/validate_tool_inventory.py` 会检查它与 `tools/` 实际内容是否同步。
新加脚本后重跑生成器，不要手改本文件。

## 提交前必跑（校验与契约测试）

- `tools/smoke_balance_notice_states.js`
- `tools/smoke_battle_drag_interactions.js`
- `tools/smoke_battle_stability.js`（需要 `node --expose-gc`）
- `tools/smoke_card_art_loading.js`
- `tools/smoke_closed_pool.js`
- `tools/smoke_collection_navigation.js`
- `tools/smoke_device_matrix.js`
- `tools/smoke_game_interactions.js`
- `tools/smoke_game_runtime.js`
- `tools/smoke_home_capsule.js` —— 主界面入口与微信胶囊按钮的避让校验。
- `tools/smoke_home_routes.js`
- `tools/smoke_home_state.js`
- `tools/smoke_navigation_stability.js`（需要 `node --expose-gc`）
- `tools/smoke_pool_session_state.js`
- `tools/smoke_render_budget.js` —— 渲染预算冒烟：战斗界面是最重的画面（双侧各 7 个随从 + 10 张手牌 + 墓地 + 提示），
- `tools/smoke_service_interactions.js`
- `tools/smoke_service_scrolling.js`
- `tools/test_admin_crud.js` —— 管理端写入契约审计：adminGame 是唯一能直接改「邮件/任务/调整公告/卡牌/玩家资源」的入口，
- `tools/test_ai_behavior.js`
- `tools/test_balance_notice_accuracy.js` —— 平衡公告「前后对比」准确性校验：
- `tools/test_balance_notice_art.js`
- `tools/test_balance_notices.js`
- `tools/test_battle_engine.js`
- `tools/test_battle_persistence.js`
- `tools/test_battle_reward.js`
- `tools/test_battle_snapshot.js`
- `tools/test_card_data_integrity.js` —— 卡牌数据完整性审计（比 test_card_designs 更广的「自洽性」检查）：
- `tools/test_card_designs.js`
- `tools/test_cloud_data_compatibility.js`
- `tools/test_cloud_security.js` —— 服务端安全边界审计：
- `tools/test_collection_filters.js`
- `tools/test_collection_layout.js`
- `tools/test_deck_rules.js` —— 牌组合法性校验回归（服务端 validateDeck）：
- `tools/test_deck_save.js`
- `tools/test_draw_pity.js` —— 抽卡概率与保底逻辑审计：直接跑 cloudfunctions/drawCards/index.js 的 exports.main，
- `tools/test_draw_results_layout.js`
- `tools/test_game_services.js`
- `tools/test_legacy_account.js`
- `tools/test_loading_feedback.js`
- `tools/test_shared_constants.js` —— 跨模块共享规则的「单一事实」审计：
- `tools/test_signin_cycle.js` —— 签到奖励审计：直接跑 cloudfunctions/dailySignIn/index.js 的 exports.main，
- `tools/test_workshop_rules.js` —— 工坊（分解 / 合成 / 闪耀）服务端规则回归：
- `tools/test_workshop_ui.js`
- `tools/validate_card_art_subpackages.py`
- `tools/validate_cloudfunctions.py` —— 云函数结构校验：部署前必须全部满足，否则微信开发者工具上传会失败或运行时报错。
- `tools/validate_docs_consistency.py` —— 文档一致性校验：文档里引用的脚本必须存在、卡牌数量口径必须与代码一致、文档不能变成孤儿。
- `tools/validate_package_limits.py` —— 微信小游戏代码包体积校验（平台硬限制）。
- `tools/validate_release_readiness.js`
- `tools/validate_runtime_budget.py`
- `tools/validate_tool_inventory.py` —— 校验 docs/TOOLS.md 与 tools/ 实际脚本集合一致。
- `tools/validate_ui_overlay_rules.py` —— 校验覆盖层（遮罩）规范是否被遵守。
- `tools/validate_visual_assets.py`

## 素材构建（生成运行时资源，产物写入游戏目录）

- `tools/build_card_art_mask.py`
- `tools/build_card_art_subpackages.py`
- `tools/build_card_frame_variants.py`
- `tools/build_card_template.py` —— Build a blank (text-free, art-free) card template from the source Hearthstone card.
- `tools/build_home_button_asset.py` —— Build the "adjust announcement" home-menu button from the game's own tile.
- `tools/build_original_card_frame.py`
- `tools/build_visual_runtime_assets.py`
- `tools/clean_embedded_limited_badge.py`
- `tools/clean_white_background_assets.py`
- `tools/extract_design_assets.py`

## 视觉 QA 渲染（截图写入 D:\kaifa\design\review）

- `tools/render_balance_notice_qa.py` —— 平衡调整公告页的视觉 QA 渲染（含右侧立绘）。
- `tools/render_battle_board_visual_qa.py`
- `tools/render_battle_canvas.js`
- `tools/render_battle_visual_qa.py`
- `tools/render_card_art_visual_qa.py`
- `tools/render_card_template_visual_qa.py`
- `tools/render_collection_card_art_qa.py`
- `tools/render_home_visual_qa.py`
- `tools/render_service_visual_qa.py`

## 证据与窗口抓取（P7 真机证据）

- `tools/export_latest_imagegen.js`
- `tools/write_p7_evidence.js`

## 素材生成辅助（ComfyUI 等）

- `tools/comfy_button_icon.py` —— Generate home-button icon art with the local ComfyUI server.
- `tools/design_root.py` —— Resolve the design/ asset directory.

## 其他

- `tools/check_card_art_edges.py` —— 卡牌母版「白边 / 浅色边」检测。
- `tools/design-root.js`
- `tools/gen_tools_doc.py` —— 生成 docs/TOOLS.md：把 tools/ 下的脚本按用途分组列出来。
- `tools/p7_evidence_status.py` —— P7 真机验收进度助手。
- `tools/run_release_checklist.py` —— 把 docs/RELEASE_CHECKLIST.md 里的 bash 代码块逐条跑一遍。
- `tools/trim_card_art_edges.py` —— 裁掉卡牌母版边缘的纯色白带（非 AI，可复核）。
