// 绿角犀看图 · 照片处理功能专项测试（jsdom 黑盒）
// 覆盖：色温/模糊/锐化滑杆、filterCss 一致性、sharpenCanvas 卷积、自动增强、
//       OpenCV/AI 高级处理队列（接线与降级）
// 运行: NODE_PATH=<workspace node_modules> node test/photo.cjs
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

// 可控像素：所有 getImageData 返回统一灰度（供自动增强统计）
let pxV = 128;
const sharedCtx = {
  filter: 'none',
  drawImage() {}, fillRect() {}, clearRect() {}, save() {}, restore() {},
  translate() {}, rotate() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {},
  getImageData(x, y, w, h) {
    const n = Math.max(1, (w | 0) * (h | 0));
    const data = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { data[i * 4] = pxV; data[i * 4 + 1] = pxV; data[i * 4 + 2] = pxV; data[i * 4 + 3] = 255; }
    return { data, width: w | 0, height: h | 0 };
  },
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; },
  putImageData(id) { sharedCtx.lastPut = id; },
  lastPut: null,
};
window.HTMLCanvasElement.prototype.getContext = () => sharedCtx;
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

// 预置 AI 模型地址（onAiRun 接线测试用；不会触发真实网络，仅入队）
window.localStorage.setItem('qjviewer_settings_v1', JSON.stringify({ advanced: { aiModelUrl: 'http://localhost/m.onnx' } }));

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
  fi.dispatchEvent(new window.Event('change'));
  await wait(50);
}
function setRange(id, v) { const el = $(id); el.value = String(v); el.dispatchEvent(new window.Event('input', { bubbles: true })); }

