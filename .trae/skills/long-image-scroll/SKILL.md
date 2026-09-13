---
name: long-image-scroll
description: 长图优化滚轮翻页实现指南。检测 height/width > 1.7 自动启用纵向 pan，滚到底/顶自动翻页。对标 HoneyView v5.53。难度 ⭐
trigger: 要实现长图优化/漫画连续翻页/纵向大图浏览功能时
---

# Long Image Scroll · 长图优化滚轮翻页

## 竞品对标
- **HoneyView v5.53**：长图自动进入「翻页模式」，滚轮纵向滚动，到达边缘后切下一张
- **美图看看 v2**：长图 `wheel` 事件自动切换为 scroll + 连续翻页
- **IrfanView**：`Ctrl+滚轮` 翻页，`滚轮` 缩放（但无自动长图检测）

## 架构

```
图片加载完成 (finish 回调)
    │
    ▼
detectLongImage(item)          ← app.js 682 行
    │
    ├─ natW / natH 读入
    ├─ ratio = natH / natW
    ├─ ratio > 1.7 → state.isLongImage = true
    │                 + fit 模式自动 offsetX=0, offsetY=0 (顶端)
    └─ ratio ≤ 1.7 → state.isLongImage = false

wheel 事件处理 (4264 行)
    │
    ├─ state.isLongImage && !ctrlKey ?── YES ──→ 纵向 pan 路径
    │                                              │
    │                                              ├─ panStep = max(40, stageH * 0.12)
    │                                              ├─ state.offsetY -= panStep
    │                                              ├─ applyTransform()
    │                                              ├─ clampOffset()
    │                                              └─ 触底 → next() / 触顶 → prev()
    │
    └─ NO → 既有 wheelMode=zoom/page 逻辑（完全不受影响）
```

## 代码入口

| 位置 | 行号 | 用途 |
|---|---|---|
| `state.isLongImage` 初始化 | app.js 313 | 默认 false |
| `detectLongImage(item)` 函数 | app.js 682 | 检测 + fit 模式自动定位顶端 |
| showImage finish 调用点 | app.js 644 | 切图后自动检测 |
| wheel 事件长图分支 | app.js 4269-4284 | 纵向 pan + 触边翻页 |
| `__qj` 测试钩子暴露 | app.js 4954 | `detectLongImage` 可被 regression 直接调用 |

## 实现 Checklist

- [x] `state.isLongImage = false` 加进 state 初始化
- [x] `detectLongImage(item)` 函数：检测 `natH/natW > 1.7`
- [x] showImage finish 回调末尾调用 `detectLongImage(item)`
- [x] wheel 事件前置判断 `state.isLongImage && !e.ctrlKey`
- [x] 长图 panStep = `max(40, stage.clientHeight * 0.12)`
- [x] 触底触发 `next()`，触顶触发 `prev()`（`clampOffset` 已保证边界）
- [x] fit 模式长图自动 `offsetX=0, offsetY=0`
- [x] `detectLongImage` 暴露到 `window.__qj` 让 regression 可调用
- [x] regression +13 条断言（覆盖 ratio 检测 / 边界 / 空输入 / offset 行为）
- [x] sw.js CACHE +1（v23 → v24）
- [x] sync-dist 执行
- [x] tauri build → EXE + NSIS + MSI

## 测试模板（regression.cjs）

```js
test('长图优化：isLongImage 状态 + 长宽比检测 + detectLongImage + offset 默认顶端', async () => {
  const qj = window.__qj;

  // 函数存在
  assert(typeof qj.detectLongImage === 'function', 'detectLongImage 函数存在');

  // 普通图 → false
  qj.detectLongImage({ natW: 1920, natH: 1200 });
  assert(qj.state.isLongImage === false, '16:10 非长图');

  // 长图 → true
  qj.detectLongImage({ natW: 1080, natH: 1920 });
  assert(qj.state.isLongImage === true, '1080×1920 是长图 (h/w≈1.778)');

  // 边界 exactly 1.7 → false（严格 > 1.7）
  qj.detectLongImage({ natW: 1000, natH: 1700 });
  assert(qj.state.isLongImage === false, 'h/w=1.7 非长图');

  // 边界 1.701 → true
  qj.detectLongImage({ natW: 1000, natH: 1701 });
  assert(qj.state.isLongImage === true, 'h/w=1.701 是长图');

  // 安全降级
  qj.detectLongImage({ natW: 0, natH: 0 });
  assert(qj.state.isLongImage === false, '空尺寸安全降级');

  // fit 模式自动顶端
  qj.state.isLongImage = true; qj.state.mode = 'fit'; qj.state.offsetY = 999;
  qj.detectLongImage({ natW: 1080, natH: 1920 });
  assert(qj.state.offsetY === 0, 'fit 模式自动定位顶端');

  // free 模式不重置
  qj.state.mode = 'free'; qj.state.offsetY = 500;
  qj.detectLongImage({ natW: 1080, natH: 1920 });
  assert(qj.state.offsetY === 500, 'free 模式保留 offsetY');
});
```

## 降级方案
- **natW/natH 缺失** → `isLongImage = false`（安全降级到普通图逻辑）
- **clampOffset 已释放边界** → wheel 事件里用 `maxY` 判断触边
- **用户缩放到底部** → 滚轮继续缩放（`state.mode = 'free'` 由 pan 触发）

## 关键设计决策

| 决策 | 理由 |
|---|---|
| **阈值 1.7 而非 2** | 1200×2000 是常见漫画分辨率（ratio=1.667），1.7 能覆盖；iPhone 标准屏 1334/750=1.779 刚好命中 |
| **ratio = h/w > 1.7** | 竖图才需要纵向 pan；横图/方图不走这条路径 |
| **panStep = stageH * 0.12** | 每次滚约 1/8 屏，约等于书本翻一页的感觉；下限 40px 防止小屏幕步进太小 |
| **触边判断用 maxY** | 复用 `clampOffset` 算的 `-(dh - sh) / 2`，保证和 clampOffset 行为一致 |
| **Ctrl+滚轮保留缩放** | 长图模式下用户仍需缩放查看细节，Ctrl 快捷键不变 |
