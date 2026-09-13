---
name: simple-inpainting
description: 消除笔简单版实现指南。Patch-Match Inpainting（SSD 7×7 补丁匹配 + Navier-Stokes 边界推进）+ 复用 mosaic 笔刷交互架构。对标光影看图 / FastStone。难度 ⭐⭐⭐
trigger: 要实现内容感知填充、消除笔、污点去除、inpainting 时
---

# Simple Inpainting · 消除笔简单版

## 竞品对标
- **光影看图**：「消除笔」涂抹后自动从周围采样填充
- **美图秀秀**：「消除笔」AI 内容感知填充（我们是 patch-match 简单版，非深度学习）
- **FastStone Image Viewer**：「Clone Stamp」仿制图章（需手动采样）
- **Adobe Photoshop**：「Content-Aware Fill」（我们对标其效果）

## 核心算法：Patch-Match Inpainting（Navier-Stokes 简化版）

```
笔触覆盖圆形 mask（Uint8Array W×H）
       │
       ▼
降采样到最长边 800px（双线性插值加速）
       │
       ▼
迭代填充：每次只处理 borderMask（mask 内但有邻居在 mask 外的像素）
       │
       ▼
findBestPatch()：在 31×31 搜索窗口里找 7×7 补丁的 SSD 距离最小者
  - 半分辨率粗搜（步长 2）
  - 精细搜（粗搜结果 ±2 邻域精确匹配）
  - 有效性阈值：源补丁至少 50% 像素不在 mask 里
       │
       ▼
复制最佳补丁（只填充 mask 内的像素，mask 外保持原值）
       │
       ▼
重新计算 borderMask → 向内推进
       │
       ▼
上采样回原分辨率（双线性）
```

### 参数表

| 参数 | 值 | 说明 |
|---|---|---|
| PATCH | 7 | 补丁大小 7×7 像素（奇数，中心对称） |
| HALF | 3 | PATCH / 2 floor |
| SEARCH | 15 | 搜索窗口半径 → 31×31 范围 |
| scale maxEdge | 800 | 降采样最长边（大图加速） |
| maxIter | ceil(√remaining / 2) | 最大迭代次数 |
| SSD threshold | 50% 有效像素 | 源补丁有效性阈值 |

### 时间复杂度

```
O(remaining × SEARCH² × PATCH² × 半分辨率加速因子)

典型情况（mask 覆盖 5% 的 1920×1080 图）：
  降采样到 ~444px 最长边
  remaining ≈ 444×444×0.05 ≈ 9800 像素
  每轮 ~9800 次匹配 × 搜索 ~225 × 补丁 49 × 步长 2² 粗搜
  ≈ 1100 万像素操作/轮
  10 轮迭代 ≈ 110M 操作 → 500-800ms（浏览器 JS）
```

## 架构亮点

### 100% 复用现有笔刷交互架构

```
state.mosaic  → state.eraser  （同结构 [{x,y,r}] 归一化笔触）
mosaicMode    → eraserMode
mosaicPainting → eraserPainting
mosaicRadiusNorm() → eraserRadiusNorm()
toggleMosaicMode() → toggleEraserMode()  (+ 互斥逻辑)
clearMosaic() → clearEraser()

drawMosaic(ctx, full, W, H)
drawEraser(ctx, full, W, H)  ← 在 drawMosaic 之前执行

editSnap() / restoreEdit()  ← 已覆盖 eraser + eraserMode
```

### 渲染流水线顺序

```
applyFilters(亮度/对比度/饱和度/色温/模糊/锐化/HSL)
    → applyDeformInPlace(瘦身/瘦脸/美型变形)
    → applyTone(高光/暗部/褪色/颗粒/暗角)
    → drawEraser  ← 消除笔 inpaint 原图像素（修改 full ImageData）
    → drawMosaic  ← 在 inpaint 后打码
    → drawTexts
```

### 预览 vs 导出

```
预览（renderEditPreview）:
  full = ctx.getImageData(0, 0, canvas.width, canvas.height)  ← 预览分辨率
  drawEraser(ctx, full, W, H)  ← 原地 inpaint
  ctx.putImageData(full, 0, 0)

导出（exportCanvasOfCurrent）:
  full = ctx.getImageData(0, 0, canvas.width, canvas.height)  ← 全尺寸！
  drawEraser(ctx, full, canvas.width, canvas.height)
  drawMosaic(ctx, canvas, ...)
  drawTexts(ctx, canvas.width, canvas.height)
```

## 代码入口

