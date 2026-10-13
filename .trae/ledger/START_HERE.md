# 🟢 接手入口 · 30 秒懂绿角犀看图

## 一句话定位
桌面图片浏览器 + 内嵌底部栏美图编辑器。零框架原生 JS 单文件 app.js（252KB）+ Rust Tauri v2 + WebView2 离线运行时。核心卖点：合并位移场变形（导出 = 预览同公式）、AI 超分 ONNX 推理失败自动降级 Lanczos、抠图高斯似然比 + 双边羽化、压缩包直看（ZIP/CBZ 懒加载）。

## 当前版本
`0.1.0`（tauri.conf.json / Cargo.toml / manifest.webmanifest 三处一致；sw.js CACHE **v53**）
- **2026-10-12 最新 build**：Chg-023 代码审核安全修复 — EXIF escapeHtml + BMP try/catch + CSP 基础策略 + build 真机验证通过

## 完成度（2026-10-13 晚）

| 模块 | 状态 | 备注 |
|------|------|------|
| 图片浏览核心 | ✅ 100% | 打开/缩放/翻页/最近访问/穿透文件夹 |
| GIF 解码兜底 | ✅ 100% | 正常 GIF 原生播动画；压缩包内 GIF Rust 端 image crate → JPEG 第一帧（Iss-005 Chg-022 彻底修复） |
| 美图编辑器 | ✅ 100% | 内嵌底部栏，edit-panel 紧贴 bottom-nav 上方展开；slim/deform 合并位移场 |
| AI 超分 | ✅ 100% | ONNX + ort.wasm，失败降级 Lanczos |
| 抠图 | ✅ 100% | 高斯似然比 + 双边羽化 ≤512px；消除笔 Patch-Match |
| 压缩包直看 | ✅ 100% | ZIP/CBZ/RAR/7Z 懒加载 |
| 批量加水印 | ✅ 100% | drawWatermarkOnCanvas 纯函数 + 9 宫格 + tile -30° |
| 海报边框+emoji | ✅ 100% | BORDER_PRESETS + emojiBar + 一键生成 |
| 打包交付 | ✅ 100% | NSIS 全中文 SimpChinese；installer.nsh PreInstall 仅留 taskkill |
| 回归测试 | ✅ 100% | regression.cjs **412** 项全绿 |
| **Android 主线** | **🔄 35%** | **真机验证通过**（PID 19104 存活零崩溃）；Rust JNI 20 符号齐全 + WebView chromium sandbox 起；踩 Iss-007（手动 cargo build 缺 JNI 桥）；Resolver 幽灵条目修复（manifest priority=100）待装新版验证；APK 已构建（18.44MB 带 priority） |
| 鸿蒙/iOS 线 | ⏸ 暂缓 | 已移除，后续再回归 |
| 后端服务 | ⬜ 待接入 | |

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

## 活跃坑 top 5（踩过 ≥1 次，新 AI 必扫）
1. **Iss-005**（踩 6 次 · 已修复）WebView2 GIF 变种原生解码失败 → Rust 端 image crate 兜底
2. **Iss-007**（踩 1 次 · 2026-10-13 新坑）手动 cargo build Android 缺 mobile_entry_point JNI 桥 → **铁律：tauri android build 是唯一入口**
3. **Iss-001**（踩 2 次）jsdom Uint8Array 是 window realm，`instanceof` 要用 `window.Uint8Array`
4. **Iss-002**（踩 2 次）PowerShell 5 参数行纯 ASCII
5. **Iss-006**（踩 1 次）edit-pane HTML 闭合检查——section 必须被 data-pane 容器包裹

## 最近 3 周大事（2026-09-20 ~ 2026-10-13）

### 2026-10-13（Android 主线突破 + Resolver 修复）
- **Chg-025** Android 真机验证通过：universal APK arm64 PID 19104 存活，Rust JNI 20 符号齐全，WebView chromium sandbox 起，空状态 UI 完整渲染
- Rust warning 清零（lib.rs Emitter/Manager 加 `#[cfg(not(target_os="android"))]`）
- **Iss-007 新坑**：手动 cargo build + 手动拷 .so → APK 启动崩溃 `UnsatisfiedLinkError`。根因：mobile_entry_point 宏只在 tauri android build 管线里触发 JNI 桥生成
- **Resolver 幽灵条目**：ghost `cd52b1` 带多余 DEFAULT category，Android 14 PackageManager 持久化 bug，非 root 清不掉
  - 解法：manifest intent-filter 加 `android:priority="100"` → Resolver 跳过 ghost
  - APK 已构建：`gen/android/app/build/outputs/apk/release/app-release.apk`（18.44MB，19:05:23 带 priority 修复）
