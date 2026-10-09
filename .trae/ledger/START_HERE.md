# 🟢 接手入口 · 30 秒懂绿角犀看图

## 一句话定位
桌面图片浏览器 + 内嵌底部栏美图编辑器。零框架原生 JS 单文件 app.js（252KB）+ Rust Tauri v2 + WebView2 离线运行时。核心卖点：合并位移场变形（导出 = 预览同公式）、AI 超分 ONNX 推理失败自动降级 Lanczos、抠图高斯似然比 + 双边羽化。

## 当前版本
`0.1.0`（tauri.conf.json / Cargo.toml / manifest.webmanifest 三处一致；sw.js CACHE v41）

## 完成度（2026-10-09）

| 模块 | 状态 | 备注 |
|------|------|------|
| 图片浏览核心 | ✅ 100% | 打开/缩放/翻页/最近访问 |
| GIF 解码兜底 | ✅ 100% | lib.rs NATIVE_EXTS 去 gif，走 image crate → JPEG 第一帧（代价：失去动画） |
| 美图编辑器 | ✅ 100% | 内嵌底部栏（非弹窗），slim/deform 合并位移场 |
| AI 超分 | ✅ 100% | ONNX + ort.wasm，失败降级 Lanczos |
| 抠图 | ✅ 100% | 高斯似然比 + 双边羽化 ≤512px |
| 打包交付 | ✅ 100% | NSIS 全中文 + MSI，内嵌 WebView2 离线包；installer.nsh 三段 hook |
| 回归测试 | ✅ 100% | regression.cjs 404 项断言全绿 |
| 鸿蒙主线 | 🔄 60% | harmony/ ArkTS 原生，并行开发中 |
| 后端服务 | ⬜ 待接入 | server/mock-server.js 占位，无正式部署 |

## 已定硬规则（别再问）
- 美图面板形态：**内嵌底部栏**（`.edit-panel` border-top），禁止改弹窗/浮窗
- 批量面板形态：遮罩弹窗（`.batchMask`），覆盖主图正常
- 导航条：顶栏（6 核心按钮）+ beauty-bar（美颜内嵌底部栏）+ bottom-nav（6 功能导航）+ 底部图片条
- 变形算法：合并位移场一次性双线性采样，导出 = 预览同公式
- AI 超分：ONNX 失败必须自动降级，禁止挂起
- **GIF 兜底**：WebView2 对某些 GIF 变种解码失败，统一走 image crate → JPEG 第一帧（失去动画但保证显示）
- 版本号 6 落点必须全同，改版本 = 7 处同步 + 重构建
- sw.js CACHE 改 app.js / sw.js 必须 +1
- 测试前必须跑 sync-dist.cjs
- **NSIS 覆盖安装失效**：/S 静默安装到自定义路径时不覆盖旧 EXE，必须手动 Copy-Item + Stop-Process + 验证 Hash

## 活跃坑 top 4（踩过 ≥2 次，Iss-005 当前最高频）
1. **Iss-005** GIF 解码失败（踩 6 次）—— WebView2 对某些变种 GIF 原生解码失败；兜底到 image crate 后 IE 缓存 0 字节空 GIF 会 skip；NSIS /S 不覆盖旧 EXE 导致新修复不生效
2. **Iss-001** jsdom Uint8Array 是 window realm，`instanceof` 必须用 `window.Uint8Array`
3. **Iss-002** PowerShell 5 参数行纯 ASCII，中文注释被 GBK 误读
4. **Iss-004** NSIS 安装残留的 lnk 指向已删除目录（C:\LVJX_TEST 手动删了但 Registry 记着）

## 接手下一步
1. 读 context.md → issues.md → decisions.md → changes.md（30 秒扫完）
2. 按用户最新需求动手，改前必扫 issues.md 活跃坑
3. 新电脑需要：克隆仓库 → npm install → cargo build（看 AGENTS.md 硬约束 §3 打包必踩）
4. 环境验证：`node test/regression.cjs` 必须 404/0 全绿

---

## 台账索引
- 完整状态快照 → `context.md`
- 所有技术决策 → `decisions.md`
- 所有踩过的坑 → `issues.md`
- 所有文件变化 → `changes.md`
- 会话临时记录 → `.session.md`
- 历史周报 → `weekly/`
