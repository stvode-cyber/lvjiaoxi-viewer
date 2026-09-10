// 高级像素质点算法冒烟测试（提取 app.js 真实源码，验证数学正确性，无 DOM 依赖）
// 运行: node test/tone-smoke.cjs
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function extractBlock(from, to) {
  const i0 = src.indexOf(from);
  if (i0 < 0) throw new Error('未找到: ' + from);
  const i1 = src.indexOf(to, i0);
  if (i1 < 0) throw new Error('未找到结束标记: ' + to);
  return src.slice(i0, i1);
}

let code = '';
code += 'const clamp = Math.max, __clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));\n';
code += extractBlock('function hexToRgb(hex) {', 'function openEdit(');
code = code.replace('clamp(t, 0, 1)', '__clamp(t, 0, 1)');
code = code.replace('clamp(r, 0, 255)', '__clamp(r, 0, 255)');
code = code.replace('clamp(g, 0, 255)', '__clamp(g, 0, 255)');
code = code.replace('clamp(b, 0, 255)', '__clamp(b, 0, 255)');
eval(code);

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

function runFilter(f, W, H, fill) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    d[i * 4] = fill.r; d[i * 4 + 1] = fill.g; d[i * 4 + 2] = fill.b; d[i * 4 + 3] = 255;
  }
  if (!needsTone(f)) return null;
  toneRows(d, W, 0, H, tonal(f, W, H));
  return d;
}

// 1) 全中性 → needsTone=false（跳过，零开销）
assert(needsTone({ brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0 }) === false, '中性参数不触发高级处理');

// 2) 提亮暗部：暗像素显著变亮，亮像素基本不变
let out = runFilter({ shadow: 40 }, 8, 8, { r: 10, g: 10, b: 10 });
assert(out && out[0] > 20, '暗部+40 提亮暗色像素 (示例 ' + out[0] + ')');
out = runFilter({ shadow: 40 }, 8, 8, { r: 250, g: 250, b: 250 });
assert(out && out[0] > 249.9 && out[0] <= 255, '暗部+40 对高亮像素几乎无影响 (' + out[0] + ')');

// 3) 压暗高光：亮像素变暗，暗像素基本不变
out = runFilter({ highlight: -40 }, 8, 8, { r: 245, g: 245, b: 245 });
assert(out && out[0] < 235, '高光-40 压暗高亮像素 (' + out[0] + ')');
out = runFilter({ highlight: -40 }, 8, 8, { r: 20, g: 20, b: 20 });
assert(out && out[0] >= 19 && out[0] < 25, '高光-40 对暗像素几乎无影响 (' + out[0] + ')');

// 4) 褪色：黑像素被抬升
out = runFilter({ fade: 60 }, 8, 8, { r: 0, g: 0, b: 0 });
assert(out && out[0] > 20 && out[0] < 120, '褪色+60 抬升黑位 (' + out[0] + ')');

// 5) 暗角：角落比中心暗（均匀灰图中处理）
const vigW = 64, vigH = 64;
const vig = new Uint8ClampedArray(vigW * vigH * 4);
for (let i = 0; i < vigW * vigH; i++) { const v = 160; vig[i * 4] = v; vig[i * 4 + 1] = v; vig[i * 4 + 2] = v; vig[i * 4 + 3] = 255; }
toneRows(vig, vigW, 0, vigH, tonal({ vignette: 80 }, vigW, vigH));
const centerIdx = ((32 * vigW) + 32) * 4, cornerIdx = ((0 * vigW) + 0) * 4;
assert(vig[cornerIdx] < vig[centerIdx], '暗角+80 角落(' + vig[cornerIdx] + ') 暗于中心(' + vig[centerIdx] + ')');

// 6) 颗粒：随机但确定（同坐标重复结果一致），且不溢出
const g1 = runFilter({ grain: 50 }, 32, 32, { r: 128, g: 128, b: 128 });
const g2 = runFilter({ grain: 50 }, 32, 32, { r: 128, g: 128, b: 128 });
let gOk = g1 && g2 && g1.length === g2.length;
if (gOk) for (let i = 0; i < g1.length; i++) {
  if (!(g1[i] >= 0 && g1[i] <= 255 && g1[i] === Math.round(g1[i]) && g1[i] === g2[i])) { gOk = false; if (i < 8) console.log('  异常 @' + i + ' = ' + g1[i]); }
}
assert(gOk, '颗粒确定且范围正确');

// 7) 色调分离：高光色调对亮像素染色，阴影色调对暗像素染色
out = runFilter({ tintH: '#ff0000', tintAmt: 100 }, 8, 8, { r: 230, g: 230, b: 230 });
assert(out && out[0] > out[2], '高光红染色：亮像素红色分量上升 (r=' + out[0] + ', b=' + out[2] + ')');
out = runFilter({ tintS: '#00ff00', tintAmt: 100 }, 8, 8, { r: 30, g: 30, b: 30 });
assert(out && out[1] > out[0], '阴影绿染色：暗像素绿色分量上升 (g=' + out[1] + ', r=' + out[0] + ')');

// 8) hexToRgb 解析
const c = hexToRgb('#abcdef');
assert(c && c.r === 0xab && c.g === 0xcd && c.b === 0xef, 'hexToRgb 解析 #abcdef');
assert(hexToRgb('ff0000') && hexToRgb('ff0000').r === 255, 'hexToRgb 无 # 前缀');

// 8.5) 色调分离强度门控：tintAmt=0 不触发处理；强度缩放生效
assert(needsTone({ tintH: '#ff0000', tintAmt: 0 }) === false, 'tintAmt=0 不启用色调分离');
assert(needsTone({ tintH: '#ff0000', tintAmt: 40 }) === true, 'tintAmt>0 启用色调分离');
const t30 = runFilter({ tintH: '#ff0000', tintAmt: 30 }, 8, 8, { r: 230, g: 230, b: 230 });
const t100 = runFilter({ tintH: '#ff0000', tintAmt: 100 }, 8, 8, { r: 230, g: 230, b: 230 });
assert(t100 && t30 && (t100[0] - 230) > (t30[0] - 230), '染色强度 100% 强于 30% (' + (t100 && t100[0]) + ' vs ' + (t30 && t30[0]) + ')');
out = runFilter({ tintH: '#ff0000', tintAmt: 0 }, 8, 8, { r: 230, g: 230, b: 230 });
assert(out === null, 'tintAmt=0 时整体跳过（返回 null）');

// 9) 组合全特效：值域完整
out = runFilter({ highlight: 30, shadow: 20, fade: 25, grain: 40, vignette: 30, tintH: '#ffcc00', tintS: '#2244aa' }, 48, 48, { r: 130, g: 120, b: 110 });
let ok = true;
for (let i = 0; i < 48 * 48 * 4; i++) if (out[i] < 0 || out[i] > 255) { ok = false; break; }
assert(ok, '组合特效像素值全部在 0-255');

// 10) 灰度图（纯 CSS 路径）不应受影响——彩色像素经 gray 仍保持 RGB 相等由 CSS 处理，此处跳过。

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);