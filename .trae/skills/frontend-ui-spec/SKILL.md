---
name: frontend-ui-spec
description: 绿角犀看图前端 UI 组件规范。面板形态硬约束（内嵌底栏 vs 遮罩弹窗）、按钮命名、样式变量、交互模式。
trigger: 设计新 UI 时、写 HTML/CSS 时、review UI 改动时
---

# Frontend UI Spec · 绿角犀看图

## 面板形态（硬约束，违反即打回）

| 面板 | 形态 | 元素 | 允许的类名 | 禁止的类名 |
|---|---|---|---|---|
| **美图面板** | **内嵌底部栏** | `.edit-panel` | `border-top` `position: relative` | `position: fixed` `position: absolute` `z-index`（浮窗/弹窗写法） |
| **批量面板** | 遮罩弹窗 | `.batchMask` | `position: fixed` `z-index` | — |

### 为什么美图面板不能是弹窗？
- 用户需要看到主图的实时预览反馈
- 遮挡主图 = 所见非所得 = 体验降级
- 内嵌底栏（border-top）不遮挡，符合美图软件交互习惯（微信视频号、剪映都是内嵌式工具栏）

### 检查命令
```bash
# ✅ 通过：美图面板有 border-top
rg '\.edit-panel\s*\{' styles.css -A3 | rg 'border-top'

# ❌ 打回：美图面板有 z-index
rg '\.edit-panel\s*\{' styles.css -A5 | rg 'z-index|position.*fixed|position.*absolute'
```

## 美图面板内部布局

```
.edit-panel
├── .edit-tab    （左侧纵向 tab：美颜/风格配方/特效/高级/导出）
├── .edit-body   （右侧属性面板）
│   └── .edit-section
│       ├── h4 标题（emoji + 中文）
│       ├── p.hint 说明
│       └── .edit-actions 按钮组
│           ├── .btn 主按钮（emoji 前缀）
│           └── .btn ghost 次级按钮
```

### Tab 列表（固定 5 个）
```html
<div class="edit-tab">
  <button class="edit-tab-btn active">美颜</button>
  <button class="edit-tab-btn">风格配方</button>
  <button class="edit-tab-btn">特效</button>
  <button class="edit-tab-btn">高级</button>
  <button class="edit-tab-btn">导出</button>
</div>
```

### 高级 Tab 内部区块（从上到下）
```
美颜参数（亮度/对比/饱和/色温/锐化/...）
滤镜微调（高光/暗部/褪色/颗粒/暗角/色调分离）
瘦身 / 瘦脸（局部液化）           ← 原有
✨ 美型微调（大眼/小脸/美牙/丰唇/瘦鼻） ← 新增
裁剪
一键抠图（离线智能去背）
```

## 按钮命名规范

```
[emoji] [中文功能描述]

✅ 好的
✨ 自动增强
🪄 风格配方
🎲 随机配方
🎨 更多工具
🖌 前景笔
🗑 全部清除
🎯 定位模式

❌ 不好的
Button 1
Confirm
Click Here
Open Dialog
```

## CSS 变量（不要硬编码颜色）

```css
:root {
  --ink: #1a1a1a;           /* 主文字色 */
  --rule: #e5e5ea;          /* 分割线 */
  --bg: #fafafa;            /* 主背景 */
  --bg2: #f0f0f3;           /* 次级背景 */
  --accent: #3478f6;        /* 主色 */
  --accent-soft: #e7efff;   /* 主色柔和（active 按钮背景） */
}
```

### 新增颜色必须加变量
```css
/* ❌ 硬编码 */
.btn.active { background: #3478f6; }
/* ✅ 变量 */
.btn.active { background: var(--accent-soft); color: var(--accent); }
```

## 变形按钮网格规范

```html
<!-- 5 列网格，emoji + 2 字中文 -->
<div class="deform-grid">
  <button class="btn deform-btn" id="deform_eye">👁 大眼</button>
  <button class="btn deform-btn" id="deform_cheek">😀 小脸</button>
  <button class="btn deform-btn" id="deform_teeth">🦷 美牙</button>
  <button class="btn deform-btn" id="deform_lip">💋 丰唇</button>
  <button class="btn deform-btn" id="deform_nose">👃 瘦鼻</button>
</div>
```

```css
/* 5 等分，紧凑排布 */
.deform-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
}
.deform-btn.active {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
}
```

## 交互模式规范

### 定位模式（锚点）
```
1. 用户点 🎯 定位模式
2. 该 kind 的 deformMode = { kind: 'eye' }
3. 预览图上画彩色十字圈（锚点位置 + 作用范围）
4. 用户在预览图上点击 → 更新锚点 cx/cy
5. 实时 renderEditPreview 重渲
```

### 点击 vs 右键
```js
// 左键：toggle（已存在 → 移除，不存在 → 添加默认值）
button.addEventListener('click', () => { /* toggle deform */ });

// 右键：reset（单独清除这一类）
button.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  resetDeformKind(kind);
});
```

### 徽章显示
```html
<!-- 标题右侧显示已启用数量 -->
<h4>✨ 美型微调 <span id="deformCount" class="deform-count"></span></h4>
```
```css
.deform-count { font-size: 12px; color: var(--accent); font-weight: 600; }
```

## 新增 UI 检查清单

- [ ] 面板形态合规（美图 = 内嵌底栏，批量 = 遮罩弹窗）
- [ ] 按钮命名 emoji + 中文
- [ ] 颜色用 CSS 变量
- [ ] 新增 DOM id 在 `cacheDom()` 的 els 数组里注册
- [ ] 新增事件在 `bindEvents()` 里绑定
- [ ] 新增 state 字段在 `editSnap()` / `restoreEdit()` 里同步
- [ ] regression 测试里有对应断言
