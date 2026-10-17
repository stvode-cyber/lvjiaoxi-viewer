# SKILL · android-build（Android 构建铁律）

> 用途：每次新电脑构建 Android APK / 或构建失败排障时按此模板走。
> 对应台账：Iss-007 / Iss-008 / Iss-009 / Iss-010 / Chg-030

---

## 核心铁律（三条，踩过 N 次才得出）

### 铁律 1：`tauri android build` 是**唯一正确入口**（Iss-007）
❌ 禁止手动 `cargo build --target aarch64-linux-android --release` + 手动拷 `.so`
→ 会缺 `mobile_entry_point` JNI 桥（20 个导出符号），APK 启动崩溃 `UnsatisfiedLinkError: No implementation found for void ... Rust_create()`

✅ 唯一正确：
```powershell
npm run tauri -- android build --apk -t aarch64 armv7
```

### 铁律 2：必须加 `-t` 指定双架构（Iss-010）
❌ 默认 4 架构（i686/x86_64/arm64/armv7）+ gradle.properties targetList 不生效（Tauri CLI 硬编码）

✅ 必须 `-t aarch64 armv7` 跳过模拟器用的 x86 系列

### 铁律 3：构建前设 3 组环境变量（Iss-008）
cc-rs crate 交叉编译时需 NDK clang.exe —— 不设会报 `failed to find tool "clang.exe"`：

```powershell
$env:ANDROID_HOME = "C:\Users\Administrator\.android-sdk"
$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\27.0.12077973"   # 和 ANDROID_HOME 下保持一致
$env:NDK_BIN = "$env:ANDROID_NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:PATH = "$env:NDK_BIN;$env:PATH"                         # cc-rs 找 clang.exe
$env:CC_armv7_linux_androideabi = "$env:NDK_BIN\armv7a-linux-androideabi35-clang.cmd"
# x86 系列额外：$env:AR_x86_64_linux_android = "$env:NDK_BIN\llvm-ar.exe"
```

---

## 完整构建命令（复制粘贴可用）

```powershell
# 1. 环境变量（必设）
$env:ANDROID_HOME = "C:\Users\Administrator\.android-sdk"
$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\27.0.12077973"
$env:NDK_BIN = "$env:ANDROID_NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:PATH = "$env:NDK_BIN;$env:PATH"
$env:CC_armv7_linux_androideabi = "$env:NDK_BIN\armv7a-linux-androideabi35-clang.cmd"

# 2. 构建（唯一入口 + 指定双架构）
npm run tauri -- android build --apk -t aarch64 armv7

# 3. 真机验证
adb install -r src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release.apk
adb shell am start -n com.lvjiaoxi.viewer/.MainActivity
Start-Sleep 3
adb shell pidof com.lvjiaoxi.viewer                      # 必须有输出 = 存活
adb logcat -d -t 20 | findstr /i "FATAL UnsatisfiedLinkError panic"  # 零匹配

# 4. 验符号（可选，llvm-readelf 在 NDK_BIN 里）
llvm-readelf -d "src-tauri\gen\android\app\build\rust\aarch64-linux-android\release\liblvjiaoxi_viewer_lib.so"
# 搜 Java_com_lvjiaoxi_viewer_Rust_create = 必须存在
```

---

## 常见故障排查

| 症状 | 根因 | 解法 |
|------|------|------|
| `failed to find tool "clang.exe"` | NDK_BIN 没加 PATH | 铁律 3 的环境变量 |
| `UnsatisfiedLinkError: Rust_create` | 手动 cargo build 缺 JNI 桥 | 铁律 1：改用 `tauri android build` |
| 默认 4 架构构建慢/失败 | gradle.properties targetList 不生效 | 铁律 2：加 `-t aarch64 armv7` |
| npm.bat 缺失（gradle rust 插件硬调 npm.bat） | 系统只有 npm.cmd | 手动复制 npm.cmd → npm.bat 到 nodejs 目录 |
| ResolverActivity 弹多个同名入口 | PackageManager 残留幽灵条目 | AndroidManifest intent-filter 加 `android:priority="100"` |
| force-stop 后 stopped=true，`am start` 不起 | Android 12+ 安全机制 | 让用户手动点桌面图标启动一次 |
| content:// fetch 被 WebView 拦 | WebView 默认 allowContentAccess=false | onWebViewCreate 加 `webView.settings.allowContentAccess = true` |
| handleIntent 丢消息（webViewRef=null） | onCreate 比 onWebViewCreate 先跑 | 加 pendingIntent 暂存 + onWebViewCreate 补调 |

---

## 注意事项

- `.gitignore` 已加 `src-tauri/gen/android/app/assets/`（自动生成，不跟源码走）
- 每次桌面端改 app.js / Cargo.toml 后，重构建 Android APK 会自动用新代码
- Android assets/ sw.js CACHE 必须和根目录 sw.js 一致（跑 `node scripts/sync-dist.cjs` + 手动 `Copy-Item dist\* src-tauri/gen/android/app/src/main/assets/ -Recurse -Force`）