| 位置 | 行号 | 用途 |
|---|---|---|
| `patchMatchInpaint(full, strokes)` | app.js ~2621 | 核心 inpaint 算法 |
| `findBestPatch(data, mask, cx, cy, ...)` | app.js ~2772 | SSD 补丁匹配 |
| `drawEraser(ctx, full, W, H)` | app.js ~2823 | 渲染 + 笔触预览圈 |
| `toggleEraserMode()` | app.js ~2603 | 模式切换 + 互斥 |
| `clearEraser()` | app.js ~2615 | 清空 |
| `eraserRadiusNorm()` | app.js ~2613 | 笔刷半径归一化 |
| mouse down/move/up 接入 | app.js ~2999, ~3050, ~3091 | 涂抹交互 |
| renderEditPreview 调用 | app.js ~2864 | 预览时 inpaint |
| 导出烘焙调用 | app.js ~3288 | 全尺寸 inpaint |
| editSnap / restoreEdit 接入 | app.js ~1197, ~1204 | 撤销/重做 |
| state 初始化 | app.js ~325-327 | eraser / eraserMode / eraserPainting |
| reset 重置 | app.js ~617 | 切图时清空 |
| cacheDom 4 个 DOM id | app.js ~363 | eraserBtn / eraserSize / eraserSizeVal / eraserClear |
| index.html UI | index.html ~579-585 | 高级 tab 消除笔分区 |
| 事件绑定 | app.js ~4647 | toggleEraserMode / clearEraser |

## 实现 Checklist

- [x] state.eraser / eraserMode / eraserPainting 三字段
- [x] patchMatchInpaint 核心算法（mask 构建 + 降采样 + Navier-Stokes 迭代 + 上采样）
- [x] findBestPatch 双阶段搜索（半分辨率粗搜 ±2 精搜）
- [x] 降采样最长边 800px 加速（双线性插值）
- [x] 上采样回原分辨率（双线性）
- [x] borderMask 边界推进（Navier-Stokes 简化版）
- [x] maxIter 保护 + 卡住自动退出
- [x] drawEraser 渲染 + 半透明绿色笔触预览圈
- [x] mouse down/move/up 接入（三态涂抹）
- [x] toggleEraserMode + 互斥逻辑（退出 mosaic/slim/deform）
- [x] eraserRadiusNorm（笔刷半径归一化）
- [x] editSnap / restoreEdit 接入（撤销/重做）
- [x] reset 重置
- [x] renderEditPreview 调用（预览 inpaint）
- [x] 导出烘焙调用（全尺寸 inpaint）
- [x] cacheDom 注册 4 个 DOM id
- [x] index.html 高级 tab 消除笔 UI
- [x] 事件绑定（toggle + clear）
- [x] regression +33 条断言 → 338/0
- [x] sw CACHE +1
- [x] tauri build → EXE + NSIS + MSI

## 测试模板

```js
test('消除笔：patchMatchInpaint + findBestPatch + drawEraser + editSnap + UI', async () => {
  const fs = require('fs');
  const appSrc = fs.readFileSync('app.js', 'utf-8');

  // 核心算法存在
  assert(appSrc.includes('function patchMatchInpaint'), 'patchMatchInpaint 存在');
  assert(appSrc.includes('function findBestPatch'), 'findBestPatch 存在');
  assert(appSrc.includes('function drawEraser'), 'drawEraser 存在');

  // Patch 参数
  assert(appSrc.includes('PATCH = 7'), 'PATCH=7');
  assert(appSrc.includes('SEARCH = 15'), 'SEARCH=15');
  assert(appSrc.includes('scale = 800 / maxEdge'), '降采样 800px');

  // editSnap 接入
  assert(appSrc.includes("e: state.eraser || []"), 'editSnap 存 eraser');
  assert(appSrc.includes("state.eraser = s.e"), 'restoreEdit 恢复 eraser');
});
```

## 降级方案

| 场景 | 行为 |
|---|---|
| Canvas 不可用（jsdom） | `try { ... } catch(e) {}` 静默跳过 |
| mask 覆盖面积太大（> 50%） | maxIter 保护，可能残留未填充区域 |
| 所有补丁都在 mask 里（纯纯色块） | findBestPatch 返回 null → 该像素保持原值 |
| 图极小（< 100px） | 降采样不触发（scale = 1），直接全分辨率 inpaint |
| 浏览器无 createImageBitmap | 已用 document.createElement('canvas') 方案 |

## 效果边界

| 场景 | 效果 |
|---|---|
| 纹理重复区域（天空 / 砖墙 / 草地） | ⭐⭐⭐⭐⭐ 完美修复 |
| 均匀纯色背景上的文字/水印 | ⭐⭐⭐⭐⭐ 完美 |
| 复杂前景（人脸 / 动物）上的小污点 | ⭐⭐⭐⭐ 基本可用 |
| 大面积消除（> 30% 面积） | ⭐⭐ 可能残留明显接缝 |
| 纯色区域过渡处 | ⭐⭐⭐⭐ 效果一般但可接受 |
| 需要深度学习理解语义 | ⭐ patch-match 无法理解语义 |

## 扩展路线

| 功能 | 难度 | 说明 |
|---|---|---|
| **AI 消除（ONNX 模型）** | ⭐⭐⭐⭐ | 引入 LaMa / MAT 模型做真·内容感知，需要 WASM runtime + 离线模型 |
| 边缘羽化（blur seam） | ⭐ | mask 边缘高斯模糊 → 减少接缝 |
| 多通道并行（Web Worker） | ⭐⭐ | patch-match in Worker 线程，大图不阻塞 UI |
| 实时预览（每次 stroke 都跑 inpaint） | ⭐⭐⭐ | 目前是松手后完整跑一次，可以节流到 16fps |
| 撤销/重做更细粒度（每 stroke 一个快照） | ⭐⭐ | 目前只有 toggle 时 editSnap，改为 mouse down 时 snapshot |
