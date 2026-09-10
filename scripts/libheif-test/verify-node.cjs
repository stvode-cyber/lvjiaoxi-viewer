// 临时：验证 libheif-js 能否解码真实 HEIC 样例并提取像素（用自包含 bundle）
process.env.LVJX_HEIC2 = process.env.LVJX_HEIC || (process.env.TEMP + '\\lvjx-sample.heic');
const fs = require('fs');
const path = require('path');
const libheif = require(path.join(process.env.TEMP, 'lhjs', 'package', 'libheif-wasm', 'libheif-bundle.js'));
(async () => {
  const m = await libheif();
  const buf = fs.readFileSync(process.env.LVJX_HEIC2);
  const dec = new m.HeifDecoder();
  const imgs = await dec.decode(buf);
  console.log('images=' + imgs.length);
  if (imgs[0]) {
    const im = imgs[0];
    const w = im.get_width(), h = im.get_height();
    console.log('w=' + w + ' h=' + h);
    // 正确 API：heif_js_decode_image2(handle, colorspace_RGB, interleaved_RGBA)
    const out = await m.heif_js_decode_image2(
      im.handle,
      m.heif_colorspace.heif_colorspace_RGB,
      m.heif_chroma.heif_chroma_interleaved_RGBA
    );
    if (!out || out.code) { console.log('decode2 code=', out && out.code); }
    console.log('channels=' + (out.channels ? out.channels.length : 'none'));
    let firstNonzero = null;
    let total = 0;
    for (const ch of (out.channels || [])) {
      const d = ch.data;
      if (!d) continue;
      for (let i = 0; i < d.length && i < 64; i++) { if (d[i] !== 0) { firstNonzero = i; break; } }
      total += d.length;
    }
    console.log('firstNonzeroByteIdx=' + firstNonzero + ' totalDataBytes=' + total + ' expect=' + (w * h * 4));
    if (firstNonzero !== null) console.log('PIXEL_OK');
    else console.log('PIXEL_BLANK');
    if (out.image) m.heif_image_release(out.image);
  }
})().catch((e) => { console.error('ERR', (e && e.stack) || String(e)); process.exit(1); });