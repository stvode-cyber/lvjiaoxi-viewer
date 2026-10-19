# 🛠 Skill · 构建环境铁律（持续更新）

> **谁用**：所有要跑 `tauri android build` 或 `npm run tauri build` 的时候
> **前置依赖**：Android SDK + NDK / Rust stable / Node 18+
> **最近更新**：2026-10-19

---

## Android 构建前置（新电脑必配）

| 项 | 值 | 备注 |
|----|----|----|
| ANDROID_HOME | `C:\Users\Administrator\.android-sdk` | 必须含 build-tools 34+ / platform 35 |
| ANDROID_NDK_HOME | `$ANDROID_HOME\ndk\27.0.12077973` | **只有一份**，别同时装多版本 |
| NDK_BIN | `$ANDROID_NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin` | cc-rs 找 clang.exe |
| npm.bat | `nodejs\npm.bat` | **必须手动复制** npm.cmd → npm.bat（gradle rust 插件硬调 npm.bat）|
| Rust | `rustup default stable` | |

### 环境变量（构建前必跑）

```powershell
$env:ANDROID_HOME = "C:\Users\Administrator\.android-sdk"
$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\27.0.12077973"
$env:NDK_BIN = "$env:ANDROID_NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:PATH = "$env:NDK_BIN;$env:PATH"
$env:CC_armv7_linux_androideabi = "$env:NDK_BIN\armv7a-linux-androideabi35-clang.cmd"
```

## Android 构建命令（铁律）

```powershell
# 唯一正确入口（Iss-007 + Iss-010：禁止手动 cargo build + 手动拷 .so）
npm run tauri -- android build --apk -t aarch64 armv7

# 真机验证
adb install -r app-universal-release.apk
adb shell am start -n com.lvjiaoxi.viewer/.MainActivity
Start-Sleep 3
adb shell pidof com.lvjiaoxi.viewer   # 必须有输出
adb logcat -d -t 20 | findstr /i "FATAL UnsatisfiedLinkError panic"  # 零匹配
```

## 桌面构建命令

```powershell
node scripts/sync-dist.cjs          # 同步前端资源到 dist/
node scripts/check-versions.cjs     # 发版前必跑：6 落点版本号自检
npm run tauri build                 # 产出 Setup.exe + MSI
# ⚠️ Setup.exe /S 有 Registry 缓存缺陷（Iss-014），
#    本机验证：手动 Copy-Item release EXE → AppData + 手动 Set-ItemProperty 修正注册表
```

## 真机验证铁律

| 场景 | 命令 | 通过标准 |
|------|------|---------|
| 进程存活 | `adb shell pidof com.lvjiaoxi.viewer` | 有输出 |
| 零崩溃 | `adb logcat -d -t 20 \| findstr "FATAL"` | 零匹配 |
| intent 链路 | `adb logcat -d \| Select-String "__androidOpenFile"` | 能看到文件路径 |
| 桌面启动 | 双击 EXE | 主图显示，debug log 有 `setup` + `showImage finish` |

## 踩坑索引

| 坑号 | 问题 | 解法 |
|------|------|------|
| Iss-007 | 手动 cargo build 缺 JNI 符号 | 只用 `tauri android build` 入口 |
| Iss-008 | cc-rs 找不到 clang.exe | PATH + CC_armv7 环境变量 |
| Iss-009 | force-stop 后 App stopped=true | 让用户手动点图标启动一次 |
| Iss-010 | Tauri CLI 硬调 4 架构 | `-t aarch64 armv7` 参数 |
| Iss-014 | Setup.exe /S Registry 缓存 | 手动 Copy-Item EXE + 手动修正注册表 |
