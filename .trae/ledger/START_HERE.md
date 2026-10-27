> 📂 角色索引：▶ 必读：新 AI 接手第一步（30 秒）；跳过：已有上下文时
# 🟢 接手入口 · 30 秒懂绿角犀看图

> 最后更新：2026-10-17

## ⏱ 新 AI 30 秒接手清单（按序执行）

| 序号 | 动作 | 耗时 | 必须完成 |
|------|------|------|---------|
| 1 | **读本文件 START_HERE.md** | 2 min | ✅ 理解项目定位 + 完成度 |
| 2 | **读 user-preferences.md** | 1 min | ✅ 了解用户沟通偏好 + 硬约束 |
| 3 | **context.md 版本号落点快速扫** | 30s | ✅ 6 落点全同 + sw.js CACHE 不落后 |
| 4 | **issues.md 活跃坑 top 5** | 30s | ✅ 避免踩已知坑 |
| 5 | **跑 regression.cjs** | 10s | ✅ 必须 467/0 全绿，否则先修测试 |
| 6 | **宣告 P-XXX 动作清单 → 等用户 OK** | 1 min | ✅ 再动手 |

## 一句话定位
桌面图片浏览器 + 内嵌底部栏美图编辑器。零框架原生 JS 单文件 app.js（252KB）+ Rust Tauri v2 + WebView2 离线运行时。核心卖点：合并位移场变形（导出 = 预览同公式）、AI 超分 ONNX 推理失败自动降级 Lanczos、抠图高斯似然比 + 双边羽化、压缩包直看（ZIP/CBZ 懒加载）。

## 当前版本
`0.1.0`（tauri.conf.json / Cargo.toml / manifest.webmanifest 三处一致；sw.js CACHE **v83**）
- **2026-10-19 最新提交**：`338feef` P-005 sync-dist 补 js/ + CACHE v83（PSD 修复核心）
- **桌面 build**：Setup.exe 212.94MB（10-19 18:37）/ EXE 16.08MB（P-005 重构建）
- **Android APK**：Universal 35.38MB（arm64+armv7 release 签名）

## 完成度（2026-10-19 下午）

| 模块 | 状态 | 备注 |
|------|------|------|
| 图片浏览核心 | ✅ 100% | 打开/缩放/翻页/最近访问/穿透文件夹；**虚拟滚动窗口 ±3**（Chg-031） |
| **新增格式** | ✅ 100% | **PSD/PSB（ag-psd 0.3 + 展平合成缩略图）+ EXR（image exr feature）+ WebP（桌面原生 + Android）**（Chg-P7 / P-20261018-007） |
| GIF 解码兜底 | ✅ 100% | 正常 GIF 原生播动画；坏 GIF decode_fallback；压缩包内/缩略图 Rust 端 image crate → JPEG（Iss-005 7 次踩坑全闭环） |
| 美图编辑器 | ✅ 100% | 内嵌底部栏（border-top），edit-panel 紧贴 bottom-nav 上方；slim/deform 合并位移场 |
| AI 超分 | ✅ 100% | ONNX + ort.wasm，失败降级 Lanczos |
| 抠图 | ✅ 100% | 高斯似然比 + 双边羽化 ≤512px；消除笔 Patch-Match |
| 压缩包直看 | ✅ 100% | ZIP/CBZ/RAR/7Z 懒加载 |
| 批量加水印 | ✅ 100% | drawWatermarkOnCanvas 纯函数 + 9 宫格 + tile -30° |
| 海报边框+emoji | ✅ 100% | BORDER_PRESETS + emojiBar + 一键生成 |
| **长图 + Webtoon** | ✅ 100% | **长图滚轮翻页（ratio>1.7 自动启用 + 触屏边界 + Space 长滚）+ 📚 长流按钮连续流模式（IntersectionObserver 懒加载 + gap 0~100px 可调）**（P-20261018-003/005） |
| **竞品功能 P2 6/6** | ✅ 100% | 深色主题 + EXIF GPS 高德 + SD Prompt 查看 + 双页漫画 + 递归穿透文件夹 + Webtoon（全部零新依赖） |
| 打包交付 | ✅ 100% | NSIS 全中文 SimpChinese；installer.nsh PreInstall 仅留 taskkill |
| 回归测试 | ✅ 100% | regression.cjs **467** 项全绿 |
| **启动性能** | ✅ 100% | rayon 并行 + IPC 懒加载：load_paths 53 张 1500ms→37ms；冷启动 5.7s→0.8s（7x 提升） |
| **缩略图渲染** | ✅ 100% | 虚拟滚动窗口 ±3：最多 7 张 DOM 同时存活，thumbUrl 永久缓存复用 |
| **模块化拆分** | **95%** | **6 子文件落地 + 渐进替换第4批完成**：exif/archive/render/init/edit/batch 全部 IIFE；裸调→__API__ 替换完成 archive(21)+render(115)+init(231)=367 + edit/batch TDZ 修复（Chg-034 / Iss-013） |
| **Android 主线** | **🔄 55%** | **完整构建管线闭环**：tauri android build --apk -t aarch64 armv7 一次跑通；Universal APK 35.38MB 双架构；JNI 20 符号齐全；**待 Android intent 真机测试 + SAF Picker 完整授权** |
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
1. **Iss-005**（踩 7 次 · 已修复）WebView2 GIF 变种原生解码失败 → Rust 端 image crate 兜底
2. **Iss-013**（踩 5 次 · 2026-10-18 P-006 第4批）渐进替换 TDZ + $$ replace + 子文件闭包变量
3. **Iss-015**（踩 1 次 · 2026-10-19 P-005 新坑）sync-dist.cjs 漏拷 js/ 子目录 → PSD 解码链路全失效
4. **Iss-008**（踩 2 次 · 2026-10-16 又踩）armv7 交叉编译缺 C 编译器 → 构建前 PATH + CC_armv7 环境变量
5. **Iss-001/002**（各踩 2 次）jsdom Uint8Array / PowerShell 5 GBK 中文注释

