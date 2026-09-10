// 绿角犀看图 · 裁剪功能专项测试（jsdom 黑盒）
// 运行: NODE_PATH=<workspace node_modules> node test/edit-crop.cjs
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => console.log('JSDOM_ERROR:', e.detail ? (e.detail.stack || e.detail) : e.message));
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/', virtualConsole: vc });
const { window } = dom;
const { document } = window;

const fakeCtx = new Proxy({}, {
  get: (t, k) => {
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
    if (k === 'canvas') return { width: 0, height: 0 };
    return () => {};
  },
});
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
window.HTMLCanvasElement.prototype.toBlob = function (cb, type) { cb(new window.Blob([new Uint8Array([1, 2, 3])], { type: type || 'image/png' })); };
window.URL.createObjectURL = () => 'blob:fake';
window.URL.revokeObjectURL = () => {};
class FakeImage {
  constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; this.onerror = null; this._src = ''; this.complete = false; }
  set src(v) { this._src = v; this.complete = true; this.naturalWidth = 100; this.naturalHeight = 80; if (this.onload) setTimeout(() => this.onload(), 0); }
  get src() { return this._src; }
}
window.Image = FakeImage;
window.HTMLAnchorElement.prototype.click = function () {};
Object.defineProperty(document, 'fullscreenElement', { get() { return null; }, configurable: true });

let errors = [];
window.addEventListener('error', (e) => errors.push(e.message || String(e)));
try { window.eval(appJs); } catch (e) { errors.push('eval: ' + e.message); }

const stage = document.getElementById('stage');
Object.defineProperty(stage, 'clientWidth', { get() { return 800; }, configurable: true });
Object.defineProperty(stage, 'clientHeight', { get() { return 600; }, configurable: true });

let pass = 0, fail = 0;
const fails = [];
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; fails.push(msg); console.log('  FAIL ' + msg); } }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => document.getElementById(id);
function makeFiles(names) { return names.map((n) => new window.File([new Uint8Array([1, 2, 3])], n, { type: 'image/jpeg' })); }
async function openFiles(names) {
  const fi = $('fileInput');
  Object.defineProperty(fi, 'files', { value: makeFiles(names), configurable: true });
  fi.addEventListener('change', () => console.log('PROBE files=' + fi.files.length + ' itemsBefore=' + window.__qj.state.items.length));
  fi.dispatchEvent(new window.Event('change'));
  await wait(50);
}
// 让预览画布有非零尺寸，便于模拟指针坐标
const preview = $('editPreview');
preview.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 160, right: 200, bottom: 160 });
function pd(type, x, y) { const e = new window.Event(type, { bubbles: true, cancelable: true }); e.clientX = x; e.clientY = y; e.pointerId = 1; return e; }

(async () => {
  // 等待 jsdom 触发 DOMContentLoaded，确保 init/bindEvents 完成（绑定 fileInput 监听）
  await wait(60);
  // 准备一张 100x80 的测试图
  await openFiles(['crop_test.jpg']);
  console.log('DIAG items=' + window.__qj.state.items.length + ' errors=' + JSON.stringify(errors) + ' fileInput=' + !!$('fileInput'));
  const qj = window.__qj;
  assert(!!qj, '测试钩子 __qj 存在');
  assert(errors.length === 0, 'init 无 JS 错误: ' + errors.join(' | '));
  assert(qj.state.items.length === 1, '已打开测试图(1张)');
  assert(qj.state.items[0].img, 'item.img 已加载(供烘焙)');

  // 打开编辑面板，预览渲染不应报错
  qj.openEdit();
  assert($('editMask').hidden === false, '编辑面板已打开');
  assert(errors.length === 0, 'openEdit/renderEditPreview 无错误: ' + errors.join(' | '));

  // normToPx 纯几何
  const np = qj.normToPx({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }, 100, 80);
  assert(np.x === 10 && np.y === 16 && np.w === 50 && np.h === 32, 'normToPx 计算正确 (实际 ' + JSON.stringify(np) + ')');

  // 设置裁剪后导出画布尺寸应等于裁剪区域
  qj.setCrop({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
  let c = await qj.exportCanvasOfCurrent();
  assert(c && c.width === 50 && c.height === 32, '裁剪导出尺寸 50x32 (实际 ' + (c && c.width) + 'x' + (c && c.height) + ')');

  // 裁剪坐标越界应被 clamp（起点归 0，宽高不超过画布边界）
  qj.setCrop({ x: -0.1, y: -0.2, w: 1.5, h: 1.5 });
  c = await qj.exportCanvasOfCurrent();
  assert(c && c.width === 100 && c.height === 80, '越界裁剪被 clamp 到 100x80 (实际 ' + (c && c.width) + 'x' + (c && c.height) + ')');

  // 重置裁剪 = 全图（无 crop）
  qj.resetCrop();
  assert(qj.getCrop() === null, 'resetCrop 清空裁剪');
  c = await qj.exportCanvasOfCurrent();
  assert(c && c.width === 100 && c.height === 80, '无裁剪导出全图 100x80 (实际 ' + (c && c.width) + 'x' + (c && c.height) + ')');

  // 模拟指针拖拽生成裁剪框
  qj.resetCrop();
  preview.dispatchEvent(pd('pointerdown', 10, 16));   // (0.05, 0.10)
  preview.dispatchEvent(pd('pointermove', 110, 96));  // (0.55, 0.60)
  preview.dispatchEvent(pd('pointerup', 110, 96));
  const dragCrop = qj.getCrop();
  assert(dragCrop && dragCrop.x > 0.04 && dragCrop.x < 0.06 && dragCrop.w > 0.49 && dragCrop.w < 0.51,
    '拖拽生成裁剪框 (实际 ' + JSON.stringify(dragCrop) + ')');
  assert(dragCrop.y > 0.09 && dragCrop.y < 0.11 && dragCrop.h > 0.49 && dragCrop.h < 0.51,
    '拖拽裁剪框 y/h 正确 (实际 ' + JSON.stringify(dragCrop) + ')');

  // 四角缩放：拖右下角把手
  qj.setCrop({ x: 0.2, y: 0.2, w: 0.3, h: 0.3 });
  const px = qj.normToPx(qj.getCrop(), preview.getBoundingClientRect().width, preview.getBoundingClientRect().height);
  const brX = px.x + px.w, brY = px.y + px.h; // 右下角像素
  preview.dispatchEvent(pd('pointerdown', brX, brY));
  preview.dispatchEvent(pd('pointermove', brX + 40, brY + 30));
  preview.dispatchEvent(pd('pointerup', brX + 40, brY + 30));
  const resized = qj.getCrop();
  assert(resized && resized.w > 0.45 && resized.h > 0.4, '右下角缩放扩大裁剪 (实际 w=' + (resized && resized.w.toFixed(3)) + ' h=' + (resized && resized.h.toFixed(3)) + ')');

  console.log('\n========================================');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fails.length) { console.log('用例失败:'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
