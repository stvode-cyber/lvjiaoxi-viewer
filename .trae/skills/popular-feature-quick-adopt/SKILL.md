---
name: popular-feature-quick-adopt
description: 快速吸收竞品热门功能的实现 Checklist。覆盖长图优化、穿透文件夹、消除笔、HSL 分通道、批量加水印等 P0 功能。
trigger: 要实现竞品热门功能时
---

# Popular Feature Quick Adopt · 热门功能快速吸收

## 核心原则
- 从零实现但**不照搬 UI**，走绿角犀的视觉风格
- 走原代码架构：扩展现有 pipeline，不另起炉灶
- 优先离线可行（项目硬约束）
- 每次吸收后**必须加 regression 测试**

---

## 功能 1：长图优化（难度 ⭐）

### 竞品
美图看看 v2、HoneyView v5.53

### 实现 Checklist

1. **检测长宽比**
```js
// 在 renderEditPreview 里：
const ratio = canvas.width / canvas.height;
const isTall = ratio < 0.6;    // 竖图 高度 > 1.6× 宽度
const isWide = ratio > 1.8;     // 横图 宽度 > 1.8× 高度
```

2. **滚轮行为切换**
```js
// 默认滚轮：缩放 → 长图时：上下翻页
// 改 app.js 导航条 wheel 事件监听
if (state.isLongImage) {
  // 滚动 → 翻页（top→bottom，bottom→top）
} else {
  // 缩放
}
```

3. **自动定位到顶端**
```js
// 长图 1:1 显示时自动把 viewport 定位到顶部
if (isTall && scale === 1) setViewportTop();
```

### 代码位置
- `app.js` renderEditPreview → 检测 ratio → 设 `state.isLongImage`
- `app.js` wheel 事件分支
- `styles.css` 长图模式滚动条

### 测试
```js
assert(state.isLongImage !== undefined, 'state 有长图标志');
// 竖图 → isLongImage=true
// 横图 → isLongImage=false
```

---

## 功能 2：穿透文件夹（难度 ⭐）

### 竞品
美图看看「穿透文件夹」、XnView MP

### 实现 Checklist

1. **加递归开关**
```html
<!-- 导航条右侧新增"📁 穿透"按钮 -->
<button id="btnRecurse" class="btn">📁 穿透文件夹</button>
```

2. **文件列表递归遍历**
```js
async function loadFolderRecursive(folder) {
  const files = await invoke('list_dir', { path: folder });
  let images = [];
  for (const f of files) {
    if (f.isDirectory) {
      images.push(...await loadFolderRecursive(f.path));  // 递归
    } else if (isImageExt(f.name)) {
      images.push(f);
    }
  }
  return images;
}
```

3. **路径显示**
```js
// 缩略图下方显示相对路径（a/b/c.jpg 而非只有 c.jpg）
item.label = item.path.replace(folder + '\\', '');
```

### 代码位置
- `lib.rs` 加 `list_dir_recursive` command
- `app.js` 文件列表加载逻辑
- `index.html` 加穿透按钮

### 测试
```js
// regression 里 mock 一个 3 层目录结构
const structure = { 'a': { 'b': { 'c.jpg': null } } };
// 递归加载后 items.length === 1
```

---

## 功能 3：消除笔（难度 ⭐⭐⭐）

### 竞品
美图秀秀「AI 消除」、光影看图「消除笔」

### 实现 Checklist

#### 简单版（可离线）
```js
// 局部克隆 + 边界融合
function inpaintSimple(srcCanvas, maskCanvas) {
  // 1. mask 区域 = 要消除的像素
  // 2. 从 mask 四周采样像素（PatchMatch 思路简化版）
  // 3. 高斯加权混合边界
  // 4. 双边滤波羽化过渡
}
```

#### 进阶版（等模型小了）
```js
// 加一个 ONNX 模型（sub_pixel_cnn.onnx 级别的体积）
// ort.min.js 推理 mask 区域的填充
// 模型放在 assets/inpaint.onnx
// 失败自动降级简单版，绝不挂起
```

### UI 位置
```
美图面板 → 高级 tab
├── 瘦身/瘦脸
├── ✨ 美型微调
├── 🧽 消除笔（新增）
│   ├── 笔刷大小滑块
│   ├── 🖌 涂抹 / ✨ 消除
│   ├── 消除强度滑块
│   └── 重置
├── 裁剪
└── 一键抠图
```

