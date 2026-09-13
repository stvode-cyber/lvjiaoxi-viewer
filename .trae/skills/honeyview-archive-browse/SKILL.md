---
name: honeyview-archive-browse
description: HoneyView 竞品差异化功能实现指南——压缩包直看（ZIP/RAR/7Z/CBR/CBZ 不解压直接浏览图片）。代码架构 + 依赖选型 + Tauri command 设计。
trigger: 实现压缩包浏览功能时
---

# HoneyView Archive Browse · 压缩包直看实现指南

## 竞品背景

HoneyView v5.53 的独家卖点：**不解压直接浏览 ZIP/RAR/7Z/CBR/CBZ/TAR/LZH/ALZ/EGG 内的图片**。漫画党刚需，图片分享链路上的高频场景。

## 技术选型

### 方案对比

| 方案 | 原理 | 大小 | 离线 | 可行性 |
|---|---|---|---|---|
| **方案 A：libarchive.js（WASM）** | 浏览器端解压 | ~1.5MB | ✅ | ⭐⭐⭐⭐⭐ 推荐 |
| **方案 B：Rust 侧解压（zip/rar/7z crate）** | Tauri command 解压到临时目录 | +Rust 依赖 | ✅ | ⭐⭐⭐ 但破坏"纯嵌入"架构 |
| 方案 C：7z.exe 外部进程 | 调系统 7z | 依赖外部 | ⚠️ | ❌ 不可控 |

### 推荐方案 A：libarchive.js + 内嵌 WASM

```bash
# 下载
npm install libarchive.js  # 或直接把 dist/libarchive.js + libarchive.wasm 复制进 assets/
# 放在 assets/libarchive.wasm
# 放在 assets/libarchive.min.js
```

## 实现架构

### Step 1：Tauri Command 加文件头嗅探

```rust
// src-tauri/src/lib.rs
/// 嗅探文件头，判断是否压缩包
#[tauri::command]
fn detect_archive(path: &str) -> Result<bool, String> {
    let ext = Path::new(path)
        .extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    Ok(["zip", "rar", "7z", "cbz", "cbr", "tar", "lzh", "alz", "egg"].contains(&ext.as_str()))
}

/// 读压缩包内某个 entry 的字节
#[tauri::command]
fn read_archive_entry(path: &str, entry_index: usize) -> Result<Vec<u8>, String> {
    // 返回 entry_index 对应的原始字节
    // 前端拿到字节后 Blob → createObjectURL → <img src>
}
```

### Step 2：前端用 libarchive.js 解压

```js
// app.js 初始化
import Archive from 'libarchive.js/main.js';
Archive.init({
  workerUrl: 'assets/libarchive.worker.min.js',
  wasmBinaryPath: 'assets/libarchive.wasm',
});

// 用户打开 .zip → 我们识别为压缩包 → 用 libarchive 解压到内存
async function openArchive(path) {
  const fileBytes = await invoke('read_file', { path });
  const blob = new Blob([new Uint8Array(fileBytes)], { type: 'application/octet-stream' });
  const archive = await Archive.open(blob);
  const entries = await archive.getFilesArray();
  const imageEntries = entries.filter(e => isImageExt(e.file.name));
  // 构建图片列表，前端按需懒加载
  state.items = imageEntries.map(e => ({
    archivePath: path,
    entry: e.file,
    // 真正展示时调用 archive.extract(e.file) → Blob URL
  }));
}
```

### Step 3：懒加载（关键！大压缩包不能全解压）

```js
// 翻到某张图时才解压那一个 entry
async function loadArchiveImage(item) {
  const { blob } = await item.archive.extract(item.entry);
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;  // 缓存到 item.img
}
```

### Step 4：CBR/CBZ 双页翻模式（锦上添花）

```js
// 漫画阅读场景
state.comicMode = true;
state.comicDir = 'rtl';  // rtl=日漫右→左, ltr=欧美左→右

function renderComicPage() {
  if (state.comicMode) {
    // 画两个 canvas 并排
    // 第一页在右（rtl）或左（ltr）
  } else {
    // 正常单页
  }
}
```

## UI 位置

```
顶栏新增：
├── 📂 图片（打开文件夹）
├── 📦 压缩包（打开 .zip/.rar/.7z/.cbz/.cbr）  ← 新增
├── 🔧 设置
└── ...

打开压缩包后：
├── 缩略图列表（和文件夹一样）
├── 漫画模式开关（双页/单页）
├── 翻页方向（rtl/ltr）
└── 顶部标签：「📦 archive.zip（24 张图）」
```

## 文件列表 Tab 新增

```
导航条底部新增 tab：
[图片文件] [压缩包]
```

## 依赖打包

```json
// package.json（新增）
{
  "dependencies": {
    "libarchive.js": "^1.3.0"
  }
}
```

```bash
# sync-dist.cjs 需要同步
fs.copyTree('node_modules/libarchive.js/dist/', 'dist/assets/libarchive/');
# 包含 libarchive.min.js + libarchive.wasm + libarchive.worker.min.js
```

## 降级安全网

```js
// libarchive 加载失败 → 提示用户安装 7-Zip 后我们走外部进程
try {
  await Archive.init({ ... });
} catch (e) {
  toast('压缩包支持模块加载失败，请重启应用');
  // 或者降级方案：提示用户解压后用图片打开
}
```

## 测试 Checklist

```js
// regression 里 mock libarchive 模块
// 1. zip 压缩包里有 3 张 jpg → items.length === 3
// 2. rar 解压失败 → 有 toast 提示
// 3. cbz 压缩包 → comicMode 默认 true
// 4. 翻页到第 2 张 → lazy load 只加载这一张 entry
```

## 难度评估

```
总难度: ⭐⭐⭐
- 依赖引入 + 打包: ⭐⭐
- 内存解压 + 懒加载: ⭐⭐⭐
- 双页模式 + rtl/ltr: ⭐⭐
- 回归测试: ⭐⭐
```

## 竞品对比

| 竞品 | 压缩包 | 双页翻 | 格式 |
|---|---|---|---|
| **HoneyView** | ✅ ZIP/RAR/7Z/CBR/CBZ/TAR/LZH/ALZ/EGG | ✅ rtl/ltr | 独家卖点 |
| **XnView MP** | ✅ ZIP/RAR 基础 | ❌ | — |
| IrfanView | ✅ 插件 | ❌ | — |
| 我们（实现后）| ✅ ZIP/RAR/7Z/CBR/CBZ | ✅ rtl/ltr | 核心差异化 |
