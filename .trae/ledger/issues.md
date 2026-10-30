> 📂 角色索引：▶ 必读：改文件前扫活跃坑；跳过：不碰源码时
# issues.md · 踩过的坑

> 活跃区：正在威胁当前开发的坑，改相关文件前必扫
> 归档区：踩够 3 次已沉淀或已解决的历史坑，只追加不准删

---

## 活跃坑（当前 10 个，硬限 ≤10）

> 💡 **2026-10-30 · v2 Phase 0 真机闭环成功**：Iss-022/023/024 已澄清（不是真正死因），Iss-025 是新真凶
> 💡 **活跃坑 TOP 重排**：🔴 TOP1 Iss-005（踩 7 次） / 🟠 TOP2 Iss-025（踩 3 次并列第二）+ Iss-017/019/020/021 各踩 1 次

#### 🟠 TOP2 Iss-025（活跃 · 踩 3 次 · 2026-10-30 v2 Phase 0）Android 15 ResolverActivity 多用户残留 → 同一包被列 3 次 → 强制弹选择器

- **问题**：`adb shell am start -n com.lvjiaoxi.viewer.v2/android.app.NativeActivity` 被 Android 15 强制跳 ResolverActivity（"选择要使用的应用程序"），且同一包被列 3 次 → 无论 `am start` 加不加 `-n` 都被截胡 → 进程永远起不来
- **根因**：Android 15 多用户环境（User 0 + User 900/901/902/903 等）。v2 APK 安装时被 PackageManager 分配了多个 user 状态（pm dump 里 User 0/900/901/902/903 全显示 installed=true），导致 ResolverActivity 把同一 package + activity 匹配了多次 → 弹选择器强制用户选。`am start -n pkg/activity` 虽然指定了 component，但 PackageManager 内部解析还是触发了多匹配
- **解决**：`adb shell input tap 250 2250`（直接点 ResolverActivity 第一个选项）→ NativeActivity 成功启动 → pidof=3232 → 进程存活 ✅
- **预防规则**：
  - Android 15 真机首次验证 NativeActivity，不能只靠 `am start -n`，必须准备好"点 Resolver 选项"的 fallback
  - `cmd package resolve-activity` 返回单一结果不代表 `am start` 不会触发 ResolverActivity（多用户缓存可能干扰）
  - ResolverActivity 持久存在时：先 `am force-stop android`（不是 v2 包），再重试
  - 长期解法：Phase 1 正式加 AndroidManifest.xml 手动写 intent-filter + priority="100"（参考 Iss-010 v1 Android 已踩过的套路）
- **关联 Chg**：Chg-P20261030 / P-20261030-001
- **关联路径**：v2 Cargo.toml application/activity 配置
- **重现次数**：3（2026-10-30 整个上午反复踩，每次 `am start` 都被 Resolver 截胡）
- **已沉淀**：下次真机启动 NativeActivity 先 `adb logcat -c` + `am start` + 等 3 秒 + 检查 ResolverActivity 是否在 topResumedActivity + 是就 tap 选项

#### 🔴 TOP1 Iss-005（活跃 · 踩 7 次）WebView2 对某些 GIF 变种原生解码失败

- **问题**：v2 cargo apk build 出的 APK，启动后 ~1.5 秒 Activity 被系统强制 finish（白屏）
- **根因**：Manifest 里 activity/application **没有显式指定 theme** → Android 默认 translucent Activity（Task 属性 `translucent=true`）。华为 ROM（HarmonyOS/EMUI）对半透明 Activity 有特殊处理——检测不到活跃渲染就自动 finish，即使进程还活着也会杀 Activity
- **证据**（logcat 关键行）：
  - `Stopping ActivityRecord{... finishing=true}` ← 系统强制 finish
  - `makeWindowLayoutParams mAttrs.flags=0x1020100 FULLSCREEN translucent=true` ← 默认半透明
  - `RunAppOnDemand 非阻塞立即 return` ← run_and_return=true 的副因（已修复为 false）
- **解决**：Cargo.toml `[package.metadata.android.application]` 加 `theme = "@android:style/Theme.DeviceDefault.NoActionBar.Fullscreen"` → 重新 `cargo apk build` 后 Manifest 带 theme 属性
- **预防规则**：
  - Android NativeActivity（无 Java setContentView）必须显式指定不透明 theme，不能依赖默认
  - cargo-apk 0.10.0 **不认识** activity 级别的 theme 字段，只认 application 级别
  - 构建完先 grep 生成的 AndroidManifest.xml 确认 theme 属性在 application 上
