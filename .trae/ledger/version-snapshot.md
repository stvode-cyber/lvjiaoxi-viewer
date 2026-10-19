> 📂 角色索引：▶ 必读：发版前后对齐版本号；跳过：非发版期
# 绿角犀看图 · 版本快照（自动更新，每次发版同步）

> 新 AI 接手先看这份——所有版本号、产物路径、资质证书位置一目了然

---

## 当前版本：**v0.1.0**（2026-10-18 21:16:59 构建）

### 6 落点版本号（必须全同，发版前自检）

| # | 落点 | 版本号 | 文件位置 |
|---|------|--------|----------|
| 1 | tauri.conf.json bundle.version | `0.1.0` | `src-tauri/tauri.conf.json` L4 |
| 2 | Cargo.toml package.version | `0.1.0` | `src-tauri/Cargo.toml` L3 |
| 3 | EXE FileVersion (自动) | `0.1.0` | 从 tauri.conf.json 同步 |
| 4 | EXE ProductVersion (自动) | `0.1.0` | 从 tauri.conf.json 同步 |
| 5 | manifest.webmanifest version | `0.1.0` | `manifest.webmanifest` L14 |
| 6 | app.js aboutContent 标题 | `v0.1.0` | `app.js` L5052 |
| — | sw.js CACHE 常量（前端缓存版本） | `v82` | `sw.js` L4（改前端必须 +1） |

### 构建产物

| 产物 | 路径 | 大小 | 构建时间 |
|------|------|------|----------|
| Setup.exe (NSIS) | `nsis_x/绿角犀看图_0.1.0_x64-setup.exe` | 212.89MB | 2026/10/18 21:16:59 |
| release EXE | `D:\tauri-build\target\release\lvjiaoxi-viewer.exe` | 16.02MB | 2026/10/18 21:17:15 |
| 安装目标 | `C:\Users\Administrator\AppData\Local\com.lvjiaoxi.viewer\` | — | Setup.exe 默认（⚠️ Setup.exe /S 有 Registry 缓存缺陷，见 Iss-014） |

### 核心依赖版本

| 依赖 | 版本 | 用途 |
|------|------|------|
| tauri | 2 | 桌面框架 |
| tauri-plugin-single-instance | 2 | 单实例 + CLI 转发 |
| image | 0.25 (jpeg/png/gif/bmp/tiff/tga/rayon/webp) | Rust 位图解码 |
| rayon | 1 | **新增**：load_paths 并行处理（37ms vs 1500ms）|
| base64 | 0.22 | data URL 编码 |
| zip | 2 | 压缩包直看（ZIP/CBZ）|
| kamadak-exif | 0.6 | EXIF 方向纠正 |
| serde/serde_json | 1 | 序列化 |
| arboard | 3 | 剪贴板位图（仅桌面）|

### Android 签名证书

| 项目 | 值 | 位置 |
|------|-----|------|
| keystore 文件 | `release.keystore` | `src-tauri/gen/android/app/release.keystore` |
| alias | 见 keystore.properties | `src-tauri/gen/android/app/keystore.properties` |
| 密码 | 见 keystore.properties | 同上 |
| **当前状态** | **release 签名就绪，Universal APK 35.38MB** | 2026-10-17 Chg-030 验证通过 |

### 发版流水线（步骤）

```
1. 改版本号：同步 6 落点（tauri.conf.json / Cargo.toml / manifest.webmanifest / app.js 标题 / EXE 自动 / sw.js CACHE+1）
2. cargo check && node test/regression.cjs （全绿才继续）
3. node scripts/sync-dist.cjs （同步前端资源到 dist/）
4. npm run tauri build → Setup.exe + MSI
5. 复制产物到 nsis_x/
6. Setup.exe /S 覆盖安装到 AppData
7. 验证：双击图片 → 主图显示 → 日志全链路通
8. git add -A && git commit -m "chore: bump to vX.X.X" && git push
9. 更新本文件 version-snapshot.md
```

### 调试工具快速查

| 工具 | 路径/命令 | 用途 |
|------|-----------|------|
| 启动日志 | `%TEMP%\lvjx-debug.log` | Rust 端全链路日志（含毫秒时间戳）|
| 文件关联注册表 | `HKCU:\Software\Classes\LvJiaoXiImage\shell\open\command` | EXE 路径正确性检查 |
| 窗口调试 | F12（WebView DevTools）| 前端 DOM / Console / Network |
| Android logcat | `adb logcat -d | Select-String "chromium\|__androidOpenFile"` | intent 链路验证 |
| 缩略图窗口常量 | `THUMB_HALF_WIN = 3`（app.js 内搜索）| ±3 张窗口 |

### 版本历史

| 版本 | 日期 | 关键变更 | 台账 |
|------|------|----------|------|
| v0.1.0 (当前) | 2026-10-17 | rayon 并行 load_paths（37ms）+ 毫秒时间戳 + 桌面双击修复 + Android intent 三件套 | Chg-034 / Chg-033 / Chg-032 / Chg-031 |
| v0.1.0 | 2026-10-16 | 缩略图虚拟滚动窗口（7 DOM 上限） | Chg-031 |
| v0.1.0 | 2026-10-15 | GIF decode_fallback 双点兜底 | Chg-029 |

---

**维护规则**：每次发版后必须更新本文件的【当前版本】和【6 落点版本号】段落。
