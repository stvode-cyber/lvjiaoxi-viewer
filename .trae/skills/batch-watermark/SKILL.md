---
name: batch-watermark
description: 批量加水印实现指南。drawWatermarkOnCanvas 纯函数 + 9 宫格 + tile 平铺 -30° + 批量主循环接入。对标 FastStone/IrfanView。难度 ⭐⭐
trigger: 要实现批量水印、版权文字、品牌 Logo 叠加时
---

# Batch Watermark · 批量加水印

## 竞品对标
- **FastStone Image Viewer**：文字 + 图片水印 / 九宫格 + 平铺 / 字号/透明度/边距
- **IrfanView**：类似但功能较简
- **美图秀秀**：非批量（单张水印）

## 架构

```
用户参数（DOM）:
  text / size% / opacity% / color / pos(9 宫格+tile) / margin% / format
       │
       ▼
updateWmUI() → 实时数值显示
renderWmPreview() → 200x200 canvas 缩略预览
       │
       ▼
批量主循环 batchTab === 'watermark'
       │
       ▼
batchWatermark(it) → loadImage → canvas.drawImage → drawWatermarkOnCanvas → toBlob
       │
       ▼
ZIP 打包下载
```

## 核心纯函数：drawWatermarkOnCanvas

```js
drawWatermarkOnCanvas(ctx, W, H, {
  text: '绿角犀',           // 空则跳过
  size: 5,                  // 字号，占图片短边的 5%
  opacity: 60,              // 0-100 → globalAlpha
  color: '#ffffff',         // fillStyle
  pos: 'br',                // tl/tc/tr/ml/mc/mr/bl/bc/br/tile
  margin: 3,                // 边距，占短边的 3%
})
```

### 位置计算

| pos | anchorX | anchorY | 坐标公式 |
|---|---|---|---|
| tl | left | top | (margin, margin + fontSize) |
| tc | center | top | (W/2, margin + fontSize) |
| tr | right | top | (W-margin, margin + fontSize) |
| ml | left | middle | (margin, H/2) |
| mc | center | middle | (W/2, H/2) |
| mr | right | middle | (W-margin, H/2) |
| bl | left | bottom | (margin, H-margin) |
| bc | center | bottom | (W/2, H-margin) |
| br | right | bottom | (W-margin, H-margin) |
| **tile** | center | middle | 网格遍历 gapX×gapY，每次 rotate(-30°) |

### Tile 平铺

```
gapX = textWidth × 1.8
gapY = fontSize × 2.2
每个 tile: translate → rotate(-30°) → fillText
opacity × 0.4（比单点淡，避免画面喧宾夺主）
```

## 代码入口

| 位置 | 行号 | 用途 |
|---|---|---|
| drawWatermarkOnCanvas 纯函数 | app.js ~3281 | 核心绘制逻辑（可独立调用） |
| batchWatermark | app.js ~3359 | 单张处理：canvas → toBlob |
| renderWmPreview | app.js ~3336 | 预览（调用 drawWatermarkOnCanvas） |
| updateWmUI | app.js ~3274 | 数值显示同步 |
| switchBatchTab watermark 分支 | app.js ~3271 | tab 切换接入 |
| 批量主循环 watermark 分支 | app.js ~3552 | ZIP 打包前调用 |
| 事件绑定 | app.js ~4688 | 7 个控件 input/change |
| cacheDom 注册 12 个 id | app.js ~352 | DOM 缓存 |

## 实现 Checklist

- [x] 纯函数 drawWatermarkOnCanvas（不依赖 state/DOM）
- [x] 9 宫格单点位置 + tile 平铺（-30° 斜向）
- [x] 字号 / 边距 按图片短边百分比（适配任意尺寸）
- [x] 透明度 globalAlpha + 单点黑描边增强可读性
- [x] renderWmPreview（200x200 canvas 缩略图预览）
- [x] batchWatermark（完整分辨率 canvas → toBlob）
- [x] index.html 批量面板第 6 个 tab
- [x] 7 个 DOM 控件（文字/字号/透明度/颜色/位置/边距/输出格式）
- [x] 批量主循环接入（watermark 分支）
- [x] 事件绑定（input + change → 实时预览）
- [x] regression +33 条断言 → 305/0
- [x] sw CACHE +1（v26 → v27）
- [x] tauri build → EXE + NSIS + MSI

## 复用关系

```
drawTexts(ctx, W, H) —— 美图面板 state.texts 版
         │
         │ 差异: state.texts 数组驱动 / 锚点 anchor
         │ 相同: canvas.fillText + strokeText + textAlign/BaseLine
         │
drawWatermarkOnCanvas(ctx, W, H, opts) —— 批量纯函数版
         │
         │ 差异: opts 单对象 / 10 种位置 / tile 平铺
         │ 相同: 字号计算 (minEdge * pct) / 黑描边 / fillStyle
```

## 关键设计决策

| 决策 | 理由 |
|---|---|
| **纯函数脱离 state** | 可独立测试 / 可导出 PDF 水印 / 不依赖 DOM 存在 |
| **tile 平铺 -30° 旋转** | 标准版权水印样式（避免正字正面看） |
| **tile opacity ×0.4** | 平铺太密，比单点 60% 更淡避免喧宾夺主 |
| **字号按短边 %** | 同一 % 值在 4000×3000 和 800×600 上视觉大小一致 |
| **黑描边 strokeText** | 水印颜色和图片同色时能看清 |
| **复用现有 ZIP 打包** | 批量主循环 + entries.push → makeZip → download 已存在 |

## 扩展路线

| 功能 | 难度 | 说明 |
|---|---|---|
| 图片水印（Logo PNG 叠加） | ⭐ | drawImage 替代 fillText |
| 水印导出透明 PNG 带水印 | ⭐⭐ | 单独开关 + PNG 保留 alpha |
| 水印定位 EXIF 位置 | ⭐⭐ | EXIF GPS / 相机信息位置 |
| 水印平铺模式（可调间距/角度） | ⭐ | 已有 tile，暴露 gap/angle 参数 |
