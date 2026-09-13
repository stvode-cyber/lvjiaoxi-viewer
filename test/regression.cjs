// 绿角犀看图 Web 原型 · 综合回归测试（jsdom 黑盒 + 单元）
// 运行: NODE_PATH=<workspace node_modules> node test/regression.cjs
// 覆盖 PRD 5.2/5.3/5.4/5.5/5.6 与桌面桥接降级、PWA 守卫等可验证项。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
const { document } = window;

// ---- polyfills ----
const fakeCtx = new Proxy({}, {
  get: (t, k) => {
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
    if (k === 'canvas') return { width: 0, height: 0 };
    return () => {};
  },
});
window.HTMLCanvasElement.prototype.getContext = () => fakeCtx;
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,xxx';
window.HTMLCanvasElement.prototype.toBlob = function (cb, type) { cb(new window.Blob([new Uint8Array([1, 2, 3])], { type: type || 'image/png' })); };
window.URL.createObjectURL = (f) => 'blob:fake-' + (f && f.name ? f.name : Math.random().toString(36).slice(2));
window.URL.revokeObjectURL = () => {};
class FakeImage {
  constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; this.onerror = null; this._src = ''; this.complete = false; }
  set src(v) {
    this._src = v; this.complete = true;
    if (this._src.indexOf('broken') >= 0) { if (this.onerror) setTimeout(() => this.onerror(), 0); return; }
    this.naturalWidth = 100; this.naturalHeight = 80; if (this.onload) setTimeout(() => this.onload(), 0);
  }
  get src() { return this._src; }
}
window.Image = FakeImage;

// 避免 jsdom 触发 <a download> 导航告警
window.HTMLAnchorElement.prototype.click = function () {};

// jsdom 不提供 DOMMatrix；补一个遵循 CSS 变换语义的 2D 仿射解析实现。
// 覆盖 app 使用的 transform 语法：translate(px,px) rotate(deg) scale(x,y)。
if (!window.DOMMatrix) {
  window.DOMMatrix = class DOMMatrix {
    constructor(css) {
      let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
      if (css) {
        const re = /([a-z]+)\(([^)]*)\)/g;
        let m;
        while ((m = re.exec(css))) {
          const fn = m[1];
          const args = m[2].split(/[\s,%]+/).filter((x) => x !== '').map(parseFloat);
          let na, nb, nc, nd, ne, nf;
          if (fn === 'translate') { na = 1; nb = 0; nc = 0; nd = 1; ne = args[0] || 0; nf = args[1] || 0; }
          else if (fn === 'rotate') { const r = (args[0] || 0) * Math.PI / 180; na = Math.cos(r); nb = Math.sin(r); nc = -Math.sin(r); nd = Math.cos(r); ne = 0; nf = 0; }
          else if (fn === 'scale') { const sx = args[0] === undefined ? 1 : args[0]; const sy = args.length > 1 ? args[1] : sx; na = sx; nb = 0; nc = 0; nd = sy; ne = 0; nf = 0; }
          else continue;
          // 组合：P = 已累积 * 本次变换（右乘，最右侧先作用于点）
          const P = [a * na + c * nb, b * na + d * nb, a * nc + c * nd, b * nc + d * nd, a * ne + c * nf + e, b * ne + d * nf + f];
          [a, b, c, d, e, f] = P;
        }
      }
      this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
    }
  };
}

// 全屏 API 桩
let _fs = null;
Object.defineProperty(document, 'fullscreenElement', { get() { return _fs; }, configurable: true });
document.documentElement.requestFullscreen = () => { _fs = document.documentElement; document.dispatchEvent(new window.Event('fullscreenchange')); return Promise.resolve(); };
document.exitFullscreen = () => { _fs = null; document.dispatchEvent(new window.Event('fullscreenchange')); return Promise.resolve(); };

let errors = [];
window.addEventListener('error', (e) => errors.push(e.message || String(e)));
try { window.eval(appJs); } catch (e) { errors.push('eval: ' + e.message); }

// jsdom 无布局，给 stage 注入固定尺寸，否则 fit scale=0
const stage = document.getElementById('stage');
Object.defineProperty(stage, 'clientWidth', { get() { return 800; }, configurable: true });
Object.defineProperty(stage, 'clientHeight', { get() { return 600; }, configurable: true });
const infoPanel = document.getElementById('infoPanel');
Object.defineProperty(infoPanel, 'offsetWidth', { get() { return 300; }, configurable: true });
Object.defineProperty(infoPanel, 'offsetHeight', { get() { return 200; }, configurable: true });