- **关联 Chg**：Chg-V2 后半段 / P-20261029-001
- **关联路径**：`lvjiaoxi-viewer-v2/Cargo.toml`、`lvjiaoxi-viewer-v2/src/lib.rs`
- **重现次数**：1（2026-10-29 Phase 0 image loading 闭环后真机启动踩坑）

#### Iss-021（活跃 · 踩 1 次 · 2026-10-29 v2 Phase 0）run_and_return=true → run_native 立即 return → glue 自动调 finish → 白屏

- **问题**：android_main 里 eframe::run_native() 调用完立即返回 → android_main 正常 return → Android glue 层自动调 ANativeActivity_finish() → Activity 被销毁 → 白屏
- **根因**：eframe 0.37 NativeOptions 默认 `run_and_return=true`。Android NativeActivity 模式下 run_app_on_demand 是非阻塞回调式——注册事件监听器后立即 return（不像桌面端阻塞跑事件循环）。android_main return 就等于 Activity 生命周期结束
- **解决**：`native_options.run_and_return = false` → run_app 阻塞一直跑到窗口被关闭 → android_main 不 return → glue 不调 finish → Activity 存活
- **预防规则**：
  - v2 Android NativeActivity 入口：run_and_return 必须显式设 false
  - android_main 尾部必须有阻塞（`loop { sleep }`）作为二次保险，防止 run_native 意外 return
  - eframe 0.37 的 android-native-activity feature 下，渲染由 wgpu surface 回调驱动，run_native 本身不驱动事件循环
- **关联 Chg**：Chg-V2 后半段 / Iss-017（同一个根因链上的不同阶段）
- **关联路径**：`lvjiaoxi-viewer-v2/src/lib.rs` android_main 函数
- **重现次数**：1（2026-10-29）

#### Iss-020（活跃 · 踩 1 次 · 2026-10-29 v2 Phase 0）Android Activity 重建 → 第二次调 run_native → EVENT_LOOP_CREATED 全局锁撞车 → RecreationAttempt

- **问题**：Android 可能因配置变更（如旋转）重建 Activity → android_main 被第二次调用 → winit EVENT_LOOP_CREATED 全局 AtomicBool 已设 true → `RecreationAttempt` error → run_native 失败
- **根因**：winit EVENT_LOOP_CREATED 是全局 `OnceLock<()>` / `AtomicBool`，整个进程只允许创建一个 event loop。Android Activity 重建在同一进程内第二次调 android_main → 撞车。且 winit 没有 web_platform feature 时没有 reset 这个锁的接口
- **解决**：android_main 外层包 `static FIRST_RUN: OnceLock<()>` → 只有第一次真正调 run_native，后续 Activity 重建直接跳过
- **预防规则**：
  - Android NativeActivity 的 android_main 必须用 OnceLock 包 run_native 调用
  - 被 OnceLock 挡住后，android_main 尾部 `loop { sleep }` 继续阻塞
  - winit 0.30.13 没有 reset EVENT_LOOP_CREATED 的接口
- **关联 Chg**：Chg-V2 后半段 / P-20261029-001
- **关联路径**：`lvjiaoxi-viewer-v2/src/lib.rs` android_main 函数
- **重现次数**：1（2026-10-29）

#### Iss-019（活跃 · 踩 1 次 · 2026-10-29 v2 Phase 0）android_log msg.as_ptr() 没 null 终止 → Android 日志静默丢弃

- **问题**：v2 用 android-activity ndk_sys::__android_log_write 打日志，logcat 完全没有我们 tag 的输出 → 看起来像 run_native 没被调
- **根因**：C 字符串函数 `__android_log_write(int prio, const char *tag, const char *text)` 要求 tag 和 text **必须 null 终止**。直接传 Rust str 的 `.as_ptr()` 没 null 终止字节 → Android 读垃圾直到遇到随机 0 → 超长或非法 tag → 日志被 logd 静默丢弃
- **解决**：整个 android_log 模块重写——所有 msg 先用 `CString::new()` 包一层，确保 null 终止再传 FFI 指针
- **预防规则**：
  - Rust 调任何 C 字符串函数（ndk_sys / jni）前，**必须**用 CString::new() 包装
  - 禁止裸传 `str.as_ptr()` 给需要 null 终止的 C 函数
  - 写 android_log 模块时 info/error/fatal 三个函数都要 CString 包装
