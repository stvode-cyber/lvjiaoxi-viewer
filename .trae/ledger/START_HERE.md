# 🟢 接手入口 · 30 秒懂绿角犀看图

## 一句话定位
桌面图片浏览器 + 内嵌底部栏美图编辑器。零框架原生 JS 单文件 app.js（252KB）+ Rust Tauri v2 + WebView2 离线运行时。核心卖点：合并位移场变形（导出 = 预览同公式）、AI 超分 ONNX 推理失败自动降级 Lanczos、抠图高斯似然比 + 双边羽化、压缩包直看（ZIP/CBZ 懒加载）。

## 当前版本
`0.1.0`（tauri.conf.json / Cargo.toml / manifest.webmanifest 三处一致；sw.js CACHE **v52**）
- **2026-10-10 最新提交**：`9eb9b3e` Iss-005 压缩包内 GIF 死代码 + 前端兜底路径 bug 彻底修复

## 完成度（2026-10-10 午）

| 模块 | 状态 | 备注 |
|------|------|------|
| 图片浏览核心 | ✅ 100% | 打开/缩放/翻页/最近访问/穿透文件夹 |
| GIF 解码兜底 | ✅ 100% | 正常 GIF 原生播动画（decode_fallback 兜底）；压缩包内 GIF Rust 端直接 image crate → JPEG 第一帧（Iss-005 Chg-022 彻底修复） |
| 美图编辑器 | ✅ 100% | 内嵌底部栏，edit-panel 紧贴 bottom-nav 上方展开；slim/deform 合并位移场 |
| AI 超分 | ✅ 100% | ONNX + ort.wasm，失败降级 Lanczos |
| 抠图 | ✅ 100% | 高斯似然比 + 双边羽化 ≤512px；消除笔 Patch-Match |
| 压缩包直看 | ✅ 100% | ZIP/CBZ/RAR/7Z 懒加载，skip __MACOSX/.DS_Store |
| 批量加水印 | ✅ 100% | drawWatermarkOnCanvas 纯函数 + 9 宫格 + tile -30° |
| 海报边框+emoji | ✅ 100% | BORDER_PRESETS + emojiBar + 一键生成 |
| 打包交付 | ✅ 100% | NSIS 全中文 SimpChinese；内嵌 WebView2 离线包；installer.nsh 三段 hook |
| 回归测试 | ✅ 100% | regression.cjs **414** 项断言全绿（Chg-022 +4 覆盖 Iss-005 修复链路） |
| 鸿蒙主线 | 🔄 60% | harmony/ ArkTS 原生，并行开发中 |
| 后端服务 | ⬜ 待接入 | server/mock-server.js 占位，无正式部署 |

## 已定硬规则（别再问）

