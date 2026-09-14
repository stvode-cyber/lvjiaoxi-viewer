const fs = require('fs');
const lines = fs.readFileSync('index.html','utf8').split('\n');

// 找粉色 banner 的注释标记
const commentIdx = lines.findIndex(l => l.includes('<!-- 新手快速入口：一键出海报 + 一键加边框 -->'));
if (commentIdx < 0) { console.log('❌ 找不到注释标记'); process.exit(1); }
console.log('注释在行', commentIdx + 1);

// 找 banner 的 edit-section 块
let start = -1, end = -1;
for (let i = commentIdx; i < commentIdx + 15 && i < lines.length; i++) {
  if (lines[i].includes('edit-section') && lines[i].includes('background:linear-gradient')) {
    start = i;
    // 往后找对应的 </div>（跳过内部的 edit-actions 等 div）
    let depth = 1;
    for (let j = i + 1; j < i + 20 && j < lines.length; j++) {
      if (lines[j].includes('<div')) depth++;
      if (lines[j].includes('</div>')) {
        depth--;
        if (depth === 0) { end = j; break; }
      }
    }
    break;
  }
}

if (start < 0 || end < 0) { console.log('❌ 未找到块边界'); process.exit(1); }

console.log('删除范围: 行', (start - 1) + 1, '→', end + 1, '(共', end - start + 1, '行)');
for (let i = start - 1; i <= end; i++) {
  console.log('  -', String(i + 1).padStart(5), lines[i].slice(0, 80));
}

// 删除：从注释前一行开始到 end
const removeFrom = start - 1;
const kept = [...lines.slice(0, removeFrom), ...lines.slice(end + 1)];
fs.writeFileSync('index.html', kept.join('\n'));

// 验证
const stillBanner = kept.findIndex(l => l.includes('快速出海报（新手点我）'));
const stillBtn = kept.findIndex(l => l.includes('quickPosterBtn'));
console.log('\n✅ 已删除');
console.log('粉色 banner 残留:', stillBanner >= 0 ? '❌ 行 ' + (stillBanner + 1) : '✅ 无');
console.log('quickPosterBtn:', stillBtn >= 0 ? '✅ 行 ' + (stillBtn + 1) : '❌ 丢失');