- **关联 Chg**：Chg-V2 后半段 / P-20261029-001
- **关联路径**：`lvjiaoxi-viewer-v2/src/lib.rs` 顶部 android_log 模块
- **重现次数**：1（2026-10-29，耗时 1 小时才锁定根因）

#### Iss-017（活跃 · 踩 1 次 · 2026-10-27 v2 Phase 0）Android NativeActivity android_main 不能退出 → 黑屏

- **问题**：v2 eframe + android-activity 脚手架，APK 能启动但黑屏
- **根因**：`eframe::run_native()` 在 Android NativeActivity 模式下是**非阻塞回调式**（立即返回），不是桌面端的阻塞事件循环。如果 `android_main()` 函数返回 → Android 立即销毁 Activity → 黑屏
- **解决**：`android_main` 尾部加 `loop { std::thread::sleep(Duration::from_millis(100)); }` 阻塞
- **预防规则**：
  - Android NativeActivity 入口函数**必须阻塞**，不能正常 return
  - run_native 在 Android 上是注册事件监听器后立即返回，不是跑事件循环
  - eframe 0.37 的 android-native-activity feature 下，渲染由 wgpu surface 回调驱动
- **关联 Chg**：v2 Phase 0 / commit 5d24807
- **关联路径**：`lvjiaoxi-viewer-v2/src/lib.rs`
- **重现次数**：1（2026-10-27 Phase 0 首次渲染踩坑）

#### Iss-016（已沉淀 · 踩 1 次归档 · 2026-10-26 v2 Phase 0）cargo-apk manifest 缺 DEFAULT + 多用户安装导致 ResolverActivity

- **问题**：v2 Android NativeActivity 启动弹 ResolverActivity 选择器（"选择要打开的应用"），android_main 永远不执行，进程完全不起来
- **根因双因素**：
  1. cargo-apk 0.10.0 硬编码 manifest intent-filter 只写 `android.intent.category.LAUNCHER`，**缺 `android.intent.category.DEFAULT`** → Android 无法隐式匹配 intent → 弹选择器
  2. adb install 默认给所有用户安装（Motorola 有 user 0 + 工作资料 900/901/902/903/904）→ 每个用户都有一份 App → 更加剧 ResolverActivity 弹多个选项
- **解决**：patch cargo-apk apk.rs L117 categories vec! 加 `DEFAULT` + 重装 cargo-apk；`adb install --user 0 -r` 只装给主用户；先 `adb shell pm uninstall --user <id>` 卸干净所有用户
- **预防规则**：
  - v2 Android 构建好后必须 `adb install --user 0 -r`，别直接 `adb install -r`
  - cargo-apk 0.10.0 有此 bug，升级到新版本后需验证 intent-filter categories
  - 多用户设备上 `pm path com.xxx` 能看到多份，属正常
- **关联 Chg**：Chg-V1 / P-20261026-001
- **关联路径**：`C:\Users\Administrator\.cargo\registry\src\...\cargo-apk-0.10.0\src\apk.rs:117`
- **重现次数**：1（2026-10-26 Phase 0 首次启动踩坑）

#### Iss-015 🟠 TOP2（已沉淀 · 踩 1 次归档 · 2026-10-19 P-005）sync-dist.cjs 漏拷 js/ 子目录

- **问题**：index.html 改成模块化拆分（加了 js/init.js/exif.js/render.js/edit.js/batch.js/archive.js 引用），但 sync-dist.cjs FILES 数组只有 8 文件 + assets/，没拷 js/ → dist/ 全 404 → app.js 第一行 `window.__API__.xxx()` 就崩 → pullPending 在 L6200+ 永远执行不到 → PSD 解码链路 + 文件关联双击全失效
- **根因**：sync-dist.cjs 是手动维护的文件列表，index.html 改了 script 引用后忘记同步更新 sync-dist 的拷贝逻辑
- **解决（正式 · 2026-10-19 commit 338feef）**：sync-dist.cjs 新增 js/ 子目录 copyTree 拷贝（6 文件），同时构建管线审计确认 index.html 所有外部引用全覆盖
- **预防规则**：
  - index.html 任何 script/link 引用变更后，必须同步更新 sync-dist.cjs 的 FILES 数组或 copyTree 目录列表
  - `tauri build` 前先 grep dist/ 确认所有 index.html 引用的资源都在
