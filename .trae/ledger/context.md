# context.md · 当前状态快照

> 这个文件记录项目的稳定状态。完成度变了、硬规则变了、关键配置变了 → 改这里。

## 完成度快照（2026-10-08）

| 模块 | 百分比 | 状态 | 备注 |
|------|--------|------|------|
| 图片浏览核心 | 100% | ✅ | 打开/缩放/翻页/最近访问/格式支持(JPG/PNG/GIF/HEIC/WebP) |
| 美图编辑器 | 100% | ✅ | 内嵌底部栏形态；slim/deform 合并位移场；美型微调(大眼/小脸/美牙/丰唇/瘦鼻) |
| AI 超分 | 100% | ✅ | sub_pixel_cnn.onnx + ort.wasm；失败自动降级 Lanczos |
| 抠图 | 100% | ✅ | 高斯似然比 + 双边滤波羽化；≤512px 工作分辨率 |
| 打包交付 | 100% | ✅ | NSIS 全中文(SimpChinese) + MSI；内嵌 WebView2 离线安装包 |
| 回归测试 | 100% | ✅ | test/regression.cjs 224 项断言；beauty.cjs / edit-crop.cjs / photo.cjs 等专项 |
| 鸿蒙主线 | 60% | 🔄 | harmony/ (ArkTS 原生)，entry/ 基本框架有，功能未对齐 |
| 后端服务 | 0% | ⬜ | server/mock-server.js 占位，无正式部署 |

## 版本号落点（2026-09-30）

| 落点 | 当前值 | 文件 |
|------|--------|------|
| Tauri bundle.version | 0.1.0 | src-tauri/tauri.conf.json |
| Cargo package.version | 0.1.0 | src-tauri/Cargo.toml |
| manifest webmanifest version | 0.1.0 | manifest.webmanifest |
| sw.js CACHE | lvjiaoxi-viewer-v41 | sw.js |
| 显示版本 (app.js about) | v0.1.0 | app.js 行 4960 |

## 已定硬规则清单

1. 美图面板 = 内嵌底部栏，批量面板 = 遮罩弹窗
2. 变形算法 = 合并位移场一次性双线性采样
3. AI 超分 = ONNX 失败自动降级 Lanczos
4. 版本号 6 落点 + sw.js CACHE 必须同步
5. 打包前必须跑 node scripts/sync-dist.cjs
6. PowerShell 5 参数行纯 ASCII
7. jsdom Uint8Array 用 window realm 检测
8. 回归测试前显式设控件值防 document 残留

## 关键路径（不许乱改的）

- `app.js` — 单文件前端 252KB，禁止拆分除非有明确重构决策
- `src-tauri/src/lib.rs` — Tauri 命令层，文件/剪贴板/壁纸接口
- `test/regression.cjs` — 回归测试入口，每次改代码后必须全绿
- `.trae/ledger/` — 本台账目录，AGENTS.md §6 定义的结构
