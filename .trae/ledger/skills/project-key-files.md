# 🗂 Skill · 项目关键文件速查（持续更新）

> **谁用**：新 AI 接手 / 快速定位 / 版本号核对 / 调试
> **最近更新**：2026-10-19

---

## 一、核心文件路径

| 文件 | 路径 | 角色 |
|------|------|------|
| 前端主逻辑 | `app.js` | 全部前端（6200+ 行，零框架原生 JS） |
| UI 结构 | `index.html` | 全部 DOM |
| 样式 | `styles.css` | 全部 CSS（含 `:root.dark` 深色主题） |
| Service Worker | `sw.js` | **CACHE 常量改前端必须 +1** |
| Tauri 配置 | `src-tauri/tauri.conf.json` | bundle.version / NSIS SimpChinese / WebView2 |
| Rust 版本 | `src-tauri/Cargo.toml` | package.version / image features / ag-psd |
| 命令层 | `src-tauri/src/lib.rs` | load_paths / single_instance / get_image_data / decode_psd_thumbnail |
| 移动端入口 | `src-tauri/src/lib.rs` run() | **#[cfg_attr(mobile, tauri::mobile_entry_point)]** |
| 回归测试 | `test/regression.cjs` | **467 项全绿基线** |
| 资源同步 | `scripts/sync-dist.cjs` | 打包前必跑 |
| 版本自检 | `scripts/check-versions.cjs` | 发版前验 6 落点 |

### app.js 模块化拆分（渐进替换）

| 子文件 | 行数 | 模块 | 替换进度 |
|--------|------|------|---------|
| `js/exif.js` | 273 | EXIF + PNG chunk + SD Prompt | ✅ 100% |
| `js/archive.js` | 70 | handleOpenPaths + resolveItemSrc | ✅ 21/21 |
| `js/render.js` | ~450 | showImage + fit/缩放/旋转/缩略图 | ✅ 115/115 |
| `js/init.js` | ~180 | settings + theme + cacheDom + init | ✅ 231/231 |
| `js/edit.js` | 2299 | 美图管线（滤镜/变形/抠图/超分） | 🔄 TDZ 修复完成 |
| `js/batch.js` | 1194 | 海报/水印/批量转换 | 🔄 TDZ 修复完成 |

## 二、版本号落点（6 落点 + sw.js CACHE）

| # | 落点 | 当前值 | 文件 + 行号 |
|---|------|--------|------------|
| 1 | tauri.conf.json bundle.version | `0.1.0` | `src-tauri/tauri.conf.json` L4 |
| 2 | Cargo.toml package.version | `0.1.0` | `src-tauri/Cargo.toml` L3 |
| 3 | EXE FileVersion (自动) | `0.1.0` | 从 tauri.conf.json 同步 |
| 4 | EXE ProductVersion (自动) | `0.1.0` | 从 tauri.conf.json 同步 |
| 5 | manifest.webmanifest version | `0.1.0` | `manifest.webmanifest` L14 |
| 6 | app.js aboutContent | `v0.1.0` | `app.js` L5181 |
| — | **sw.js CACHE** | **v82** | `sw.js` L4（改前端必须 +1） |

## 三、Tauri 命令层（lib.rs .invoke_handler）

| 命令 | 行号 | 用途 | 状态 |
|------|------|------|------|
| load_paths | 373 | 文件夹/单文件 → 收集解码 → 元信息返回 | ✅ 零延迟（rayon 并行） |
| first_thumb | 452 | 最近打开缩略图 | ✅ |
| get_image_data | — | IPC 懒加载单张拉（Chg-035 核心）| ✅ |
| get_pending_paths | 99 | 单实例转发双击文件路径 | ✅ |
| set_wallpaper | — | 4 模式壁纸 | ✅ |
| reveal_in_explorer | — | 资源管理器定位 | ✅ |
| copy_image | — | 剪贴板位图 | ✅ |
| list_archive_entries | 112 | ZIP/CBZ 内图片列表 | ✅ |
| read_archive_entry | 141 | 按需读取压缩包单张 | ✅ |
| decode_fallback | 490 | 前端解码兜底（GIF→JPEG）| ✅ |
| decode_psd_thumbnail | 371 | **PSD/PSB 展平合成** | ✅ ag-psd 0.3 |
| flog | 368 | debug log → %TEMP%\lvjx-debug.log | ✅ 毫秒时间戳 |

## 四、调试工具速查

| 工具 | 路径/命令 | 用途 |
|------|-----------|------|
| 启动日志 | `%TEMP%\lvjx-debug.log` | Rust 全链路日志（setup/load_paths/get_pending_paths） |
| 读日志 | `Get-Content "$env:TEMP\lvjx-debug.log" -Tail 50` | PowerShell 尾部查看 |
| 注册表文件关联 | `HKCU:\Software\Classes\LvJiaoXiImage\shell\open\command` | 查/修 ProgId EXE 路径 |
| 桌面安装路径 | `C:\Users\Administrator\AppData\Local\com.lvjiaoxi.viewer\` | AppData 正式路径（⚠️ Setup.exe /S 不一定能覆盖）|
| 窗口调试 | F12 | WebView DevTools |
| Android logcat | `adb logcat -d -t 50 \| findstr "chromium\|openFile"` | intent 链路验证 |
| 跑回归 | `node test/regression.cjs` | 必须 467/0 全绿 |
| 版本自检 | `node scripts/check-versions.cjs` | 发版前 6 落点 |
| 资源同步 | `node scripts/sync-dist.cjs` | 打包前必跑 |

## 五、活跃坑 TOP 扫描（改代码前必看）

| 坑号 | 踩次数 | 症状 | 预防 |
|------|--------|------|------|
| Iss-005 | 7 | GIF 某些变种解码失败 | Rust 端 image crate 兜底（已闭环） |
| Iss-013 | 5 | 渐进替换 TDZ / $$ replace / 闭包变量 | Object.assign 前改回裸调 |
| Iss-014 | 2 | Setup.exe /S Registry 缓存 + AppData 不更新 | 手动 Copy-Item + Set-ItemProperty |
| Iss-008 | 2 | armv7 交叉编译缺 clang | PATH + CC_armv7 环境变量 |
| Iss-001/002 | 各 2 | jsdom Uint8Array / PS5 GBK | 用 window.Uint8Array / 参数行纯 ASCII |