- **关联 Chg**：P-20261019-005 / commit 338feef
- **关联路径**：`scripts/sync-dist.cjs`、`index.html`、`dist/` 目录
- **重现次数**：1（2026-10-19）

#### Iss-001 🟠 TOP2（活跃 · 踩 2 次）jsdom Uint8Array 跨 realm 检测失败

- **问题**：jsdom `<canvas>` 创建的 Uint8Array 是 window realm 的，`instanceof Uint8Array` 在 Node realm 里返回 false
- **根因**：jsdom 有自己的全局对象，Uint8Array 构造函数与 Node 原生不同
- **解决**：测试里用 `window.Uint8Array` 或 `Object.prototype.toString.call(buf) === '[object Uint8Array]'`
- **预防规则**：写 `// TODO: [jsdom-Uint8Array] 预防：jsdom 环境下 instanceof Uint8Array 要用 window.Uint8Array` 到 regression.cjs 头部
- **关联路径**：`test/regression.cjs`、所有用 canvas getImageData 的测试

#### Iss-002 🟠 TOP2（活跃 · 踩 2 次）PowerShell 5 中文注释被 GBK 误读

- **问题**：PowerShell 5 读取含中文注释的脚本参数行时，按 GBK 解码导致参数错乱
- **根因**：Windows PowerShell 5 默认系统编码（中文系统为 GBK），参数行含 UTF-8 BOM 或中文会触发
- **解决**：所有 PS 脚本参数行纯 ASCII；中文注释放 `#` 单独行且不在参数行同一行
- **预防规则**：写 `# TODO: [PS5-GBK] 预防：参数行纯 ASCII，中文注释单独 # 行` 到构建脚本头部
- **关联路径**：`scripts/sync-dist.cjs` 调用的 PS 脚本、`build-windows.bat` 间接调用的 PS

#### Iss-005 🔴 TOP1（活跃 · 踩 7 次）WebView2 对某些 GIF 变种原生解码失败

- **问题**：GIF 文件在 Rust 侧正确透传 data URL（data:image/gif;base64,...），但前端 <img src> 触发 onerror → "无法解码：xxx.gif"
- **根因**：WebView2（Chromium）对某些 GIF 格式变种/损坏文件（IE 缓存中的 .gif、超大 GIF、非标准 color table）原生解码失败
- **解决**：Dc-008 方案 B（Chg-011）—— 本地文件 gif 原生透传播动画，坏 GIF 前端 onerror → decode_fallback → JPEG 第一帧；顺修 is_image 漏 gif 导致文件夹扫描整个跳过 GIF
- **踩坑 v2 根因（Chg-022）**：read_archive_entry 里 GIF 也被当作 NATIVE_EXTS 原生透传（L166 直接 return raw base64），但前端 onerror 兜底拿不到 zip 内子文件路径（item.path 是 zip 文件路径）→ 压缩包内坏 GIF 永远显示"无法解码"；且旧 L171-187 有个"GIF 走 image crate"的 matches 分支是**死代码**（永远走不到）
- **最终修复（Chg-022）**：read_archive_entry 里 GIF 单独 `if ext == "gif"` 提前处理 → image crate → JPEG 第一帧（压缩包内静态，符合设计意图）；同时加固 decode_to_rgb 用 with_guessed_format 基于文件头探测
- **踩坑 v3 遗漏（Chg-029 · 2026-10-15）**：主图 + 压缩包路径修完后，first_thumb（最近访问缩略图）和 genThumb（底部缩略图生成）两个路径遗漏 —— first_thumb 里 GIF 在 NATIVE_EXTS 直接透传原始 data URL；genThumb 无 im.onerror 绑定，解码失败静默空白
- **闭环修复（Chg-029）**：first_thumb 加 GIF 提前拦截（和 read_archive_entry 统一）；genThumb 加 onerror → decode_fallback 兜底；GIF 四路径现在全部闭环
- **预防规则**：新增"WebView2 原生支持格式"时要加真实文件验证；read_archive_entry + first_thumb 两处 GIF 不能进 NATIVE_EXTS，必须 image crate 转 JPEG 第一帧；所有 img 元素必须绑 onerror
- **关联路径**：`src-tauri/src/lib.rs` / load_paths / read_archive_entry / first_thumb / decode_to_rgb；`app.js` / genThumb
- **重现次数**：7（2026-10-10 v2 压缩包内 GIF + 2026-10-15 v3 first_thumb/genThumb 遗漏）

