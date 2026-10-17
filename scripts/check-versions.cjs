// 版本号落点自检脚本 — 跑一遍确认所有落点一致
// 用法：node scripts/check-versions.cjs
// 退出码 0 = 全绿，1 = 有不一致
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

// === 读取函数 ===
function readFile(p) { return fs.readFileSync(path.join(root, p), 'utf-8'); }

// === 7 个落点 ===
const checks = [
  { name: 'tauri.conf.json version（顶层）', file: 'src-tauri/tauri.conf.json', extract: s => JSON.parse(s).version },
  { name: 'Cargo.toml package.version',       file: 'src-tauri/Cargo.toml',        extract: s => (s.match(/^version\s*=\s*"([^"]+)"/m) || [,''])[1] },
  { name: 'manifest.webmanifest version',      file: 'manifest.webmanifest',         extract: s => JSON.parse(s).version },
  { name: 'app.js about v0.1.0 标注',          file: 'app.js',                       extract: s => (s.match(/绿角犀看图 <span[^>]*>v([\d.]+)/) || [,''])[1] },
  { name: 'sw.js CACHE v68',                   file: 'sw.js',                        extract: s => (s.match(/lvjiaoxi-viewer-v(\d+)/) || [,''])[1], type: 'cache' },
];

console.log('=== 版本号落点自检 ===\n');
let mismatches = 0;
const versions = {};

for (const c of checks) {
  try {
    const raw = readFile(c.file);
    const val = c.extract(raw);
    versions[c.name] = val;
    const mark = val ? '  ✅' : '  ❌';
    console.log(`${mark} ${c.name}: ${val || '(未找到)'}`);
    if (!val) mismatches++;
  } catch (e) {
    console.log(`  ❌ ${c.name}: 读取失败 — ${e.message}`);
    mismatches++;
  }
}

// === 一致性检查 ===
const ref = Object.values(versions)[0];
const refCache = Object.values(versions).find(v => /^\d+$/.test(v));
let allSame = true;
for (const [name, v] of Object.entries(versions)) {
  if (name.includes('CACHE')) continue;
  if (v !== ref) {
    console.log(`  ⚠️  不一致: ${name}=${v} ≠ 参考=${ref}`);
    allSame = false;
  }
}

console.log(`\n=== 结果 ===`);
console.log(`  版本号一致性: ${allSame ? '✅ 全绿 (' + ref + ')' : '❌ 有不一致'}`);
console.log(`  sw.js CACHE:  v${refCache}（下次改前端必须 +1）`);
console.log(`  总计问题: ${mismatches}`);

process.exit(mismatches === 0 && allSame ? 0 : 1);
