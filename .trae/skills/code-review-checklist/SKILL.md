---
name: code-review-checklist
description: 绿角犀看图代码审查 Checklist。每次 commit 后跑一遍，确保 6 落点版本号一致、面板形态合规、位移场管道完整、sw.js CACHE 已升、安全边界未破。
trigger: 任意代码改动后、提交前、合并前
---

# Code Review Checklist · 绿角犀看图

**触发条件**：每次 commit 后，代码审查员用这份清单过一遍。

## ✅ 必查 6 落点版本号一致性

```bash
# 1. Cargo.toml
rg '^version\s*=' src-tauri/Cargo.toml | head -1
# 2. tauri.conf.json
rg '"version":\s*"' src-tauri/tauri.conf.json
# 3. manifest.webmanifest
rg '"version":' manifest.webmanifest
# 4. app.js aboutContent
rg 'v0\.\d+\.\d+' app.js | rg -i 'about|copyright|版本'
# 5. sw.js CACHE（不要求跟版本号同号，要求递增）
rg 'lvjiaoxi-viewer-v\d+' sw.js
# 6. EXE FileVersion（构建后）
Get-Item src-tauri/target/release/lvjiaoxi-viewer.exe | Select-Object -ExpandProperty VersionInfo
```

## ✅ 必查面板形态

```bash
# 美图面板：必须是内嵌底部栏（.edit-panel border-top）
rg '\.edit-panel' styles.css
rg 'border-top' styles.css | rg -A0 -B0 edit-panel

# 批量面板：必须是遮罩弹窗
rg '\.batchMask|\.modal-mask' styles.css index.html

# 禁止：任何把 .edit-panel 改成 position: fixed + z-index 的写法
# 禁止：任何把美图功能塞进 .modal-mask 的写法
```

## ✅ 必查位移场管道

```bash
# 导出路径用 deformCanvas（含 slim + deform 合并）
rg 'deformCanvas\(full' app.js

# 预览路径用 applyDeformInPlace
rg 'applyDeformInPlace\(' app.js

# 禁止：单独调 slimCanvas / applySlimInPlace（被 deformCanvas / applyDeformInPlace 替代）
# 禁止：deform 和 slim 分开处理（会造成两次插值累积误差）
```

## ✅ 必查撤销快照完整性

```bash
# editSnap 新增 state 字段后，restoreEdit 必须对应恢复
rg -A5 'function editSnap' app.js
rg -A7 'function restoreEdit' app.js

# 新增 state.xxx 字段 → editSnap 里加 x: state.xxx
# restoreEdit 里加 if (s.x) state.xxx = s.x → 调用 updateXxxUI()
```

## ✅ 必查 sw.js CACHE

```bash
# 如果改了 app.js 或 sw.js
git diff --name-only HEAD~1 HEAD | rg 'app\.js|sw\.js'
# CACHE 常量必须 +1
git diff HEAD~1 HEAD -- sw.js | rg 'lvjiaoxi-viewer-v'
```

## ✅ 必查安全边界

```bash
# Canvas 像素操作要有 try/catch（jsdom 无像素环境）
rg 'getImageData|putImageData' app.js | rg 'try'

# Rust Tauri command 必须校验 path 参数
rg -A10 '#\[tauri::command\]' src-tauri/src/lib.rs

# 禁止 innerHTML 拼接用户可控内容
rg '\.innerHTML\s*=' app.js

# 禁止在 capabilities/default.json 出现 allow-write-all / allow-execute
rg 'allow.*all|allow.*execute' src-tauri/capabilities/default.json
```

## ✅ 必查 regression 测试

```bash
# 必须全绿
node test/regression.cjs 2>&1 | tail -3
# 新增功能必须有对应测试块
```

## 快速通过判定

```
6 落点全一致
+ 面板形态合规
+ deform 管道完整
+ editSnap / restoreEdit 字段匹配
+ sw.js CACHE 已升（如需要）
+ 安全边界未破
+ regression 全绿
= ✅ 通过
```