#### Iss-007（已沉淀 · 踩 1 次归档 · 2026-10-13 Android 真机验证发现）手动拷贝 .so 构建 APK 缺 mobile_entry_point JNI 符号

- **问题**：手动编译 Rust `cargo build --target aarch64-linux-android --release` + 手动拷 `.so` 到 `gen/android/app/src/main/jniLibs/` 再 `gradle assembleRelease` → APK 安装后启动立即崩溃 `java.lang.UnsatisfiedLinkError: No implementation found for void com.lvjiaoxi.viewer.Rust_create()`
- **根因**：`#[cfg_attr(mobile, tauri::mobile_entry_point)]` 宏在**手动 cargo build** 时不会触发 JNI 桥生成流程——只有 `tauri android build` 会执行 Rust 编译 + JNI 符号生成 + Kotlin 文件生成 + APK 组装的完整管线
- **解决**：唯一正确入口 = `tauri android build --apk`；手动 cargo build 只能产出裸 .so（符号齐全但无 JNI 桥），无法被 APK 正常加载
- **预防规则**：Android APK 构建**禁止**手动 cargo build + 手动拷 .so；永远走 `tauri android build` 作为唯一入口
- **关联路径**：`src-tauri/src/lib.rs` run() 函数 / `src-tauri/gen/android/` 整个目录
- **重现次数**：1（2026-10-13 真机验证首次发现）

#### Iss-008（活跃 · 踩 1 次 · 2026-10-14 tauri android build 管线）armv7/x86_64 交叉编译缺 C 编译器 PATH

- **问题**：`tauri android build --apk` 默认构建 4 架构（arm64/armv7/x86/x86_64），armv7 编译 Rust 代码报 `zstd-sys: failed to find tool "clang.exe": program not found` → 产物 `.so` 不生成 → gradle rust 插件报 `Library artifact not found`
- **根因**：
  1. Rust 依赖 `zstd-sys`（含 C 代码），`cc-rs` crate 在 armv7 交叉编译时需要 NDK 的 `clang.exe`
  2. NDK 有 `armv7a-linux-androideabi24-clang.cmd`（正确的 armv7 linker），但**通用 clang.exe 不在 PATH 里**
  3. `tauri android build` 只设置了 `CARGO_TARGET_*_LINKER`，没设置 `CC_armv7_linux_androideabi` 或把 NDK bin 加入 PATH
- **解决（正式 · 2026-10-14 验证通过）**：构建前设置 3 组环境变量：
  1. 把 NDK/bin 加入 PATH：`$env:PATH = "$env:NDK_BIN;$env:PATH"`（给 cc-rs 找通用 clang.exe）
  2. 设 CC 变量：`CC_armv7_linux_androideabi` / `CC_x86_64_linux_android` / `CC_i686_linux_android` = NDK 对应 clang.cmd
  3. 设 AR 变量（x86 架构）：`AR_x86_64_linux_android = llvm-ar.exe`（NDK 统一用 llvm-ar，不是每个架构各有 ar）
- **真机验证通过**（2026-10-14）：
  - arm64 + armv7 双架构 Rust 编译 + llvm-readelf 验符号干净
  - Universal APK 28.45MB（release 签名）
  - 真机 PID 28416 存活零崩溃
- **验证状态**：arm64 ✅ armv7 ✅ | x86_64/i686 ⏸（模拟器用，暂跳过；未来需配 AR_*）
- **关联路径**：`src-tauri/gen/android/buildSrc/.../RustPlugin.kt`（4 架构默认配置）
- **重现次数**：2（2026-10-14 全管线验证 + 2026-10-16 Chg-030 第二次踩，忘设环境变量直接报）

#### Iss-010（已沉淀 · 踩 2 次归档 · 2026-10-16 Chg-030）Tauri CLI android build 的 target 限制 + NDK 版本不一致

