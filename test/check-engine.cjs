// 巡检音色调发动机 5 个函数是否全部含 tintAmt（每次 Edit 后必须跑一遍）
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
const need = [
  ['needsTone', 'tintAmt'],
  ['tonal', 'tintAmt'],
  ['toneRows', 'tintAmt'],
  ['toneRows归', 'smstep(0.5, 0.0, lum)'],
  ['smstep', 'e1 - e0'],
];
const get = (name) => {
  const i0 = src.indexOf('function ' + name.replace('归', ''));
  const tail = name.replace('归', '');
  if (i0 < 0) return '';
  const upTo = { needsTone: '  function tonal', tonal: '  // 确定性伪随机', toneRows: '  function applyTone(' }[tail];
  const i1 = upTo ? src.indexOf(upTo, i0) : src.indexOf('\n  }', i0 + 10) + 4;
  return src.slice(i0, i1 > i0 ? i1 : src.length);
};
let allOk = true;
for (const [name, marker] of need) {
  const body = get(name);
  const ok = body.includes(marker);
  if (!ok) allOk = false;
  console.log((ok ? 'OK  ' : 'MISS') + ' ' + name + (ok ? '' : '  ← 缺 [' + marker + ']'));
}
console.log(allOk ? '\n引擎完整' : '\n引擎有缺失，需要修复');