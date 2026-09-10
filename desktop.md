# 绿角犀看图 · 桌面版（Tauri）构建指南

本目录已包含完整的 **Tauri v2 桌面脚手架**，把现有纯前端 Web 原型（index.html / styles.css / app.js）包装为原生桌面应用，覆盖 PRD 5.1 系统集成层与 5.2 后端解码。

> 重要：本环境无 Rust 工具链，**脚手架未经编译验证**。请在装有 Rust + Tauri CLI 的环境执行 `cargo tauri build` 验证并产出安装包。

## 目录结构

```
看图工具/
├── index.html / styles.css / app.js   # 既有 Web 原型（前端，零改动即可复用）
├── package.json                       # tauri 脚本（dev / build）
├── serve.js / manifest.webmanifest / sw.js / icon.svg   # 既有 Web/PWA 资源
└── src-tauri/
    ├── Cargo.toml                     # Rust 依赖（tauri / image / arboard / 单实例 ...）
    ├── tauri.conf.json                # 应用/窗口/打包/文件关联/NSIS 配置
    ├── build.rs
    ├── capabilities/default.json      # 权限（core + event + window）
    ├── installer.nsh                  # NSIS 右键菜单注册段
    └── src/
        ├── main.rs                    # 入口
        └── lib.rs                     # IPC 命令 + 托盘 + 单实例/CLI
```

## 前置条件

- 安装 [Rust](https://rustup.rs/)（stable）与 [Tauri CLI](https://v2.tauri.app/start/)：
  ```bash
  cargo install tauri-cli --version "^2.0"
  ```
- Windows 需 [Microsoft C++ 生成工具](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 与 WebView2（Win11 自带）。
- 生成应用图标（Tauri 需要 raster 图标）：
  ```bash
  cargo tauri icon path/to/icon.png
  ```
  可先用仓库内 `icon.svg` 转一张 512×512 PNG 作为源。

## 开发 / 构建

```bash
cd 看图工具
npm install            # 安装 @tauri-apps/cli
npm run tauri dev      # 开发模式（热重载前端）
npm run tauri build    # 产出 NSIS(.exe) + MSI 安装包（位于 src-tauri/target/release/bundle/）
```

## 桌面能力映射（PRD）

| PRD 条目 | 实现 |
|----------|------|
| 5.1 文件类型关联 | `tauri.conf.json` 的 `bundle.fileAssociations`（NSIS 安装时写入注册表） |
| 5.1 右键菜单集成 | `installer.nsh` 注册 `SystemFileAssociations\image\shell\LvJiaoXiViewer` 与 `Directory\shell` |
| 5.1 系统托盘 | `lib.rs::build_tray`（显示窗口 / 浏览图片 / 退出） |
| 5.1 单实例 + CLI | `tauri-plugin-single-instance` + `setup` 读取 `std::env::args()`，经 `open-file` 事件转发前端 |
| 5.2 后端解码 | `load_paths`：WebView 原生格式直传 data URL；TIFF/TGA 经 `image` crate；HEIC/RAW/PSD 为扩展点（见 lib.rs 末尾） |
| 5.2 EXIF 方向 | 前端 `makeCanvasOfCurrent` 已烘焙 orientation；Rust 侧 `kamadak-exif` 预留 |
| 5.4 设为壁纸 | `set_wallpaper`（Windows `SystemParametersInfo` / macOS `osascript` / Linux `gsettings`） |
| 5.4 资源管理器定位 | `reveal_in_explorer`（explorer /select / open -R / xdg-open） |
| 5.4 复制到剪贴板 | `copy_image`（arboard 写入位图，替代 Web ClipboardItem） |

## 前端桥接（Web 安全降级）

`app.js` 顶部新增 `desktop` 对象：仅当检测到 `window.__TAURI__.core.invoke` 时启用；纯 Web（双击 index.html / serve.js）下 `setWallpaper`/`revealInExplorer`/`copyCurrentImage` 自动降级为原有下载 / 复制文件名 / ClipboardItem 行为，**功能与表现完全一致**。桌面环境下 `desktop.loadPaths` 接收 Rust 返回的本地图片条目（含真实 path 与 data URL），并监听 `open-file` / `tauri://file-drop` 事件自动加载。

## 已知限制 / 后续

- **HEIC / HEIF / RAW / PSD 后端解码**：当前为扩展点（load_paths 返回「需后端解码」）。解除 `Cargo.toml` 对应 crate 注释并按 `lib.rs` 末尾示例在 `decode_to_rgb` 增加分支即可启用。
- **防火墙/签名**：生产分发建议配置 EV 代码签名证书（PRD 5.7 数字签名），避免 SmartScreen 拦截。
- **任务栏 Jumplist（PRD 5.1）**：Windows 原生 Jumplist 需额外 Win32 调用，建议作为后续增强（Rust 侧写 SQLite/JSON 记录最近图片，调用 `SHAddToRecentDocs`）。
- **自动更新（PRD 5.7）**：接入 `tauri-plugin-updater` 指向更新服务器 JSON。