- **问题**：
  1. `tauri android build --apk` 默认硬调 i686 + x86_64 + arm64 + armv7 四个架构，不看 `gradle.properties` 里的 `targetList`（RustPlugin.kt 读 `findProperty("targetList")` 但 Tauri CLI 内部调 `android-studio-script --target i686` 是硬编码）
  2. 环境变量 `$env:ANDROID_NDK_HOME` 设成 NDK 28.2，但 Tauri CLI 实际使用 `C:\Users\Administrator\.android-sdk\ndk\27.0.12077973`（ANDROID_HOME 指向的另一份）—— 两份 NDK 版本不一致
- **根因**：Tauri CLI v2.11.4 的 target 选择机制分两层：CLI 层（硬调 android-studio-script）+ gradle 层（RustPlugin.kt）。gradle.properties 里的属性只影响 gradle 层，但 CLI 层先硬调了
- **解决（正式 · 2026-10-16 验证通过）**：
  1. 指定目标架构用 **CLI -t 参数**：`npm run tauri -- android build --apk -t aarch64 armv7`
  2. 不依赖 gradle.properties 里的 targetList/archList/abiList（留作文档说明即可）
  3. 环境变量 ANDROID_NDK_HOME 设成 ANDROID_HOME 下面那份（`C:\Users\Administrator\.android-sdk\ndk\27.0.12077973`），让 Tauri CLI 和 cc-rs 用同一份 NDK
- **预防规则**：Android 构建命令必须包含 `-t aarch64 armv7`；NDK 路径在 ANDROID_HOME 下统一指向一份，别同时装多版本
- **关联路径**：`src-tauri/gen/android/buildSrc/src/.../RustPlugin.kt`、`src-tauri/gen/android/gradle.properties`
- **重现次数**：1（2026-10-16 Chg-030 构建时发现）

---


#### Iss-013 🟠 TOP2（活跃 · 踩 5 次 · 2026-10-18 P-006 第4批）渐进替换 sub-file + TDZ + replace 特殊序列

- **问题**：app.js 渐进替换裸调 → window.__API__.xxx() 过程中，子文件（edit.js/batch.js）闭包访问不到 app.js IIFE 内部变量；Object.assign 之前调用 window.__API__.xxx() 触发 TDZ；Node.js str.replace 的 $$ 被解释成单个 $
- **根因**：三重机制叠加——(1) IIFE 作用域隔离：子文件 IIFE 闭包看不到 app.js IIFE 内部顶层 const/let；(2) TDZ：Object.assign(__API, {...}) 之后才能安全调 __API.xxx()，之前调函数声明提升的裸调能跑但调 __API.xxx() 会炸；(3) Node.js String.prototype.replace 的 replaceValue 里 $$ 是特殊序列（代表单个 $），不是正则里的 $$ 匹配
- **踩坑 5 次**：
  - v1：子文件裸调 EMOJI_PRESETS/ORIENT_CSS/CRC_TABLE → TypeError：不是函数
  - v2：app.js Object.assign 前 40 处 window.__API__.xxx() → TDZ ReferenceError（loadSettings/applyTheme/next/prev 等）
  - v3：Node replace("$$('.x')", "window.__API__.$$('.x')") → $$ 被替换成单个 $ → window.__API__.$('.x')（单 $ 不是 $$）
  - v4：子文件注册块误加嵌套函数（clearTimer 等）→ IIFE 尾部访问不到
  - v5：app.js Object.assign 里注入子文件独占函数（readExif/editUndo 等）→ undefined → eval 炸
- **沉淀铁律**：
  1. Object.assign(__API, {...}) 之前的 window.__API__.xxx() 调用 **必须改回裸调**（函数声明提升安全）
  2. 子文件引用 app.js 顶层 const/let **必须** window.__API__.XXX（子文件闭包看不到）
  3. Node.js replace 涉及 $$/$ 时 **用函数形式 replaceValue**（() => 'xxx' + '$$' + 'yyy'）
  4. 子文件注册块 **只注册顶层函数**（缩进最少的那些），跳过嵌套函数
  5. regression.cjs eval 顺序：先单独 eval 所有子文件 IIFE，再 eval appJs 合并串
- **关联 Chg**：Chg-033 / Chg-034
- **关联路径**：app.js、js/edit.js、js/batch.js、test/regression.cjs

---
## 归档区（已沉淀 / 已解决，只追加不准删）