## 最近 3 周大事（2026-10-07 ~ 2026-10-27）

### 2026-10-27（v2 Phase 0 完整跑通 · 黑屏修复 + 中文字体 + eframe 0.37）
- **commit 5d24807**（v2 repo）：android_main 阻塞循环防 NativeActivity 退出黑屏（Iss-017）
- **真机验证**（Motorola XT2401）：✅ 不再黑屏 ✅ 中文正常 ✅ Vulkan Adreno GPU 初始化成功 ✅ 进程稳定存活
- **中文字体**：加载 `/system/fonts/NotoSansCJK-Regular.ttc`（32MB TTC）→ tofu 消除
- **eframe 0.37 API 全变**：`App::update` → `App::ui`；`cc.loader` → `cc.egui_ctx.load_texture`；`ColorImage::from_rgba` → `from_rgba_unmultiplied`
- **活跃坑更替**：Iss-017（新活跃）+ Iss-009（force-stop，踩 1 次挤位归档）

### 2026-10-26（v2 全 Rust 重写决策落地 · AGENTS §12 新增）
- **核心决策链**：用户"不管成本要最稳定"→ 4 套方案对比 → 选定全 Rust 重写 → 用户拍板"先 Android 再 Win"
- **AGENTS.md §12 新增**：§12.5 平台优先级（Android 第一目标）+ §12.7 Android 专属硬约束 7 条 + §12.8 Phase 0~4（Android 优先 220h）
- **v2-rewrite-design.html**（44KB）：10 章节设计文档（架构 / 渲染管线 / 格式矩阵 / UI 映射 / 算法迁移 / oculante 复用 / 分阶段）
- **decisions.md Dc-012/Dc-013**：v2 重写决策 + Android 优先 + SAF JNI 桥接方式（手写，jni crate + ~80Rust + ~30Java）
- **P0 补漏清单**：① 设计文档未同步 Android 优先（🔴 待补）② oculante fork 起点 Android 下不成立（🟡 待改）③ v1 Android 资产可复用清单（🟡 待补）

### 2026-10-19（Setup.exe /S 缺陷确认 + PSD 打开修复 + sync-dist 补 js/）
- **P-002 文件关联修复**：注册表飘到 C:\LVJX_VERIFY 旧 EXE → 手动修正 HKCU ProgId + 删除旧目录
- **P-003 PSD 打不开修复**：AppData EXE 是 10-17 旧 build（没 ag-psd 依赖）→ 手动覆盖 release EXE（10-18 最新）
- **P-005 sync-dist 补 js/ + 重构建（核心）**：index.html 改成模块化拆分后 sync-dist.cjs 没拷 js/ 子目录 → dist/ 全 404 → app.js 第一行崩 → pullPending L6200+ 永远跑不到 → PSD + 文件关联全失效
- **commit 338feef**：sw.js CACHE v82→v83 + sync-dist 新增 js/ copyTree
- **新坑 Iss-015**：sync-dist.cjs 漏拷 js/ 子目录（踩 1 次）
- **Iss-014 归档**：Setup.exe /S Registry 缓存（踩够 3 次）

### 2026-10-18（BandiView 竞品差异化 · 7 个 P 进程落地）
- **P-001 台账瘦身**：活跃坑 10→9（Iss-004 归档）+ 测试断言数 224→467
- **P-002/006 竞品扫描**：BandiView v8.03 三大差异化 → 长图 P0 四项 + Webtoon + PSD/EXR
- **P-003 长图 P0 四项优化**：触屏边界翻页 + 滚轮步长可调 + 长图阈值可调 + Space 长滚一屏
- **P-005 Webtoon 连续流模式**：📚 底部导航条新增「长流」按钮；文件夹所有图垂直 stack + IntersectionObserver 懒加载（纯前端零 Rust）
- **P-007 PSD/PSB + EXR 原生预览**：ag-psd crate 纯 Rust 解码（展平合成缩略图）+ image crate exr feature；Android 也能编译
- **Setup.exe 212.89MB**（+0.13MB 新增），regression 467/0 全绿

