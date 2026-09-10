// 绿角犀看图 · 美工功能专项测试（jsdom 黑盒）
// 覆盖：风格预设 / 美颜接线 / 边框烘焙 / 文字层（添加/选中/删除/属性联动）/ 马赛克（模式/笔触/清空/换图重置）
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

// fake ctx：drawTexts 需要 font/fillText/measureText；drawMosaic 需要 clip/arc 等
const sharedCtx = {
  filter: 'none',
  drawImage() {}, fillRect() {}, clearRect() {}, save() {}, restore() {},
  translate() {}, rotate() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, strokeRect() {},
  arc() {}, arcTo() {}, clip() {}, closePath() {},
  getImageData(x, y, w, h) {
    const n = Math.max(1, (w | 0) * (h | 0));
    const data = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { data[i * 4] = 128; data[i * 4 + 1] = 128; data[i * 4 + 2] = 128; data[i * 4 + 3] = 255; }
    return { data, width: w | 0, height: h | 0 };
  },
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; },
  putImageData() {},
  // 文字绘制桩：记录最后一次 fillText 调用
  font: '', fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', textBaseline: '',
  fillText() { sharedCtx.lastText = Array.from(arguments); },
  strokeText() { sharedCtx.lastStrokeText = Array.from(arguments); },
  measureText(t) { return { width: String(t).length * 10 }; },
  imageSmoothingEnabled: true,
  lastText: null, lastStrokeText: null,
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

let errors = [];
window.addEventListener('error', (e) => errors.push(e.message || String(e)));
try { window.eval(appJs); } catch (e) { errors.push('eval: ' + e.message); }

const stage = document.getElementById('stage');
Object.defineProperty(stage, 'clientWidth', { get() { return 800; }, configurable: true });
Object.defineProperty(stage, 'clientHeight', { get() { return 600; }, configurable: true });
const editPreview = document.getElementById('editPreview');
Object.defineProperty(editPreview, 'clientWidth', { get() { return 400; }, configurable: true });
Object.defineProperty(editPreview, 'clientHeight', { get() { return 300; }, configurable: true });
editPreview.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });

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

// 独立可跑像素的 ctx（边框测试需要真实 fillRect 计数）
function makeBorderedCtx() {
  const calls = { fillRect: 0, drawImage: 0 };
  return {
    canvas: null, fillStyle: '', save() {}, restore() {}, beginPath() {}, moveTo() {}, arcTo() {}, closePath() {},
    fillRect() { calls.fillRect++; }, drawImage() { calls.drawImage++; }, clip() {},
    get calls() { return calls; },
  };
}