#### Iss-004（已沉淀 · 踩 3 次归档 · 2026-10-12）Tauri NSIS Setup.exe /S 静默安装在当前环境不可靠

- **问题**：Setup.exe 静默安装不可靠，三类表现：
  - **v1（踩 2 次）**：装上了但沿用 Registry 记录的旧路径，/D 被忽略 → lnk 指向已删目录
  - **v2（Chg-023）**：Setup.exe /S /D=C:\XXX 没装到 /D 指定路径，实际装到 Registry 最早的残留路径
  - **v3（Chg-024 根因锁定）**：**纯 Tauri NSIS 模板（无任何 hook）/S 也卡！** 临时移除 installerHooks 后 Build 测试 — Setup.exe /S 15s 不退出；但 C:\LVJX_NOHooks 里已经有 EXE 了
- **根因**：**Tauri bundler 内嵌的 NSIS 模板 Setup.exe /S 在当前 Windows 10 管理员环境下有缺陷** — 不是 installer.nsh hook 的问题。两轮隔离验证确认
- **最终 Workaround**：
  - **发版自动化验证**：release EXE 直接运行（二进制与安装版一致）
  - **Setup.exe 定位**：只做**用户交互式**安装包发布，不用于自动化 /S
  - **如需静默安装**：走 MSI（WiX）通道或 SCCM/GPO
- **关联 Chg**：Chg-023 / Chg-024 / Chg-S1
- **关联路径**：`src-tauri/installer.nsh`
- **归档原因**：根因锁定 + Workaround 确立 + 代码已简化

#### Iss-014（已沉淀 · 踩 3 次归档 · 2026-10-19）Setup.exe /S 静默安装 Registry 缓存 + AppData EXE 不自动更新

- **问题**：Setup.exe /S 静默安装被 Registry 缓存骗过——HKCU ProgId 飘到旧 EXE 路径（如 C:\LVJX_VERIFY），导致双击图片只开软件不显示；且 AppData 正式路径的 EXE 不自动更新到最新 build
- **根因**：Tauri NSIS 模板 /S 缺陷（Iss-004 归档已记录）+ 多次不同路径安装后 Registry 飘 + Setup.exe 不自动覆盖 AppData 已安装 EXE
- **踩坑 3 次**：
  - v1（Chg-B1 2026-10-17）：飘到 C:\LVJX_A_TEST → 手动删目录 + 注册表
  - v2（P-002 2026-10-19 上午）：飘到 C:\LVJX_VERIFY → 手动 Set-ItemProperty 修正 HKCU + 删除旧目录
  - v3（P-003 2026-10-19 下午）：AppData EXE 是 10-17 旧 build（15.53MB）→ PSD 解码代码在 10-18 build 里 → 手动 Copy-Item release EXE 覆盖（16.02MB）
- **沉淀铁律**：
  1. 构建新功能后**必须手动 Copy-Item** release EXE → AppData 正式路径，不能只靠 Setup.exe /S
  2. 本机验证双击文件关联前先查注册表：`Get-ItemProperty HKCU:\Software\Classes\LvJiaoXiImage\shell\open\command`
  3. Setup.exe 只做用户交互式发布，本机自动化验证走 release EXE 直跑
- **关联 Chg**：Chg-B1 / P-002 / P-003 / P-005
- **归档原因**：踩够 3 次 + 沉淀铁律确立

#### Iss-011（已解决 · 2026-10-17）Windows 资源管理器缩略图变程序图标

- **问题**：绿角犀看图设为默认图片打开方式后，资源管理器里 .png/.jpg/.gif 等缩略图显示成绿角犀程序图标，不是图片真实内容
- **根因**：Tauri 注册了 Shell 关联（双击打开），但没注册 Windows Shell Thumbnail Provider COM 组件。Windows 问不到真实缩略图就退而用程序图标顶上
- **解决**：装 Microsoft PowerToys（winget install --id Microsoft.PowerToys），其 File Explorer 模块内置 Thumbnail Provider 覆盖所有常见图片格式；重启 explorer.exe 生效
- **为什么不自己写**：Tauri 原生实现需要 ~200 行 Rust + COM 注册 + NSIS 安装时注册 COM 组件，维护成本高，且只覆盖 png/jpg。PowerToys 一次覆盖 png/jpg/gif/webp/heic/psd 等 + 零代码
- **预防规则**：涉及 Windows Shell 缩略图问题直接走 PowerToys，不自己实现 Thumbnail Provider COM 组件
- **关联 Chg**：Chg-P9
- **关联路径**：无项目代码改动（PowerToys 系统级解决）

