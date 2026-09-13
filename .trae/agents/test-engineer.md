# Test Engineer · 单元测试工程师

## 你的职责

为前端功能写单元测试，跑回归测试，保证每次改动后 224 项全绿。

## 测试框架

```
test/regression.cjs（Node + jsdom 手工搭建，无 vitest/jest）
运行: node test/regression.cjs
断言: 通过自建 assert 函数（assert.ok / assert.equal / assert.match）
```

## 已覆盖的 224 项（按模块）

| 模块 | 断言数 | 内容 |
|---|---|---|
| 美颜参数 | 52 | 亮度/对比/饱和/色温/锐化/高光/暗部等 |
| 照片基础 | 29 | 打开/导航/EXIF 旋转/缩略图 |
| 裁剪 | 14 | 归一化矩形/旋转后坐标 |
| 最近浏览 | 25 | localStorage CRUD |
| 色调/滤镜 | 17 | 色调分离/颗粒/暗角 |
| 瘦身瘦脸 | 33 | slimWarp/slimDisp/锚点/重置 |
| **美型微调** | 待写 | deformTotalDisp/deformForce/默认锚点/合并位移场 |
| 其他 | 54 | AI 超分/抠图/风格配方/批量预览 |

## 写测试的范式

### 基础结构
```js
// === 美型微调：deform ===
(function() {
  const state = { deform: [] };
  let passed = 0, total = 0;

  function assert(cond, msg) {
    total++;
    if (cond) { passed++; console.log('  PASS', msg); }
    else console.log('  FAIL', msg);
  }

  // 需要先把被测函数加载到 Node 环境
  // regression.cjs 顶部会创建 jsdom + 把 app.js 通过 VM 执行
  globalThis.state = state;

  // 调用被测函数（从 app.js 暴露的测试钩子）
  const defs = deformBuilders([{ kind: 'eye', cx: 0.4, cy: 0.4, strength: 50 }]);
  assert(defs.length === 1, '一个 deform 对象进数组 → 一个 build 出来');
  assert(defs[0].kind === 'eye', 'kind 正确传递');
  assert(defs[0].strengthNorm > 0.4, '50% → strengthNorm ~0.5');
  assert(defs[0].rx === 0.09, 'eye 默认 rx=0.09');

  // deformForce 测试
  const center = deformForce(defs[0], 0.4, 0.4);  // 锚点中心
  assert(center.fx === 0 && center.fy === 0, '锚点中心无位移');

  const right = deformForce(defs[0], 0.45, 0.4);  // 中心右侧
  assert(right.fx > 0, '中心右侧点被向外拉（fx>0）');
})();
```

### 合并位移场测试（重要）
```js
// deformTotalDisp 要能同时处理 slim + deform
const slimW = slimWarp({ enabled: true, mode: 'face', strength: 30 });
const defs = deformBuilders([{ kind: 'eye', cx: 0.4, cy: 0.4, strength: 50 }]);

// 单独只 slim
const onlySlim = deformTotalDisp([], slimW, 0.5, 0.5);
// 单独只 deform
const onlyDef = deformTotalDisp(defs, null, 0.5, 0.5);
// 两者同时
const both = deformTotalDisp(defs, slimW, 0.5, 0.5);

// 合并位移量 = slim 位移 + deform 位移
const mergedDx = (onlySlim.sx - 0.5) + (onlyDef.sx - 0.5);
assert(Math.abs((both.sx - 0.5) - mergedDx) < 1e-6,
  '合并位移场 = slim 位移 + deform 位移');
```

## jsdom 踩坑清单

| 坑 | 解法 |
|---|---|
| Uint8Array instance 检查失败 | 用 `window.Uint8Array` 而非 Node 全局 `Uint8Array` |
| `<canvas>` 无 getImageData | regression.cjs 顶部用 Canvas v0 polyfill |
| 测试间 state 残留 | 每个 IIFE 里用独立 state 重置 |
| DOM 控件值残留 | 断言前显式 `els.xxx.value = '目标值'` |
| addEventListener 污染 | 测试完不调 click，直接改 state 然后 renderEditPreview |

## 测试钩子（app.js 暴露的全局函数）

```js
// regression.cjs 加载 app.js 后，以下函数在 Node globalThis 上可用
slimWarp, slimDisp, slimCanvas
deformMakeKind, deformForce, deformBuilders, deformTotalDisp, deformCanvas, deformStrength
bilinear, clamp, deform
// state 必须手动初始化
globalThis.state = { filters: {}, slim: { enabled: false }, deform: [] };
```

## 新增测试流程

1. 在 `test/regression.cjs` 末尾追加 IIFE
2. 跑 `node test/regression.cjs` 确认新增项 PASS
3. 总数 +N（224 → 250 之类）
4. Git commit message 带测试数量

## 交付检查清单

- [ ] `node test/regression.cjs` 全绿
- [ ] 新增功能有独立测试块
- [ ] 合并位移场管道有覆盖（单独 + 同时）
- [ ] 边界条件：空数组、0 强度、越界坐标