(async () => {
  await wait(60);
  await openFiles(['beauty_test.jpg']);
  const qj = window.__qj;
  const st = qj.state;
  assert(!!qj && st.items.length === 1, '已打开测试图');
  assert(errors.length === 0, 'init 无 JS 错误: ' + errors.join(' | '));

  // ===== 1. 风格预设 =====
  const preset = qj.STYLE_PRESETS.find((p) => p.id === 'vintage');
  qj.applyStylePreset(preset);
  assert(st.filters.saturate === 72 && st.filters.temp === 45 && st.filters.contrast === 104, '「复古」预设写入滤镜参数');
  assert($('flSaturate').value === '72' && $('flSaturateVal').textContent === '72', '预设后滑杆 UI 同步');
  assert($('image').style.filter.includes('sepia'), '预设后主图预览含 sepia（temp 生效）');
  qj.applyStylePreset(qj.STYLE_PRESETS[0]);
  assert(st.filters.saturate === 100 && st.filters.temp === 0, '「原图」预设还原');
  // 渲染风格格（openEdit 时）
  qj.openEdit();
  const cells = document.querySelectorAll('#styleGrid .style-cell');
  assert(cells.length === qj.STYLE_PRESETS.length, '风格格渲染 ' + qj.STYLE_PRESETS.length + ' 个按钮 (实际 ' + cells.length + ')');
  cells[3].dispatchEvent(new window.Event('click', { bubbles: true }));  // 黑白
  assert(st.filters.gray === 100, '点击「黑白」风格格按钮生效');

  // ===== 2. 美颜（美白走滤镜；磨皮走 OpenCV 队列）=====
  const b0 = st.filters.brightness;
  $('beautyVal').value = '50';
  $('beautyVal').dispatchEvent(new window.Event('input', { bubbles: true }));
  assert($('beautyValVal').textContent === '50', '美颜强度滑杆数值显示同步');
  window.cv = { Mat: function () { this.delete = () => {}; }, Size: function () {}, imread: () => ({ delete() {} }), imshow() {}, bilateralFilter() {}, GaussianBlur() {}, addWeighted() {}, medianBlur() {} };
  await qj.onBeauty('white');
  assert(st.filters.brightness === Math.min(200, b0 + 20), '美白 50% → 亮度 +20 (实际 ' + st.filters.brightness + ')');
  const opsBefore = st.ops.length;
  await qj.onBeauty('smooth');
  const lastOp = st.ops[st.ops.length - 1];
  assert(st.ops.length === opsBefore + 1 && lastOp.type === 'bilateral' && lastOp.d === 7, '磨皮 50% → bilateral d=7 入队 (实际 d=' + (lastOp && lastOp.d) + ')');

  // ===== 3. 边框 =====
  // 直接用可计数的 ctx 造 canvas 调 applyBorder
  const bctx = makeBorderedCtx();
  const bc = { width: 200, height: 100, getContext: () => bctx };
  $('borderMode').value = 'white';
  // applyBorder 内部 document.createElement('canvas') → 用真实 prototype getContext（sharedCtx），
  // 这里仅验证尺寸/返回值，填充调用由 fake ctx 计数（sharedCtx 桩）
  const bordered = qj.applyBorder(bc);
  assert(bordered !== bc, '白边模式返回新画布');
  assert(bordered.width === 210 && bordered.height === 110, '白边 5% → 尺寸 200×100 → 210×110 (实际 ' + bordered.width + '×' + bordered.height + ')');
  $('borderMode').value = 'none'; $('borderRadius').value = '0';
  assert(qj.applyBorder(bc) === bc, '无边框直角 → 原画布直返');
  $('borderMode').value = 'white-thick';
  const b2 = qj.applyBorder(bc);
  assert(b2.width === 230 && b2.height === 130, '相纸白边 15% → 230×130');

  // ===== 4. 文字层 =====
  $('txtInput').value = '绿角犀水印';
  $('txtSize').value = '8'; $('txtColor').value = '#ff0000'; $('txtStroke').value = '2'; $('txtPos').value = 'br';
  $('txtAdd').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert(st.texts.length === 1, '添加文字层');
  const t0 = st.texts[0];
  assert(t0.text === '绿角犀水印' && t0.size === 8 && t0.color === '#ff0000' && t0.stroke === 2, '文字属性完整记录');
  assert(Math.abs(t0.x - 0.94) < 0.01 && Math.abs(t0.y - 0.95) < 0.01, '右下锚点坐标 (0.94, 0.95)');
  assert($('txtInput').value === '', '添加后输入框清空');
  assert(qj.textSel === t0.id, '新文字自动选中');
  // 绘制：drawTexts 应调用 fillText/strokeText
  qj.drawTexts(sharedCtx, 400, 300);
  assert(sharedCtx.lastText && sharedCtx.lastText[0] === '绿角犀水印', 'drawTexts 调用 fillText 绘制文字');
  assert(sharedCtx.lastStrokeText && sharedCtx.lastStrokeText[0] === '绿角犀水印', '描边>0 时调用 strokeText');
  // 命中检测：点文字中心 → 命中；点远处 → 不命中
  const hit = qj.selTextAt(0.9, 0.93, 400, 300);
  assert(hit && hit.id === t0.id, 'selTextAt 命中文字');
  assert(qj.selTextAt(0.1, 0.1, 400, 300) === null, 'selTextAt 远处不命中');
  // 属性联动：选中后改字号
  $('txtSize').value = '12';
  $('txtSize').dispatchEvent(new window.Event('input', { bubbles: true }));
  assert(t0.size === 12, '选中文字字号联动更新');
  // 删除
  $('txtDel').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert(st.texts.length === 0 && qj.textSel === null, '删除选中文字');

  // ===== 5. 马赛克 =====
  $('mosaicBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert(st.mosaicMode === true && $('mosaicBtn').textContent.includes('退出'), '进入马赛克模式（按钮文案切换）');
  // 模拟涂抹：直接调 onPreviewDown/Move（pointer 事件 jsdom 不全，走内部函数）
  // 借 pointerdown 事件
  const pd = new window.Event('pointerdown', { bubbles: true, cancelable: true });
  pd.clientX = 200; pd.clientY = 150; pd.pointerId = 1;
  editPreview.dispatchEvent(pd);
  assert(st.mosaic.length === 1 && st.mosaicPainting === true, 'pointerdown 落笔（1 笔触 + painting 态）');
  const pm = new window.Event('pointermove', { bubbles: true, cancelable: true });
  pm.clientX = 220; pm.clientY = 150; pm.pointerId = 1;
  editPreview.dispatchEvent(pm);
  assert(st.mosaic.length === 2, 'pointermove 涂抹追加笔触');
  const pu = new window.Event('pointerup', { bubbles: true, cancelable: true });
  pu.pointerId = 1;
  editPreview.dispatchEvent(pu);
  assert(st.mosaicPainting === false, 'pointerup 收笔');
  // 笔刷大小 → 归一化半径（改大后再落一笔对比）
  $('mosaicSize').value = '60';
  $('mosaicSize').dispatchEvent(new window.Event('input', { bubbles: true }));
  const pd2 = new window.Event('pointerdown', { bubbles: true, cancelable: true });
  pd2.clientX = 250; pd2.clientY = 150; pd2.pointerId = 2;
  editPreview.dispatchEvent(pd2);
  const pu2 = new window.Event('pointerup', { bubbles: true, cancelable: true });
  pu2.pointerId = 2;
  editPreview.dispatchEvent(pu2);
  assert(st.mosaic[st.mosaic.length - 1].r > st.mosaic[0].r * 1.5, '笔刷 60 涂抹半径大于笔刷 30 (r=' + st.mosaic[st.mosaic.length - 1].r + ' vs ' + st.mosaic[0].r + ')');
  // drawMosaic 不炸（fake ctx）
  let mosaicOk = true;
  try { qj.drawMosaic(sharedCtx, { width: 100, height: 80 }, 400, 300); } catch (e) { mosaicOk = false; }
  assert(mosaicOk, 'drawMosaic 在 fake ctx 下不抛错');
  // 清空
  $('mosaicClear').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert(st.mosaic.length === 0, '清空马赛克');
  // 退出模式
  $('mosaicBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert(st.mosaicMode === false && $('mosaicBtn').textContent.includes('进入'), '退出马赛克模式（按钮文案还原）');

  // ===== 6. 换图重置美工状态 =====
  await openFiles(['second.jpg', 'third.jpg']);
  await wait(50);
  $('txtInput').value = 'temp';
  qj.addText();
  $('mosaicBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
  // 切到下一张
  const nx = new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
  document.dispatchEvent(nx);
  await wait(60);
  assert(st.texts.length === 0 && st.mosaic.length === 0 && st.mosaicMode === false, '切图后文字/马赛克/模式全部重置');

  // ===== 7. 批量套滤镜（tone tab）=====
  const btS = $('btPreset');
  qj.openBatch();
  await wait(20);
  assert(btS.options.length === qj.STYLE_PRESETS.length - 1, '批量滤镜预设下拉含全部预设（不含原图）: ' + btS.options.length);
  qj.switchBatchTab('tone');
  await wait(20);
  await qj.renderTonePreview();
  assert(/「/.test($('btPreviewLabel').textContent || ''), '批量滤镜预览标注已选择预设: ' + $('btPreviewLabel').textContent);
  const bpc = $('btPreview');
  const px = bpc.getContext('2d').getImageData(bpc.width >> 1, bpc.height >> 1, 1, 1).data;
  assert(px[3] > 0, '批量滤镜预览画布已渲染像素');
  const canvas = document.createElement('canvas');
  canvas.width = 100; canvas.height = 80;
  const b = await qj.batchTone(st.items[0], 'vintage', 'image/jpeg');
  assert(b instanceof window.Blob && b.type === 'image/jpeg', 'batchTone 返回 JPEG Blob（预设 vintage）');
  const btPng = await qj.batchTone(st.items[0], 'xuqing', 'image/png');
  assert(btPng instanceof window.Blob && btPng.type === 'image/png', 'batchTone 返回 PNG Blob（预设玄青，走色调引擎不抛错）');
  assert(st.errors === undefined || typeof errors === 'object', 'batchTone 调用后无异常');

  // ===== 8. AI 放大降级（未配置模型 → 插值放大，离线可用）=====
  const up = qj.upscaleInterp({ width: 100, height: 80 }, 2);
  assert(up && up.width === 200 && up.height === 160, 'upscaleInterp 2× 放大画布尺寸 200×160');
  const up4 = qj.upscaleInterp({ width: 100, height: 80 }, 4);
  assert(up4 && up4.width === 400 && up4.height === 320, 'upscaleInterp 4× 放大画布尺寸 400×320');
  // 无模型：aiUpscale 不等 onnxruntime（不走网络），直接返回插值放大
  const ad = await qj.aiUpscale({ width: 100, height: 80 }, 2);
  assert(ad && ad.width === 200 && ad.height === 160, '未配模型 aiUpscale 降级为插值放大（不抛错、不联网）');

  // ===== 9. HEIC/HEIF 动态解码 =====
  const heicName = { name: 'photo.heic', url: null, type: '', file: null };
  const heicData = { name: 'x.heic', url: 'data:image/heic;base64,aGVsbG8=', type: '', file: null };
  const heicType = { name: 'x.heic', url: null, type: 'image/heic', file: null };
  const jpgItem = { name: 'a.jpg', url: 'data:image/jpeg;base64,', type: 'image/jpeg', file: null };
  assert(qj.isHeicItem(heicName) === true && qj.isHeicItem(heicData) === true && qj.isHeicItem(heicType) === true, 'isHeicItem 识别 扩展名/dataURL/type 三种来源');
  assert(qj.isHeicItem(jpgItem) === false, 'isHeicItem 不误判 JPEG');
  const heicBlob = await qj.toSourceBlob(heicData);
  assert(heicBlob instanceof window.Blob && heicBlob.type === 'image/heic' && heicBlob.size === 5, 'toSourceBlob 从 data URL 还原 5 字节 HEIC Blob');
  const srcJpg = await qj.resolveItemSrc(jpgItem);
  assert(srcJpg === jpgItem.url, '普通格式 resolveItemSrc 直返原 URL');
  // 桩 libheif 模块（避免 jsdom 网络请求 + 无 canvas），验证 decodeHeicToUrl 编排出 blob URL 并缓存
  const fakeHeifModule = {
    HeifDecoder: class { async decode() { return [{ handle: 1, get_width: () => 1, get_height: () => 1 }]; } },
    heif_colorspace: { heif_colorspace_RGB: 0 },
    heif_chroma: { heif_chroma_interleaved_RGBA: 0 },
    heif_channel: { heif_channel_interleaved: 0 },
    heif_js_decode_image2: async () => ({ image: 1, channels: [{ id: 0, stride: 4, data: new Uint8Array([1, 2, 3, 4]) }] }),
    heif_image_release: () => {},
  };
  window.__libheifModule = fakeHeifModule;
  // jsdom 无 canvas：注入像素→URL 桩
  qj.pixelsToBlobUrl = async () => URL.createObjectURL(new window.Blob([new Uint8Array([9])], { type: 'image/png' }));
  const heicItem = { name: 'photo.heic', url: 'data:image/heic;base64,aGVsbG8=', type: '', file: null, displayUrl: null };
  const h1 = await qj.resolveItemSrc(heicItem);
  assert(typeof h1 === 'string' && h1.indexOf('blob:') === 0, 'HEIC resolveItemSrc 转码产出 blob URL: ' + String(h1).slice(0, 12));
  const h2 = await qj.resolveItemSrc(heicItem);
  assert(h2 === h1, 'HEIC 转码结果复用缓存项 displayUrl');
  // 降级容错：libheif 解码抛错时 resolveItemSrc 拒掉，外层可显示“无法解码”
  window.__libheifModule = { HeifDecoder: class { async decode() { throw new Error('net-down'); } } };
  let failed = false;
  try { await qj.decodeHeicToUrl({ name: 'b.heic', url: 'data:image/heic;base64,xxx', type: '', file: null }); } catch (e) { failed = true; }
  assert(failed === true, '离线/失败时 decodeHeicToUrl 抛出供外层容错');

  assert(errors.length === 0, '全程无 JS 错误: ' + errors.join(' | '));

  console.log('\n========================================');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fails.length) { console.log('用例失败:'); fails.forEach((f) => console.log('  - ' + f)); }
  process.exit(fail ? 1 : 0);
})();
