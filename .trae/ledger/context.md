﻿> 📂 角色索引：▶ 必读：改代码前扫版本号落点；跳过：纯台账编辑时
# context.md · 当前状态快照

> 这个文件记录项目的稳定状态。完成度变了、硬规则变了、关键配置变了 → 改这里。
> 最近更新：2026-10-27（v2 Phase 0 Android 脚手架跑通 + Iss-016 新坑 + Chg-V1）

## 完成度快照（2026-10-17 晚间）

| 模块 | 百分比 | 状态 | 备注 |
|------|--------|------|------|
| **模块化拆分** | **95%** | 🔄 | **6/6 子文件落地 + 渐进替换 3/4 批**：exif.js + archive.js + render.js + init.js + edit.js + batch.js 全部独立 IIFE；渐进替换裸调用→window.__API__.xxx() 已完成 archive(21)+render(115)+init(231)=367 处，剩 edit/batch ~60+（第4批）；三重保险保留（函数声明 + Object.assign 注入 + shim eval 层）；regression 467/0 全绿 |
| 图片浏览核心 | 100% | ✅ | 打开/缩放/翻页/最近访问/格式支持(JPG/PNG/GIF/HEIC/WebP) |
| GIF 解码策略 | 100% | ✅ | 正常 GIF 原生动画 + 坏 GIF decode_fallback 兜底；**压缩包内 GIF Rust 端直接 JPEG 第一帧**（Chg-022 彻底修复） |
| 美图编辑器 | 100% | ✅ | 内嵌底部栏（非弹窗）；edit-panel 紧贴 bottom-nav 上方；slim/deform 合并位移场 |
| AI 超分 | 100% | ✅ | sub_pixel_cnn.onnx + ort.wasm；失败自动降级 Lanczos |
| 抠图 | 100% | ✅ | 高斯似然比 + 双边羽化 ≤512px；消除笔 Patch-Match |
| 压缩包直看 | 100% | ✅ | ZIP/CBZ/RAR/7Z 懒加载 |
| 批量加水印 | 100% | ✅ | drawWatermarkOnCanvas 纯函数 + 9 宫格 + tile -30° |
| 海报边框+emoji | 100% | ✅ | BORDER_PRESETS + emojiBar + 一键生成 |
| 打包交付 | 100% | ✅ | NSIS SimpChinese；内嵌 WebView2；installer.nsh 三段 hook |
| 回归测试 | 100% | ✅ | regression.cjs **467** 项全绿（今天 +53：深色主题 +2 / EXIF GPS +1 / SD Prompt +24 / 双页漫画 +19 / 递归穿透已有 +其他） |
| **启动性能** | **100%** | ✅ | **rayon 并行 + IPC 懒加载**：load_paths 53 张 1500ms→37ms；冷启动 setup→showImage 5730ms→809ms（7x 提升） |
| **缩略图渲染** | **100%** | ✅ | **虚拟滚动窗口 ±3**：只渲染当前选中前后各 3 张最多 7 张 DOM，thumbUrl 永久缓存复用 |
| **竞品功能（P2 S/A 级 6/6 全落地）** | **100%** | ✅ | S1 长图滚轮翻页 + S2 深色主题 + S3 EXIF GPS 高德链接 + A1 SD Prompt 查看 + A2 CBR/CBZ 双页漫画 + A3 递归穿透文件夹（全部零新依赖，5/6 零 Rust 改动） |
| 鸿蒙主线 | — | ⏸ 暂缓 | 已移除 harmony/ + iOS 图标，后续再回归 |
| **Android 主线** | **55%** | 🔄 | **完整构建管线闭环**：tauri android build --apk -t aarch64 armv7 一次跑通；Universal APK 35.38MB 双架构；JNI 20 符号齐全；待 Android intent 真机测试（从 Gallery/Files 点图打开 content://）+ SAF Picker 完整授权 |
| **v2 Phase 0** | **90%** | 🔄 | **独立项目 lvjiaoxi-viewer-v2/（不碰 v1）**：eframe 0.37 + wgpu + egui + android-activity 0.6；cargo-apk patch CATEGORY_DEFAULT；adb install --user 0 -r；android_main 阻塞循环防黑屏（Iss-017）；中文字体 NotoSansCJK-Regular.ttc；Vulkan Adreno GPU 初始化成功；**差最后一步**：恢复 image loading 显示第一张 JPG |
| 后端服务 | 0% | ⬜ | server/mock-server.js 占位 |

## 版本号落点（2026-10-09 交接）

