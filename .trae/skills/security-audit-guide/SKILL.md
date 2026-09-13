---
name: security-audit-guide
description: 绿角犀看图安全审计指南。覆盖 Tauri 权限、文件穿越、WebView2 边界、离线 AI 资源、剪贴板/壁纸命令、XSS 注入。
trigger: 发版前、新增 Tauri command 后、新增读写文件功能后
---

# Security Audit Guide · 绿角犀看图

## 1. Tauri 权限最小化

### 检查方法
```bash
cat src-tauri/capabilities/default.json
# 对照 Tauri v2 权限清单，确认每项都有用
```

### 当前权限清单（只保留实际用到的）
```json
{
  "core:default",           // 窗口管理
  "dialog:default",         // 文件选择器
  "shell:default",          // 外部打开
  "fs:allow-read-file",     // 只读单个文件
  "fs:allow-write-file",    // 写单个文件
  "fs:allow-list-directory", // 列目录
  "os:default",             // 平台信息
  "path:default"            // 路径操作
}
```

### 禁止出现
```
fs:allow-read-all       → 改白名单
fs:allow-write-all      → 改白名单
fs:allow-execute        → 严禁
shell:allow-open-all    → 改 allow-open-with
core:allow-relaunch     → 除非功能需要
```

## 2. 文件读写路径穿越

### 风险模式
```rust
// ❌ 错误：前端 path 直接透传
#[tauri::command]
fn read_file(path: &str) -> Result<Vec<u8>, String> {
    fs::read(path).map_err(|e| e.to_string())
}

// ✅ 正确：白名单 + canonicalize
#[tauri::command]
fn read_file(path: &str) -> Result<Vec<u8>, String> {
    let canonical = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    // 1. 检查扩展名白名单
    let ext = canonical.extension().and_then(|e| e.to_str()).unwrap_or("");
    if !["jpg","jpeg","png","webp","heic","gif","bmp"].contains(&ext) {
        return Err("不支持的文件格式".into());
    }
    // 2. 检查路径在允许目录内（用户目录）
    let allowed = std::path::Path::new(std::env::var_os("USERPROFILE").unwrap());
    if !canonical.starts_with(allowed) {
        return Err("访问被拒绝".into());
    }
    fs::read(&canonical).map_err(|e| e.to_string())
}
```

### 审计命令
```bash
rg -B2 -A10 '#\[tauri::command\]' src-tauri/src/lib.rs | rg 'path|Path'
# 每个 command 里出现 path 参数 → 检查有没有 canonicalize + 白名单
```

## 3. WebView2 安全

### tauri.conf.json security 段
```json
"security": {
  "allow-protocol-access": false,
  "asset-protocol-scope": ["**"]  // 只允许本地 bundled 资源
}
```

### 检查入口 URL 不是远程
```bash
rg 'dist/index.html' src-tauri/tauri.conf.json
# frontendDist 必须指向本地 dist/
# 禁止 https:// 开头的远程 URL 作为主入口
```

## 4. 离线 AI 资源

### 完整性验证
```bash
# 记录原始 SHA256（下载时）
certutil -hashfile assets/sub_pixel_cnn.onnx SHA256
certutil -hashfile assets/ort/ort.min.js SHA256

# 运行时禁止从网络加载
rg 'https?://' app.js | rg -i 'onnx|wasm|ort'
# 应无匹配 → 全部走本地 assets/
```

### 来源追溯
- `sub_pixel_cnn.onnx` → ONNX Runtime Models Zoo
- `ort.min.js` / `ort-wasm-simd-threaded.wasm` → npm `onnxruntime-web@latest`

## 5. 剪贴板/壁纸

### copy_image_to_clipboard
```rust
// 必须：path 存在验证 + 扩展名白名单 + 文件头 magic number
// 禁止：把任意字符串 path 直接当作文件写进剪贴板
```

### set_wallpaper
```rust
// 必须：文件头验证（PNG `89 50 4E 47` / JPEG `FF D8 FF`）
// SPI_SETDESKWALLPAPER 会接受任何路径 → 必须先确定是真图片
```

## 6. XSS / 注入

### 前端禁止事项
```bash
# 禁止 innerHTML 拼接用户可控内容
rg '\.innerHTML\s*=\s*`?\.?' app.js

# EXIF caption、云端评论、文件名等用户输入 → 必须用 textContent
# 动态 HTML 模板 → 用 document.createElement + textContent + appendChild
```

## 7. NSIS installer.nsh

### 禁止出现
```nsis
# ❌ 禁止执行外部脚本
ExecWait 'powershell.exe -Command ...'
# ❌ 禁止修改注册表启动项
WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run"
# ❌ 禁止下载 + 执行
NSISdl
```

## 审计输出模板

```markdown
## Security Audit · commit XXXXXXX

| 优先级 | 项 | 结果 | 备注 |
|---|---|---|---|
| P0 | Tauri 权限 | ✅ | 最小化 |
| P0 | 文件穿越 | ✅ | canonicalize + 白名单 |
| P1 | WebView2 | ✅ | 仅本地资源 |
| P1 | AI 资源 | ✅ | SHA256 已记录 |
| P1 | 剪贴板 | ✅ | 白名单 + magic |
| P2 | 前端注入 | ✅ | textContent 规范 |
| P2 | NSIS | ✅ | 无外部执行 |

结论: ✅ 通过 / ❌ 阻塞
```
