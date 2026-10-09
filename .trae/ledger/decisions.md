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

#### Dc-007（2026-10-08 · GIF 解码策略）GIF 走 image crate 解码兜底 → JPEG 第一帧

- **选型**：gif 从 NATIVE_EXTS 移除，load_paths / read_archive_entry / resolve_image_url 三处统一走 image::ImageReader 解码 → JPEG data URL
- **备选**：
  - A) 保留 WebView2 原生透传（gif 在 NATIVE_EXTS 里），但某些变种/损坏 GIF 会触发 img.onerror → "无法解码"
  - B) JS 侧用 gif.js 解码成 canvas 帧播放动画（代价：前端膨胀 + 性能）
  - C) 当前方案：image crate → JPEG 第一帧（失去动画但保证显示）
- **原因**：lvjx-debug.log 5 张 GIF 全 CATCH broken，urlHead=data:image/gif;base64, → Rust 透传正确但 WebView2 解码端挂；image crate 是项目已有依赖（lib.rs 里 TIFF/TGA 已经在用），加 gif feature 零额外成本；静态第一帧比"无法解码"强
- **影响文件**：`src-tauri/src/lib.rs` NATIVE_EXTS 行 206、三处 matches! 扩展行 172/419/479；`test/regression.cjs` 行 1203 源码断言
- **代价**：GIF 失去动画帧（image crate gif 解码只取第一帧）
- **升级路径**：未来如需保留动画 → Dc-008 gif.js 方案（见 weekly/2026-10-09.md 下周待办）
- **关联**：↔Iss-005（GIF 踩 6 次）

#### Dc-008（2026-10-09 · GIF 动画方案）✅ 已拍板并实施：原生优先 + 解码失败兜底（替换 Dc-007「全走 JPEG」策略，实施批次见 Chg-011）

- **背景**：weekly 待办分析 GIF 动画找回方案；Dc-007 现状 = 全部 GIF 走 image crate → JPEG 第一帧（失去动画）
- **摸底事实**：
  1. assets/gif.js 是**编码器**（批量 tab「制作 GIF」在用），不能解码播放；JS 解码需 gifuct-js / omggif（约 10-20KB），weekly 原文「用 gif.js 解码」不成立
  2. WebView2 是 Chromium 内核，正常 GIF 原生能解码且能播动画；当时踩坑的 5 张全是 IE 缓存 0 字节/截断坏文件（10-08 诊断已确认）
  3. 前端条目带原始路径（app.js L87 `e.path`），具备「失败后找 Rust 兜底」条件
- **方案对比**：A 现状全 JPEG（零改动但动画全丢）/ **B 原生优先 + onerror 兜底**（lib.rs 恢复 gif 透传 + 新增 decode_fallback 命令 ~30 行，app.js img.onerror 换 JPEG ~15 行；正常 GIF 满血动画，坏 GIF 降级静态=现状效果）/ C JS 解码器逐帧 canvas（大改动 + 大 GIF 内存风险，仅在将来要做 GIF 逐帧编辑时考虑）
- **建议**：方案 B，设计哲学与「AI 超分失败自动降级 Lanczos」一致
- **状态**：✅ 用户已拍板「按方案 B 执行」，2026-10-09 晚实施完成（Chg-011）；本条替换 Dc-007 的「全走 JPEG」策略
- **关联**：↔Dc-007 ↔Iss-005

#### Dc-009（2026-10-09 · 切图行为决策）每张图独立编辑态，切图全部编辑参数归零（替换旧行为：滤镜跨图继承）

- **选型**：showImage 入口统一重置所有编辑态：filters / slim / deform / crop / ops / matting / texts / mosaic / eraser / slimMode / deformMode / editUndo / editRedo / logoWm
- **替换旧行为**：旧版 L767 注释明确写「滤镜按既有行为在切图时保留」，导致用户给 A 图调的亮度 130 → 切到 B 图、C 图都带 brightness:130，体验反直觉
- **保留不动**：视图级参数（rotation/flipH/flipV/mode/scale）按既有行为：rotation 由 rememberRotation 设置控制，mode 默认 defaultZoom
- **UI 同步**：重置后立即 syncFilterUI() / syncBeautyBar() / updateSlimUI() / updateDeformUI() / updateOpsUI()，finish 里调 renderEditPreview 用新图重绘编辑预览 canvas
- **原因**：参考 HoneyView / FastStone / 美图秀秀 —— 每张图片打开都是干净初始态，编辑只对当前图生效；历史记录（editUndo）跟图绑定不跨图
- **隐藏修复**：切到带 EXIF 旋转的新图时，rotation 可能残留上一张的值导致方向错
- **影响文件**：`app.js` showImage（主改动）、sw.js CACHE +1
- **验证**：regression 410/0 全绿（Iss-003 活跃坑未触发——regression 大部分是源码断言而非运行时控件值断言）
- **关联**：↔Dc-003（内嵌底栏形态） ↔Iss-003（jsdom document 残留值，本次未踩但改控件值的测试需警惕）