| 落点 | 当前值 | 文件 |
|------|--------|------|
| Tauri bundle.version | 0.1.0 | src-tauri/tauri.conf.json |
| Cargo package.version | 0.1.0 | src-tauri/Cargo.toml |
| manifest webmanifest version | 0.1.0 | manifest.webmanifest |
| **sw.js CACHE** | **lvjiaoxi-viewer-v83** | sw.js ← **改 app.js/styles.js/js/*.js 必须再 +1** |
| 显示版本 (app.js about) | v0.1.0 | app.js |
| 最近 build | 2026-10-19 18:37 | P-20261019-005 sync-dist 补 js/ + CACHE v83；Setup.exe 212.94MB / EXE 16.08MB |

## UI 布局快照（2026-10-09 Dc-011 定稿）

```
┌─────────────────────────────────┐
│ 顶栏 toolbar (6 按钮)           │ 打开 │ 上 │ 下 │ 幻灯 │ 🎨美图 │ ⚒设置
├─────────────────────────────────┤
│                                 │
│   app-row 主图 viewer          │ ← 不受 edit-panel 挤压（body flex column）
│                                 │
├─────────────────────────────────┤
│ beauty-bar (hidden)             │ ← 默认隐藏，所有控件已移进 edit-panel
├─────────────────────────────────┤
│ edit-panel（展开时显示在此）    │ ← DOM 在 bottom-nav 前，紧贴导航条上方
│ ┌─────────────────────────────┐ │
│ │美颜│风格配方│特效│高级│导出  │ │ ← 顶部横向 tab bar（已与 head 合并）
│ │                  文件⏱✕     │ │ ← 文件名 margin-left:auto 推右
│ ├─────────────────────────────┤ │
│ │ 二级 sub-tab（按一级 tab）   │ │
│ ├─────────────────────────────┤ │
│ │ 内容区（max-height 26vh）    │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ bottom-nav (6 按钮)             │ 复制 │ 幻灯 │ 批量 │ 最近 │ ⚒设置 │ 🎨美图
├─────────────────────────────────┤
│ 底部图片条（缩略图 + 搜索）    │
└─────────────────────────────────┘
```

### bottom-nav 当前按钮（2026-10-09 替换）
1. btnCopy（复制图片）
2. btnSlide（幻灯片）
3. btnBatch（批量处理）
4. btnRecent（最近访问）
5. btnSettings（设置）
6. **btnBeauty（美图）** ← 替换了原来的 accountBtn（云账户）

### 关键约束
- bottom-nav 硬限 6 按钮（AGENTS §1 "不可随意增删按钮"）
- beauty-bar 默认 hidden，HTML 保留（app.js 有独立事件绑定依赖其 id）
- edit-panel 必须是 body flex column 内嵌成员（position:fixed 方案被否决，Chg-015）
- edit-panel border-top 硬约束（Dc-003）

## 已定硬规则清单

1. 美图面板 = 内嵌底部栏（border-top），批量面板 = 遮罩弹窗
2. 变形算法 = 合并位移场一次性双线性采样
3. AI 超分 = ONNX 失败自动降级 Lanczos
4. **GIF 原生优先**（Dc-008）= 正常 GIF WebView2 原生播动画；坏 GIF → decode_fallback → JPEG 第一帧；压缩包内 GIF 静态
5. 版本号 6 落点 + sw.js CACHE 必须同步
6. 打包前必须跑 node scripts/sync-dist.cjs
7. PowerShell 5 参数行纯 ASCII
8. jsdom Uint8Array 用 window realm 检测
9. 回归测试前显式设控件值防 document 残留
10. **切图编辑态归零**（Dc-009）= filters/slim/deform/crop/ops/matting/texts/mosaic/eraser/editUndo/editRedo/logoWm 切图全部重置；视图级参数（rotation/flip/mode）由 rememberRotation 决定
11. **发版前本机验证铁律**（AGENTS step 7-10）= 静默安装 → 版本号 → 启动冒烟 → 目视核心场景 → 卸载临时路径
12. **edit-pane 闭合检查**（Iss-006 预防）= section 必须被 data-pane 容器包裹
13. **导航条不可增删按钮**（AGENTS §1）= bottom-nav 硬限 6 个，只能替换不能增删

## 关键路径（不许乱改的）

- `app.js` — 单文件前端 252KB，禁止拆分除非有明确重构决策
- `src-tauri/src/lib.rs` — Tauri 命令层，文件/剪贴板/壁纸/load_paths/压缩包
- `src-tauri/installer.nsh` — NSIS 自定义 hook：PreInstall 定点删 3 应用文件（不是 RMDir /r）；PostInstall 注册右键菜单；PostUnInstall 清理
- `test/regression.cjs` — 回归测试入口，每次改代码后必须全绿
- `scripts/sync-dist.cjs` — 打包前资源同步，复制 8 文件 + assets/ + **js/**（⚠️ index.html 引用变更后必须同步更新，见 Iss-015）
- `.trae/ledger/` — 本台账目录

## Tauri 命令层（lib.rs .invoke_handler 注册的命令）

| 命令 | 行号 | 用途 |
|------|------|------|
| load_paths | 373 | 文件夹/单文件 → collect_files → 解码/透传 → data URL 条目 |
| first_thumb | 452 | 最近打开缩略图（仅取第一张） |
| set_wallpaper | - | 设置桌面壁纸（4 模式：fit/fill/center/tile） |
| reveal_in_explorer | - | 在资源管理器中显示 |
| copy_image | - | 复制图片到剪贴板 |
| get_pending_paths | 91 | 前端启动后拉取双击关联文件路径（单实例转发） |
| flog | 368 | 前端 debug log → %TEMP%/lvjx-debug.log |
| list_archive_entries | 112 | ZIP/CBZ 压缩包内图片条目列表（懒加载） |
| read_archive_entry | 141 | 按需读取压缩包内单张图片 → data URL |
| decode_fallback | 490 | 前端解码兜底（GIF 等原生透传失败 → image crate → JPEG 第一帧） |
| get_image_data | ~410 | IPC 懒加载单张拉（Chg-035：load_paths 只传元信息，前端按需调此命令拿 data URL） |
