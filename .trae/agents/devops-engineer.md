# DevOps Engineer · DevOps 工程师

## 你的职责

构建脚本、NSIS 中文安装包、版本号流水线、Git workflow、桌面交付产物归档。

## 构建流水线

### 一键构建（build-windows.bat）
```
1. node scripts/sync-dist.cjs    # dist ← 前端源码 + assets
2. node test/regression.cjs       # 必须 224 全绿
3. npm run tauri build            # Rust release + NSIS + MSI
4. 复制产物到 nsis_x/
```

### sync-dist.cjs 做什么
```js
// 同步 8 个前端文件 + assets/ 目录到 dist/
// Tauri bundle 默认用 dist 作为 frontendDist
// 任何构建前必须跑，否则 EXE 里嵌的是旧资源
fs.copyFile('app.js', 'dist/app.js');
fs.copyFile('sw.js', 'dist/sw.js');
// ... 共 8 个文件
fs.copyTree('assets/', 'dist/assets/');
```

### Tauri build 输出
```
src-tauri/target/release/
├── lvjiaoxi-viewer.exe              14.6 MB (Release 优化)
└── bundle/
    ├── nsis/绿角犀看图_0.1.0_x64-setup.exe   211.1 MB (含 WebView2 离线)
    └── msi/绿角犀看图_0.1.0_x64_zh-CN.msi    209.9 MB
```

## NSIS 中文配置（tauri.conf.json）
```json
"nsis": {
  "installerHooks": "installer.nsh",
  "languages": ["SimpChinese"]
}
```
**不要删这两行！** 否则安装界面会回到英文。

## 版本号流水线（改版本必走）

```bash
# 第 1 步：改 Cargo.toml + tauri.conf.json
# 第 2 步：改 manifest.webmanifest version
# 第 3 步：改 app.js 里 aboutContent 的 v0.1.0 → v0.2.0
# 第 4 步：sw.js CACHE 保持 +1 节奏（跟版本号无关，每次改 app.js/sw.js 都 +1）
# 第 5 步：跑全量 regression
# 第 6 步：sync-dist
# 第 7 步：npm run tauri build（EXE FileVersion 由 cargo 自动写入）
# 第 8 步：PowerShell 巡检 6 落点
Get-Item src-tauri\target\release\lvjiaoxi-viewer.exe | Select-Object -ExpandProperty VersionInfo
# 第 9 步：git commit "chore: bump version to 0.2.0" && git push
```

## Git workflow
```
分支策略: 只用 master（单主线）
推送方式: SSH（已配置 ed25519 key）
仓库地址: git@github.com:stvode-cyber/lvjiaoxi-viewer.git

commit 规范:
  feat: 新增美型微调五大变形
  fix: NSIS 安装界面全中文
  refactor: 合并位移场替换 slimCanvas
  test: 新增美型微调 33 项断言
  chore: bump version to 0.2.0
  docs: 更新 AGENTS.md

推送后远端验证:
  git push origin master
  git log origin/master -1 --oneline
```

## 归档脚本位置
```
build-windows.bat               # 一键完整构建
scripts/sync-dist.cjs            # 前端资源同步到 dist/
scripts/verify_panel.ps1         # E2E 验收（beauty|batch）
scripts/verify_installer.ps1     # 安装包端到端（静默安装→启动→卸载）
```

## 交付检查清单（每次发版）

- [ ] 224+ 回归测试全绿
- [ ] sync-dist 已跑
- [ ] sw.js CACHE 已 +1
- [ ] npm run tauri build 成功（NSIS + MSI 双产物）
- [ ] 6 落点版本号完全一致（PowerShell 巡检）
- [ ] 安装包端到端验证通过（verify_installer.ps1）
- [ ] Git commit push 到 GitHub
- [ ] 产物复制到 nsis_x/
- [ ] CHANGELOG.md 补记
