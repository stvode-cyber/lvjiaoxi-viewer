# context.md · 当前状态快照

> 这个文件记录项目的稳定状态。完成度变了、硬规则变了、关键配置变了 → 改这里。

## 完成度快照（2026-10-09）

| 模块 | 百分比 | 状态 | 备注 |
|------|--------|------|------|
| 图片浏览核心 | 100% | ✅ | 打开/缩放/翻页/最近访问/格式支持(JPG/PNG/GIF/HEIC/WebP/GIF兜底) |
| GIF 解码兜底 | 100% | ✅ | lib.rs NATIVE_EXTS 去 gif，统一走 image crate → JPEG 第一帧（失去动画但保证显示） |
| 美图编辑器 | 100% | ✅ | 内嵌底部栏形态；slim/deform 合并位移场；美型微调(大眼/小脸/美牙/丰唇/瘦鼻) |
| AI 超分 | 100% | ✅ | sub_pixel_cnn.onnx + ort.wasm；失败自动降级 Lanczos |
| 抠图 | 100% | ✅ | 高斯似然比 + 双边滤波羽化；≤512px 工作分辨率 |
| 打包交付 | 100% | ✅ | NSIS 全中文(SimpChinese) + MSI；内嵌 WebView2 离线包；installer.nsh 三段 hook |
| 回归测试 | 100% | ✅ | test/regression.cjs 404 项断言全绿；beauty.cjs / edit-crop.cjs / photo.cjs 等专项 |
| 鸿蒙主线 | 60% | 🔄 | harmony/ (ArkTS 原生)，entry/ 基本框架有，功能未对齐 |
| 后端服务 | 0% | ⬜ | server/mock-server.js 占位，无正式部署 |

## 版本号落点（2026-10-09）

| 落点 | 当前值 | 文件 |
|------|--------|------|
| Tauri bundle.version | 0.1.0 | src-tauri/tauri.conf.json |
| Cargo package.version | 0.1.0 | src-tauri/Cargo.toml |
| manifest webmanifest version | 0.1.0 | manifest.webmanifest |
| sw.js CACHE | lvjiaoxi-viewer-v45 | sw.js |
| 显示版本 (app.js about) | v0.1.0 | app.js 行 4960 |

## 已定硬规则清单

1. 美图面板 = 内嵌底部栏，批量面板 = 遮罩弹窗
2. 变形算法 = 合并位移场一次性双线性采样
3. AI 超分 = ONNX 失败自动降级 Lanczos
4. **GIF 原生优先**（Dc-008）= 正常 GIF WebView2 原生解码播动画；解码失败 img.onerror → decode_fallback → image crate → JPEG 第一帧；压缩包内 GIF 仍静态第一帧
5. 版本号 6 落点 + sw.js CACHE 必须同步
6. 打包前必须跑 node scripts/sync-dist.cjs
7. PowerShell 5 参数行纯 ASCII
8. jsdom Uint8Array 用 window realm 检测
9. 回归测试前显式设控件值防 document 残留
10. **切图编辑态归零**（Dc-009）= filters/slim/deform/crop/ops/matting/texts/mosaic/eraser/editUndo/editRedo/logoWm 切图全部重置；视图级参数（rotation/flip/mode）由 rememberRotation 等设置决定
11. **发版前本机验证铁律**（AGENTS 交付流程 step 7-10）= 每次打包后必须：本机静默安装 → 验证版本号 → 启动冒烟 → 目视核心场景 → 卸载临时路径；全部 OK 再推整体升级
12. **edit-pane 闭合检查**（Iss-006 预防）= 写 edit-pane HTML 后必须确认所有 section 被对应 data-pane 容器包裹，不能裸在 edit-body 直接子级；`.edit-pane { display:none }` 不会隐藏裸 section

## 关键路径（不许乱改的）

- `app.js` — 单文件前端 252KB，禁止拆分除非有明确重构决策
- `src-tauri/src/lib.rs` — Tauri 命令层，文件/剪贴板/壁纸/load_paths 核心
- `src-tauri/installer.nsh` — NSIS 自定义 hook：PreInstall 自动卸载旧版；PostInstall 注册右键菜单；PostUnInstall 清理
- `test/regression.cjs` — 回归测试入口，每次改代码后必须全绿
- `scripts/sync-dist.cjs` — 打包前资源同步，复制 8 文件 + assets
- `.trae/ledger/` — 本台账目录，AGENTS.md §6 定义的结构

## Tauri 命令层（lib.rs .invoke_handler 注册的命令）

| 命令 | 行号 | 用途 |
|------|------|------|
| load_paths | 373 | 文件夹/单文件 → collect_files → 解码/透传 → data URL 条目 |
| first_thumb | 452 | 最近打开缩略图（仅取第一张） |
| set_wallpaper | - | 设置桌面壁纸 |
| reveal_in_explorer | - | 在资源管理器中显示 |
| copy_image | - | 复制图片到剪贴板 |
| get_pending_paths | 91 | 前端启动后拉取双击关联文件路径（单实例转发） |
| flog | 368 | 前端 debug log → %TEMP%/lvjx-debug.log |
| list_archive_entries | 112 | ZIP/CBZ 压缩包内图片条目列表（懒加载） |
| read_archive_entry | 141 | 按需读取压缩包内单张图片 → data URL |
| decode_fallback | 490 | 前端解码兜底（GIF 等原生透传失败 → image crate → JPEG 第一帧，Dc-008 方案 B） |
