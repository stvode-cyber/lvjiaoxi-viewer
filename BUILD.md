# 绿角犀看图 · Windows 原生客户端构建指南

本目录是一个 **Tauri v2 + 原生 Web 前端** 的 Windows 桌面看图应用。
Web 原型（`index.html` / `styles.css` / `app.js`）作为前端，Rust 后端（`src-tauri/`）负责
系统级能力：文件关联、单实例、系统壁纸、资源管理器定位、系统剪贴板位图、TIFF/TGA 原生解码。

> ✅ **2026-09-01 首次真实构建成功**：NSIS + MSI 双安装包已产出（本机 Rust 1.97 + VS BuildTools + ghfast 镜像下载 NSIS/WiX）。
> 详见文末「构建实录 · 踩坑记录」。

---

## 一、前置依赖（构建机必须）

| 依赖 | 说明 | 安装 |
| --- | --- | --- |
| Rust (MSVC) | `x86_64-pc-windows-msvc` 工具链 | <https://rustup.rs> 安装时选默认 MSVC |
| Visual Studio Build Tools 2022 | 工作负载 **“使用 C++ 的桌面开发”**（提供 `cl.exe` / `link.exe`） | <https://visualstudio.microsoft.com/zh-hans/downloads/> |
| Node.js ≥ 18 | 提供 Tauri CLI 与图标生成 | 已自带（仓库用 22） |
| WebView2 运行时 | Evergreen，Win10/11 通常已预装 | <https://developer.microsoft.com/zh-cn/microsoft-edge/webview2/> |

> Tauri 在打包 NSIS/MSI 时会**自动下载**对应打包器，无需本机安装 NSIS/WiX。

---

## 二、一键构建

双击 `build-windows.bat`，或命令行执行：

```bat
build-windows.bat
```

脚本会自动：检查 Rust → 生成图标（如需）→ `npm install` → `npm run tauri build`。

构建完成后产物：

```
src-tauri\target\release\bundle\nsis\绿角犀看图_0.1.0_x64-setup.exe   # NSIS 安装包（含右键菜单注册）
src-tauri\target\release\bundle\msi\绿角犀看图_0.1.0_x64_zh-CN.msi    # MSI 安装包
```

---

## 构建实录 · 踩坑记录（2026-09-01 首次真实构建）

本次构建共修 5 个问题，已全部固化到配置/脚本，后续构建不应再遇到：

1. **NSIS 配置字段名**：`bundle.windows.nsis.customInstallerSections` 不是合法字段（schema 报错）→ 改为 `installerHooks`。
2. **frontendDist 指向项目根被拒**：Tauri v2 不允许 frontendDist 包含 `src-tauri` / `node_modules` → 新建 `dist/` 隔离目录，`beforeBuildCommand` 调 `scripts/sync-dist.cjs` 自动同步 7 个 Web 资源文件（index.html / app.js / styles.css / sw.js / manifest.webmanifest / icon.svg / 使用说明.html）。
3. **image crate feature 名**：`jpeg_rayon` 在 image 0.25 已移除 → 改为独立的 `rayon`。
4. **capability 标识符非法**：`lvjiaoxi-viewer:allow-load_paths` 含下划线不符合标识符规范 → 删除（Tauri v2 应用自身命令无需 capability 声明，权限系统只管插件命令）。
5. **MSI codepage 1252 装不下中文**：WiX 默认 en-US，light.exe 报 LGHT0311 → `bundle.windows.wix.language` 设为 `zh-CN`（codepage 936）。

**国内网络注意**：Tauri 打包时要从 GitHub 下载 NSIS / WiX（约 42MB），直连易超时。镜像方案（已验证可用）：

```powershell
# NSIS 3.11 → %LOCALAPPDATA%\tauri\NSIS（zip 内有顶层 nsis-3.11 目录需跳过）
curl.exe -L -o nsis-3.11.zip "https://ghfast.top/https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip"
# nsis_tauri_utils.dll → NSIS\Plugins\x86-unicode\additional\（注意 additional 子目录）
curl.exe -L -o nsis_tauri_utils.dll "https://ghfast.top/https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll"
# WiX 3.14 → %LOCALAPPDATA%\tauri\WixTools314\（注意目录名无点号）
curl.exe -L -o wix314.zip "https://ghfast.top/https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip"
```

> NSIS 必需文件清单（缺任何一个都会触发整目录重建重下）：makensis.exe、Bin/makensis.exe、Stubs/lzma-x86-unicode、Stubs/lzma_solid-x86-unicode、Plugins/x86-unicode/additional/nsis_tauri_utils.dll、Include/MUI2.nsh 等。