- **npm.bat 问题**：gradle rust 插件硬调 npm.bat，但机器只有 npm.cmd → 手动复制 npm.cmd → npm.bat
- **gradle 绕过法**：临时注释 build.gradle.kts 里 rust 插件 → 手动 gradle assembleRelease（前提：.so 已在 jniLibs）
- **manifest 写法坑**：`<priority android:value="100" />` 子元素写法 AAPT 报错；正确写法是 `<intent-filter android:priority="100">` 属性

### 2026-10-12（安全审核 + NSIS 简化 + 移除鸿蒙/iOS + Android APK 首次构建）
- **Chg-023 代码审核安全修复**：EXIF escapeHtml + BMP try/catch + CSP 基础策略 + sw.js CACHE v53
- **Chg-024 installer.nsh PreInstall 简化**：只留一行 taskkill
- 移除 harmony/ 目录 + iOS 图标文件
- Android arm64 APK 首次构建成功（4.1MB，手动 .so 拷贝，后确认缺 JNI 符号）

### 2026-10-10（GIF 解码彻底修复）
- **Chg-022 / Iss-005** 压缩包内 GIF 死代码 bug + 前端兜底路径失效 → lib.rs read_archive_entry 单独分支 image crate；decode_to_rgb 改为文件头格式探测
- regression 410 → 414（+4 覆盖修复链路）

### 2026-10-09（密集迭代日）
- Chg-012 切图归零；Chg-013 edit-panel 重构一级 tab + 二级 sub-tab
- Chg-018 edit-panel 移到 bottom-nav 前面；云账户→美图按钮
- Chg-019/020 两轮空间压缩（~320px → ~110px）
- CACHE v45→v52（7 次迭代）

## 接手下一步（新 AI 必做）

### 新电脑初始化
```
git clone git@github.com:stvode-cyber/lvjiaoxi-viewer.git
cd lvjiaoxi-viewer
npm install
rustup default stable
cargo check src-tauri/
node test/regression.cjs   # 必须 412/0 全绿
node scripts/sync-dist.cjs
```

### ⚠️ Android 构建前置（新电脑必配）
- 安装 Android SDK + build-tools 34+ + platform 35
- 确认 `C:\Users\<USER>\.android-sdk\build-tools\XX.X.X\aapt2.exe` 存在
- **关键**：nodejs 目录里**必须有 npm.bat**（不是只有 npm.cmd）
  - 如果没有，手动复制：`copy npm.cmd npm.bat` → `C:\Users\<USER>\AppData\Local\Programs\nodejs\`
- 手机 USB 连 → 开开发者模式 → 开 USB 调试 → `adb devices` 确认

### 当前未完成（优先级排序）
1. **🔴 Resolver 幽灵条目验证**：手机插 USB → `adb install -r src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk` → 启动看 ghost 还弹不弹
2. **🔴 还原 build.gradle.kts 注释**：修完验证后恢复 rust 插件（别让下次 `tauri android build` 再撞 npm.bat 坑）
3. **🟡 commit manifest 修复 + 还原 gradle**
4. **🟡 Android 签名**：配 keystore + 签 arm64/armv7/x86_64 多架构
5. **🟢 Android SAF 图片选择**：Android 13+ file:// 权限用 SAF 授权
6. **🟢 Android UI 进一步优化**：美图面板弹出效果 / 触控区域再加大

### 30 秒扫台账
1. START_HERE.md（已读完）→ context.md 版本号落点 → issues.md 活跃坑 → changes.md 最近 10 条
2. **新电脑先跑**：`node test/regression.cjs` 确认 412/0

---

## 台账索引
- 完整状态快照 → `context.md`
- 所有技术决策 → `decisions.md`
- 所有踩过的坑 → `issues.md`
- 所有文件变化 → `changes.md`
- 历史周报 → `weekly/`