(async () => {
  await wait(60);
  await openFiles(['photo_test.jpg']);
  const qj = window.__qj;
  const st = qj.state;
  assert(!!qj && st.items.length === 1, '已打开测试图');
  assert(errors.length === 0, 'init 无 JS 错误: ' + errors.join(' | '));

  // ===== 1. 新滑杆存在且默认为 0 =====
  assert(!!$('flTemp') && !!$('flBlur') && !!$('flSharp'), '色温/模糊/锐化滑杆存在');
  assert(st.filters.temp === 0 && st.filters.blur === 0 && st.filters.sharp === 0, '新滤镜默认值全 0');

  // ===== 2. 色温/模糊实时预览（CSS filter 串）=====
  const baseFilter = $('image').style.filter;
  setRange('flTemp', 80);
  assert(st.filters.temp === 80, '色温滑杆写入 state (80)');
  assert($('image').style.filter.includes('sepia(0.28'), '暖色调预览含 sepia (实际 ' + $('image').style.filter + ')');
  setRange('flTemp', -60);
  assert($('image').style.filter.includes('hue-rotate(10.8deg)'), '冷色调预览含 hue-rotate');
  setRange('flTemp', 0);
  const zeroFilter = $('image').style.filter;
  assert(zeroFilter === baseFilter + 'brightness(100%) contrast(100%) saturate(100%) grayscale(0%)' || zeroFilter === 'brightness(100%) contrast(100%) saturate(100%) grayscale(0%)',
    '色温归零后滤镜串还原（无 sepia/hue-rotate）(实际 ' + zeroFilter + ')');
  assert(!zeroFilter.includes('sepia') && !zeroFilter.includes('hue-rotate'), '归零串不含色温残留');
  setRange('flBlur', 2.5);
  assert($('image').style.filter.includes('blur(2.5px)'), '模糊预览含 blur(2.5px)');
  setRange('flBlur', 0);

  // ===== 3. resetFilters 覆盖新键 =====
  setRange('flSharp', 60);
  $('flReset').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert(st.filters.sharp === 0 && st.filters.temp === 0 && st.filters.blur === 0, '重置滤镜覆盖 temp/blur/sharp');

  // ===== 4. sharpenCanvas 卷积数学（3×3 亮中心）=====
  // 独立画布对象：中心 200、四邻 100，amount=25 → k=0.3 → 中心 200+0.3*(200-100)=230
  const spx = new Uint8ClampedArray(3 * 3 * 4).fill(100);
  for (let c = 0; c < 4; c++) spx[16 + c] = c === 3 ? 255 : 200;
  let putOut = null;
  const sharpCtx = {
    getImageData: () => ({ data: spx, width: 3, height: 3 }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: (id) => { putOut = id; },
  };
  const sharpCanvas = { width: 3, height: 3, getContext: () => sharpCtx };
  const r = qj.sharpenCanvas(sharpCanvas, 25);
  assert(r === sharpCanvas, 'sharpenCanvas 返回同一画布');
  assert(putOut && putOut.data[16] === 230, '锐化中心像素 200→230 (实际 ' + (putOut && putOut.data[16]) + ')');
  assert(putOut && putOut.data[0] === 100, '角点（边缘行）保持原值 100');
  assert(putOut && putOut.data[19] === 255, 'alpha 通道保持 255');

  // ===== 5. 自动增强：暗图 → 提亮；亮图 → 压暗 =====
  pxV = 64;  // 全图均匀暗灰
  qj.autoEnhance();
  assert(st.filters.brightness === 180, '暗图自动增强亮度=180（clamp 上限）(实际 ' + st.filters.brightness + ')');
  assert(st.filters.contrast === 180, '暗图（零动态范围）对比度=180');
  assert(st.filters.saturate === 125, '低饱和图饱和度=125');
  pxV = 200; // 全图均匀亮灰
  qj.autoEnhance();
  assert(st.filters.brightness === 64, '亮图自动增强亮度=64 (实际 ' + st.filters.brightness + ')');
  assert($('flBrightness').value === '64' && $('flBrightnessVal').textContent === '64', '自动增强后滑杆 UI 同步');

  // ===== 6. OpenCV 高级处理队列（cv 已就绪 → 点击入队）=====
  let imshowCalls = 0;
  window.cv = {
    Mat: function () { this.delete = () => {}; },
    Size: function () {},
    imread: () => ({ delete() {} }),
    imshow: () => { imshowCalls++; },
    medianBlur() {}, bilateralFilter() {}, GaussianBlur() {}, addWeighted() {},
  };
  qj.openEdit();
  $('cvDenoise').dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(30);
  assert(st.ops.length === 1 && st.ops[0].type === 'median' && st.ops[0].k === 5, '点击「去噪」入队 median k=5');
  assert($('opsReset').textContent.includes('1 步'), '队列计数按钮显示 1 步 (实际 ' + $('opsReset').textContent + ')');
  $('cvBilateral').dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(30);
  assert(st.ops.length === 2 && st.ops[1].type === 'bilateral', '点击「保边去噪」入队 bilateral');

  // applyPixelOpsAsync：fake cv 就绪时依序执行（imshow 被调用、画布透传）
  const opsCanvas = { width: 10, height: 10, getContext: () => sharedCtx };
  const applied = await qj.applyPixelOpsAsync(opsCanvas);
  assert(applied === opsCanvas && imshowCalls === 2, '导出管线依序应用 2 步 OpenCV（imshow×2）');

  // ===== 7. 清空高级处理 =====
  $('opsReset').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert(st.ops.length === 0 && $('opsReset').textContent.includes('0 步'), '清空队列并复位计数');

  // ===== 8. AI 放大接线（已配置模型地址 → 入队）=====
  qj.onAiRun();
  assert(st.ops.length === 1 && st.ops[0].type === 'upscale' && st.ops[0].scale === 2, 'AI 放大入队 scale=2');
  $('aiScale').value = '4';
  qj.resetOps();
  qj.onAiRun();
  assert(st.ops[0].scale === 4, '选择 4× 后入队 scale=4');
  qj.resetOps();

  // ===== 9. 无像素环境降级：sharpenCanvas 返回 null 不炸 =====
  const noPixelCanvas = { width: 4, height: 4, getContext: () => ({ drawImage() {} }) };
  assert(qj.sharpenCanvas(noPixelCanvas, 50) === null, '无像素环境 sharpenCanvas 安全返回 null');

  assert(errors.length === 0, '全程无 JS 错误: ' + errors.join(' | '));

  console.log('\n========================================');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fails.length) { console.log('用例失败:'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