也可仅开发预览：`npm run tauri dev`（依赖 `serve.js` 在 8080 提供前端）。

---

## 三、手动构建步骤

```bat
:: 1. 生成图标（仅首次 / 图标变更时）
npm install @resvg/resvg-js --no-save
node scripts/gen-icons.cjs

:: 2. 安装依赖
npm install

:: 3. 构建（NSIS + MSI）
npm run tauri build
```

---

## 四、已就绪的构建要点（无需再改）

- **能力授权** `src-tauri/capabilities/default.json`：已为 4 个自定义命令
  `load_paths` / `set_wallpaper` / `reveal_in_explorer` / `copy_image` 添加
  `lvjiaoxi-viewer:allow-*`，并放开 `core:menu` / `core:tray`，否则桌面端 `invoke` 会被拒绝。
- **图标** `src-tauri/icons/`：由 `icon.svg` 经 resvg 生成 32/128/256/512 PNG 与 7 尺寸 ICO，
  满足 `tauri.conf.json` 的 `bundle.icon` 要求，否则 `generate_context!` 编译失败。
- **打包忽略** `src-tauri/.taurignore`：排除 `node_modules` / `test` / `.workbuddy` 等，
  避免把开发目录打进安装包（Tauri 默认也已忽略 `node_modules` / `src-tauri`）。
- **前端桥接** `app.js` 的 `desktop` 对象已对 `window.__TAURI__.core.invoke` 做能力检测，
  纯 Web 下自动降级，命令名与 Rust 完全一致；事件通道 `open-file` 与 Rust 单实例/`setup` 转发一致。
- **Service Worker** 仅在 `http/https` 下注册，`tauri://localhost` 下不注册，不会报错。

---

## 五、已知限制 / 扩展点

- **HEIC / HEIF / RAW(CR2/NEF/ARW/DNG) / PSD**：`load_paths` 当前返回错误。
  启用方式见 `src-tauri/src/lib.rs` 末尾说明：解除 `Cargo.toml` 中 `libheif-rs` / `rawler` / `psd`
  注释，并在 `decode_to_rgb` 增加对应分支。解码后统一经 `rgb_to_jpeg_data_url` 转 data URL。
- **TIFF/TGA 经 Rust 解码为 JPEG**：会丢失原图 EXIF 方向（浏览器 `<img>` 不会二次校正）。
  如需保留方向，可在 `decode_to_rgb` 中读取 kamadak-exif 并先旋转/翻转。
- **批量 DPI / WebP 分辨率**：Web 端已用字节级嵌入（见 `app.js` `setPngDpi` 等）；
  桌面端若需把处理后端迁到 Rust，可复用同一算法。
- **WebView2 固定版本**：若目标机器无 Evergreen 运行时，可在 `tauri.conf.json` 的
  `bundle.windows` 增加 `webviewFixedRuntime` 或 `bundledWebview2Runtime`。

---

## 六、CI 构建

`.github/workflows/build-windows.yml` 提供 GitHub Actions 工作流：
打 `v*` 标签或手动触发，在 `windows-latest` 上自动产出 NSIS + MSI 安装包作为 Artifact。

---

## 七、云端账户后端（可选功能）

应用支持可选云端账户（注册 / 登录 / 跨设备同步 设置·收藏·历史·资料）。后端为可选组件：

- **本地演示后端**：`server/mock-server.js`（零依赖 Node）。启动：
  ```bat
  node server/mock-server.js
  ```
  默认 `http://localhost:8787`（可用 `PORT=9000 node server/mock-server.js` 改端口）。数据存 `server/data/`（仅本机，请勿暴露公网）。
- **接真实后端**：前端「设置 → 高级 → 云端账户服务器地址」填入真实服务地址（留空用 localhost:8787）。契约见 `server/mock-server.js` 顶部注释（REST + JWT，端点 `/api/register` `/api/login` `/api/me` `/api/settings` `/api/favorites` `/api/history`，以及收藏图本体 `/api/favorites/image` 上传/下载）。同步范围：设置·快捷键、收藏记录**及图片本体**、浏览历史、账户资料。
- **Tauri 客户端注意**：`tauri.conf.json` 的 `app.security.csp` 当前为 `null`。若前端要连云端后端，需在 `connect-src` 放行后端地址，并保留 Tauri 默认 IPC 源（`ipc:` / `http://ipc.localhost`），否则 `fetch` 被 CSP 拦截。
- **安全提示**：mock 后端 JWT 密钥、明文文件存储、CORS `*` 均仅适合本地开发；生产后端须用 HTTPS、强密钥、数据库与哈希存储。token 在前端暂存 `localStorage`，Tauri 客户端建议迁移到系统凭据保管（如 `tauri-plugin-keyring`）。