#### Iss-012（已沉淀 · 2026-10-17 · 踩 3 次归档）渐进替换裸调与 regression 源码字符串断言冲突

- **问题**：regression.cjs 用正则 `appSrc.includes('xxx')` 或 `appSrc.match(/裸调形式/)` 检查源码中裸调用的存在，渐进替换把裸调改成 `window.__API__.xxx()` 后源码字符串不再匹配 → regression 失败
- **根因**：渐进替换改变了源码字符串形态，但 regression 用源码字符串断言锁定了裸调形式
- **踩坑 3 次**：
  - v1（Chg-032 第2批 render.js）：3 处源码断言 break → L942 renderDualPage / L1154 next / L1155 prev 改回裸调
  - v2（Chg-033 第3批 init.js）：handleOpenPaths+getSetting 正则只匹配裸调 → 改正则兼容 `(?:window.__API__\.)?` 可选前缀
  - v3（Chg-031 第1批 archive.js）：类似 Object.assign 注入问题（子文件独占函数不能注入）
- **沉淀方案**：
  1. 替换前先 grep regression.cjs 的 `appSrc.includes` 和源码正则，标记锁定行
  2. 锁定行要么**保留裸调**（加 `// TODO: [regression-lock] 保留裸调用`），要么**改正则兼容两种写法**（加 `(?:window.__API__\.)?`）
  3. 替换后必须跑 regression 验证
- **关联 Chg**：Chg-031 / Chg-032 / Chg-033
- **关联路径**：`app.js`、`test/regression.cjs`

> Iss-000 / Iss-001 / Iss-002 活跃区仍在；Iss-003 踩够 3 次自动归档

#### Iss-006（已解决归档 · 踩 1 次）decor pane 空 div + section 裸在 edit-body 外

- **问题**：编辑面板「特效」tab（data-pane="decor"）内容丢失 → 11 个 section 裸在 `.edit-body` 下，所有 tab 都显示
- **根因**：`index.html` `<div class="edit-pane" data-pane="decor">` 后立即 `</div>` → 空容器，11 个 section 变成裸 div
- **解决（Chg-U3 Dc-010）**：editMask 大重构时把 11 个裸 section 收回 decor pane + 加 sub-tab 导航
- **归档原因**：问题已修复，零复现（踩 1 次）

#### Iss-000（已沉淀）初始化占位

- **备注**：首个条目，方便后续归档追加时有参照格式

#### Iss-003（已沉淀 · 踩 3 次归档）regression.cjs 共享 jsdom document 残留值

- **问题**：regression.cjs 所有测试共享同一个 jsdom document，前序测试改过的 input.value / canvas 尺寸 / global state 会残留到后序测试
- **根因**：test 框架没有每个 test 独立 setup，同一个 document 贯穿全程
- **解决**：断言前显式 `element.value = '目标值'`，不要依赖默认值
- **预防规则**：写 `// TODO: [jsdom-document] 预防：断言前显式设目标值，别依赖上一个测试的残留` 到 regression.cjs 头部
- **关联路径**：`test/regression.cjs`
- **归档原因**：踩够 3 次，预防规则已注入 regression.cjs 头部

#### Iss-009（已沉淀 · 踩 1 次归档 · 2026-10-14）Android 12+ force-stop 后 App 进入 stopped=true 状态

- **问题**：`am force-stop com.lvjiaoxi.viewer` 之后，`am start -n com.lvjiaoxi.viewer/.MainActivity` 返回 `Warning: Activity not started, intent has been delivered to currently running top-most instance`，但进程不存在
- **根因**：Android 12+（targetSdk >= 31）安全机制：App 被 force-stop 后进入 `stopped=true` 状态，**只有用户手动点击桌面图标才能清除**。`am start` 被认为是自动化启动，不清除 stopped
- **解决**：force-stop 后让用户手动点击 App 图标启动一次，之后 adb 自动化才能正常工作
- **归档原因**：问题罕见（一般不会 force-stop 后立刻 am start），已记录预防规则，活跃坑硬限挤位归档
