---
name: tauri-build-guide
description: 绿角犀看图构建手册。含 sync-dist、sw.js CACHE 规则、NSIS 中文配置、版本号流水线、PowerShell 5 踩坑。
trigger: 每次构建前、改版本号后、生成安装包时
---

# Tauri Build Guide · 绿角犀看图

## 一键构建流程

```bash
# 方式一：build-windows.bat（全部串行）
./build-windows.bat

# 方式二：手动分步
# 1. 跑回归测试（必须全绿）
node test/regression.cjs
# 2. 同步前端资源到 dist/
node scripts/sync-dist.cjs
# 3. Tauri release 构建（同时出 EXE + NSIS + MSI）
npm run tauri build
# 4. 复制产物到 nsis_x/
Copy-Item src-tauri/target/release/bundle/nsis/*.exe nsis_x/ -Force
Copy-Item src-tauri/target/release/bundle/msi/*.msi nsis_x/ -Force
```

## sync-dist.cjs 同步清单

```js
// 8 个前端文件 + assets/ 目录
const files = [
  'app.js', 'index.html', 'styles.css', 'sw.js',
  'manifest.webmanifest', 'libheif-bundle.js',
  '使用说明.html', 'icon.svg'
];
const dirs = ['assets/'];  // 含 ort/ + sub_pixel_cnn.onnx
```

**不跑 sync-dist 直接 build → EXE 里嵌的是旧前端资源！** 这是最高频的"为什么新功能用户看不到"的原因。

## sw.js CACHE 规则

```js
// sw.js 第 4 行
const CACHE = 'lvjiaoxi-viewer-v23';
```

| 什么时候 | CACHE 怎么改 |
|---|---|
| 改了 app.js | **必须 +1** |
| 改了 sw.js 本身 | **必须 +1** |
| 改了 index.html | **必须 +1** |
| 改了 styles.css | **可以不加，但建议 +1** |
| 改了后端 Rust | 不用改 |

**不加 CACHE → 旧 PWA 缓存拦截 → 用户看不到新功能！**

## NSIS 中文配置（tauri.conf.json）

```json
"nsis": {
  "installerHooks": "installer.nsh",
  "languages": ["SimpChinese"]
}
```

**不要删 `"languages": ["SimpChinese"]`！** 删了安装界面回到英文。

## 版本号流水线（改版本时完整 9 步）

```bash
# Step 1: Cargo.toml
# version = "0.1.0" → "0.2.0"

# Step 2: tauri.conf.json
# bundle.version = "0.2.0"

# Step 3: manifest.webmanifest
# "version": "0.2.0"

# Step 4: app.js aboutContent
# 标题里的 v0.1.0 → v0.2.0

# Step 5: sw.js CACHE（保持 +1 节奏，不要求跟版本号同号）
# 比如 v23 → v24

# Step 6: 回归测试 + sync-dist
node test/regression.cjs && node scripts/sync-dist.cjs

# Step 7: 构建
npm run tauri build

# Step 8: PowerShell 巡检 6 落点
$fv = (Get-Item src-tauri/target/release/lvjiaoxi-viewer.exe).VersionInfo
Write-Output "Cargo: $(rg version Cargo.toml | head -1)"
Write-Output "tauri.conf: $(rg bundle.version tauri.conf.json)"
Write-Output "manifest: $(rg version manifest.webmanifest)"
Write-Output "aboutContent: $(rg 'v0.\d+.\d+' app.js)"
Write-Output "EXE FileVersion: $($fv.FileVersion)"
Write-Output "EXE ProductVersion: $($fv.ProductVersion)"
Write-Output "sw.js CACHE: $(rg 'lvjiaoxi-viewer-v\d+' sw.js)"

# Step 9: Git commit
git add -A
git commit -m "chore: bump version to 0.2.0"
git push
```

## PowerShell 5 踩坑

| 坑 | 解法 |
|---|---|
| 参数行中文注释被 GBK 误读 | 参数行写纯 ASCII，注释挪到下一行 |
| `&&` 不支持 | 用分号 `;` 或 `if ($?)` |
| `$pid` 只读变量 | 用非 `$pid` 变量名（如 `$p`） |
| 中文路径在 Start-Process 里乱码 | 用 `-ArgumentList` 数组传参，不要拼接字符串 |

## 产物清单

```
src-tauri/target/release/
├── lvjiaoxi-viewer.exe                    ~14.6 MB
└── bundle/
    ├── nsis/绿角犀看图_0.1.0_x64-setup.exe  ~211 MB (含 WebView2 离线)
    └── msi/绿角犀看图_0.1.0_x64_zh-CN.msi    ~210 MB
```

## 安装包端到端验证

```powershell
# 静默安装
& "Setup.exe" /S /D=C:\LVJX_TEST
exit_code=0 + 目录存在 + EXE FileVersion 正确

# 启动
$proc = Start-Process ".\lvjiaoxi-viewer.exe" -PassThru
$proc.Responding  # True

# 卸载
& ".\uninstall.exe" /S
# 目录完全删除
```

## 交付前检查清单

- [ ] node test/regression.cjs 全绿
- [ ] node scripts/sync-dist.cjs 已跑
- [ ] sw.js CACHE 已 +1（如果改了前端）
- [ ] npm run tauri build 成功
- [ ] 6 落点版本号巡检通过
- [ ] 安装包端到端验证通过
- [ ] Git commit push 到 GitHub
- [ ] CHANGELOG.md 补记