### UI 形态
- 美图面板：**内嵌底部栏**（`.edit-panel` border-top），禁止改弹窗/浮窗
- 批量面板：遮罩弹窗（`.batchMask`），覆盖主图正常
- **导航条布局**（Dc-011 · 2026-10-09 迭代版）：
  - 顶栏 toolbar：6 按钮（打开/上一/下一/幻灯片/美图🎨/设置⚒）
  - bottom-nav：6 按钮（复制/幻灯/批量/最近/设置/**美图🎨**）← 云账户已替换
  - 底部图片条：缩略图 + 搜索
  - **beauty-bar 默认 hidden**，所有美图控件收进 edit-panel
  - **edit-panel DOM 在 bottom-nav 前面**（展开时紧贴导航条上方显示）
  - edit-tools 是顶部横向 tab bar（5 一级 tab：美颜/风格配方/特效/高级/导出）+ 文件名/⏱/✕ 在同一行

### 算法
- 变形：合并位移场一次性双线性采样，导出 = 预览同公式
- AI 超分：ONNX 失败必须自动降级 Lanczos
- GIF：正常原生播动画；坏 GIF → decode_fallback → JPEG 第一帧

### 工程铁律
- 版本号 6 落点必须全同，改版本 = 7 处同步 + 重构建
- sw.js CACHE 改 app.js/sw.js/styles.css 必须 +1
- 打包前必须跑 sync-dist.cjs
- 切图后编辑态（滤镜/变形/裁剪/抠图...）**全部归零**
- 发版前本机静默安装验证（AGENTS 交付流程 step 7-10）

## 活跃坑 top 5（踩过 ≥2 次）
1. **Iss-005**（踩 5 次）WebView2 对某些 GIF 变种原生解码失败
2. **Iss-001**（踩 2 次）jsdom Uint8Array 是 window realm，`instanceof` 要用 `window.Uint8Array`
3. **Iss-002**（踩 2 次）PowerShell 5 参数行纯 ASCII
4. **Iss-004**（踩 2 次）NSIS 安装残留的 lnk 指向已删除目录
5. **Iss-006**（踩 1 次）edit-pane HTML 闭合检查——section 必须被 data-pane 容器包裹

## 最近 3 周大事（2026-09-20 ~ 2026-10-09）

### 2026-10-09（密集迭代日）
- **Chg-012** 切图归零：showImage 入口统一重置所有编辑态（filters/slim/deform/crop/matting/texts/mosaic/eraser/editUndo/editRedo/logoWm）
- **Chg-011 修订** GIF 恢复原生动画 + is_image 漏 gif 修复
- **Chg-013** edit-panel 重构：一级 tab（美颜/风格配方/特效/高级/导出）+ 二级 sub-tab 分层导航；修 Iss-006 decor pane 空 div
- **Chg-017** beauty-bar 默认 hidden，🎨 成为唯一美图入口
- **Chg-018** edit-panel 移到 bottom-nav 前面（展开时紧贴导航条上方）；云账户按钮替换为美图按钮（6→6 合规）
- **Chg-019/020** edit-panel 空间两轮压缩：侧栏→横向 tab + max-height 42→32→26vh + padding 砍半 + 双重 padding 清零
- **Chg-021** 头部行与一级 tab 合并成一行（面板顶部再省 ~28px）
- **CACHE v45→v52**（7 次迭代）
- **regression 404→410**（6 个新断言覆盖 GIF 修复 + 切图归零 + 导航重构）
- NSIS 构建偶发 os error 10054（网络抖动），重试即过

### 2026-10-08
- Dc-008 GIF 解码策略定稿方案 B（原生播动画 + 坏 GIF 兜底）
- Chg-010 lib.rs GIF 解码修复

### 2026-10-07
- 压缩包直看功能：lib.rs + zip crate + 前端懒加载
- 批量加水印 drawWatermarkOnCanvas 纯函数 + 9 宫格 + tile -30°

## 接手下一步

### 新电脑初始化
```
git clone git@github.com:stvode-cyber/lvjiaoxi-viewer.git
cd lvjiaoxi-viewer
npm install
# 需要 Rust 1.97+：rustup default stable
cargo check src-tauri/
```

### 环境验证
```
node test/regression.cjs   # 必须 410/0 全绿
npm run tauri build         # 双产物（Setup.exe + MSI）
```

### 30 秒扫台账
1. START_HERE.md（已读完）→ context.md 版本号落点 → issues.md 活跃坑 → changes.md 最近 10 条
2. **新电脑先执行**：`node test/regression.cjs` 确认 410/0 全绿

### 当前未完成
- 用户反馈：edit-panel 空间已优化三轮（~320px→~110px），如仍嫌大可做第 4 轮：sub-tab 也合并进 tab 行；或提供悬浮拖拽调高度
- 云账户按钮从 bottom-nav 移除 → 云端功能暂不可用（后续可恢复到设置面板内）
- harmony/ 主线 60% 并行

---

## 台账索引
- 完整状态快照 → `context.md`
- 所有技术决策 → `decisions.md`
- 所有踩过的坑 → `issues.md`
- 所有文件变化 → `changes.md`
- 历史周报 → `weekly/`
