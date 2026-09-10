const fs = require('fs');
const path = require('path');
const s = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
const m = [
  'tintAmt: (f.tintAmt || 0) / 100',
  'tintAmt: 0 }',
  'tintAmt: 0 }, preset.f)',
  'els.flTintH) els.flTintH.value',
  'els.flTintS) els.flTintS.value',
  "['flTintAmt', 'tintAmt', 'flTintAmtVal']]",
  "flTintH', 'flTintS'",
];
const bad = m.filter((x) => !s.includes(x));
console.log(bad.length ? 'MISS: ' + bad.join(' | ') : 'app.js 关键标记全部完整');
console.log('tintAmt 出现处数:', (s.match(/tintAmt/g) || []).length);