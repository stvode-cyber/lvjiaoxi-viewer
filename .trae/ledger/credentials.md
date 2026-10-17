# credentials.md · 重要信息独立文件

> ⚠️ 本文件含敏感信息，已加入 .gitignore，**不进版本控制**！
> 换电脑 / 新 AI 接手时，从这里复制过来即可。

---

## GitHub 仓库

| 项 | 值 |
|----|----|
| 远程名 | origin |
| SSH 地址 | `git@github.com:stvode-cyber/lvjiaoxi-viewer.git` |
| 分支 | master（单主线开发） |

## Android Release Keystore

| 项 | 值 |
|----|----|
| 文件 | `src-tauri/gen/android/app/release.keystore` |
| keystore.properties | `src-tauri/gen/android/app/keystore.properties` |
| 备注 | 已加入 .gitignore（*.keystore / *.jks / release.keystore.bak） |
| alias | 见 keystore.properties |
| storePassword | 见 keystore.properties |

## 版本号落点（7 处必须全同）

| 落点 | 文件 | 示例查询 |
|------|------|---------|
| Tauri version | src-tauri/tauri.conf.json | `JSON.parse(f).version` |
| Cargo version | src-tauri/Cargo.toml | `^version = "0.1.0"` |
| manifest | manifest.webmanifest | `JSON.parse(f).version` |
| app.js about | app.js | `绿角犀看图 .*v0.1.0` |
| sw.js CACHE | sw.js | `lvjiaoxi-viewer-v68` |
| EXE 元数据 | 构建时自动写入 | FileVersion / ProductVersion |
| **自检脚本** | scripts/check-versions.cjs | `node scripts/check-versions.cjs` |

## 构建环境关键路径（新电脑必配）

| 项 | 值 | 备注 |
|----|----|----|
| ANDROID_HOME | `C:\Users\Administrator\.android-sdk` | 必须含 build-tools 34+ / platform 35 |
| ANDROID_NDK_HOME | `$ANDROID_HOME\ndk\27.0.12077973` | Tauri CLI 认这份，别同时装多版本 |
| NDK_BIN | `$ANDROID_NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin` | cc-rs 找 clang.exe |
| npm.bat | `nodejs\npm.bat` | **必须手动复制** npm.cmd → npm.bat（gradle rust 插件硬调 npm.bat）|
| Rust | `rustup default stable` | |
| Tauri CLI | `cargo install tauri-cli` | |

## Android 构建命令（铁律模板）

```powershell
# Iss-008 + Iss-010 环境变量
$env:ANDROID_HOME = "C:\Users\Administrator\.android-sdk"
$env:ANDROID_NDK_HOME = "$env:ANDROID_HOME\ndk\27.0.12077973"
$env:NDK_BIN = "$env:ANDROID_NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:PATH = "$env:NDK_BIN;$env:PATH"
$env:CC_armv7_linux_androideabi = "$env:NDK_BIN\armv7a-linux-androideabi35-clang.cmd"

# 唯一正确入口（Iss-007 + Iss-010）
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
node scripts/sync-dist.cjs
node scripts/check-versions.cjs   # 发版前必跑
npm run tauri build
# 产物: nsis_x/绿角犀看图_0.1.0_x64-setup.exe + MSI
```

## Setup.exe 安装路径默认

| 项 | 值 |
|----|----|
| 默认安装 | `C:\Users\Administrator\AppData\Local\com.lvjiaoxi.viewer\` |
| ProgId | `LvJiaoXiImage` |
| 关联命令 | `HKCR\LvJiaoXiImage\shell\open\command` |
| ⚠️ 预防 Iss-011 | 必须通过 Setup.exe 覆盖安装更新文件关联，禁止手动 Start-Process release EXE |

## Debug 日志路径

| 项 | 值 |
|----|----|
| lvjx-debug.log | `%TEMP%\lvjx-debug.log` |
| 启动时自动创建 | src-tauri/src/lib.rs dbg_log 函数（毫秒时间戳）|
| 读日志 | `Get-Content "$env:TEMP\lvjx-debug.log" -Tail 50` |
