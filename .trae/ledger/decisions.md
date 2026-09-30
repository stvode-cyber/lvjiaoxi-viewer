# decisions.md · 技术决策

> 已定决策不许无故推翻；真要推翻 → 新建 Dc-XXX 标注替换哪个，旧 Dc 保留。

---

#### Dc-001（2026-09-30 · 项目初始化）前端用原生 JS 单文件，零框架

- **选型**：app.js 作为全部前端逻辑的单文件（当前 252KB），不引入 Vue/React/Svelte
- **备选**：Vue 3 setup + Vite、React + TS、SvelteKit
- **原因**：单文件分发对 Tauri 嵌入最简化，零构建依赖；项目体量可控（252KB 仍在单文件维护阈值内），拆分反而增加加载时间和构建复杂度
- **影响文件**：`app.js`、`index.html`、`styles.css`
- **关联**：↔Dc-002（Tauri 嵌入策略）

#### Dc-002（2026-09-30 · 项目初始化）桌面壳选 Rust Tauri v2 + WebView2

- **选型**：Rust Tauri v2 + 系统 WebView2，不内嵌 Chromium
- **备选**：Electron（内嵌 Chromium，体积翻倍）、CEF 自编译（维护成本高）、Qt WebEngine（跨 UI 栈）
- **原因**：Tauri v2 WebView2 在 Windows 10+ 自带，离线安装包体积 <150MB vs Electron >200MB；Rust 命令层安全性高于 Node.js
- **影响文件**：`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/src/lib.rs`、`build-windows.bat`

#### Dc-003（2026-09-30 · 项目初始化）美图面板内嵌底部栏，批量面板遮罩弹窗

- **选型**：`.edit-panel` border-top 内嵌底部栏（不遮挡主图）；`.batchMask` 遮罩弹窗（覆盖主图属正常）
- **备选**：美图也用遮罩弹窗（HoneyView 风格）
- **原因**：内嵌底部栏预览所见即所得，不遮挡主图，调整参数时用户能持续看到效果；批量操作天然需要遮挡主图做任务队列展示
- **影响文件**：`index.html`、`styles.css`、`app.js` 中 edit-panel / batchMask 相关逻辑

#### Dc-004（2026-09-30 · 项目初始化）变形算法走合并位移场 + 双线性采样

- **选型**：slim / deform / 美型微调所有变形合并到同一位移场，一次性双线性采样导出和预览共用同一公式
- **备选**：每个变形独立做 warp + 合成（预览/导出公式不一致风险）
- **原因**：合并位移场架构保证导出 = 预览像素级一致，且各变形独立作用叠加不冲突
- **影响文件**：`app.js` 中 renderEditPreview / 导出逻辑 / 位移场生成函数

#### Dc-005（2026-09-30 · 项目初始化）AI 超分 ONNX 失败自动降级 Lanczos

- **选型**：优先 sub_pixel_cnn.onnx + ort.wasm；任何 ONNX 推理失败（模型加载失败、WebAssembly 不可用、超时）必须自动降级为 Lanczos 插值，禁止挂起或崩溃
- **备选**：ONNX 失败直接报错退出（不做）、失败降级到双线性/双三次
- **原因**：WebAssembly 在某些企业环境被禁用；Lanczos 是本项目已有算法（变形预览也用），降级成本为零且效果可接受
- **影响文件**：`app.js` 中 AI 超分模块、`assets/ort/ort.wasm`、`assets/sub_pixel_cnn.onnx`

#### Dc-006（2026-09-30 · 项目初始化）建立成长型台账系统

- **选型**：AGENTS.md §6 定义 `.trae/ledger/` 目录，配合 growth-journal Skill，实现启动先读、改前必扫、改完必记、结束总汇、跨 AI 交接
- **备选**：只写 CHANGELOG.md（无法覆盖动态决策和踩坑）、每会话单独 handover（碎片化）
- **原因**：台账必须是"活"的 —— 改前扫、改后记、踩坑归类加级；静态 CHANGELOG 做不到动态风险预警
- **影响文件**：`AGENTS.md`（新增 §6）、`.trae/ledger/` 全部文件
- **关联**：↔所有 Dc/Iss/Chg 条目
