---
name: poster-border-stickers
description: 海报边框扩展 + emoji 贴纸 + 海报标题一键生成实现指南。BORDER_PRESETS 配置 + Canvas fillText emoji + 4 种海报布局。对标 FastStone/美图秀秀。难度 ⭐⭐
trigger: 要实现海报制作、边框效果、emoji 贴纸、标题一键生成时
---

# Poster / Border / Stickers · 海报边框 + 贴纸

## 竞品对标
- **FastStone Image Viewer**：边框（白边/黑边/粗边）+ 贴纸（有限）
- **美图秀秀**：海报模板 + 边框 + 贴纸商店 + 标题文字
- **Photoshop**：海报画布 + 形状工具

## 架构亮点

### 100% 复用现有 state.texts

```
emoji 贴纸  → { type: 'emoji', ...state.texts 字段 }  → drawTexts fillText 渲染（emoji 当文字）
🆕 image 贴纸 → { type: 'image', img: Image, src: dataUrl, ... } → drawTexts drawImage 渲染（保持长宽比）
poster 标题 → { type: 'poster', ...state.texts 字段 } → drawTexts 渲染（和普通文字一样）
普通文字    → { type: undefined, ...state.texts 字段 } → drawTexts 渲染
```

**零新增 state 数组 / 零新增渲染函数** — drawTexts 统一入口，type 分支处理不同渲染。

**图片贴纸特殊点**：
- `img: Image` 对象不能 JSON 序列化（undo/redo 会丢）→ drawTexts 内懒恢复：检测 `!t.img` 时从 `t.src`（data URL）重新 `new Image()` 并 onload 后自动 `renderEditPreview()`
- `src: dataUrl` 字段持久化保存，确保跨 undo/redo / 导出后可恢复
- 尺寸和 emoji 共用 `size` 百分比高度，保持视觉一致

## 边框预设配置化

```js
const BORDER_PRESETS = {
  none:           { padPct: 0,      bg: '#F5F4F7', rad: 0 },
  white:          { padPct: 0.05,   bg: '#F5F4F7', rad: 0 },
  black:          { padPct: 0.05,   bg: '#1C1C1C', rad: 0 },
  'white-thick':  { padPct: 0.15,   bg: '#F5F4F7', rad: 0 },
  polaroid:       { padPct: 0.08,   bg: '#FFFFFF', rad: 0.02, bottomExtra: 0.18 },
  vintage:        { padPct: 0.06,   bg: '#F5EDDC', rad: 0.03, innerShadow: true },
  shadow:         { padPct: 0.03,   bg: '#FFFFFF', rad: 0.04, shadowBlurPct: 0.08, shadowColor: 'rgba(0,0,0,0.35)' },
  gradient:       { padPct: 0.06,   rad: 0.06, gradient: ['#FF6B6B', '#4ECDC4', '#45B7D1'] },
  diagonal:       { padPct: 0.08,   bg: '#F5F4F7', rad: 0, cornerCutPct: 0.15 },
};
```

### 6 种新模式渲染分支

| Mode | 效果 | Canvas 技术 |
|---|---|---|
| shadow | 悬浮卡片 | `ctx.shadowColor + shadowBlur + shadowOffsetX/Y` |
| vintage | 复古内阴影 | clip 圆角 + stroke 深色圆角矩形 |
| polaroid | 拍立得 | clip 圆角 + 底部额外留白（bottomExtra） |
| gradient | 渐变边框 | `ctx.createLinearGradient` |
| diagonal | 对角斜角 | 8 顶点 path（四角各 cut × pct） |

## 海报标题 4 种布局

| Layout | 主标题 | 副标题 | 特点 |
|---|---|---|---|
| **top** | y=0.08 / 8% / stroke 4 | y=0.92 / 5% / stroke 3 | 顶部标题 + 底部副标题（白字黑描边抗光） |
| **center** | y=0.45 / 10% | y=0.60 / 5% 灰色 | 居中双行（适合白/浅底） |
| **bottom** | y=0.85 / 7% / stroke 3 | y=0.93 / 4% / stroke 2 | 底部标题栏（白字抗光） |
| **price** | y=0.30 / 6% #FF6B6B | y=0.55 / **14%** **#FF2D55** stroke 5 | 价格海报大字（美图秀秀同款红） |

## Emoji 贴纸

