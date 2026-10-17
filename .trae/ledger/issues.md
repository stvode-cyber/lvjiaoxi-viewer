> 📂 角色索引：▶ 必读：改文件前扫活跃坑；跳过：不碰源码时
# issues.md · 踩过的坑

> 活跃区：正在威胁当前开发的坑，改相关文件前必扫
> 归档区：踩够 3 次已沉淀或已解决的历史坑，只追加不准删

---

## 活跃坑（当前 ≤10 个，硬限）

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

#### Iss-006（活跃 · 踩 1 次）decor pane 空 div + section 裸在 edit-body 外

- **问题**：编辑面板「特效」tab（data-pane="decor"）内容丢失 → 边框/贴纸/海报/证件照/Logo/文字/马赛克/消除笔 11 个 section 在**所有 tab 下**都永远显示，严重干扰其他 tab 的使用
- **根因**：`index.html` L593 `<div class="edit-pane" data-pane="decor">` 后 L594 立即 `</div>` 闭合 → 空容器；L596-L773 的 11 个 section 裸在 `.edit-body` 直接子级。`.edit-pane { display:none }` 只对 pane 生效，裸 section 不受控
- **解决**：Dc-010 重构时顺便修了 —— 把 11 个裸 section 收回 decor pane，同时加 sub-tab 导航
- **预防规则**：写 edit-pane HTML 后必须确认所有 section 被对应 data-pane 容器包裹；用 `rg -n 'data-pane'` 检查闭合
- **关联路径**：`index.html` editMask 部分（L472-L887）
- **重现次数**：首次发现（2026-10-09 晚）

#### Iss-007（活跃 · 踩 1 次 · 2026-10-13 Android 真机验证发现）手动拷贝 .so 构建 APK 缺 mobile_entry_point JNI 符号

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

#### Iss-009（活跃 · 踩 1 次 · 2026-10-14 Android 12+）force-stop 后 App 进入 stopped=true 状态

- **问题**：`am force-stop com.lvjiaoxi.viewer` 之后，`am start -n com.lvjiaoxi.viewer/.MainActivity` 返回 `Warning: Activity not started, intent has been delivered to currently running top-most instance`，但 `ps -A | grep lvjiaoxi` 无进程，`pidof` 也找不到
- **根因**：Android 12+（targetSdk >= 31）安全机制：App 被 force-stop 后进入 `stopped=true` 状态，**只有用户手动点击桌面图标/通知/快捷方式才能清除 stopped 状态**。`am start` 被认为是自动化启动，不清除 stopped
- **解决**：force-stop 后让用户手动点击 App 图标启动一次，之后 adb 自动化测试才能正常工作
- **预防规则**：adb 自动化测试前先检查 `dumpsys package | grep stopped=`，如 stopped=true 先让用户手动启动
- **重现次数**：1（2026-10-14 intent 测试时 force-stop 踩坑）

#### Iss-010（活跃 · 踩 1 次 · 2026-10-16 Chg-030）Tauri CLI android build 的 target 限制 + NDK 版本不一致

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

#### Iss-000（已沉淀）初始化占位

- **备注**：首个条目，方便后续归档追加时有参照格式

#### Iss-003（已沉淀 · 踩 3 次归档）regression.cjs 共享 jsdom document 残留值

- **问题**：regression.cjs 所有测试共享同一个 jsdom document，前序测试改过的 input.value / canvas 尺寸 / global state 会残留到后序测试
- **根因**：test 框架没有每个 test 独立 setup，同一个 document 贯穿全程
- **解决**：断言前显式 `element.value = '目标值'`，不要依赖默认值
- **预防规则**：写 `// TODO: [jsdom-document] 预防：断言前显式设目标值，别依赖上一个测试的残留` 到 regression.cjs 头部
- **关联路径**：`test/regression.cjs`
- **归档原因**：踩够 3 次，预防规则已注入 regression.cjs 头部
- **活跃区位置**：见上（已从活跃区移出）
