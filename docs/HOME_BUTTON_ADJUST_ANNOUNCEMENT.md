# 主界面「调整公告」按键设计稿

> 状态：美术素材与运行逻辑均已接入，自动化验证完成
> 日期：2026-11-18
> 关联计划：`docs/CARD_BALANCE_ANNOUNCEMENT_PLAN.md`

## 1. 交付内容

| 文件 | 用途 |
| --- | --- |
| `assets/ui/home/adjustAnnouncement.png` | 运行时素材，152 × 141 px，带透明通道 |
| `design/generated/home-button-adjust-announcement/preview.png` | 设计说明图（规格、色板、并排对比） |
| `design/generated/home-button-adjust-announcement/adjustAnnouncement@4x.png` | 4 倍预览母版 |
| `design/generated/home-button-adjust-announcement/comfyui-icon-raw.png` | ComfyUI 原始图标输出（绿色幕布） |
| `design/generated/home-button-adjust-announcement/comfyui-icon-meta.json` | 生成参数（模型、采样器、种子、提示词） |
| `design/generated/home-button-adjust-announcement/button-spec.json` | 合成参数与几何信息 |

## 2. 设计规格

- 画布：152 × 141 px，与「每日签到」「卡牌图鉴」等四字按钮同尺寸。
- 底板：直接复用线上「每日签到」圆角玻璃底板；仅逐行补绘图标与文字区域，外圈描边、高光、投影保持原像素。
- 图标：奶油白 + 暖金 + 靛蓝三色的 3D 玩具喇叭，绿色幕布抠图后缩放至 98 × 80 px，附带柔和接触阴影。
- 字标：「调整公告」四字，Noto Sans SC Medium 80 px 行宽，白色字面 + 深紫偏移描边，底部轻微冷色渐变，匹配现有按钮的贴纸立体感。
- 色板：`#4E5796` `#6671BC` `#F4E7CC` `#D9A64F` `#2C3670` `#FFFFFF`。

## 3. ComfyUI 生成流程

1. 本地 ComfyUI（`D:\ComfyUI`，SDXL 1.0）以 1024 × 1024、32 步、dpmpp_2m + karras、CFG 7.0 生成图标概念，共 20 余张候选。
2. 选用绿色幕布版本（便于抠图），按「绿色主导」阈值抠图，保留最大连通块，去掉悬浮道具与投影。
3. 用「每日签到」按钮做结构底：逐行读取左右边带的颜色插值补绘内部，保留原始外圈玻璃质感。
4. 合成图标（缩放、轻微提饱和、冷色暗部、接触阴影）与文字（4 倍渲染后降采样）。
5. 输出 152 × 141 PNG，并用高斯模糊羽化边缘，避免与底板接缝。

完整命令：

```powershell
D:\ComfyUI-venv\Scripts\python.exe tools\comfy_button_icon.py --concept megaphone-toy2 --style green --seeds 1501,1502 --size 896 --out _gen\raw
D:\ComfyUI-venv\Scripts\python.exe tools\build_home_button_asset.py --icon _gen\raw\megaphone-toy2_1501.png --label 调整公告 --font "C:/Windows/Fonts/Noto Sans SC Medium (TrueType).otf" --label-width 80 --label-center 76,108.5 --label-outline 0.6 --label-stroke 0.2 --label-tracking 1.8 --icon-width 98 --icon-height 80 --icon-center 76,49 --variant final --out _gen\final
```

`tools/comfy_button_icon.py` 需要先启动本机 ComfyUI（`D:\ComfyUI\启动ComfyUI.bat`），默认地址 `http://127.0.0.1:8188`。

## 4. `game.js` 接入结果

运行时已完成以下接入：

1. `HOME_ART_PATHS` 已增加 `adjustAnnouncement:"assets/ui/home/adjustAnnouncement.png"`。
2. `HOME_ART_RECTS` 已增加公告按钮区域，并通过 320 × 568、375 × 812、393 × 852、430 × 932 四种尺寸预览验证布局。
3. `HOME_MENU_ART` 已增加 `["adjustAnnouncement","adjustAnnouncement"]`。
4. 点击后进入公告列表/详情（数据结构见 `docs/CARD_BALANCE_ANNOUNCEMENT_PLAN.md` 第 4 节）。
5. 入口始终显示；无启用公告时点击提示“暂无卡牌调整公告”。
6. 入口需要新公告红点；玩家打开最新公告详情并成功保存云端已读状态后红点消失，只查看列表或旧公告不清除红点。

按钮本身已包含文字与图标，无需在 Canvas 中重复绘制标题，直接按矩形绘制即可。

## 5. 设计取舍

- 用「喇叭」表达“公告”，颜色沿用现有按钮的奶油 + 暖金 + 靛蓝，未引入新的主色。
- 文字使用系统字体而非 AI 生成，保证「调整公告」四字准确、可读、可复用。
- 底板复用现有按钮，避免新按钮与旧按钮在圆角、描边、光泽上出现风格断层。
