---
name: recursive-folder-browse
description: 穿透文件夹递归扫描实现指南。Rust load_paths 加 recursive 参数 + 前端 files.recursive 设置开关。对标 XnView MP。难度 ⭐
trigger: 要实现穿透子文件夹 / 递归扫描目录 / 单文件模式下也显示子目录图片时
---

# Recursive Folder Browse · 穿透文件夹递归扫描

## 竞品对标
- **XnView MP**：打开单张图片时，开启"Include Subfolders"后递归扫描父目录所有子目录
- **FastStone Image Viewer**：同样有 "Include Subfolders" toggle
- **IrfanView**：需插件实现，默认不穿透

## 架构

```
用户操作 → desktop.loadPaths(paths, getSetting('files', 'recursive'))
                    │
                    ▼
          Rust load_paths(paths, recursive: Option<bool>)
                    │
                    ▼
          collect_files(path, out, recursive)
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     文件夹路径             单文件路径
          │                   │
  始终 collect_images     recursive=true?
  （递归 ✅）             ├─ YES → collect_images(parent)     ← 穿透！
                          └─ NO  → collect_images_flat(parent) ← 默认
```

## 代码入口

| 位置 | 行号 | 用途 |
|---|---|---|
| `collect_files` 加 recursive 参数 | lib.rs ~227 | 核心分发逻辑 |
| `load_paths` 加 recursive: Option\<bool\> | lib.rs ~250 | Tauri command 签名 |
| `desktop.loadPaths(paths, recursive)` | app.js ~75 | 前端 desktop 模块 |
| `files.recursive` 设置定义 | app.js ~176 | toggle 开关（早已存在，之前未接入） |
| 5 个调用点统一加 getSetting | app.js ~3610, 4556, 4561, 4571, 4922 | 全部传递 recursive |

## 实现 Checklist

- [x] Rust `load_paths` 加 `recursive: Option<bool>` 参数（默认 false）
- [x] Rust `collect_files` 加 `recursive: bool` 参数
- [x] `recursive=true` 时单文件 → `collect_images(parent)` 递归父目录
- [x] `recursive=false` 时单文件 → `collect_images_flat(parent)` 仅一层（保持现有行为）
- [x] 文件夹路径 → 始终 `collect_images` 递归（不受 recursive 参数影响）
- [x] 前端 `desktop.loadPaths(paths, recursive)` 加第二参数
- [x] invoke 调用 `recursive: !!recursive` 确保 boolean
- [x] 所有 5 个 desktop.loadPaths 调用点统一传 `getSetting('files', 'recursive')`
- [x] 设置 `files.recursive` toggle 已存在（无需新建 UI）
- [x] Rust 单元测试 `load_paths(..., None)` 保持通过
- [x] regression +11 条断言（源码级验证参数传递 + Rust 签名 + 逻辑）
- [x] sw.js CACHE +1
- [x] sync-dist
- [x] tauri build → EXE + NSIS + MSI

## 测试模板

```js
test('穿透文件夹：设置开关 files.recursive 存在 + recursive 参数语义', async () => {
  const qj = window.__qj;
  const fs = require('fs');

  // 设置开关存在
  const appSrc = fs.readFileSync('app.js', 'utf-8');
  assert(appSrc.includes("group: 'files', key: 'recursive'"), 'files.recursive toggle 已定义');

  // 所有调用点都传了 getSetting
  const calls = (appSrc.match(/desktop\.loadPaths\(paths,\s*getSetting\('files',\s*'recursive'\)\)/g) || []).length;
  assert(calls >= 4, `调用点 >= 4（实际 ${calls}）`);

  // Rust 签名
  const rustSrc = fs.readFileSync('src-tauri/src/lib.rs', 'utf-8');
  assert(rustSrc.includes('fn load_paths(paths: Vec<String>, recursive: Option<bool>)'), 'Rust load_paths 签名正确');
  assert(rustSrc.includes('fn collect_files(path: &Path, out: &mut Vec<PathBuf>, recursive: bool)'), 'Rust collect_files 签名正确');
  assert(rustSrc.includes('recursive.unwrap_or(false)'), '默认 false');
});
```

## 关键设计决策

| 决策 | 理由 |
|---|---|
| **recursive: Option\<bool\>** | Tauri 2 支持 Option，前端未传时默认 false，**向后兼容** |
| **文件夹路径始终递归** | 打开文件夹 = 肯定要全包含，不需要再穿透开关 |
| **单文件路径受 recursive 控制** | 这才是"穿透"的核心场景：打开一张图，要能翻到子文件夹里的相邻图 |
| **前端 toggle 早已存在** | `{ group: 'files', key: 'recursive', type: 'toggle' }` 在 app.js 176 行，只需要把值传到 desktop 层 |

## 降级方案
- **recursive 未传** → `unwrap_or(false)` → 默认不穿透
- **collect_images 递归但子目录为空** → 自然跳过，不报错
- **权限不足** → `std::fs::read_dir` 返回 Err 时静默跳过该目录

## 难度评估

```
总难度: ⭐（极低）
- Rust 签名改动: ⭐
- 前端参数传递: ⭐（replace_all 一把梭）
- 测试: ⭐⭐（源码级验证）
- 核心发现: 递归函数 collect_images 早已存在，只是没被单文件路径调用
```
