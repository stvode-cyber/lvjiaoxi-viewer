# AGENTS.md · 绿角犀看图项目全局规则

> 本文件对所有 AI 员工生效，每次会话自动注入。修改后记得 commit。

## 项目是什么

**绿角犀看图**是一款桌面图片浏览器 + 美图编辑器。技术栈：

```
前端: 原生 JS 单文件 app.js (252KB) + index.html + styles.css，零框架
桌面: Rust 1.97 + Tauri v2 + WebView2 离线运行时
打包: NSIS (中文界面) + MSI，内嵌 WebView2 离线安装包
测试: test/regression.cjs (Node + jsdom)，224 项断言
鸿蒙: harmony/ (ArkTS 原生，并行主线)
```

## 硬约束（违反即踩坑）

### 1. UI 形态
- 美图面板：**内嵌底部栏**（`.edit-panel` border-top），禁止改成弹窗/浮窗，不遮挡主图
- 批量面板：遮罩弹窗（`.batchMask`），覆盖主图属正常交互
- 导航条：顶栏 + 底部图片条，不可随意增删按钮

### 2. 版本号一致性（6 落点必须全同）
```
tauri.conf.json      → bundle.version
Cargo.toml            → package.version
EXE FileVersion       → .VersionInfo.FileVersion
EXE ProductVersion    → .VersionInfo.ProductVersion
manifest.webmanifest  → version
aboutContent 显示     → app.js 内 about 标题的 vX.X.X 标注
sw.js 缓存            → CACHE 常量（改 app.js 必须升）
```
改版本号 = 7 处同步 + 重构建 + 重推送。

### 3. 打包必踩
- 改 app.js / sw.js / index.html 后 **sw.js CACHE 必须 +1**
- 构建前必须跑 `node scripts/sync-dist.cjs`（复制 8 文件 + assets）
- Windows PowerShell 5：参数行纯 ASCII（中文注释会被 GBK 误读）

### 4. 算法管道
- 美图变形（slim / deform）：**合并位移场**一次性双线性采样，导出 = 预览同公式
- AI 超分：`sub_pixel_cnn.onnx` + ort.wasm，**失败自动降级 Lanczos**，绝不挂起
- 抠图：高斯似然比 + 双边滤波羽化 ≤512px 工作分辨率

### 5. 测试环境限制
- jsdom `<canvas>` 的 Uint8Array 是 window realm，`instanceof Uint8Array` 要用 `window.Uint8Array`
- regression.cjs 共享同一 jsdom document，前序测试改的控件值会残留 → 断言前显式设目标值

## 代码风格

```
原生 JS，无 TypeScript，无框架
- 函数命名: camelCase（slimCanvas, renderEditPreview）
- UI id: kebab-case（slim-reset, edit-history-btn）
- CSS 类: kebab-case（.deform-btn, .edit-section）
- 变量: 全局 state 对象（state.filters, state.slim, state.deform）
- 常量: UNDO_MAX, CACHE, STYLE_PRESETS
- 注释: // 单行，中文
```

## Git 规范

```
commit message: 中文前缀 + 短描述
  feat: 新增美型微调五大变形
  fix: NSIS 安装界面全中文
  refactor: 合并位移场替换 slimCanvas

SSH 推送（已配置）:
  git push origin master

分支: 只用 master（单主线开发）
```

## 关键文件入口

| 文件 | 角色 |
|---|---|
| `app.js` | 全部前端逻辑（252KB，单文件） |
| `index.html` | 全部 UI 结构 |
| `styles.css` | 全部样式 |
| `sw.js` | Service Worker 缓存（CACHE 常量必须跟版本） |
| `src-tauri/tauri.conf.json` | Tauri 配置 + NSIS 语言 + bundle.version |
| `src-tauri/Cargo.toml` | Rust 版本号 |
| `src-tauri/src/lib.rs` | Tauri 命令层（文件/剪贴板/壁纸） |
| `test/regression.cjs` | 224 项前端回归测试 |
| `scripts/sync-dist.cjs` | 打包前资源同步 |
| `nsis_x/*.exe` | 交付产物（Setup + MSI） |

## 交付流程（每次改动后）

```
1. 改代码 → 跑 node test/regression.cjs（必须全绿）
2. node scripts/sync-dist.cjs（dist 同步）
3. sw.js CACHE +1（如果改了 app.js 或 sw.js）
4. git add -A && git commit -m "xxx" && git push
5. npm run tauri build（需要桌面安装包时）
6. 复制产物到 nsis_x/
```