### 2026-10-17（模块化拆分 + 性能优化 + Android 闭环）
- **还原 rust 插件**：Chg-029 后有人注释了 `build.gradle.kts` 里的 `id("rust")`，本次还原
- **管线验证**：`npm run tauri -- android build --apk -t aarch64 armv7` 一次跑通完整管线
  - Rust 双架构 release profile 编译（2 warnings：unused_mut + unused 变量）
  - Universal APK 35.38MB（arm64-v8a + armeabi-v7a，release 签名）
  - llvm-readelf 验：JNI 桥 20 符号齐全（含 `Rust_create`），NEEDED 全系统库
  - 真机 adb install -r → Success；PID 25696 存活；零崩溃
- **Iss-010 新坑**：
  - Tauri CLI 硬调 i686/x86_64，`gradle.properties` targetList 不生效 → 必须用 `-t aarch64 armv7`
  - Tauri CLI 用 ANDROID_HOME 下的 NDK 27，cc-rs 用环境变量 NDK 28，版本不一致
- **Iss-008 重现次数 +1**：本次又踩了 PATH 没加 NDK/bin 的坑

### 2026-10-15（Iss-005 闭环 · Chg-029）
- **Chg-029 Iss-005 闭环**：补完 first_thumb（最近访问缩略图）和 genThumb（底部缩略图生成）两个遗漏路径，GIF 四路径现在全部闭环（主图 / 压缩包内 / first_thumb / genThumb）
- sw.js CACHE v63 → v64
- regression.cjs 414/0 全绿

### 2026-10-13 ~ 2026-10-14（Android 主线大推进 · Chg-025/026/027）
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
node test/regression.cjs   # 必须 467/0 全绿
node scripts/sync-dist.cjs
```

### ⚠️ Android 构建前置（新电脑必配）
- 安装 Android SDK + build-tools 34+ + platform 35
- 确认 `C:\Users\<USER>\.android-sdk\build-tools\XX.X.X\aapt2.exe` 存在
- **关键**：nodejs 目录里**必须有 npm.bat**（不是只有 npm.cmd）
  - 如果没有，手动复制：`copy npm.cmd npm.bat` → `C:\Users\<USER>\AppData\Local\Programs\nodejs\`
- 手机 USB 连 → 开开发者模式 → 开 USB 调试 → `adb devices` 确认

### 当前未完成（优先级排序）
1. **🔴 Android intent 真机测试**：adb push 测试图片到手机 → Gallery/Files 点图打开 → 验证 content:// SAF 路径能否加载显示 → App 是否触发 `__androidOpenFile` handler
2. **🔴 Android SAF Picker 完整授权**：Android 13+ 文件打开按钮调 SAF Picker（ACTION_OPEN_DOCUMENT），拿到 URI → 解析真实路径 → 加载显示
3. **🟡 Android release APK 分发**：把 `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk`（35.38MB，release 签名）整理到 `nsis_x/` 下做 Android 版交付物
4. **🟡 Android UI 优化**：美图面板触控区域再加大 / 顶栏精简版布局优化 / 长按图片上下文菜单

### Android 构建铁律模板（复制粘贴即可用）
```powershell
# Iss-008 + Iss-010 环境
$env:ANDROID_HOME = "C:\Users\Administrator\.android-sdk"
$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\27.0.12077973"  # 和 ANDROID_HOME 保持一致
$env:NDK_BIN = "$env:ANDROID_NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:PATH = "$env:NDK_BIN;$env:PATH"
$env:CC_armv7_linux_androideabi = "$env:NDK_BIN\armv7a-linux-androideabi35-clang.cmd"

# 构建命令（Iss-007 + Iss-010：唯一正确入口 + 必须 -t 指定双架构）
npm run tauri -- android build --apk -t aarch64 armv7

# 真机验证
adb install -r app-universal-release.apk
adb shell am start -n com.lvjiaoxi.viewer/.MainActivity
Start-Sleep 3
adb shell pidof com.lvjiaoxi.viewer   # 必须有输出 = 存活
adb logcat -d -t 20 | findstr /i "FATAL UnsatisfiedLinkError panic"  # 必须零匹配
```

### 30 秒扫台账
1. START_HERE.md（已读完）→ context.md 版本号落点 → issues.md 活跃坑 → changes.md 最近 10 条
2. **新电脑先跑**：`node test/regression.cjs` 确认 412/0

---

## 台账索引
- 🟢 **接手入口（先读这个）** → 本文件 START_HERE.md
- 👤 **用户行为偏好** → `user-preferences.md`（沟通方式/功能选择/硬约束/AI 工作流）
- 🎯 **项目能力清单** → `capabilities.md`（能做什么/不能做什么/下一阶段补什么/核心卖点）
- 🔐 **重要信息（敏感，.gitignore 排除）** → `credentials.md`（GitHub/keystore/版本号落点/构建路径/命令模板）
- 📊 完整状态快照 → `context.md`
- 💡 所有技术决策 → `decisions.md`
- 🪤 所有踩过的坑 → `issues.md`
- 📝 文件变化（聚合版）→ `changes.md`（UI布局/GIF修复/Android构建/性能优化 12 条）
- 📅 历史周报 → `weekly/`
- 🛠 SKILL 模板 → `skills/`（android-build 构建铁律）