```js
const EMOJI_PRESETS = ['😀','😍','🥰',...'🪧','🪪'];  // 170+ Unicode emoji
// Canvas 2D fillText 原生支持！零素材依赖
ctx.font = fontSize + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
ctx.fillText(emoji, x, y);
```

## 代码入口

| 位置 | 行号 | 用途 |
|---|---|---|
| BORDER_PRESETS 配置对象 | app.js ~2465 | 9 种边框预设 |
| borderSpec() | app.js ~2459 | 读 borderMode + borderRadius DOM |
| applyBorder(canvas) switch-case | app.js ~2481 | 按 mode 分别渲染 |
| drawTexts — 已支持 emoji | app.js ~2717 | Canvas fillText 自动渲染 emoji |
| EMOJI_PRESETS 列表 | app.js ~2589 | 170+ emoji |
| initEmojiBar() | app.js ~2590 | 动态填充 emoji bar |
| addSticker(emoji) | app.js ~2602 | 推入 state.texts |
| clearStickers() | app.js ~2620 | filter type!=='emoji' |
| generatePoster() | app.js ~2627 | 一键生成 type:'poster' 文字 |
| cacheDom 注册 | app.js ~350-351 | emoji + poster DOM id |
| 事件绑定 | app.js ~4821 | initEmojiBar() + clearStickers + generatePoster |

## 实现 Checklist

- [x] BORDER_PRESETS 配置化 9 种预设
- [x] applyBorder switch-case 渲染（shadow/vintage/polaroid/diagonal/gradient 5 种新模式）
- [x] EMOJI_PRESETS 170+ emoji Unicode 列表
- [x] initEmojiBar 动态填充 emoji bar
- [x] addSticker / clearStickers（type:'emoji' 标记）
- [x] generatePoster 4 种布局（top/center/bottom/price）
- [x] state.texts 加 type 字段（emoji/poster/undefined=普通）
- [x] borderMode select 加 optgroup（基础/海报边框分组）
- [x] cacheDom 注册 emoji + poster DOM id
- [x] 事件绑定
- [x] regression +35 条断言 → 373/0
- [x] sw CACHE v28 → v29
- [x] tauri build → EXE + NSIS + MSI

## 测试模板

```js
test('海报边框扩展 + emoji 贴纸 + 海报标题一键生成', async () => {
  const fs = require('fs');
  const appSrc = fs.readFileSync('app.js', 'utf-8');

  assert(appSrc.includes('const BORDER_PRESETS ='), 'BORDER_PRESETS 配置存在');
  assert(appSrc.includes('polaroid:'), 'polaroid 预设');
  assert(appSrc.includes('const EMOJI_PRESETS ='), 'EMOJI_PRESETS 列表');
  assert(appSrc.includes('function generatePoster'), 'generatePoster 函数');
  assert(appSrc.includes("layout === 'price'"), 'price 价格海报布局');
});
```

## 扩展路线

| 功能 | 难度 | 说明 |
|---|---|---|
| 图片水印（Logo PNG 叠加） | ⭐ | 在批量水印基础上扩展，已有 drawWatermarkOnCanvas |
| 证件照自动排版 | ⭐⭐ | A4 / 2 寸 / 1 寸 自动切图 + 白边 |
| GIF 制作 | ⭐⭐⭐ | gif.js + fps + 循环次数 |
| 自定义快捷键 | ⭐ | state.shortcuts + addEventListener('keydown') |
| 贴纸素材包（非 emoji，是 PNG 贴纸） | ⭐⭐ | base64 PNG 内嵌 + 拖拽缩放 |

## 关键设计决策

| 决策 | 理由 |
|---|---|
| **emoji 用 fillText 而非 canvas.drawImage** | 零素材依赖；系统 emoji 自动适配 macOS/Windows/Android 不同渲染 |
| **BORDER_PRESETS 配置对象驱动** | 新增边框 = 加一行配置 + 一个 switch-case，不改主流程 |
| **polaroid 底部额外留白** | 贴照片/日期效果，out.height 只加 pad（pad × 2）而不是 pad × 4 |
| **price 布局大字 14% + stroke 5** | 价格需要视觉冲击力，stroke 确保在任何背景下可读 |
| **emoji 字体回退链** | Apple Color Emoji → Segoe UI Emoji → Noto Color Emoji → sans-serif（跨平台兼容） |
