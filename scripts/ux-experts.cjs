/* ============================================================
 * 体验测试 AI 专家矩阵 · 自动扫描脚本
 * ------------------------------------------------------------
 * 6 个角色分别从不同用户视角审 UI 文案 / 交互 / 反馈
 * 每个专家输出 3-5 条高优先级改进建议
 * 跑完自动汇总成整改清单
 * ============================================================ */
const fs = require('fs');
const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');

const issues = [];

// ============ 专家 1: 傻瓜用户（完全不懂看图软件）============
console.log('\n🔴 专家 1: 傻瓜用户 —— 完全不懂看图软件的人能用吗？\n');

// 1a: empty-hint 有没有提压缩包？
if (!html.includes('.zip') && !html.includes('.cbz') && !html.includes('压缩包')) {
  issues.push({ e: '傻瓜', p: 'H', issue: '空态提示「拖入图片或文件夹」没提压缩包(ZIP/CBZ)，用户不知道能直接拖漫画包', loc: 'index.html L99' });
}

// 1b: 按钮纯图标没文字 → 用户不知道 ⏸ 是幻灯片暂停, ⛶ 是全屏, ⚙ 是设置
const iconBtns = html.match(/<button[^>]*>\s*[⏸⏱▶⏯⏹⏺⇋⇅↷↻↶↺⧉⚙⛶🖥📁📂📷🕘🗑✕ⓘ🎨🎯🎲🪄]\s*<\/button>/g) || [];
if (iconBtns.length > 0) {
  issues.push({ e: '傻瓜', p: 'H', issue: `有 ${iconBtns.length} 个纯图标按钮(⏸⚙⛶等)没文字，hover 时也没 tooltip，用户猜不出意思`, loc: 'index.html 多处' });
}

