const fs = require('fs');
let c = fs.readFileSync('index.html','utf8');

// 找锚点：随机配方 之后、更多工具 之前
const anchor = '<button class="btn sm accent" id="miMore"';
const idx = c.indexOf(anchor);
if (idx < 0) { console.log('❌ 找不到锚点'); process.exit(1); }

// 往前找换行符（前面的 beauty-sep 行末）
const beforeAnchor = c.lastIndexOf('\n', idx);
// 往前再找一行（beauty-sep 那行）
const sepLineStart = c.lastIndexOf('\n', beforeAnchor - 1) + 1;

const insert = `\n    <span class="beauty-sep"></span>
    <span class="mini-lbl mini-oneclick">一键海报</span>
    <button class="btn sm primary" id="quickPosterBtn" title="📣 一键生成示例海报（限时特惠）">📣 海报</button>
    <button class="btn sm" id="quickPolaroidBtn" title="📷 加拍立得边框（底部留白 18%）">📷 拍立得</button>
    <button class="btn sm" id="quickVintageBtn" title="🖼️ 加复古边框（米黄背景 + 内阴影）">🖼️ 复古</button>`;

// 在 anchor 那行前面插入
const result = c.slice(0, idx) + insert + '\n' + c.slice(idx);
fs.writeFileSync('index.html', result);

// 验证
const v = fs.readFileSync('index.html','utf8');
const n1 = (v.match(/quickPosterBtn/g) || []).length;
const n2 = (v.match(/quickPolaroidBtn/g) || []).length;
const n3 = (v.match(/quickVintageBtn/g) || []).length;
console.log('✅ 插入成功');
console.log('quickPosterBtn:', n1, '处');
console.log('quickPolaroidBtn:', n2, '处');
console.log('quickVintageBtn:', n3, '处');

// 验证 decor tab 里粉色 banner 已干净删除
const noBanner = !v.includes('快速出海报（新手点我）');
console.log('粉色 banner 残留:', noBanner ? '✅ 无' : '❌ 还在');
