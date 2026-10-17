# SKILL: frontend-init-order — 前端初始化顺序铁律

> 创建：2026-10-17 · 今天踩了 **2 次** 完全相同的坑（深色主题 + 双页漫画）
> 每次在函数定义块末尾写立即调用 → `Cannot access 'els' before initialization` → regression 全挂

## 铁律（2 条，违反即 crash）

### 铁律 1：任何需要 `els` 的函数调用，必须在 `init()` → `cacheDom()` 之后

```
❌ 错误：在函数定义块末尾立即调用
function toggleTheme() { ... }
applyTheme(loadTheme());    // ← 踩坑！els 还没定义

✅ 正确：init() 里 cacheDom() 之后调
function init() {
  cacheDom();               // ← els 在这里初始化
  applyTheme(loadTheme());  // ← 正确
  applyComicMode(localStorage.getItem('qjviewer_comic_v1') === '1');
  bindEvents();
}
```

### 铁律 2：`state` 内初始化的对象不能引用 `els`

```
❌ 错误：
const state = {
  btnTheme: els.btnTheme,   // ← els 还没定义！
}

✅ 正确：state 里存原始值，cacheDom() 后再操作 els
const state = {
  theme: 'light',
  comicMode: false,
}
```

## 踩坑记录

| 时间 | 功能 | 位置 | 修复 |
|------|------|------|------|
| 2026-10-17 L274 | S2 深色主题 | `applyTheme(loadTheme())` | 删掉，init() cacheDom 后已有 |
| 2026-10-17 L274 | A2 双页漫画 | 同上位置 | 同上 |

## 预防检查清单（每次加新初始化函数前扫一遍）

1. 这个函数里用了 `els.xxx` 吗？
2. 如果用了 → **绝对不能**在函数定义块末尾立即调用
3. 必须在 init() 的 cacheDom() 之后调用
4. 调用前写注释标注位置：`// S2 深色主题：DOM 就绪后立即应用 localStorage 存的主题`
