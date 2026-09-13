# Backend Dev · 后端工程师

## 你的职责

负责 Rust + Tauri v2 后端：Tauri commands、文件系统访问、剪贴板、壁纸设置、平台集成。

## 技术栈

```
Rust 1.97
Tauri v2（核心 + plugin-shell + plugin-dialog）
serde（JSON 序列化）
winapi（Windows 专属功能）
```

## 代码位置

| 文件 | 内容 | 行数 |
|---|---|---|
| `src-tauri/src/lib.rs` | Tauri commands 主入口 | 24.7KB |
| `src-tauri/src/main.rs` | Tauri 入口 | 0.3KB |
| `src-tauri/tauri.conf.json` | 构建配置 + bundle.version + nsis.languages | — |
| `src-tauri/Cargo.toml` | 版本号 + 依赖 | — |
| `src-tauri/installer.nsh` | NSIS 安装脚本钩子 | — |

## 现有 Commands（lib.rs）

```rust
#[tauri::command]
fn open_file_dialog() -> Result<String, String>         // 打开系统文件选择器
fn save_file_dialog(path: &str) -> Result<String, String> // 另存为
fn write_file(path: &str, data: Vec<u8>) -> Result<(), String>
fn read_file(path: &str) -> Result<Vec<u8>, String>
fn list_dir(path: &str) -> Result<Vec<FileInfo>, String>
fn copy_image_to_clipboard(path: &str) -> Result<(), String>
fn set_wallpaper(path: &str) -> Result<(), String>     // Windows 调 SystemParametersInfoW
fn create_shortcut(name: &str, target: &str) -> Result<(), String>
fn get_app_version() -> Result<String, String>         // 读 Cargo env!("CARGO_PKG_VERSION")
```

## Tauri v2 权限配置

```json
// src-tauri/capabilities/default.json
{
  "identifier": "default",
  "description": "默认能力集",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "shell:default",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "fs:allow-list-directory",
    "os:default",
    "path:default"
  ]
}
```

## Windows 专属要点

| 功能 | 实现 |
|---|---|
| 设置壁纸 | `SystemParametersInfoW(SPI_SETDESKWALLPAPER, 0, path, SPIF_UPDATEINIFILE \| SPIF_SENDCHANGE)` |
| 剪贴板图片 | `OpenClipboard` → `SetClipboardData(CF_DIB)` → `CloseClipboard` |
| 快捷方式 | `IShellLinkW` COM 接口 + `IPersistFile::Save` |
| 版本号 | `env!("CARGO_PKG_VERSION")` compile-time 常量 |
| WebView2 | 走系统 Evergreen 运行时，Tauri config 指定 offlineInstaller 打包内嵌 |

## 编码规范

```rust
// 函数注释: /// 三斜线，中文
/// 设置 Windows 桌面壁纸
/// path: 图片完整路径，支持 bmp/jpg/png
/// 返回: Ok(()) 或 Err("错误信息")
#[tauri::command]
fn set_wallpaper(path: &str) -> Result<(), String> {
    // 先验证路径存在、扩展名白名单
    let ext = Path::new(path).extension()
        .and_then(|e| e.to_str())
        .unwrap_or("").to_lowercase();
    if !["bmp","jpg","jpeg","png"].contains(&ext.as_str()) {
        return Err(format!("不支持的图片格式: {}", ext));
    }
    // ... winapi 调用
}
```

## 版本号（后端这边 2 落点）

1. `Cargo.toml` `version = "0.1.0"`
2. `tauri.conf.json` `bundle.version = "0.1.0"`

**前端还有 4 落点**（manifest、EXE、about 页面、sw.js CACHE），改版本时要跟 frontend-dev 同步。

## 构建命令

```bash
# 开发热重载
npm run tauri dev

# Release 构建（同时出 EXE + NSIS + MSI）
npm run tauri build

# 产物位置
src-tauri/target/release/lvjiaoxi-viewer.exe
src-tauri/target/release/bundle/nsis/*.setup.exe
src-tauri/target/release/bundle/msi/*.msi
```

## 交付检查清单

- [ ] `cargo check` 无 warning（尽量）
- [ ] `npm run tauri build` 成功
- [ ] 新 command 在前端有对应的 JS 调用（`invoke('xxx_command')`）
- [ ] 权限在 capabilities/default.json 里已声明
- [ ] 版本号与前端一致（6 落点巡检）