#### Dc-010（2026-10-09 · 编辑面板交互重构）editMask 内部采用「一级 tab + 二级 sub-tab」分层导航，不靠滚动堆 section

- **选型**：每个 edit-pane 内部加 `.edit-sub-tabs > .edit-sub-panes > .edit-sub-pane`，sub-tab 点击只切对应内容区，不滚到底
- **替换旧行为**：
  1. 旧版 edit-body overflow-y auto，每个 pane 5-10 个 section 全堆一个滚动体里 → 用户要滚到底才能找到"消除笔"这种工具，体验反直觉
  2. decor pane 有 HTML bug：`data-pane="decor"` 是空 div（L594 就闭合），边框/贴纸/海报/证件照/Logo/文字/马赛克/消除笔 11 个 section 裸在 `.edit-body` 直接子级 → 切任何一级 tab 它们都**永远显示**（`.edit-pane` 只切自己的 active，裸 section 不受控）
- **新 sub-tab 分组**（3 个 pane 加导航，2 个内容少保持原样）：
  | Pane | Sub-tabs |
  |---|---|
  | beauty（美颜） | 美型&调色（美颜+滤镜完整参数+色调分离） / 照片调整（自动增强） |
  | recipe（风格配方） | 不变（2 个 section 本来就少） |
  | decor（特效） | 边框/贴纸 / 海报排版（海报标题+证件照） / 水印/笔刷（Logo+文字+马赛克+消除笔） |
  | pro（高级） | 人像精修（瘦脸瘦腹+美型微调+抠图） / 高级处理（OpenCV+AI放大+裁剪） |
  | export（导出） | 不变（1 个 section） |
- **CSS**：`.edit-pane { display: flex; }` 改 flex 容器（active 时 flex），新增 7 条 sub-tab 样式规则
- **JS**：$$('.edit-sub-tab') 点击绑定（每个 pane 内部独立管 active，切一级 tab 时 sub-tab 状态保持）
- **核心 bug 修复**：decor pane 的 11 个裸 section 收回 `data-pane="decor"` 容器内（这是重构的**关键动机**，不是可选项）
- **id/class 零改动**：所有 section id（flBrightness/beautyVal/borderMode/emojiBar/mosaicBtn/cvDenoise/slimFace/deform_eye/matFg/cropReset/exRun）和 class 名保持不变，app.js 事件绑定 100% 兼容
- **关联**：↔Dc-003（内嵌底栏形态） ↔Chg-013 ↔Iss-006（decor pane 空 div bug，首次发现）

#### Dc-011（2026-10-09 · edit-panel 布局修正 · 第二次迭代）edit-panel 回到 body flex 内嵌底栏，与 beauty-bar 互斥替换

- **背景**：Chg-015 把 edit-panel 改为 position:fixed 浮层覆盖，用户实测仍不可接受——浮层遮挡了底部 beauty-bar + bottom-nav 区域，主图视觉上仍被遮挡。用户明确需求："点更多工具，只改出风格配方/特效/高级...导航，但图片页面不动"
- **第二次修正**（本批次）：edit-panel 回到 body flex 内嵌底栏
  - `position: fixed` 去掉，恢复 body flex column 子元素身份
  - edit-panel 在 DOM 中位于 beauty-bar 和 bottom-nav 之后（L472），追加在底部
  - openEdit() 时 beautyBar.hidden = true（**互斥替换**，不叠加挤压）
  - editClose 时 beautyBar.hidden = false（恢复常驻）
  - edit-preview-wrap 默认 hidden（砍掉 32vh 大预览 canvas，edit-work 直接占满面板剩余空间）
  - edit-panel max-height 从 58vh 降到 42vh
- **els 新增注册**：'beautyBar', 'bottomNav' 加入 app.js els 对象之前从未注册（之前 beauty-bar 和 bottom-nav 纯 CSS 定位，JS 不操作它们的显隐）
- **Dc-003 最终对齐**：edit-panel 内嵌底部栏（border-top，body flex column 内），与 beauty-bar 互斥，符合硬约束 §1
- **测试**：regression.cjs 410/0 全绿；els.beautyBar 之前未注册导致 TypeError（踩了 1 次）
- **关联**：↔Dc-003（内嵌底栏硬约束，本决策最终对齐） ↔Chg-016（本次迭代） ↔Chg-015（上一次迭代 position:fixed 方案）
