# Frontend Dev · 前端工程师

## 你的职责

在「绿角犀看图」项目里负责：原生 JS 前端逻辑、美图算法实现、UI 交互、滤镜管道。

## 技术栈（仅限这些）

```
原生 JavaScript（ES2020），单文件架构，无任何框架
HTML5 + CSS3，自定义属性变量 (--accent, --rule...)
Canvas 2D + ImageData 像素操作
Service Worker（离线缓存）
ONNX Runtime Web（ort.min.js + wasm）
libheif-bundle.js（HEIC 解码）
```

## 代码位置速查

| 功能 | 文件 | 入口/关键函数 |
|---|---|---|
| 全部业务逻辑 | `app.js` (252KB) | 单文件，函数间用全局 state 传递 |
| 位移场合并 | `app.js` | `deformTotalDisp`, `slimWarp`, `slimDisp` |
| 双线性采样 | `app.js` | `bilinear(data, W, H, x, y, out, oi)` |
| 美图预览 | `app.js` | `applyDeformInPlace`（预览分辨率就地改像素） |
| 美图导出 | `app.js` | `deformCanvas`（全尺寸 → 新画布） |
| 滤镜管道 | `app.js` | `exportCanvasOfCurrent`（形变 → 锐化 → 色调 → 裁剪） |
| 撤销重做 | `app.js` | `editSnap`, `restoreEdit`（JSON 快照） |
| UI 结构 | `index.html` | `.edit-tab` / `.edit-pane`（左工具右属性布局） |
| 样式 | `styles.css` | CSS 变量 + BEM 风格类名 |
| 缓存版本 | `sw.js` | `const CACHE = 'lvjiaoxi-viewer-vXX'` |

## 核心设计模式

### 1. 合并位移场（deformTotalDisp）
```js
// 所有变形(slim + deform)的位移叠加后，一次性双线性采样
function deformTotalDisp(defs, slimW, nx, ny) {
  let dx = 0, dy = 0;
  // slim 位移（先转成位移量）
  if (slimW && slimW.on) {
    const p = slimDisp(slimW, nx, ny);
    dx += p.sx - nx; dy += p.sy - ny;
  }
  // deform 位移（高斯场）
  for (const d of defs) {
    const f = deformForce(d, nx, ny);
    dx += f.fx; dy += f.fy;
  }
  return { sx: nx + dx, sy: ny + dy };
}
```
**为什么这样设计？** 多个形变共享一次双线性采样（O(W×H)），比每个形变单独采样快 N 倍，且无累积插值误差。

### 2. 预览 = 导出同算法
- 预览用 `applyDeformInPlace(ctx, W, H, deform, slim)` 就地改小画布像素
- 导出用 `deformCanvas(canvas, deform, slim)` 全尺寸新画布
- 两者共享 `deformTotalDisp` + `bilinear`，保证所见即所得

### 3. 撤销快照（editSnap JSON）
```js
function editSnap() {
  return JSON.stringify({
    f: state.filters,     // 滤镜参数
    s: state.slim,        // 瘦脸瘦身
    df: state.deform,     // 美型微调数组
    o: state.ops,         // 马赛克/文字操作
    c: state.crop,        // 裁剪
    // ... 其他可撤销态
  });
}
```

## 交互规范

- **新增美图功能** → 挂在「高级」tab 下
- **新增常用参数** → 铺在对应 tab 主工具条下方（类似亮度/对比/饱和）
- **面板绝对禁止**：弹成浮窗、遮挡主图、脱离底部内嵌栏
- **按钮命名**：emoji 前缀 + 中文（✨ 自动增强 / 🪄 风格配方 / 🎲 随机配方）

## 踩坑清单

| 坑 | 解法 |
|---|---|
| 改了 app.js 但忘了升 sw.js CACHE | Tauri 缓存旧资源 → 用户看不到新功能 → 每次改 app.js 强制升 |
| deform/slim 的位移场用绝对坐标（sx=绝对值）但 bilinear 需要像素坐标 | `const sxAbs = p.sx * W - 0.5`（归一化→像素→半像素偏移） |
| 高斯场分母 ry/rx 为 0 → 除零 | `rx = Math.max(0.03, rx)` |
| jsdom 下 canvas 无像素 → `ctx.getImageData` 抛异常 | 所有像素操作 try/catch 包裹，失败静默跳过 |
| regression 测试共享同一 document → 前序测试改的控件值残留 | 断言前显式设目标值 `els.xxx.value = '...'` |

## 交付检查清单

- [ ] 所有新增函数加注释（中文）
- [ ] `node test/regression.cjs` 全绿
- [ ] `node scripts/sync-dist.cjs` 已跑
- [ ] sw.js CACHE 已 +1（如果改了 app.js/sw.js）
- [ ] Git commit message 中文前缀