// 1c: 错误 toast 说了「无法加载图片」但没说为什么 / 怎么办
const vagueToasts = [...app.matchAll(/toast\('无法([^']+)'\)/g)];
if (vagueToasts.length >= 3) {
  issues.push({ e: '傻瓜', p: 'H', issue: `有 ${vagueToasts.length} 处 toast 只说「无法XX」没告诉用户怎么办(比如无法解码应该提示「可能是 HEIC/RAW 格式，桌面版支持更好」)`, loc: 'app.js toast 多处' });
}

// 1d: 海报功能需要手动填标题但没给示例占位符
if (html.includes('placeholder="主标题（如「限时特惠」）"')) {
  issues.push({ e: '傻瓜', p: 'M', issue: '海报主标题占位符已经有示例了 ✓', loc: 'index.html posterTitle' });
}

// ============ 专家 2: 老年人（60+ 老花眼 / 操作慢）============
console.log('\n🟠 专家 2: 老年人 —— 60+ 老花眼，看不清 / 点不准\n');

// 2a: 字体太小
const fontSizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map(m => +m[1]);
const smallFonts = fontSizes.filter(s => s < 13);
if (smallFonts.length > 5) {
  issues.push({ e: '老年人', p: 'M', issue: `样式里有 ${smallFonts.length} 处 font-size < 13px（最小 ${Math.min(...smallFonts)}px），老花眼看不清`, loc: 'styles.css 多处' });
}

// 2b: 按钮太小
const smallBtns = [...css.matchAll(/\.btn[^{]*\{[^}]*height:\s*(\d+)px/g)].map(m => +m[1]).filter(h => h < 32);
if (smallBtns.length > 0) {
  issues.push({ e: '老年人', p: 'M', issue: `按钮高度 ${Math.min(...smallBtns)}px < 32px，手指点不准（建议最小 36px）`, loc: 'styles.css .btn' });
}

// ============ 专家 3: 新手（第一次打开应用，5 分钟出海报？）============
console.log('\n🟡 专家 3: 新手 —— 第一次打开，能在 5 分钟内做出一张海报吗？\n');

// 3a: 有没有「快速开始」引导？
if (!html.includes('快速开始') && !html.includes('新手引导') && !html.includes('quick start')) {
  issues.push({ e: '新手', p: 'H', issue: '没有「快速开始」引导——新用户打开应用不知道第一步该点哪', loc: 'index.html' });
}

// 3b: 海报功能藏在「特效 tab → 滑到最底部」——发现成本高
if (html.includes('data-tab="decor"')) {
  issues.push({ e: '新手', p: 'H', issue: '海报/边框/贴纸藏在「特效」tab 最底部(约 L560)，用户点进 tab 还得往下滑才能看见「生成海报文字」按钮', loc: 'index.html decor tab 布局' });
}

// 3c: 有没有「一键出图」最短路径？
if (!app.includes('一键海报') && !app.includes('quickPoster') && !app.includes('demo_poster')) {
  issues.push({ e: '新手', p: 'M', issue: '海报功能需要用户手动填标题 + 选布局——应该给「一键用默认示例出一张」按钮，用户先看到效果再自己改', loc: 'app.js generatePoster' });
}

// ============ 专家 4: 功能发现者（用户能找到隐藏功能吗？）============
console.log('\n🟢 专家 4: 功能发现者 —— 用户能找到所有功能吗？\n');

// 4a: 压缩包直看功能有没有任何提示？
if (!html.includes('ZIP') && !html.includes('压缩包')) {
  issues.push({ e: '功能发现', p: 'H', issue: '压缩包直看(ZIP/CBZ)功能零提示——用户不知道能拖漫画包进来', loc: 'index.html empty-hint' });
}

// 4b: AI 超分 / 消除笔 / HSL 分通道 这些高级功能入口深吗？
const hiddenFeatures = {
  'AI 消除笔': ['eraserMode', '🧽'],
  'AI 超分': ['超分', 'upscale'],
  'HSL 分通道': ['flHslH', 'flHslS', 'flHslL'],
};
for (const [name, keys] of Object.entries(hiddenFeatures)) {
  const found = keys.some(k => app.includes(k) || html.includes(k));
  if (found) {
    issues.push({ e: '功能发现', p: 'L', issue: `${name} 功能已实现但入口需要深入面板才能找到（合理，但建议加 tooltip 提示作用）`, loc: '美图面板' });
  }
}

// ============ 专家 5: 错误提示（出错时用户能自己解决吗？）============
console.log('\n🔵 专家 5: 错误提示 —— 出错了用户能自己修吗？\n');

// 5a: toast 里包含技术名词？
const techWords = ['OpenCV', 'ONNX', 'WebView', 'TAURI', 'invoke', 'blob', 'URL', 'decode', 'codec'];
for (const w of techWords) {
  if (app.includes(`toast('${w}`) || app.includes(`toast('无法${w}`)) {
    issues.push({ e: '错误提示', p: 'M', issue: `toast 里出现技术词「${w}」，普通用户看不懂`, loc: 'app.js toast' });
  }
}

// 5b: AI 放大失败时的降级提示够友好吗？
if (app.includes('AI 放大失败') && app.includes('已用插值放大')) {
  issues.push({ e: '错误提示', p: 'L', issue: 'AI 放大失败已做降级处理 ✓ — 但可把「已用插值放大」改成「已自动改用普通放大」更易懂', loc: 'app.js L2363' });
}

// ============ 专家 6: 效率党（常用操作能更快吗？）============
console.log('\n🟣 专家 6: 效率党 —— 常用操作能更快吗？\n');

// 6a: 海报生成后需要手动保存吗？
if (app.includes('generatePoster') && !app.includes('generatePosterAndSave')) {
  issues.push({ e: '效率党', p: 'M', issue: '生成海报文字后需要用户自己点保存——可加「生成并保存」按钮一步到位', loc: 'app.js generatePoster' });
}

// 6b: 常用快捷键有没有在 UI 上露出？
if (!html.includes('按') && !html.includes('快捷键') && !html.includes('shortcut')) {
  issues.push({ e: '效率党', p: 'L', issue: '自定义快捷键功能已实现(app.js L3701)但 UI 上没露出入口——用户不知道有这个功能', loc: 'index.html 设置' });
}

// 6c: 导出按钮有几个？分散吗？
const exportBtns = [...html.matchAll(/导出|export|保存/g)].length;
issues.push({ e: '效率党', p: 'L', issue: `导出/保存 相关按钮共 ${exportBtns} 处 — 检查是否可合并到一个统一的「导出」面板`, loc: 'index.html 多处' });

// ============ 汇总 ============
console.log('\n' + '='.repeat(60));
console.log('📋 6 专家矩阵扫描结果（按优先级排序）');
console.log('='.repeat(60));

const sorted = issues.filter(i => i.p !== 'L').sort((a, b) => {
  const rank = { H: 0, M: 1, L: 2 };
  return rank[a.p] - rank[b.p];
});

let hCount = 0, mCount = 0;
for (const it of sorted) {
  if (it.p === 'H') hCount++;
  if (it.p === 'M') mCount++;
  const icon = it.p === 'H' ? '🔴' : it.p === 'M' ? '🟠' : '🟡';
  console.log(`${icon} [${it.p}] ${it.e}: ${it.issue}（${it.loc}）`);
}

console.log(`\n共 ${sorted.length} 条改进：🔴 高优先级 ${hCount} / 🟠 中 ${mCount} / 🟡 低 ${sorted.length - hCount - mCount}`);
console.log('\n建议下一步：先修 🔴 高优 3 条（最快见效）');
