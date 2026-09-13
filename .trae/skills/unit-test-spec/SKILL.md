---
name: unit-test-spec
description: 绿角犀看图单元测试规范。jsdom + 手工 assert 框架、state 隔离、Canvas Uint8Array 坑、合并位移场测试模板。
trigger: 写新测试时、新增功能后、regression 挂了时
---

# Unit Test Spec · 绿角犀看图

## 框架
```
test/regression.cjs
- Node + jsdom 手工搭建
- 自建 assert 函数（assert.ok / assert.equal / assert.match / assert.closeTo）
- 无 vitest/jest，不要引入
- 运行: node test/regression.cjs
```

## 基础模板

```js
// === 模块名（新增测试块放这里）===
(function() {
  // 1. 本地 state（不要污染全局）
  const state = { deform: [], slim: { enabled: false }, filters: {} };
  globalThis.state = state;  // 被测函数可能读 state

  // 2. 计数器（沿用 regression.cjs 顶部的 passed/total）
  let passed = 0, total = 0;
  function assert(cond, msg) {
    total++;
    if (cond) { passed++; console.log('  PASS', msg); }
    else console.log('  FAIL', msg);
  }

  // 3. 直接调用被测函数（VM 执行 app.js 后，函数在 globalThis 上）
  assert(typeof deformBuilders === 'function', 'deformBuilders 存在');

  // 4. 用 assert.equal / assert.closeTo / assert.match
  assert.equal(deformBuilders([{ kind: 'eye', strength: 0 }]).length, 0, '0 强度 deform 被过滤');
  assert.closeTo(deformBuilders([{ kind: 'eye', strength: 50 }])[0].strengthNorm, 0.5, 0.001,
    '50% → strengthNorm ~0.5');

  // 5. 测试结束恢复计数器
  // regression.cjs 顶部会汇总 passed/total
})();
```

## 位移场测试模板（最重要）

```js
// === deformTotalDisp 合并位移场 ===
(function() {
  const slimW = slimWarp({ enabled: true, mode: 'face', strength: 30 });
  const defs = deformBuilders([{ kind: 'eye', cx: 0.4, cy: 0.4, strength: 50 }]);

  // 锚点中心（nx=0.4, ny=0.4）：位移场应为 0
  assert.closeTo(deformTotalDisp(defs, slimW, 0.4, 0.4).sx, 0.4, 0.001,
    '锚点中心 sx=0.4');
  assert.closeTo(deformTotalDisp(defs, slimW, 0.4, 0.4).sy, 0.4, 0.001,
    '锚点中心 sy=0.4');

  // 只有 slim 时
  const onlySlim = deformTotalDisp([], slimW, 0.5, 0.5);
  // 只有 deform 时
  const onlyDef = deformTotalDisp(defs, null, 0.5, 0.5);
  // 同时启用 → 位移量应该 = slim 位移 + deform 位移
  const both = deformTotalDisp(defs, slimW, 0.5, 0.5);
  const mergedSx = (onlySlim.sx - 0.5) + (onlyDef.sx - 0.5) + 0.5;
  assert.closeTo(both.sx, mergedSx, 0.001, '合并位移场 = slim + deform');
})();
```

## jsdom 必记坑

| 坑 | 解法 |
|---|---|
| `Uint8Array instanceof Uint8Array` 失败 | 用 `window.Uint8Array` 而非 Node 全局 |
| `<canvas>` 无像素 → `getImageData` 抛 | 所有像素操作 try/catch 包裹 |
| 测试间 state 残留 | 每个 IIFE 用独立 state 重置 |
| DOM 控件值残留 | 断言前显式设置目标值 `els.xxx.value = '目标'` |
| addEventListener 触发副作用 | 不调 `.click()`，直接改 state + 手动调 renderEditPreview |

## 被测函数钩子（regression.cjs 会从 app.js 暴露）

```js
// 形变管道
deformMakeKind(kind, strength)    // → { rx, ry, sign }
deformBuilders(list)               // 过滤 strength=0，返回可采样 def 数组
deformForce(def, nx, ny)           // → { fx, fy } 局部高斯位移
deformTotalDisp(defs, slimW, nx, ny) // → { sx, sy } 合并后采样坐标
deformCanvas(canvas, list, slim)    // → canvas 或 null（无像素环境跳过）
applyDeformInPlace(ctx, W, H, list, slim)  // 就地修改，无返回

// 瘦脸瘦身（slimWarp/slimDisp 也暴露）
slimWarp(slim)                     // → { cx, cy, K, Kv, invRx2, invRy2, on } 或 null
slimDisp(w, nx, ny)                // → { sx, sy }
bilinear(data, W, H, x, y, out, oi) // 原地写入 out[oi..oi+3]

// 通用
clamp(v, lo, hi)
deform                              // 无像素环境跳过标志（boolean）
```

## assert 方法清单

```js
assert.ok(cond, msg)
assert.equal(a, b, msg)
assert.notEqual(a, b, msg)
assert.closeTo(a, b, epsilon, msg)
assert.match(str, regex, msg)
assert.doesNotThrow(fn, msg)
```

## 质量门槛

```bash
# 跑测试
node test/regression.cjs
# 必须: 通过 224 / 失败 0
# 新增测试后: 通过 260 / 失败 0（新功能 ≥ 36 项断言）
```
