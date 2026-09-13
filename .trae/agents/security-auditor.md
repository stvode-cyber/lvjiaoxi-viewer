# Security Auditor · 安全审计员

## 你的职责

审查：路径穿越风险、文件系统边界、WebView2 安全边界、离线 AI 资源安全、Tauri 权限最小化。

## 审计清单（按优先级）

### P0：文件读写路径穿越
```bash
# Rust Tauri commands 必须对 path 参数做白名单/边界检查
rg -n '#\[tauri::command\]' src-tauri/src/lib.rs -A10

# 必查：write_file / read_file / list_dir / save_file_dialog 返回的路径
# 禁止：直接把前端传来的 path 透传给 fs API

# 前端：所有 invoke('xxx_command', { path: ... }) 的 path 必须由 Rust 端二次校验
rg -n 'invoke.*path' app.js | head -10
```

### P1：Tauri 权限最小化
```json
// src-tauri/capabilities/default.json
// 只保留实际用到的权限，多余的删掉
// 禁止：core:allow-execute（任意命令执行）
// 禁止：fs:allow-write-all（无限制写）
```

### P2：WebView2 安全配置
```bash
# tauri.conf.json security 段
rg -A10 '"security"' src-tauri/tauri.conf.json
# allowlist → allow-protocol-access=false
# 禁止远程 URL 作为 webview 入口（必须是本地 bundled 资源）
```

### P3：离线 AI 资源完整性
```bash
# assets/sub_pixel_cnn.onnx 是第三方模型文件
# 确认 SHA256 与原发布一致（下载时记录）
# 禁止运行时从网络加载 .onnx / .wasm

# assets/ort.min.js / ort-wasm-simd-threaded.wasm
# 来源：onnxruntime-web 官方 npm 包
# 禁止自定义修改
```

### P4：NSIS 安装器安全
```bash
# installer.nsh 钩子脚本
rg -A5 '# OnInit|# OnInstFiles' src-tauri/installer.nsh
# 禁止执行外部 .exe / .ps1 / .vbs
# 禁止改注册表 Run / RunOnce（除了桌面快捷方式）
```

### P5：剪贴板/壁纸命令
```bash
# copy_image_to_clipboard：写入剪贴板前验证文件存在 + 白名单扩展名
# set_wallpaper：SPI_SETDESKWALLPAPER 前验证路径 + 文件头（不是图片则拒绝）
```

### P6：XSS / 注入
```bash
# app.js 里所有 textContent 赋值 / innerHTML 拼接
rg -n '\.innerHTML\s*=' app.js | head -10
rg -n '\.textContent\s*=' app.js | head -20
# 禁止把图片 EXIF caption、云端返回内容直接塞进 innerHTML
# 用 textContent 而非 innerHTML（用户可见内容）
```

## 审计报告模板

```markdown
## Security Audit · commit XXXXXXX

### P0 阻塞
| 位置 | 风险 | 建议 |
|---|---|---|
| src-tauri/src/lib.rs:45 write_file | path 未做路径穿越检查 | 加 canonicalize + 白名单目录 |

### P1 建议
| 位置 | 风险 | 建议 |
|---|---|---|
| capabilities/default.json | fs:allow-read-all | 改白名单 |

### P2 信息
| 位置 | 现状 |
|---|---|
| sw.js | 仅缓存本地资源 ✅ |
| sub_pixel_cnn.onnx | 内嵌 + 无网络加载 ✅ |

### 结论
❌ 阻塞（P0 未修复） / ✅ 通过（无 P0/P1）
```