### 事件/撤销集成
```js
// state 里加
state.eraseStrokes = [];  // 类似 mosaic 的笔触数组
state.eraseMask = null;   // 生成的 mask

// editSnap / restoreEdit 里加
e: state.eraseStrokes || [], em: state.eraseMask || null,
me: state.eraseMode || false,

// drawEraseStroke / applyEraseOverlay / renderEditPreview 流程跟抠图同款
```

### 测试
```js
assert(typeof inpaintSimple === 'function', '消除笔函数存在');
// 输入 canvas + mask → 输出 canvas
// mask 区域颜色应该从四周采样填充
// 边界应做高斯融合（不能硬边）
```

---

## 功能 4：HSL 分通道调色（难度 ⭐⭐）

### 竞品
FastStone、美图秀秀、像素蛋糕

### 实现 Checklist

```js
// 在 applyTone 里加 HSL 函数
function applyHSL(ctx, W, H, params) {
  const imgData = ctx.getImageData(0, 0, W, H);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const { h, s, l } = rgbToHsl(r, g, b);
    // 调 h (±180°) / s (±100%) / l (±100%)
    const nh = clamp(h + (params.hue || 0), 0, 360);
    const ns = clamp(s + (params.sat || 0), 0, 100);
    const nl = clamp(l + (params.lum || 0), 0, 100);
    const { r: nr, g: ng, b: nb } = hslToRgb(nh, ns, nl);
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
  }
  ctx.putImageData(imgData, 0, 0);
}
```

### UI 位置
```
美图面板 → 美颜 tab → 滤镜微调 下方
├── 高光 / 暗部 / 褪色 / 颗粒 / 暗角 / 色调分离
└── HSL 分通道（新增）
    ├── 色相 ±180°
    ├── 饱和度 ±100%
    └── 明度 ±100%
```

### 测试
```js
// rgbToHsl / hslToRgb 精度测试
const { h } = rgbToHsl(255, 0, 0);
assert(Math.abs(h - 0) < 1, '红色色相 ≈ 0°');
const { h: gh } = rgbToHsl(0, 255, 0);
assert(Math.abs(gh - 120) < 1, '绿色色相 ≈ 120°');
```

---

## 功能 5：批量加水印（难度 ⭐⭐）

### 竞品
FastStone、IrfanView、美图秀秀批处理

### 实现 Checklist

```js
// 在批量面板加第 6 个 tab：加水印
// state.batchWatermark = {
//   enabled: true,
//   type: 'text' | 'image',
//   text: '© 2026 绿角犀',
//   fontSize: 36,
//   color: '#ffffffcc',
//   position: 'br',  // tl/tm/tr/ml/mc/mr/bl/bm/br 九宫格
//   margin: 20,
//   opacity: 0.8,
//   imagePath: null,
// }

function applyWatermark(ctx, W, H, wm) {
  if (!wm.enabled) return;
  ctx.save();
  ctx.globalAlpha = wm.opacity;
  if (wm.type === 'text') {
    ctx.font = `${wm.fontSize}px sans-serif`;
    ctx.fillStyle = wm.color;
    // 根据 position 计算坐标
    const { x, y } = watermarkPos(wm.position, W, H, wm.margin);
    ctx.fillText(wm.text, x, y);
  } else {
    // 图片水印 → drawImage
  }
  ctx.restore();
}
```

### UI 位置
```
批量面板 → 新增「加水印」tab（格式转换/调整尺寸/重命名/添加滤镜/压缩 → 加水印）
├── 🖋 文字水印 / 🖼 图片水印
├── 文字内容输入框
├── 字体大小滑块
├── 颜色选择器
├── 九宫格位置选择
├── 边距滑块
├── 不透明度滑块
└── 实时预览
```

---

## 通用 Checklist（每次吸收后）

- [ ] 不破坏现有 pipeline（扩展而非替换）
- [ ] 所有新 state 字段进 editSnap / restoreEdit
- [ ] 预览 = 导出同算法
- [ ] sw.js CACHE 已 +1
- [ ] regression.cjs 有对应断言（≥ 5 条）
- [ ] node test/regression.cjs 全绿
- [ ] node scripts/sync-dist.cjs 已跑
- [ ] npm run tauri build 成功
- [ ] 6 落点版本号巡检
- [ ] Git commit + push
