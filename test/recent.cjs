// 绿角犀看图 Web 原型 · 最近打开（Recent）专项测试（jsdom 黑盒）
// 运行: NODE_PATH=<workspace node_modules> node test/recent.cjs
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const vc = new VirtualConsole();
const errs = [];
vc.on('jsdomError', (e) => errs.push('jsdomError: ' + (e.detail ? (e.detail.stack || e.detail) : e.message)));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const { window } = dom;
const { document } = window;

const fakeCtx = new Proxy({}, { get: (t, k) => (k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }) : () => {}) });
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,xxx';
window.HTMLCanvasElement.prototype.toBlob = function (cb, type) { cb(new window.Blob([new Uint8Array([1, 2, 3])], { type: type || 'image/png' })); };
window.URL.createObjectURL = (f) => 'blob:fake-' + (f && f.name ? f.name : Math.random().toString(36).slice(2));
window.URL.revokeObjectURL = () => {};
class FakeImage { constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; this.onerror = null; this._src = ''; this.complete = false; } set src(v) { this._src = v; this.complete = true; if (this._src.indexOf('broken') >= 0) { if (this.onerror) setTimeout(() => this.onerror(), 0); return; } this.naturalWidth = 100; this.naturalHeight = 80; if (this.onload) setTimeout(() => this.onload(), 0); } get src() { return this._src; } }
window.Image = FakeImage;
window.HTMLAnchorElement.prototype.click = function () {};
let _fs = null;
Object.defineProperty(document, 'fullscreenElement', { get() { return _fs; }, configurable: true });

window.addEventListener('error', (e) => errs.push('window error: ' + (e.message || String(e))));
try { window.eval(appJs); } catch (e) { errs.push('eval: ' + e.message); }

let pass = 0, fail = 0; const fails = [];
function assert(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; fails.push(m); console.log('  FAIL ' + m); } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => document.getElementById(id);
const qj = window.__qj;
const RECENT_KEY = 'lvjiaoxi_viewer_recent_v1';

