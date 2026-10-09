# context.md · 当前状态快照

> 这个文件记录项目的稳定状态。完成度变了、硬规则变了、关键配置变了 → 改这里。
> 最近更新：2026-10-09 晚（交接用）

## 完成度快照（2026-10-09）

| 模块 | 百分比 | 状态 | 备注 |
|------|--------|------|------|
| 图片浏览核心 | 100% | ✅ | 打开/缩放/翻页/最近访问/格式支持(JPG/PNG/GIF/HEIC/WebP) |
| GIF 解码策略 | 100% | ✅ | 正常 GIF 原生动画 + 坏 GIF/压缩包内 → JPEG 第一帧 |
| 美图编辑器 | 100% | ✅ | 内嵌底部栏（非弹窗）；edit-panel 紧贴 bottom-nav 上方；slim/deform 合并位移场 |
| AI 超分 | 100% | ✅ | sub_pixel_cnn.onnx + ort.wasm；失败自动降级 Lanczos |
| 抠图 | 100% | ✅ | 高斯似然比 + 双边羽化 ≤512px；消除笔 Patch-Match |
| 压缩包直看 | 100% | ✅ | ZIP/CBZ/RAR/7Z 懒加载 |
| 批量加水印 | 100% | ✅ | drawWatermarkOnCanvas 纯函数 + 9 宫格 + tile -30° |
| 海报边框+emoji | 100% | ✅ | BORDER_PRESETS + emojiBar + 一键生成 |
| 打包交付 | 100% | ✅ | NSIS SimpChinese；内嵌 WebView2；installer.nsh 三段 hook |
| 回归测试 | 100% | ✅ | regression.cjs **410** 项全绿 |
| 鸿蒙主线 | 60% | 🔄 | harmony/ (ArkTS 原生)，entry/ 基本框架有，功能未对齐 |
| 后端服务 | 0% | ⬜ | server/mock-server.js 占位 |

## 版本号落点（2026-10-09 交接）

| 落点 | 当前值 | 文件 |
|------|--------|------|
| Tauri bundle.version | 0.1.0 | src-tauri/tauri.conf.json |
| Cargo package.version | 0.1.0 | src-tauri/Cargo.toml |
| manifest webmanifest version | 0.1.0 | manifest.webmanifest |
| **sw.js CACHE** | **lvjiaoxi-viewer-v52** | sw.js ← **改 app.js/styles.css 必须再 +1** |
| 显示版本 (app.js about) | v0.1.0 | app.js |
| 最近 commit | ec8f7ad | feat: 头部行与一级tab合并 |

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
- `scripts/sync-dist.cjs` — 打包前资源同步，复制 8 文件 + assets
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