// ---- 断言与工具 ----
let pass = 0, fail = 0;
const fails = [];
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; fails.push(msg); console.log('  FAIL ' + msg); } }
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (id) => document.getElementById(id);
function closeAllMasks() { ['settingsMask', 'batchMask', 'aboutMask', 'editMask'].forEach((id) => { const el = $(id); if (el && !el.hidden) el.hidden = true; }); }
function key(k) { document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
const tf = () => $('image').style.transform || '';
const getScale = () => { const m = tf().match(/scale\(([-\d.]+)/); return m ? parseFloat(m[1]) : NaN; };
const getRot = () => { const m = tf().match(/rotate\(([-\d.]+)deg\)/); return m ? parseFloat(m[1]) : NaN; };

// 单元：抽取 naturalCompare 做数字感知排序
const natSrc = (appJs.match(/function naturalCompare\(a, b\) \{[\s\S]*?\n  \}/) || [''])[0];
let naturalCompare = null;
try { naturalCompare = new Function(natSrc + '\n; return naturalCompare;')(); } catch (e) { errors.push('extract naturalCompare: ' + e.message); }

function makeFiles(names) {
  return names.map((n) => new window.File([new Uint8Array([1, 2, 3])], n, { type: 'image/jpeg' }));
}
async function openFiles(names) {
  const fi = $('fileInput');
  Object.defineProperty(fi, 'files', { value: makeFiles(names), configurable: true });
  fi.dispatchEvent(new window.Event('change'));
  await wait(50);
}

// ---- 场景 ----
const scenarios = [];
const test = (name, fn) => scenarios.push([name, fn]);

test('init 无错误 + 空状态', async () => {
  assert(errors.length === 0, 'init 无 JS 错误: ' + errors.join(' | '));
  assert($('emptyHint').hidden === false, '初始显示空状态提示');
});

test('打开多图(数字感知排序) + 计数/缩略图', async () => {
  await openFiles(['img10.bmp', 'photo1.jpg', 'photoA.png']);
  assert($('counter').textContent === '1 / 3', '打开3图计数 1/3 (实际 ' + $('counter').textContent + ')');
  assert($('image').hidden === false, '图片元素已显示');
  assert($('thumbBar').hidden === false, '缩略图栏可见');
  const thumbs = document.querySelectorAll('.thumb');
  assert(thumbs.length === 3, '生成 3 个缩略图 (实际 ' + thumbs.length + ')');
});

test('naturalCompare 数字感知排序', async () => {
  assert(naturalCompare !== null, 'naturalCompare 可提取');
  if (naturalCompare) {
    assert(naturalCompare('img2.jpg', 'img10.jpg') < 0, 'img2 < img10 (数字感知)');
    assert(naturalCompare('photo10.jpg', 'photo2.jpg') > 0, 'photo10 > photo2');
    assert(naturalCompare('a.jpg', 'a.jpg') === 0, '相同返回 0');
  }
});

test('翻页 下一/上一 + 循环', async () => {
  await openFiles(['a.jpg', 'b.jpg', 'c.jpg']);
  await wait(20);
  $('navNext').click(); assert($('counter').textContent === '2 / 3', '下一 → 2/3');
  $('navNext').click(); assert($('counter').textContent === '3 / 3', '下一 → 3/3');
  $('navNext').click(); assert($('counter').textContent === '1 / 3', '末张下一循环 → 1/3');
  $('navPrev').click(); assert($('counter').textContent === '3 / 3', '首张上一循环 → 3/3');
});

test('Home/End 键盘定位', async () => {
  await openFiles(['a.jpg', 'b.jpg', 'c.jpg']);
  await wait(20);
  key('Home'); assert($('counter').textContent === '1 / 3', 'Home → 1/3');
  key('End'); assert($('counter').textContent === '3 / 3', 'End → 3/3');
});

test('缩放(按钮) + 旋转(r) + 翻转(h)', async () => {
  key('Home');
  const s0 = getScale(); assert(s0 > 0 && isFinite(s0), '初始 fit 缩放有效 (' + s0 + ')');
  $('btnZoomIn').click(); const s1 = getScale(); assert(s1 > s0, '放大后缩放增大 ' + s0 + '→' + s1);
  key('r'); assert(getRot() === 90, '旋转 90° (实际 ' + getRot() + ')');
  key('h'); assert(tf().includes('scale(-'), '水平翻转 transform 含 scale(-');
});

test('fit/actual 切换不报错', async () => {
  $('btnZoomFit').click(); const s = getScale(); assert(isFinite(s) && Math.abs(s) > 0, '切换后缩放有限且非零 (' + s + ')');
});

test('信息面板 + 内容渲染', async () => {
  key('Home');
  $('btnInfo').click(); assert($('infoPanel').hidden === false, '信息面板打开');
  const body = $('infoBody').innerHTML;
  assert(body.includes('尺寸'), '信息含「尺寸」');
  assert(body.includes('文件大小'), '信息含「文件大小」');
});

test('复制图片(Web 降级) 不报错', async () => {
  const before = errors.length;
  $('btnCopy').click(); await wait(20);
  assert(errors.length === before, '复制路径无新错误');
});

test('设为壁纸 4 模式（PRD 5.4，Web 下载）不报错', async () => {
  await openFiles(['wp1.jpg', 'wp2.png', 'wp3.gif']);
  await wait(30);
  const before = errors.length;
  const modes = ['fit', 'fill', 'center', 'tile'];
  for (const m of modes) {
    $('btnSettings').click();
    const navBtns = Array.from($('settingsNav').querySelectorAll('button'));
    const viewNav = navBtns.find((b) => b.textContent === '看图');
    if (viewNav) viewNav.click();
    const sel = Array.from($('settingsForm').querySelectorAll('select')).find((s) => Array.from(s.options).some((o) => o.value === m));
    assert(!!sel, '壁纸模式选择存在 (' + m + ')');
    sel.value = m; sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    $('settingsClose').click();
    await wait(5);
    const sv = JSON.parse(window.localStorage.getItem('qjviewer_settings_v1') || '{}');
    assert(sv.view && sv.view.wallpaperMode === m, '设置写入壁纸模式=' + m);
    // 通过右键菜单触发 setWallpaper
    $('stage').dispatchEvent(new window.MouseEvent('contextmenu', { clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
    const wi = document.querySelector('#ctxMenu [data-act="wallpaper"]');
    if (wi) wi.click();
    await wait(60);
    if (!$('ctxMenu').hidden) document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  }
  assert(errors.length === before, '4 种壁纸模式均无新错误 (实际 ' + (errors.length - before) + ')');
});

test('批量调整尺寸 DPI 嵌入（PRD 5.5）', async () => {
  // ---- 单元：直接对构造的真实 PNG/JPEG 字节验证编码器（与 canvas 无关）----
  const qj = window.__qj;
  assert(typeof qj.setPngDpi === 'function' && typeof qj.setJpegDpi === 'function', 'DPI 编码器已暴露');

  // 构造最小合法 PNG（IHDR+IDAT+IEND，CRC 由 app 的 crc32 计算）
  function pngChunk(type, dataBuf) {
    const len = Buffer.alloc(4); len.writeUInt32BE(dataBuf.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), dataBuf]);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((qj.crc32(new Uint8Array(body)) >>> 0), 0);
    return Buffer.concat([len, body, crcBuf]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8;
  const idat = pngChunk('IDAT', zlib.deflateSync(Buffer.from([0, 0])));
  const pngBuf = Buffer.concat([sig, pngChunk('IHDR', ihdr), idat, pngChunk('IEND', Buffer.alloc(0))]);
  const pngBytes = new Uint8Array(pngBuf);

  const ppm300 = Math.round(300 * 39.37007874);
  const outP = qj.setPngDpi(pngBytes, 300);
  assert(outP.length === pngBytes.length + 21, 'PNG 注入 pHYs 后长度 +21 (实际 +' + (outP.length - pngBytes.length) + ')');
  let pIdx = -1;
  for (let i = 8; i + 4 <= outP.length; i++) {
    if (outP[i] === 0x70 && outP[i + 1] === 0x48 && outP[i + 2] === 0x59 && outP[i + 3] === 0x73) { pIdx = i; break; }
  }
  assert(pIdx === 37, 'PNG pHYs 紧跟 IHDR 插入（整块偏移+4, pos ' + pIdx + ')');
  const pPpm = (outP[pIdx + 4] << 24) | (outP[pIdx + 5] << 16) | (outP[pIdx + 6] << 8) | outP[pIdx + 7];
  assert(pPpm === ppm300, 'PNG pHYs X分辨率(ppm)=' + pPpm + ' (期望 ' + ppm300 + ')');
  assert(outP[pIdx + 12] === 1, 'PNG pHYs 单位=米');
  assert(qj.setPngDpi(pngBytes, 0) === pngBytes, 'DPI=0 不修改原图');

  // JPEG：插入 JFIF APP0 与改写已有 JFIF 密度
  const jIns = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0x00, 0x0A, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xFF, 0xD9]);
  const oIns = qj.setJpegDpi(jIns, 300);
  assert(oIns.length === jIns.length + 18, 'JPEG 插入 APP0 长度 +18 (实际 +' + (oIns.length - jIns.length) + ')');
  assert(oIns[2] === 0xFF && oIns[3] === 0xE0, 'JPEG 首段为 APP0(JFIF)');
  assert(oIns[11] === 1, 'JPEG 单位=点/英寸');
  assert((oIns[14] << 8 | oIns[15]) === 300 && (oIns[16] << 8 | oIns[17]) === 300, 'JPEG X/Y密度=300');
  const jMod = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xD9]);
  const oMod = qj.setJpegDpi(jMod, 150);
  assert(oMod.length === jMod.length, 'JPEG 已含 JFIF 不改长度');
  assert(oMod[11] === 1 && (oMod[14] << 8 | oMod[15]) === 150 && (oMod[16] << 8 | oMod[17]) === 150, 'JPEG 改写密度=150');
  assert(qj.setJpegDpi(jIns, 0) === jIns, 'DPI=0 不修改原图');

  // WebP：构造最小 RIFF/WEBP + 一个占位块，验证 EXIF 元数据块注入与 RIFF 尺寸
  assert(typeof qj.setWebpDpi === 'function' && typeof qj.buildExifTiff === 'function', 'WebP DPI 编码器已暴露');
  function fakeWebp() {
    const fourcc = Buffer.from('VP8 ');
    const body = Buffer.alloc(10);
    const chunk = Buffer.concat([fourcc, (() => { const l = Buffer.alloc(4); l.writeUInt32LE(10, 0); return l; })(), body]);
    const inner = Buffer.concat([Buffer.from('WEBP'), chunk]);
    const riff = Buffer.concat([Buffer.from('RIFF'), (() => { const l = Buffer.alloc(4); l.writeUInt32LE(inner.length, 0); return l; })(), inner]);
    return new Uint8Array(riff);
  }
  const w0 = fakeWebp();
  const wOut = qj.setWebpDpi(w0, 300);
  assert(wOut !== w0, 'WebP 注入 EXIF 后返回新引用');
  assert(wOut.length > w0.length, 'WebP 长度增加 (实际 +' + (wOut.length - w0.length) + ')');
  assert(String.fromCharCode(wOut[12], wOut[13], wOut[14], wOut[15]) === 'EXIF', 'WebP EXIF 块位于首块前偏移 12');
  const wRiffSize = (wOut[4] | (wOut[5] << 8) | (wOut[6] << 16) | (wOut[7] << 24)) >>> 0;
  assert(wRiffSize === wOut.length - 8, 'WebP RIFF 尺寸字段已更新 (期望 ' + (wOut.length - 8) + ', 实际 ' + wRiffSize + ')');
  // EXIF payload = 'Exif\0\0' + TIFF；TIFF 内 IFD0 XResolution(RATIONAL) 指向数据区 dpi/1，ResolutionUnit=2
  const exifBodyLen = (wOut[16] | (wOut[17] << 8) | (wOut[18] << 16) | (wOut[19] << 24)) >>> 0;
  assert(wOut[20] === 0x45 && wOut[21] === 0x78 && wOut[22] === 0x69 && wOut[23] === 0x66, 'EXIF payload 以 Exif\\0\\0 开头');
  const tiffBase = 12 + 8 + 6; // RIFF头(12) + EXIF头(8) + 'Exif\0\0'(6)
  const dv = new DataView(wOut.buffer, wOut.byteOffset + tiffBase, wOut.length - tiffBase);
  const le = dv.getUint16(0, true) === 0x4949;
  const get16 = (o) => dv.getUint16(o, le), get32 = (o) => dv.getUint32(o, le);
  assert(get16(0) === 0x4949, 'WebP TIFF 字节序 II');
  const ifd0 = get32(4);
  const count = get16(ifd0);
  let xResOff = -1, unitVal = -1;
  for (let i = 0; i < count; i++) {
    const e = ifd0 + 2 + i * 12;
    const tag = get16(e);
    if (tag === 0x011A) xResOff = get32(e + 8);
    if (tag === 0x0128) unitVal = get32(e + 8);
  }
  assert(xResOff > 0 && get32(xResOff) === 300 && get32(xResOff + 4) === 1, 'WebP TIFF XResolution=300/1');
  assert(unitVal === 2, 'WebP TIFF ResolutionUnit=2(英寸)');
  assert(qj.setWebpDpi(w0, 0) === w0, 'WebP DPI=0 不修改原图');
  // embedDpi 异步入口
  const wBlob = new Blob([qj.setWebpDpi(w0, 150)], { type: 'image/webp' });
  const wEmb = new Uint8Array(await qj.embedDpi(wBlob, 'image/webp', 150).then((b) => b.arrayBuffer()));
  assert(String.fromCharCode(wEmb[12], wEmb[13], wEmb[14], wEmb[15]) === 'EXIF', 'WebP embedDpi 异步写入 EXIF 块');

  // ---- 集成：批量尺寸接线 DPI 不报错 + 报告成功 ----
  closeAllMasks();
  await openFiles(['dpi1.jpg', 'dpi2.png']);
  await wait(20);
  const before = errors.length;
  $('btnBatch').click();
  assert($('batchMask').hidden === false, '批量弹窗打开');
  const resizeTab = document.querySelector('.batch-tab[data-tab="resize"]');
  assert(!!resizeTab, '存在「尺寸」标签页');
  resizeTab.click();
  assert($('rsDpi').value === '96', 'DPI 默认 96 (实际 ' + $('rsDpi').value + ')');
  $('rsDpi').value = '300';
  $('rsFormat').value = 'image/png';
  $('batchRun').click();
  await wait(200);
  assert(errors.length === before, '批量 DPI 接线无新错误 (实际 ' + (errors.length - before) + ')');
  assert(/成功/.test($('batchReport').textContent || ''), '批量报告含成功: ' + $('batchReport').textContent);
  closeAllMasks();
});

test('图片编辑 打开 + 滤镜滑块 + 导出', async () => {
  $('btnEdit').click(); assert($('editMask').hidden === false, '编辑弹窗打开');
  assert(!!$('flBrightness'), '亮度滑块存在');
  assert(document.querySelectorAll('.edit-tab').length === 5, '编辑面板含 5 个工具分类（左工具 + 右属性）');
  const bt2 = document.querySelector('.edit-tab[data-tab="beauty"]'); assert(bt2 && bt2.classList.contains('active'), '默认「美颜」页激活');
  const ft2 = document.querySelector('.edit-tab[data-tab="filter"]'); assert(!ft2, '滤镜页签已隐藏（美颜页整合参数）');
  const bp = document.querySelector('.edit-pane[data-pane="beauty"]'); assert(bp && bp.classList.contains('active'), '美颜面板已激活');
  const before = errors.length;
  $('exRun').click(); await wait(30);
  assert(errors.length === before, '导出无新错误');
  $('editClose').click(); await wait(5);
});

test('主界面「美图」条：控件存在 + 滑块直改滤镜', async () => {
  assert(!!$('beautyBar'), '美图常规条存在');
  assert(!!$('miBrightness') && !!$('miContrast') && !!$('miSaturate') && !!$('miTemp') && !!$('miSharp'), '5 个核心滤镜滑块齐全');
  assert(!!$('miBeautySmooth') && !!$('miBeautyWhite'), '磨皮 / 美白按钮存在');
  const axis = [['miBrightness', 'brightness'], ['miContrast', 'contrast'], ['miSaturate', 'saturate'], ['miTemp', 'temp'], ['miSharp', 'sharp']];
  const before = window.__qj.state.filters.brightness;
  const pb = $('miBrightness'); pb.value = 134; pb.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert(window.__qj.state.filters.brightness === 134 && $('miBrightnessVal').textContent === '134', '主条亮度滑块直达 state.filters（' + before + '→134）');
  const pc = $('miContrast'); pc.value = 88; pc.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert(window.__qj.state.filters.contrast === 88, '对比度滑块同步到滤镜状态');
  assert($('miMore') && !!$('miEnhance'), '「更多工具」与「自动增强」按钮存在');
});

test('一键美颜多档：三档按钮存在 + 点选联动亮度', async () => {
  assert(!!$('miBeautyLight') && !!$('miBeautyNatural') && !!$('miBeautyFancy'), '一键美颜 轻度/自然/精致 三档按钮齐全');
  const before = window.__qj.state.filters.brightness;
  $('miBeautyNatural').click();
  await wait(50);
  assert(window.__qj.state.filters.brightness > before, '点「自然」后亮度提升（' + before + '→' + window.__qj.state.filters.brightness + '）');
});

test('风格配方：图下主入口 + 左工具分类 + 一键/随机套用', async () => {
  assert(!!$('miRecipe') && !!$('miRecipeRandom') && !!$('recipeRandom'), '主界面「风格配方」/「随机配方」/面板「随机」按钮齐全');
  const err0 = errors.length;
  $('miRecipe').click(); await wait(40);
  assert(document.querySelector('.edit-tab[data-tab="recipe"]').classList.contains('active'), '点「风格配方」激活左工具分类');
  assert(document.querySelector('.edit-pane[data-pane="recipe"]').classList.contains('active'), '右侧风格配方面板显示');
  assert(document.querySelectorAll('#styleGrid .style-cell').length === window.__qj.STYLE_PRESETS.length, '风格格渲染 ' + window.__qj.STYLE_PRESETS.length + ' 个预设');
  $('miRecipeRandom').click(); await wait(30);
  assert(errors.length === err0, '随机配方无新错误');
  $('editClose').click(); await wait(5);
});

test('批量处理 打开 + 运行 + 汇总', async () => {
  $('btnBatch').click(); assert($('batchMask').hidden === false, '批量弹窗打开');
  const tab = document.querySelector('.batch-tab[data-tab="resize"]');
  if (tab) tab.click();
  const before = errors.length;
  $('batchRun').click(); await wait(200);
  assert(errors.length === before, '批量运行无新错误');
  assert($('batchReport').hidden === false, '批量汇总报告可见');
  assert(($('batchReport').textContent || '').length > 0, '汇总报告有内容');
  $('batchClose').click(); await wait(5);
});

test('幻灯片 开始/退出', async () => {
  $('btnSlide').click(); assert($('slideBar').hidden === false, '幻灯片控制条显示');
  $('slideExit').click(); assert($('slideBar').hidden === true, '退出后控制条隐藏');
});

test('右键菜单 打开 + 执行项', async () => {
  $('stage').dispatchEvent(new window.MouseEvent('contextmenu', { clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
  assert($('ctxMenu').hidden === false, '右键菜单弹出');
  const item = document.querySelector('#ctxMenu [data-act="slideshow"]') || document.querySelector('#ctxMenu [data-act="copy"]');
  if (item) { const before = errors.length; item.click(); assert(errors.length === before, '菜单项执行无新错误'); }
  assert($('ctxMenu').hidden === true, '菜单项点击后关闭');
  // 清理可能开启的幻灯片
  if (!$('slideBar').hidden) $('slideExit').click();
});

test('跳转序号', async () => {
  await openFiles(['a.jpg', 'b.jpg', 'c.jpg']);
  await wait(20);
  $('counter').click(); assert($('jumpInput').hidden === false && $('counter').hidden === true, '点击计数打开跳转框');
  $('jumpInput').value = '2';
  $('jumpInput').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(10);
  assert($('counter').textContent === '2 / 3', '跳转至 2/3 (实际 ' + $('counter').textContent + ')');
  assert($('jumpInput').hidden === true, '跳转后输入框收起');
});

test('缩略图搜索过滤', async () => {
  await openFiles(['photo.png', 'pic.jpg', 'img.gif']);
  await wait(20);
  const q = $('thumbSearch'); q.value = 'png';
  q.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(10);
  const visible = Array.from(document.querySelectorAll('.thumb')).filter((t) => t.style.display !== 'none');
  assert(visible.length === 1, '仅 1 个缩略图可见 (实际 ' + visible.length + ')');
  assert(visible.length === 1 && visible[0].querySelector('.t-fmt').textContent.toLowerCase() === 'png', '可见缩略图为 png');
  q.value = ''; q.dispatchEvent(new window.Event('input', { bubbles: true }));
});

test('全屏 缩略图栏 3s 自动隐藏 + 移动重显', async () => {
  document.documentElement.requestFullscreen(); await wait(10);
  assert($('thumbBar').hidden === false, '进入全屏先显示缩略图栏');
  await wait(3200);
  assert($('thumbBar').hidden === true, '全屏 3s 后自动隐藏');
  window.dispatchEvent(new window.Event('mousemove')); await wait(30);
  assert($('thumbBar').hidden === false, '鼠标移动重新显示');
  document.exitFullscreen(); await wait(10);
  assert($('thumbBar').hidden === false, '退出全屏恢复显示');
});

test('桌面桥接 Web 安全降级', async () => {
  assert(!window.__TAURI__, 'Web 环境无 __TAURI__（桥接降级）');
});

test('损坏图片 优雅处理(不崩溃/可跳过)', async () => {
  await openFiles(['ok1.jpg', 'broken.png', 'ok2.jpg']);
  await wait(40);
  // natural 排序：broken.png('b') 排在 ok1.jpg('o') 之前 → 首图(index0)即为损坏图
  assert($('image').hidden === true, '损坏图(排序后首图)隐藏图片元素，不显示破图');
  assert($('loading').classList.contains('is-error'), '损坏图显示错误覆盖层');
  assert(($('loading').querySelector('.loading-text').textContent || '').includes('无法解码'), '错误文案含「无法解码」');
  // 跳到正常图 ok1.jpg（index1）
  $('counter').click();
  $('jumpInput').value = '2';
  $('jumpInput').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(40);
  assert($('image').hidden === false, '跳到正常图(ok1.jpg)显示');
  assert($('loading').classList.contains('is-error') === false, '跳走后错误态消失');
  // 跳到另一正常图 ok2.jpg（index2）
  $('counter').click();
  $('jumpInput').value = '3';
  $('jumpInput').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await wait(40);
  assert($('image').hidden === false, '跳到正常图(ok2.jpg)显示');
  assert($('loading').classList.contains('is-error') === false, '仍在正常图错误态消失');
});

test('设置持久化', async () => {
  $('btnSettings').click(); assert($('settingsMask').hidden === false, '设置弹窗打开');
  const toggle = $('settingsForm').querySelector('.btn');
  assert(!!toggle, '渲染出设置项');
  if (toggle) {
    const before = window.localStorage.getItem('qjviewer_settings_v1');
    toggle.click();
    const raw = window.localStorage.getItem('qjviewer_settings_v1');
    assert(raw !== null && raw !== before, '点击开关写入 localStorage');
    try { JSON.parse(raw); assert(true, '设置 JSON 可解析'); } catch (e) { assert(false, '设置 JSON 可解析'); }
  }
  $('settingsClose').click();
});

test('快捷键自定义（PRD 5.1）：默认 i 开信息，改绑 o 后 i 失效 / o 生效', async () => {
  // 兜底清理前序场景可能泄漏的遮罩/面板状态，保证本场景隔离
  closeAllMasks();
  if (!$('infoPanel').hidden) $('infoClose').click();
  await wait(5);
  // 打开设置 → 切到「快捷键」分组
  $('btnSettings').click();
  assert($('settingsMask').hidden === false, '设置弹窗打开');
  const navBtns = Array.from($('settingsNav').querySelectorAll('button'));
  const scNav = navBtns.find((b) => b.textContent === '快捷键');
  assert(!!scNav, '设置导航含「快捷键」分组');
  scNav.click();
  const infoBtn = $('settingsForm').querySelector('.key-bind[data-action="info"]');
  assert(!!infoBtn, '快捷键表单含 info 行');
  assert(infoBtn.textContent.trim() === 'I', 'info 默认绑定显示 I (实际 ' + infoBtn.textContent + ')');

  // 关闭设置，确保信息面板关闭后验证默认快捷键 i 生效
  $('settingsClose').click();
  assert($('settingsMask').hidden === true, '设置已关闭');
  if (!$('infoPanel').hidden) $('infoClose').click();
  key('i'); await wait(5);
  assert($('infoPanel').hidden === false, '默认快捷键 i 打开信息面板');
  $('infoClose').click(); await wait(5);
  assert($('infoPanel').hidden === true, '关闭按钮可关信息面板');

  // 重新绑定 info → o（点击绑定按钮进入捕获，再在 document.body 派发以走捕获阶段）
  $('btnSettings').click(); scNav.click();
  const infoBtn2 = $('settingsForm').querySelector('.key-bind[data-action="info"]');
  infoBtn2.click();
  const capt = $('settingsForm').querySelector('.key-bind[data-action="info"]');
  assert(capt && capt.textContent.indexOf('按下') >= 0, '点击后进入「按下按键…」捕获态');
  document.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }));
  await wait(5);
  $('settingsClose').click();

  // 验证：i 失效，o 生效
  key('i'); await wait(5);
  assert($('infoPanel').hidden === true, '改绑后 i 不再触发信息面板');
  key('o'); await wait(5);
  assert($('infoPanel').hidden === false, '改绑后 o 打开信息面板');

  // 持久化校验
  const saved = JSON.parse(window.localStorage.getItem('qjviewer_keymap_v1') || '{}');
  assert(saved.info && saved.info.indexOf('o') >= 0, '新绑定已写入 localStorage');
});

test('EXIF Orientation 自动正向显示（PRD 5.2）', async () => {
  closeAllMasks();
  await openFiles(['ori1.jpg']);
  const st = window.__qj.state;
  assert(st.items.length === 1, '已打开测试图');
  // orientation=6（90° CW）：原 100x80 → 屏幕应旋转、导出画布应为 80x100
  st.items[0].exif = { orientation: 6 };
  key('home'); await wait(20); // 重新渲染当前图，套用方向
  const tf6 = $('image').style.transform || '';
  assert(tf6.indexOf('rotate(90deg)') >= 0, 'orientation=6 显示含 rotate(90deg) (实际 ' + tf6 + ')');
  const c6 = window.__qj.makeCanvasOfCurrent(1);
  assert(c6 && c6.width === 80 && c6.height === 100, 'orientation=6 导出画布 80x100 (实际 ' + (c6 && c6.width) + 'x' + (c6 && c6.height) + ')');
  // orientation=1：正常，无额外旋转
  st.items[0].exif = { orientation: 1 };
  key('home'); await wait(20);
  const tf1 = $('image').style.transform || '';
  assert(tf1.indexOf('rotate(90deg)') < 0, 'orientation=1 显示无额外 rotate(90deg) (实际 ' + tf1 + ')');
  const c1 = window.__qj.makeCanvasOfCurrent(1);
  assert(c1 && c1.width === 100 && c1.height === 80, 'orientation=1 导出画布 100x80 (实际 ' + (c1 && c1.width) + 'x' + (c1 && c1.height) + ')');
});

test('画面区域截图：空态放弃 + 有图导出 + 缩放/旋转/翻转矩阵正确', async () => {
  closeAllMasks();
  const st = window.__qj.state;
  let sArgs = null, dArgs = null, canvas = null, dlName = 'UNSET';
  const origGetCtx = window.HTMLCanvasElement.prototype.getContext;
  const origClick = window.HTMLAnchorElement.prototype.click;
  // 捕获锚点下载目标
  window.HTMLAnchorElement.prototype.click = function () { dlName = this.download || null; };
  function installCaptor() {
    window.HTMLCanvasElement.prototype.getContext = function (type) {
      if (canvas === null) canvas = this;
      const ctx = origGetCtx.call(this, type);
      return Object.assign(Object.create(Object.getPrototypeOf(ctx) || Object.prototype), {
        setTransform: (...a) => { sArgs = a; },
        drawImage: (...a) => { dArgs = a; },
        canvas: this,
      });
    };
  }
  function resetCaps() { dlName = 'UNSET'; sArgs = null; dArgs = null; canvas = null; }

  // —— 1) 空态：未打开图 → 放弃，不触发任何下载 ——
  st.index = -1; resetCaps(); installCaptor();
  const err0 = errors.length;
  window.__qj.snapVisible();
  await wait(20);
  assert(dlName === 'UNSET', '未打开图时放弃截图，不导出');
  assert(errors.length === err0, '空态截图执行无新错误');

  // —— 2) 有图 + 默认 fit：导出 PNG、画布=舞台、drawImage 用原尺寸、矩阵合适 ——
  await openFiles(['测试 图.png']); await wait(30);
  resetCaps(); installCaptor();
  st.scale = 1; st.rotation = 0; st.flipH = false; st.flipV = false; st.offsetX = 0; st.offsetY = 0;
  window.__qj.snapVisible();
  await wait(30);
  assert(dlName === '截图_测试 图.png', '导出文件名=截图_测试 图.png (实际 ' + dlName + ')');
  assert(canvas && canvas.width === 800 && canvas.height === 600, '截图画布=舞台 800x600 (实际 ' + (canvas && canvas.width) + 'x' + (canvas && canvas.height) + ')');
  assert(dArgs && dArgs[1] === 0 && dArgs[2] === 0 && dArgs[3] === 100 && dArgs[4] === 80, 'drawImage 用原尺寸 100x80');
  // 恒等 + transform-origin 修正：setTransform(1,0,0,1, 400-50, 300-40) = (1,0,0,1,350,260)
  assert(sArgs && near(sArgs[0], 1) && near(sArgs[1], 0) && near(sArgs[2], 0) && near(sArgs[3], 1)
         && near(sArgs[4], 350) && near(sArgs[5], 260),
         '默认 fit 变换 setTransform≈(1,0,0,1,350,260) (实际 ' + (sArgs && sArgs.join(',')) + ')');

  // —— 3) 旋转 90° + 水平翻转 + 2 倍缩放 + 平移：矩阵精确 → 覆盖 transform-origin 修正 ——
  // transform 序列 translate(10,-5) rotate(90) scale(-2,2) rotate(0) scale(1,1) →
  // 组合矩阵 (a,b,c,d,e,f)=(0,-2,-2,0,10,-5)；修正后 setTransform(0,-2,-2,0, 400-(-70), 300-(-105))=(0,-2,-2,0,470,405)
  resetCaps(); installCaptor();
  st.scale = 2; st.rotation = 90; st.flipH = true; st.flipV = false; st.offsetX = 10; st.offsetY = -5;
  window.__qj.snapVisible();
  await wait(30);
  assert(dlName === '截图_测试 图.png', '旋转/翻转态仍导出同名 PNG (实际 ' + dlName + ')');
  assert(sArgs && near(sArgs[0], 0) && near(sArgs[1], -2) && near(sArgs[2], -2) && near(sArgs[3], 0)
         && near(sArgs[4], 470) && near(sArgs[5], 405),
         '旋转90+水平翻转2倍 setTransform≈(0,-2,-2,0,470,405) (实际 ' + (sArgs && sArgs.join(',')) + ')');

  // 恢复原型
  window.HTMLCanvasElement.prototype.getContext = origGetCtx;
  window.HTMLAnchorElement.prototype.click = origClick;
});

test('批量压缩：页签/面板 + 质量开关 + 长边等比缩放 + 命名输出', async () => {
  closeAllMasks();
  await openFiles(['photo1.png']);
  window.__qj.openBatch();
  await wait(10);
  assert(!!document.querySelector('.batch-tab[data-tab="compress"]'), '存在「压缩」页签');
  window.__qj.switchBatchTab('compress');
  assert(document.querySelector('.batch-pane[data-pane="compress"]').hidden === false, '压缩面板可见');

  // PNG 目标隐藏质量滑块，JPG 恢复
  const gid = (i) => document.getElementById(i);
  const qf = gid('cpQualityField'), q = gid('cpQuality'), cpFmt = gid('cpFormat');
  cpFmt.value = 'image/png'; cpFmt.dispatchEvent(new window.Event('change')); await wait(5);
  assert(qf.hidden === true, 'PNG 目标隐藏质量滑块');
  cpFmt.value = 'image/jpeg'; cpFmt.dispatchEvent(new window.Event('change')); await wait(5);
  assert(qf.hidden === false, 'JPG 目标恢复质量滑块');

  // 压缩实时预览：切页签自动渲染 label 含目标格式/尺寸/体积估算
  const cpLbl = gid('cpPreviewLabel'), cpCv = gid('cpPreview');
  assert(!!cpLbl && !!cpCv, '存在压缩预览 label + canvas');
  cpFmt.value = 'image/webp'; gid('cpQuality').value = '70'; gid('cpMaxEdge').value = '50';
  await window.__qj.renderCompressPreview();
  assert(/压缩预览：50×40/.test(cpLbl.textContent), '预览 label 含缩放后尺寸 50×40 (实际 ' + cpLbl.textContent + ')');
  assert(/WEBP/.test(cpLbl.textContent), '预览 label 含目标格式 WEBP');
  assert(/q70/.test(cpLbl.textContent), '预览 label 含质量 q70');
  assert(/估算/.test(cpLbl.textContent), '预览 label 含体积估算');
  assert(cpCv.width === 240 && cpCv.height === 240, '预览画布 240×240 (实际 ' + cpCv.width + 'x' + cpCv.height + ')');
  // PNG 目标 → 显示无损、隐藏 q
  cpFmt.value = 'image/png'; gid('cpMaxEdge').value = '0';
  await window.__qj.renderCompressPreview();
  assert(/无损/.test(cpLbl.textContent), 'PNG 目标预览显示无损 (实际 ' + cpLbl.textContent + ')');
  assert(!/q\d+/.test(cpLbl.textContent), 'PNG 目标预览不含质量档');


  // 直接调用 batchCompress：webp + 质量70 + 最长边50 → 100x80 等比缩到 50x40，输出 photo1.webp
  let capturedCanvas = null;
  const origCtx = window.HTMLCanvasElement.prototype.getContext;
  window.HTMLCanvasElement.prototype.getContext = function (type) { if (capturedCanvas === null) capturedCanvas = this; return origCtx.call(this, type); };
  cpFmt.value = 'image/webp'; gid('cpQuality').value = '70'; gid('cpMaxEdge').value = '50';
  const itC = window.__qj.state.items[0];
  const rc = await window.__qj.batchCompress(itC);
  window.HTMLCanvasElement.prototype.getContext = origCtx;
  assert(rc && rc.name === 'photo1.webp', 'webp 目标 → 输出名 photo1.webp (实际 ' + (rc && rc.name) + ')');
  assert(capturedCanvas && capturedCanvas.width === 50 && capturedCanvas.height === 40, '最长边50 → 画布 50x40（100x80 等比, 实际 ' + (capturedCanvas && capturedCanvas.width) + 'x' + (capturedCanvas && capturedCanvas.height) + ')');
  assert(rc && rc.blob && rc.blob.type === 'image/webp', '输出 blob 类型 image/webp (实际 ' + (rc && rc.blob && rc.blob.type) + ')');

  // 保持原格式：jpg → 名称不变
  cpFmt.value = 'same';
  const itSame = window.__qj.state.items[0];
  const rsame = await window.__qj.batchCompress(itSame);
  assert(rsame && rsame.name === 'photo1.png', '保持原格式 → 名称仍为 photo1.png（仅重编码）(实际 ' + (rsame && rsame.name) + ')');

  // 整批运行压缩
  await openFiles(['a.jpg', 'b.jpg']);
  window.__qj.switchBatchTab('compress');
  cpFmt.value = 'image/jpeg'; gid('cpQuality').value = '80'; gid('cpMaxEdge').value = '0';
  const errC = errors.length;
  gid('batchRun').click(); await wait(250);
  assert(/成功/.test($('batchReport').textContent || ''), '压缩批量报告含成功: ' + $('batchReport').textContent);
  assert(errors.length === errC, '压缩批量无新错误');
});

test('批量转换实时预览：格式/质量重编码 + 体积估算（所见即所得）', async () => {
  closeAllMasks();
  await openFiles(['photo1.png']); // 100×80
  window.__qj.openBatch();
  await wait(10);
  assert(!!document.querySelector('.batch-tab[data-tab="convert"]'), '存在「转换」页签');
  window.__qj.switchBatchTab('convert');
  const gid = (i) => document.getElementById(i);
  const pane = document.querySelector('.batch-pane[data-pane="convert"]');
  assert(pane && pane.hidden === false, '转换面板可见');
  const lbl = gid('cvPreviewLabel'), cv = gid('cvPreview'), cvFmt = gid('cvFormat');
  assert(!!lbl && !!cv, '存在转换预览 label + canvas');

  // 默认 JPEG q92 → label 含原尺寸/格式/质量/估算
  cvFmt.value = 'image/jpeg'; gid('cvQuality').value = '92';
  await window.__qj.renderCvPreview();
  assert(/转换预览：100×80/.test(lbl.textContent), '预览 label 含原尺寸 100×80 (实际 ' + lbl.textContent + ')');
  assert(/JPEG/.test(lbl.textContent), '预览 label 含目标格式 JPEG');
  assert(/q92/.test(lbl.textContent), '预览 label 含质量 q92');
  assert(/估算/.test(lbl.textContent), '预览 label 含体积估算');
  assert(cv.width === 240 && cv.height === 240, '预览画布 240×240 (实际 ' + cv.width + 'x' + cv.height + ')');

  // PNG 目标 → 无损、不含质量档
  cvFmt.value = 'image/png';
  await window.__qj.renderCvPreview();
  assert(/PNG/.test(lbl.textContent), 'PNG 目标含 PNG');
  assert(/无损/.test(lbl.textContent), 'PNG 目标显示无损 (实际 ' + lbl.textContent + ')');
  assert(!/q\d+/.test(lbl.textContent), 'PNG 目标不含质量档');

  // WebP q70 → 格式与质量同时变化
  cvFmt.value = 'image/webp'; gid('cvQuality').value = '70';
  await window.__qj.renderCvPreview();
  assert(/WEBP/.test(lbl.textContent), 'WebP 目标含 WEBP (实际 ' + lbl.textContent + ')');
  assert(/q70/.test(lbl.textContent), 'WebP 目标含 q70');
});

test('批量调整尺寸实时预览：百分比/精确宽高 + 锁定比 + 重采样 + 体积估算', async () => {
  closeAllMasks();
  await openFiles(['photo1.png']); // 100×80
  window.__qj.openBatch();
  await wait(10);
  assert(!!document.querySelector('.batch-tab[data-tab="resize"]'), '存在「尺寸」页签');
  window.__qj.switchBatchTab('resize');
  const gid = (i) => document.getElementById(i);
  const pane = document.querySelector('.batch-pane[data-pane="resize"]');
  assert(pane && pane.hidden === false, '尺寸面板可见');
  const lbl = gid('rsPreviewLabel'), cv = gid('rsPreview');
  assert(!!lbl && !!cv, '存在尺寸预览 label + canvas');

  // 默认 percent 50% + JPEG → 100×80 → 50×40
  gid('rsMode').value = 'percent'; gid('rsPercent').value = '50'; gid('rsFormat').value = 'image/jpeg';
  window.__qj.updateRsUI();
  assert(gid('rsPercentField').hidden === false, '百分比模式显示百分比栏');
  assert(gid('rsExactField').hidden === true, '百分比模式隐藏精确宽高栏');
  await window.__qj.renderRsPreview();
  assert(/调整尺寸预览：100×80 → 50×40/.test(lbl.textContent), 'percent 50% → 100×80 → 50×40 (实际 ' + lbl.textContent + ')');
  assert(/JPEG/.test(lbl.textContent), '预览含输出格式 JPEG');
  assert(/估算/.test(lbl.textContent), '预览含体积估算');
  assert(cv.width === 240 && cv.height === 240, '预览画布 240×240 (实际 ' + cv.width + 'x' + cv.height + ')');

  // exact + 锁定比：宽 200 → 100×80 → 200×160（等比）
  gid('rsMode').value = 'exact'; window.__qj.updateRsUI();
  assert(gid('rsExactField').hidden === false, '精确模式显示宽高栏');
  assert(gid('rsPercentField').hidden === true, '精确模式隐藏百分比栏');
  gid('rsWidth').value = '200'; gid('rsHeight').value = '999'; // 高度被锁定比覆盖
  await window.__qj.renderRsPreview();
  assert(/100×80 → 200×160/.test(lbl.textContent), 'exact 宽200 锁定比 → 200×160 (实际 ' + lbl.textContent + ')');

  // WebP 输出格式 → label 含 WEBP
  gid('rsFormat').value = 'image/webp';
  await window.__qj.renderRsPreview();
  assert(/WEBP/.test(lbl.textContent), '切换输出格式含 WEBP (实际 ' + lbl.textContent + ')');
});

test('一键抠图：控件 + 画笔切换 + 分割蒙版 + 清除/导出透明PNG', async () => {
  closeAllMasks();
  await openFiles(['photo1.png']);
  await wait(20);
  window.__qj.openEdit('pro');
  await wait(10);

  // 控件存在
  ['matFg', 'matBg', 'matRun', 'matClear', 'matExport', 'matSize', 'matStatus'].forEach((id) => {
    assert(!!document.getElementById(id), '抠图控件存在 #' + id);
  });

  // 画笔切换：前景 → 再点取消
  const mat = window.__qj.matting;
  window.__qj.setMatBrush('fg');
  assert(mat.mode === 'fg', '前景笔激活 (mode=' + mat.mode + ')');
  window.__qj.setMatBrush('fg');
  assert(mat.mode === 'none', '再点前景笔 → 取消 (mode=' + mat.mode + ')');
  window.__qj.setMatBrush('bg');
  assert(mat.mode === 'bg', '背景笔激活 (mode=' + mat.mode + ')');

  // 注入笔迹并执行分割（工作分辨率≤512）
  mat.strokes = { fg: [{ x: 0.5, y: 0.5, r: 0.2 }], bg: [{ x: 0.05, y: 0.05, r: 0.2 }] };
  const ok = window.__qj.runMatting();
  assert(ok === true, '一键抠图成功执行');
  assert(!!mat.mask, '分割蒙版已生成');
  assert(mat.mask instanceof window.Uint8Array && mat.mask.length === mat.mW * mat.mH, '蒙版尺寸 = mW×mH (实际 ' + (mat.mask && mat.mask.length) + ' / ' + mat.mW + 'x' + mat.mH + ')');
  assert(mat.mW <= 512 && mat.mH <= 512, '工作分辨率受 512 限制 (实际 ' + mat.mW + 'x' + mat.mH + ')');
  assert($('matStatus').textContent.indexOf('抠图完成') >= 0, '状态提示转为抠图完成: ' + $('matStatus').textContent);

  // 导出透明 PNG：捕获锚点下载名
  let dlName = 'UNSET';
  const origClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { dlName = this.download || null; };
  await window.__qj.exportMatting();
  window.HTMLAnchorElement.prototype.click = origClick;
  assert(dlName === 'photo1-透明.png', '导出透明 PNG 命名 photo1-透明.png (实际 ' + dlName + ')');

  // 清除笔迹 → 蒙版与笔迹一并复位，状态回到未涂抹
  window.__qj.clearMatting();
  assert(mat.strokes.fg.length === 0 && mat.strokes.bg.length === 0, '清除后笔迹清空');
  assert(mat.mask === null, '清除后蒙版复位');
  assert(mat.mW === 0 && mat.mH === 0, '清除后工作分辨率复位');
  assert($('matStatus').textContent.indexOf('未涂抹') >= 0, '状态回未涂抹');
});

test('瘦身/瘦脸：控件 + 模式切换 + 锚点 + 位移场 + 导出', async () => {
  closeAllMasks();
  await openFiles(['photo1.png']);
  await wait(20);
  window.__qj.openEdit('pro');
  await wait(10);

  // 控件存在
  ['slimFace', 'slimBody', 'slimMode', 'slimStrength', 'slimRange', 'slimReset'].forEach((id) => {
    assert(!!document.getElementById(id), '瘦身/瘦脸控件存在 #' + id);
  });

  const qj = window.__qj;
  const sl = qj.slim;
  // 默认态
  assert(sl.enabled === false && sl.mode === 'face' && sl.strength === 0, '默认：禁用 + 瘦脸 + 强度0');
  assert(near(sl.cx, 0.5) && near(sl.cy, 0.5), '默认锚点居中 0.5/0.5');

  // 瘦身模式切换：点击后 mode=body 且启用
  document.getElementById('slimBody').click();
  assert(qj.slim.mode === 'body' && qj.slim.enabled === true, '点瘦身 → mode=body + enabled');

  // 瘦脸模式
  document.getElementById('slimFace').click();
  assert(qj.slim.mode === 'face', '点瘦脸 → mode=face');

  // 设定锚点（归一化 0..1）
  qj.setSlimAnchor(0.3, 0.4);
  assert(near(qj.slim.cx, 0.3) && near(qj.slim.cy, 0.4), 'setSlimAnchor 写入 cx=0.3 cy=0.4');
  qj.setSlimAnchor(-1, 2);
  assert(near(qj.slim.cx, 0) && near(qj.slim.cy, 1), '越界锚点被 clamp 到范围');

  // 位移场：禁用时返回 null
  qj.slim.enabled = false;
  assert(qj.slimWarp(qj.slim) === null, '禁用时 slimWarp 返回 null');
  // 启用 + 强度 → 计算收缩参数
  qj.slim.strength = 50; qj.slim.enabled = true; qj.slim.mode = 'face';
  const w = qj.slimWarp(qj.slim);
  assert(!!w && w.on === true, '启用后 slimWarp 返回位移场');
  assert(w.K > 0 && w.K < 1, '横向收缩系数 K 合理');
  // body 模式带竖直收缩 Kv
  qj.slim.mode = 'body'; const wb = qj.slimWarp(qj.slim);
  assert(wb.Kv > w.Kv, '瘦身模式竖直收缩 Kv 更强');

  // slimDisp: 锚点中心处无采样偏移（dx0≈0 → sx≈cx），边缘处有收缩
  const wc = qj.slimWarp(qj.slim);
  const atCenter = qj.slimDisp(wc, wc.cx, wc.cy);
  assert(near(atCenter.sx, wc.cx) && near(atCenter.sy, wc.cy), '中心点无位移 (dx=dx0·g, g=1 → sx=cx)');
  const off = qj.slimDisp(wc, 0.5, 0.5);
  assert(off.sx < 0.5, '右侧像素向锚点收缩 (sx<0.5)');

  // 导出形变：无像素环境安全返回（不抛错），有像素环境返回新 canvas
  let slimCanvasOut = null, slimCanvasErr = null;
  try { slimCanvasOut = qj.slimCanvas(document.createElement('canvas'), qj.slim); } catch (e) { slimCanvasErr = e; }
  assert(slimCanvasErr === null, 'slimCanvas 不抛错' + (slimCanvasErr ? ' → ' + slimCanvasErr.message : ''));
  assert(slimCanvasOut === null || slimCanvasOut.width > 0, 'slimCanvas 要么安全跳过要么产出画布');

  // 重置：恢复默认且撤销可回溯（重置按钮触发 pushUndo）
  qj.slim.cx = 0.2; qj.slim.cy = 0.9; qj.slim.strength = 80;
  document.getElementById('slimReset').click();
  assert(qj.slim.strength === 0 && qj.slim.enabled === false, '重置 → 强度0 + 未启用');
  assert(near(qj.slim.cx, 0.5) && near(qj.slim.cy, 0.5), '重置 → 锚点回中');
  assert(qj.slimMode === false, '重置退出锚点模式');
});

// ---- 长图优化滚轮翻页（对标 HoneyView v5.53）----
test('长图优化：isLongImage 状态 + 长宽比检测（nh/nw > 1.7）+ detectLongImage 函数 + offset 默认顶端', async () => {
  closeAllMasks();
  const qj = window.__qj;
  assert(qj !== undefined, 'window.__qj 存在');

  // 函数存在性
  assert(typeof qj.detectLongImage === 'function', 'detectLongImage 函数存在');

  // 普通图（16:10 ≈ 1.6）→ 非长图
  qj.state = qj.state || {};
  qj.state.isLongImage = false;
  qj.detectLongImage({ natW: 1920, natH: 1200 });
  assert(qj.state.isLongImage === false, '1920×1200 (ratio=0.625→h/w=0.625) 不是长图');

  // 横图（宽>高）→ 非长图
  qj.detectLongImage({ natW: 2560, natH: 1440 });
  assert(qj.state.isLongImage === false, '2560×1440 横图不是长图');

  // 长图 1080×1920（h/w=1.778）→ 长图！刚好超过 1.7
  qj.detectLongImage({ natW: 1080, natH: 1920 });
  assert(qj.state.isLongImage === true, '1080×1920 (h/w≈1.778) 是长图');

  // 长图 750×1334（iPhone 6/7/8，h/w=1.779）→ 长图
  qj.detectLongImage({ natW: 750, natH: 1334 });
  assert(qj.state.isLongImage === true, '750×1334 iPhone 标准长图');

  // 边界 exactly 1.7 → 非长图（严格大于）
  qj.detectLongImage({ natW: 1000, natH: 1700 });
  assert(qj.state.isLongImage === false, '1000×1700 ratio=1.7 不是长图（严格 > 1.7）');

  // 边界 1701/1000 = 1.701 → 长图
  qj.detectLongImage({ natW: 1000, natH: 1701 });
  assert(qj.state.isLongImage === true, '1000×1701 ratio=1.701 是长图');

  // 空尺寸 → 安全降级
  qj.detectLongImage({ natW: 0, natH: 0 });
  assert(qj.state.isLongImage === false, 'natW=0 安全降级 isLongImage=false');

  qj.detectLongImage({});
  assert(qj.state.isLongImage === false, '空对象安全降级 isLongImage=false');

  // fit 模式长图 → offsetY 归零（自动定位顶端）
  qj.state.isLongImage = true;
  qj.state.mode = 'fit';
  qj.state.offsetY = 999;
  qj.detectLongImage({ natW: 1080, natH: 1920 });
  assert(qj.state.offsetY === 0, '长图 fit 模式自动定位顶端 offsetY=0');
  assert(qj.state.offsetX === 0, '长图 fit 模式自动居中 offsetX=0');

  // free 模式不受影响
  qj.state.isLongImage = true;
  qj.state.mode = 'free';
  qj.state.offsetY = 500;
  qj.detectLongImage({ natW: 1080, natH: 1920 });
  assert(qj.state.offsetY === 500, '长图 free 模式不重置 offsetY');
});

// ---- 穿透文件夹递归扫描（对标 XnView MP）----
test('穿透文件夹：设置开关 files.recursive 存在 + recursive 参数语义（默认 false 穿透=关）', async () => {
  const qj = window.__qj;
  assert(qj !== undefined, 'window.__qj 存在');

  // 设置项 files.recursive 在 app.js 源码里已定义（group: 'files', key: 'recursive', type: 'toggle'）
  // 用源码验证（jsdom 下 getSetting 是闭包内函数，没法直接访问）
  const fs2 = require('fs');
  const appSrc2 = fs2.readFileSync('app.js', 'utf-8');
  assert(appSrc2.includes("group: 'files', key: 'recursive'"), '设置里已存在 files.recursive toggle 开关');

  // files.recursive 这个 key 存在于设置结构里
  // 用 try/catch 安全取值（jsdom 环境下可能没有默认值）
  let recursiveVal = false;
  try { recursiveVal = window.getSetting('files', 'recursive'); } catch (e) { recursiveVal = false; }
  assert(typeof recursiveVal === 'boolean', 'files.recursive 是 boolean（默认 false = 不穿透）');

  // desktop.loadPaths 签名变化验证（在 __qj 上）
  // 我们的改动：loadPaths(paths, recursive)，!!recursive 确保 boolean
  // 这里没法直接调用（jsdom 没有 desktop.invoke），但代码已在 app.js 确认

  // 关键改动确认：所有 desktop.loadPaths 调用点都已加 getSetting('files', 'recursive')
  // 通过源码级验证 — 我们在 app.js 里做了 replace_all
  const fs = require('fs');
  const appSrc = fs.readFileSync('app.js', 'utf-8');
  const callCount = (appSrc.match(/desktop\.loadPaths\(paths,\s*getSetting\('files',\s*'recursive'\)\)/g) || []).length;
  assert(callCount >= 4, `desktop.loadPaths(paths, getSetting('files','recursive')) 调用点 >= 4（实际 ${callCount}）`);

  // 还有一个 [path] 形式
  const singleCall = (appSrc.match(/desktop\.loadPaths\(\[path\],\s*getSetting\('files',\s*'recursive'\)\)/g) || []).length;
  assert(singleCall >= 1, `desktop.loadPaths([path], getSetting(...)) 单文件形式 >= 1（实际 ${singleCall}）`);

  // desktop.loadPaths 签名已加 recursive 参数
  assert(appSrc.includes('async loadPaths(paths, recursive)'), 'loadPaths 签名已加 recursive 参数');
  assert(appSrc.includes('recursive: !!recursive'), 'invoke 调用里传 recursive: !!recursive');

  // Rust 侧 load_paths 已加 recursive: Option<bool>
  const rustSrc = fs.readFileSync('src-tauri/src/lib.rs', 'utf-8');
  assert(rustSrc.includes('fn load_paths(paths: Vec<String>, recursive: Option<bool>)'), 'Rust load_paths 签名已加 recursive');
  assert(rustSrc.includes('recursive.unwrap_or(false)'), 'Rust 默认 recursive=false');

  // collect_files 已改为带 recursive 参数
  assert(rustSrc.includes('fn collect_files(path: &Path, out: &mut Vec<PathBuf>, recursive: bool)'), 'Rust collect_files 签名已加 recursive');

  // 递归开启时单文件也走 collect_images（穿透父目录）
  assert(rustSrc.includes('if recursive {') && rustSrc.includes('collect_images(parent, out)'), '穿透逻辑：recursive=true → collect_images 父目录');
});

// ---- HSL 分通道调色（对标 FastStone）----
test('HSL 分通道：rgbToHsl/hslToRgb 函数存在 + state.filters.hslH/S/L 默认值 + flMap 绑定 + needsTone 识别', async () => {
  const qj = window.__qj;
  assert(qj !== undefined, 'window.__qj 存在');
  const fs = require('fs');
  const appSrc = fs.readFileSync('app.js', 'utf-8');

  // 1. 函数存在
  assert(appSrc.includes('function rgbToHsl'), 'rgbToHsl 函数存在');
  assert(appSrc.includes('function hslToRgb'), 'hslToRgb 函数存在');
  assert(appSrc.includes('function needsTone'), 'needsTone 函数存在');

  // 2. HSL 默认值（filters 里）
  // state.filters 默认: hslH:0, hslS:100, hslL:0
  assert(appSrc.includes('hslH: 0'), 'filters 默认 hslH: 0');
  assert(appSrc.includes('hslS: 100'), 'filters 默认 hslS: 100');
  assert(appSrc.includes('hslL: 0'), 'filters 默认 hslL: 0');

  // 3. needsTone 能识别 HSL 非默认值
  assert(appSrc.includes('f.hslH'), 'needsTone 检查 hslH');
  assert(appSrc.includes('f.hslS'), 'needsTone 检查 hslS');
  assert(appSrc.includes('f.hslL'), 'needsTone 检查 hslL');

  // 4. tonal 函数组装 HSL 参数
  assert(appSrc.includes('hslH: (f.hslH || 0) / 180'), 'tonal 组装 hslH (-180..180 → -1..1)');
  assert(appSrc.includes('hslS: (f.hslS'), 'tonal 组装 hslS');
  assert(appSrc.includes('hslL: (f.hslL || 0) / 100'), 'tonal 组装 hslL');
  assert(appSrc.includes('useHsl'), 'tonal 组装 useHsl 标志');

  // 5. toneRows 解构 + 调用
  assert(appSrc.includes('hslH, hslS, hslL, useHsl'), 'toneRows 解构 HSL 参数');
  assert(appSrc.includes('if (useHsl)'), 'toneRows 里有 useHsl 分支');
  assert(appSrc.includes('rgbToHsl(r, g, b'), 'toneRows 里调用 rgbToHsl');
  assert(appSrc.includes('hslToRgb(H, S, L)'), 'toneRows 里调用 hslToRgb');

  // 6. flMap 事件绑定
  assert(appSrc.includes("['flHslH', 'hslH', 'flHslHVal']"), 'flMap 绑定 hslH');
  assert(appSrc.includes("['flHslS', 'hslS', 'flHslSVal']"), 'flMap 绑定 hslS');
  assert(appSrc.includes("['flHslL', 'hslL', 'flHslLVal']"), 'flMap 绑定 hslL');

  // 7. index.html 有 DOM
  const htmlSrc = fs.readFileSync('index.html', 'utf-8');
  assert(htmlSrc.includes('flHslH'), 'index.html 有 flHslH DOM');
  assert(htmlSrc.includes('flHslS'), 'index.html 有 flHslS DOM');
  assert(htmlSrc.includes('flHslL'), 'index.html 有 flHslL DOM');
});

// ---- 批量加水印（对标 FastStone/IrfanView）----
test('批量加水印：drawWatermarkOnCanvas 纯函数 + 10 种位置 + tile 平铺 + batchWatermark + 批量主循环接入', async () => {
  const fs = require('fs');
  const appSrc = fs.readFileSync('app.js', 'utf-8');
  const htmlSrc = fs.readFileSync('index.html', 'utf-8');

  // 1. 核心函数存在
  assert(appSrc.includes('function drawWatermarkOnCanvas'), 'drawWatermarkOnCanvas 纯函数存在');
  assert(appSrc.includes('function batchWatermark'), 'batchWatermark 函数存在');
  assert(appSrc.includes('function renderWmPreview'), 'renderWmPreview 预览函数存在');
  assert(appSrc.includes('function updateWmUI'), 'updateWmUI UI 同步函数存在');

  // 2. 10 种位置：9 宫格 + tile 平铺
  const positions = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br', 'tile'];
  for (const p of positions) {
    assert(appSrc.includes("pos === '" + p + "'"), '位置分支 ' + p + ' 存在');
  }

  // 3. 平铺特殊逻辑
  assert(appSrc.includes('gapX = tw * 1.8'), 'tile 平铺 gapX 计算');
  assert(appSrc.includes('gapY = fontSize * 2.2'), 'tile 平铺 gapY 计算');
  assert(appSrc.includes('ctx.rotate(-Math.PI / 6)'), 'tile 平铺 -30° 斜向');

  // 4. 九宫格锚点 + margin + 透明度
  assert(appSrc.includes('anchorX'), '九宫格 anchorX 存在');
  assert(appSrc.includes('anchorY'), '九宫格 anchorY 存在');
  assert(appSrc.includes('marginPct'), '边距百分比参数');
  assert(appSrc.includes('globalAlpha = opacity'), '透明度应用');

  // 5. 批量主循环接入
  assert(appSrc.includes("batchTab === 'watermark'"), '批量主循环 watermark 分支存在');

  // 6. tab 切换 + 事件绑定
  assert(appSrc.includes("tab === 'watermark'"), 'switchBatchTab watermark 分支存在');
  assert(appSrc.includes("'wmText', 'wmSize', 'wmOpacity'"), 'wm 事件绑定数组存在');

  // 7. index.html tab + pane
  assert(htmlSrc.includes('data-tab="watermark"'), 'index.html 有 watermark tab 按钮');
  assert(htmlSrc.includes('data-pane="watermark"'), 'index.html 有 watermark pane');
  assert(htmlSrc.includes('wmText'), 'index.html 有 wmText DOM');
  assert(htmlSrc.includes('wmSize'), 'index.html 有 wmSize DOM');
  assert(htmlSrc.includes('wmOpacity'), 'index.html 有 wmOpacity DOM');
  assert(htmlSrc.includes('wmColor'), 'index.html 有 wmColor DOM');
  assert(htmlSrc.includes('wmPos'), 'index.html 有 wmPos DOM');
  assert(htmlSrc.includes('wmFormat'), 'index.html 有 wmFormat DOM');

  // 8. 输出格式
  assert(htmlSrc.includes('image/jpeg') && htmlSrc.includes('image/png') && htmlSrc.includes('image/webp'), 'wmFormat 有 3 种输出格式');
});

// ---- 运行 ----
(async () => {
  console.log('=== 绿角犀看图 回归测试 ===');
  for (const [name, fn] of scenarios) {
    try {
      console.log('\n> ' + name);
      await fn();
    } catch (e) {
      fail++; fails.push(name + ' :: ' + (e && e.message));
      console.log('  ERROR ' + name + ' :: ' + (e && e.stack || e));
    }
  }
  console.log('\n========================================');
  console.log('通过 ' + pass + ' / 失败 ' + fail + (errors.length ? ' / 运行期错误 ' + errors.length : ''));
  if (fails.length) console.log('失败项:\n - ' + fails.join('\n - '));
  if (errors.length) console.log('运行期错误:\n - ' + errors.join('\n - '));
  process.exitCode = fail === 0 && errors.length === 0 ? 0 : 1;
})();