(async () => {
  await wait(60); // 等 DOMContentLoaded→init 完成 + 内联渲染
  assert(errs.length === 0, 'init 无 JS 错误: ' + errs.join(' | '));
  assert(typeof qj.addRecentFolder === 'function', '__qj 暴露最近打开钩子');

  // 1) 添加文件夹
  qj.clearRecent();
  qj.addRecentFolder('C:/Users/me/Pictures/Vacation2026', 24);
  let r = qj.getRecent();
  assert(r.length === 1, '添加文件夹后共 1 条 (实际 ' + r.length + ')');
  assert(r[0].kind === 'folder' && r[0].name === 'Vacation2026', '文件夹名取 basename: ' + (r[0] && r[0].name));
  assert(r[0].count === 24, '文件夹计数 24 (实际 ' + (r[0] && r[0].count) + ')');
  let stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
  assert(stored.length === 1 && stored[0].path === 'C:/Users/me/Pictures/Vacation2026', '写入 localStorage 且含路径');

  // 2) 同路径去重 + 计数/时间更新
  qj.addRecentFolder('C:/Users/me/Pictures/Vacation2026', 30);
  r = qj.getRecent();
  assert(r.length === 1, '同路径去重后仍 1 条 (实际 ' + r.length + ')');
  assert(r[0].count === 30, '去重后计数更新为 30 (实际 ' + r[0].count + ')');

  // 3) 添加文件组（多文件）
  qj.addRecentFiles(['sunset.jpg', 'beach.png']);
  r = qj.getRecent();
  assert(r.length === 2, '再添加文件组后共 2 条 (实际 ' + r.length + ')');
  assert(r[0].kind === 'files' && r[0].name.indexOf('等 2 个文件') >= 0, '文件组标签带数量: ' + (r[0] && r[0].name));
  assert(r[1].kind === 'folder', '文件夹因较早而排第二');
  // 文件组同名去重
  qj.addRecentFiles(['sunset.jpg', 'beach.png']);
  assert(qj.getRecent().length === 2, '同文件组标签去重仍 2 条 (实际 ' + qj.getRecent().length + ')');

  // 4) 上限 RECENT_MAX=12 的 LRU 截断
  qj.clearRecent();
  for (let i = 0; i < 15; i++) qj.addRecentFolder('Folder' + i, i);
  assert(qj.getRecent().length === 12, '超 12 条被截断为 12 (实际 ' + qj.getRecent().length + ')');
  assert(qj.getRecent()[0].name === 'Folder14', '最新添加在最前 (实际 ' + qj.getRecent()[0].name + ')');

  // 5) renderRecent 填充弹窗列表
  qj.clearRecent();
  qj.addRecentFolder('C:/X/MyTrip', 5);
  qj.renderRecent();
  assert($('recentList').innerHTML.indexOf('MyTrip') >= 0, 'renderRecent 渲染出文件夹名');
  assert($('recentList').querySelector('.recent-item') !== null, 'renderRecent 生成 .recent-item 节点');

  // 6) renderRecentInline 空状态内联
  qj.renderRecentInline();
  assert($('recentInline').hidden === false, '内联最近显示 (hidden=false)');
  assert($('recentInline').innerHTML.indexOf('MyTrip') >= 0, '内联渲染出文件夹名');
  qj.clearRecent();
  assert($('recentInline').hidden === true, '清空后内联最近隐藏');

  // 7) removeRecent 移除单条
  qj.clearRecent();
  qj.addRecentFolder('A', 1); qj.addRecentFolder('B', 2);
  let before = qj.getRecent().length;
  qj.removeRecent(qj.getRecent()[0].ts);
  assert(qj.getRecent().length === before - 1, 'removeRecent 删除一条');

  // 8) 桌面端：点击文件夹 → 经 desktop.loadPaths 调后端 load_paths
  qj.clearRecent();
  qj.addRecentFolder('C:/Desktop/Photos', 7);
  qj.renderRecent();
  let invoked = [];
  window.__TAURI__ = { core: { invoke: (cmd, args) => { invoked.push({ cmd, args }); return Promise.resolve([]); } } };
  const folderItem = $('recentList').querySelector('.recent-item');
  folderItem.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  assert(invoked.some((i) => i.cmd === 'load_paths' && i.args.paths[0] === 'C:/Desktop/Photos'),
    '桌面端点击文件夹经 load_paths 传路径 (实际 ' + JSON.stringify(invoked) + ')');
  assert($('recentMask').hidden === true, 'reopen 后弹窗关闭');

  // 9) Web 降级：无 __TAURI__ 时回退到 dirInput.click（重新选择）
  delete window.__TAURI__;
  const dirInput = $('dirInput');
  let dirClicked = false; const origDirClick = dirInput.click; dirInput.click = function () { dirClicked = true; };
  qj.clearRecent();
  qj.addRecentFolder('C:/NoHook/Albums', 3);
  qj.renderRecent();
  $('recentList').querySelector('.recent-item').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert(dirClicked === true, '无桌面钩子时回退触发 dirInput.click（重新选择文件夹）');
  dirInput.click = origDirClick;

  // 11) 桌面端文件组：addRecentFiles 捕获完整 .path，点击经 load_paths 传多路径
  qj.clearRecent();
  invoked = [];
  window.__TAURI__ = { core: { invoke: (cmd, args) => { invoked.push({ cmd, args }); return Promise.resolve([]); } } };
  const fakeFiles = [
    { name: 'a.jpg', path: 'C:/Users/me/a.jpg' },
    { name: 'b.png', path: 'C:/Users/me/b.png' },
  ];
  qj.addRecentFiles(fakeFiles);
  qj.renderRecent();
  invoked = [];
  $('recentList').querySelector('.recent-item').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(10);
  assert(invoked.some((i) => i.cmd === 'load_paths' && i.args.paths.length === 2 &&
    i.args.paths[0] === 'C:/Users/me/a.jpg'),
    '文件组桌面端重开传 2 个完整路径 (实际 ' + JSON.stringify(invoked) + ')');
  delete window.__TAURI__;

  // 10) 删除按钮（data-del）移除而不触发 reopen
  qj.clearRecent();
  qj.addRecentFolder('Del1', 1); qj.addRecentFolder('Del2', 1);
  qj.renderRecent();
  const delBtn = $('recentList').querySelector('[data-del]');
  delBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert(qj.getRecent().length === 1, '点击 ✕ 删除一条 (剩余 ' + qj.getRecent().length + ')');

  console.log('\n[recent] ' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('FAILED: ' + fails.join('; ')); process.exit(1); }
})();
