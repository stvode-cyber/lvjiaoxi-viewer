---
name: hsl-color-wheel
description: HSL 分通道调色实现指南。RGB⇄HSL 标准转换 + toneRows 管线最前面执行。对标 FastStone/美图秀秀。难度 ⭐⭐
trigger: 要实现色相/饱和度/明度独立调整、色彩校正、创意调色时
---

# HSL Color Wheel · HSL 分通道调色

## 竞品对标
- **FastStone Image Viewer**：Hue / Saturation / Lightness 三个独立 slider
- **美图秀秀**：「局部调色」色相环 + 饱和度 + 明度
- **IrfanView**：插件实现，默认不含

## 架构

```
用户拖动 H/S/L slider
       │
       ▼
flMap 事件绑定 → state.filters.hslH / hslS / hslL
       │
       ▼
needsTone(f) → 检测 HSL 非默认值 → true
       │
       ▼
tonal(f, W, H) → 组装 hslH/hslS/hslL/useHsl 参数
       │
       ▼
toneRows(d, W, y0, y1, cfg)
       │
  for 每个像素 {
    ├─ RGB → HSL          (rgbToHsl)
    ├─ H += hslH/180       (色相偏移 -180..180°)
    ├─ S *= hslS/100       (饱和度缩放 0..200%)
    ├─ L += hslL/100 * 0.5 (明度偏移 ±50%)
    ├─ HSL → RGB          (hslToRgb)
    └─ highlight/shadow/tint 等既有处理
  }
```

## 代码入口

| 位置 | 行号 | 用途 |
|---|---|---|
| `state.filters` 默认值 + hslH/S/L | app.js ~319 | 6 处 filters 默认统一更新 |
| `rgbToHsl(r,g,b)` | app.js ~1446 | RGB 0-255 → HSL 0-1 |
| `hslToRgb(H,S,L)` | app.js ~1464 | HSL 0-1 → RGB [0-255] |
| `needsTone(f)` 加 HSL 判断 | app.js ~1417 | 非默认值 → 触发处理 |
| `tonal()` 组装 HSL 参数 | app.js ~1428 | hslH/hslS/hslL/useHsl |
| `toneRows()` 最前面 HSL 管线 | app.js ~1452 | RGB→HSL→调整→HSL→RGB |
| cacheDom 注册 HSL DOM id | app.js ~357 | flHslH/S/L + Val |
| flMap 事件绑定 | app.js ~4192 | 实时预览 |
| index.html 3 个 slider | index.html ~425 | 色温之后、模糊之前 |

## 实现 Checklist

- [x] state.filters 6 处默认值统一加 `hslH:0, hslS:100, hslL:0`
- [x] rgbToHsl 函数（标准 HSL 转换公式）
- [x] hslToRgb 函数（hue2rgb 辅助函数）
- [x] needsTone 加 HSL 非默认值判断
- [x] tonal 组装 hslH/S/L + useHsl 标志
- [x] toneRows 解构 HSL 参数 + 最前面执行转换
- [x] 色相循环归一：`((H + hslH) % 1 + 1) % 1`
- [x] 饱和度缩放：`clamp(S * hslS, 0, 1)`
- [x] 明度偏移：`clamp(L + hslL * 0.5, 0, 1)` — 0.5 系数防过曝
- [x] cacheDom 注册 6 个新 DOM id
- [x] flMap 事件绑定 hslH/S/L
- [x] index.html 加 H/S/L 三个 slider（色温之后）
- [x] regression +24 条断言 → 272/0 全绿
- [x] sw CACHE +1（v25 → v26）
- [x] tauri build → EXE + NSIS + MSI

## 测试模板

```js
test('HSL 分通道：rgbToHsl/hslToRgb + 默认值 + flMap + needsTone', async () => {
  const fs = require('fs');
  const appSrc = fs.readFileSync('app.js', 'utf-8');

  // 函数存在
  assert(appSrc.includes('function rgbToHsl'), 'rgbToHsl 存在');
  assert(appSrc.includes('function hslToRgb'), 'hslToRgb 存在');

  // 默认值
  assert(appSrc.includes('hslH: 0'), 'hslH 默认 0');
  assert(appSrc.includes('hslS: 100'), 'hslS 默认 100');
  assert(appSrc.includes('hslL: 0'), 'hslL 默认 0');

  // flMap 绑定
  assert(appSrc.includes("['flHslH', 'hslH', 'flHslHVal']"), 'hslH 绑定');
});
```

## 关键设计决策

| 决策 | 理由 |
|---|---|
| **HSL 在 highlight/shadow 之前执行** | 色彩调整（HSL）应先于明暗调整（高光/暗部），否则高光提升会改变 HSL 色彩偏移 |
| **明度 L 偏移 ×0.5 系数** | 直接 ±100% 会把所有像素推到纯白/纯黑，×0.5 让 ±100 对应 ±50% L 值偏移 |
| **色相循环归一 `((H+Δ)%1+1)%1`** | -180° 到 +180° 跨越 0 时需要循环（例：红 +120° = 绿，再 +120° = 蓝） |
| **饱和度 clamp 到 [0,1]** | 200% 上限在 toneRows 里强制 clamp，不让它超出色域 |

## 数学公式（参考标准 HSL）

```
RGB → HSL:
  mx = max(r,g,b), mn = min(r,g,b)
  L = (mx + mn) / 2
  S = (mx === mn) ? 0 : (L > 0.5 ? d/(2-mx-mn) : d/(mx+mn))
  H = (mx-r → g-b, mx-g → b-r+2, mx-b → r-g+4) / 6

HSL → RGB:
  q = L < 0.5 ? L*(1+S) : L+S-L*S
  p = 2*L - q
  hue2rgb(p,q,t) → r/g/b 分量（t ∈ {h+1/3, h, h-1/3}）
```
