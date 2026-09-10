#!/usr/bin/env node
/*
 * render-presets.cjs —— 把绿角犀看图 26 个风格预设套到同一张图上，生成可对比的多图 + HTML 页。
 *
 * 用途：直观"体验并微调"滤镜预设。算法与 app.js 完全一致（CSS 滤镜数学 + toneRows 高级像素质点）。
 * 纯 Node 实现，自带 PNG 解码/编码，无第三方依赖。
 *
 * 用法：
 *   node scripts/render-presets.cjs                 # 用内置测试图（synthetic）
 *   node scripts/render-presets.cjs path/to/a.png   # 用给定 PNG（支持 RGB/RGBA/灰度 8bit）
 *
 * 输出：预设图到 preset-previews/ 目录，标签对比页到 preset-previews.html。
 *       （若计算结果与 app.js 有出入，以实机（浏览器/桌面）为准——本工具仅用于快速对比调参。）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ===================== 通用工具 ===================== */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
const sRGB8 = (x) => clamp(Math.round(x), 0, 255);

/* ===================== app.js 复刻：可读字面量 ===================== */

// ---- 6/8 位滤镜三原色权重（CSS saturate/grayscale 同用）----
// 复刻自 CSS Filter spec：luminance = 0.2126R + 0.7152G + 0.0722B
function cssGray(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

// ---- CSS filter: brightness / contrast / saturate / grayscale / sepia / hue-rotate / brightness ----
// 均在 sRGB 空间逐通道运算（与浏览器一致，仅近似，见文件头说明）。
function applyCssFinal(c, f) {
  const bv = (f.brightness == null ? 100 : f.brightness) / 100;  // 亮度
  const con = (f.contrast == null ? 100 : f.contrast) / 100;     // 对比
  const sat = (f.saturate == null ? 100 : f.saturate) / 100;     // 饱和
  const gry = (f.gray == null ? 0 : f.gray) / 100;               // 灰度
  // 色温 temp：先转 0..1
  let r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  // brightness
  r *= bv; g *= bv; b *= bv;
  // contrast
  r = (r - 0.5) * con + 0.5; g = (g - 0.5) * con + 0.5; b = (b - 0.5) * con + 0.5;
  // saturate
  if (sat !== 1) { const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat; }
  // grayscale
  if (gry > 0) { const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; r += (lum - r) * gry; g += (lum - g) * gry; b += (lum - b) * gry; }
  // 色温 tempCss(temp)：+暖 sepia+saturate+hue-rotate(-12a)；-冷 hue-rotate(18a)+brightness(1-0.06a)
  const t = f.temp ? f.temp : 0;
  if (t > 0) {
    const a = Math.min(1, Math.abs(t) / 100);
    // sepia(a*0.35)
    const amt = a * 0.35;
    const sr = 0.393 * r + 0.769 * g + 0.189 * b;
    const sg = 0.349 * r + 0.686 * g + 0.168 * b;
    const sb = 0.272 * r + 0.534 * g + 0.131 * b;
    r += (sr - r) * amt; g += (sg - g) * amt; b += (sb - b) * amt;
    // saturate(1+0.4a)
    const sat2 = 1 + a * 0.4;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = lum + (r - lum) * sat2; g = lum + (g - lum) * sat2; b = lum + (b - lum) * sat2;
    // hue-rotate(-12a deg)
    hue([r, g, b], -12 * a, (o) => { r = o[0]; g = o[1]; b = o[2]; });
  } else if (t < 0) {
    const a = Math.min(1, Math.abs(t) / 100);
    // hue-rotate(18a deg)
    hue([r, g, b], 18 * a, (o) => { r = o[0]; g = o[1]; b = o[2]; });
    // brightness(1-0.06a)
    const bb = 1 - 0.06 * a; r *= bb; g *= bb; b *= bb;
  }
  return [sRGB8(r * 255), sRGB8(g * 255), sRGB8(b * 255)];
}
function hue(c, deg, out) {
  const rad = deg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const [r, g, b] = c; // 输入 0..1，返回 0..1
  out([
    clamp((0.213 + cos * 0.787 - sin * 0.213) * r + (0.715 - cos * 0.715 - sin * 0.715) * g + (0.072 - cos * 0.072 + sin * 0.928) * b, 0, 1),
    clamp((0.213 - cos * 0.213 + sin * 0.143) * r + (0.715 + cos * 0.285 + sin * 0.14) * g + (0.072 - cos * 0.072 - sin * 0.283) * b, 0, 1),
    clamp((0.213 - cos * 0.213 - sin * 0.787) * r + (0.715 - cos * 0.715 + sin * 0.715) * g + (0.072 + cos * 0.928 + sin * 0.072) * b, 0, 1),
  ]);
}

// ---- 色调引擎（app.js toneRows 精确复刻）----
function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return null;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function smstep(e0, e1, v) {
  const t = (v - e0) / ((e1 - e0) || 1e-6);
  const s = clamp(t, 0, 1);
  return s * s * (3 - 2 * s);
}
function gnash(x, y) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n & 0x3fffffff) / 0x3fffffff;
}
function applyTone(data, W, H, f) {
  const hl = (f.highlight || 0) / 100, sh = (f.shadow || 0) / 100;
  const fade = (f.fade || 0) / 100, grain = (f.grain || 0) / 100, vig = (f.vignette || 0) / 100;
  const tintAmt = (f.tintAmt || 0) / 100;
  const th = f.tintH ? hexToRgb(f.tintH) : null, ts = f.tintS ? hexToRgb(f.tintS) : null;
  const useHl = (f.highlight || 0) !== 0 || (!!f.tintH && (f.tintAmt || 0) > 0);
  const useSh = (f.shadow || 0) !== 0 || (!!f.tintS && (f.tintAmt || 0) > 0);
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const invMax = 1 / Math.sqrt(cx * cx + cy * cy);
  const gAmp = grain * 30;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let r = data[i], g = data[i + 1], b = data[i + 2];
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const hm = useHl ? smstep(0.42, 1.0, lum) : 0;
      const sm = useSh ? smstep(0.5, 0.0, lum) : 0;
      if (hl > 0) { const t = hl * hm * 0.9; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
      else if (hl < 0) { const t = -hl * hm * 0.55; r *= 1 - t; g *= 1 - t; b *= 1 - t; }
      if (sh > 0) { const t = sh * sm * 0.9; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
      else if (sh < 0) { const t = -sh * sm * 0.55; r *= 1 - t; g *= 1 - t; b *= 1 - t; }
      if (th) { const k = hm * 0.5 * tintAmt; r += (th.r - r) * k; g += (th.g - g) * k; b += (th.b - b) * k; }
      if (ts) { const k = sm * 0.55 * tintAmt; r += (ts.r - r) * k; g += (ts.g - g) * k; b += (ts.b - b) * k; }
      if (fade > 0) { const t = fade * 0.4; r += (230 - r) * t; g += (230 - g) * t; b += (230 - b) * t; }
      if (vig > 0) {
        const dx = (x - cx) * invMax, dy = (y - cy) * invMax;
        const vd = Math.sqrt(dx * dx + dy * dy);
        const vf = 1 - smstep(0.45, 1.1, vd) * vig * 0.6;
        r *= vf; g *= vf; b *= vf;
      }
      if (grain > 0) {
        const n = gAmp * (gnash(x, y) * 2 - 1) * (0.55 + 0.45 * lum);
        r += n; g += n; b += n;
      }
      data[i] = sRGB8(r); data[i + 1] = sRGB8(g); data[i + 2] = sRGB8(b);
    }
  }
}

// ---- 锐化（3×3 卷积，复刻 sharpenCanvas）----
function sharpen(data, W, H, amount) {
  const out = data.slice();
  const a = amount / 100;                    // 0..1，中心增益
  const k = 0.4 * a;                          // 邻域负权重（近似）
  // 3×3 中心 = 1 + 4k，四邻 = -k
  const center = 1 + 4 * k;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      const up = ((y - 1) * W + x) * 4, dn = ((y + 1) * W + x) * 4;
      const lf = (y * W + (x - 1)) * 4, rg = (y * W + (x + 1)) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = data[i + ch] * center - k * (data[up + ch] + data[dn + ch] + data[lf + ch] + data[rg + ch]);
        out[i + ch] = sRGB8(v);
      }
    }
  }
  return out;
}

/* ===================== 预设表（复刻自 app.js STYLE_PRESETS） ===================== */
const STYLE_PRESETS = [
  { id: 'none',    name: '原图',  f: {} },
  { id: 'japanese',name: '日系',  f: { brightness: 106, saturate: 88, contrast: 96, temp: 12 } },
  { id: 'vintage', name: '复古',  f: { saturate: 72, contrast: 104, temp: 45, brightness: 102 } },
  { id: 'bw',      name: '黑白',  f: { gray: 100, contrast: 112 } },
  { id: 'film',    name: '胶片',  f: { contrast: 108, saturate: 84, temp: 18, brightness: 97 } },
  { id: 'lomo',    name: 'LOMO',  f: { contrast: 122, saturate: 118, temp: -14, brightness: 94 } },
  { id: 'fresh',   name: '清新',  f: { brightness: 108, saturate: 104, contrast: 98, temp: -4 } },
  { id: 'cool',    name: '冷调',  f: { temp: -55, saturate: 95, contrast: 104 } },
  { id: 'warm',    name: '暖阳',  f: { temp: 38, brightness: 104, saturate: 104 } },
  { id: 'hk',      name: '港风',  f: { contrast: 114, saturate: 78, temp: 28, brightness: 98 } },
  { id: 'mono2',   name: '高对比黑白', f: { gray: 100, contrast: 126, brightness: 103 } },
  { id: 'xuqing',    name: '玄青·ME8',   f: { brightness: 88, contrast: 110, highlight: 18, shadow: 10, saturate: 104, temp: -16, sharp: 45, grain: 10, tintAmt: 80, tintS: '#1f3540', tintH: '#c8d8dc' } },
  { id: 'magazine',  name: '杂志人像·MN7', f: { brightness: 92, contrast: 116, highlight: 12, shadow: 12, saturate: 86, temp: 16, grain: 18, tintAmt: 55, tintS: '#a8863f', tintH: '#3d5a7a' } },
  { id: 'retro-mz5', name: '复古暗调·MZ5', f: { brightness: 88, contrast: 122, highlight: -25, shadow: -10, fade: 20, saturate: 86, temp: 10, grain: 15, sharp: 14, tintAmt: 60, tintH: '#c98d4f' } },
  { id: 'bwtone',    name: '黑白质感·V2', f: { gray: 100, contrast: 150, highlight: -50, shadow: -50, grain: 30 } },
  { id: 'brownteal', name: '暗调棕青·TC8', f: { brightness: 82, contrast: 104, highlight: 22, shadow: -12, saturate: 104, temp: 6, grain: 12, sharp: 14, tintAmt: 55, tintS: '#4a3d22' } },
  { id: 'streetvn2', name: '暗调扫街·VN2', f: { brightness: 92, contrast: 130, highlight: 45, temp: -10, grain: 35, sharp: 40 } },
  { id: 'despvn4',   name: '丧系扫街·VN4', f: { brightness: 92, contrast: 116, highlight: 18, saturate: 94, temp: -6, grain: 16, sharp: 45 } },
  { id: 'lowsatvn1', name: '低饱和·VN1',  f: { brightness: 88, contrast: 125, highlight: 32, shadow: -12, saturate: 66, temp: -20, grain: 10 } },
  { id: 'nightcn2',  name: '夜景质感·CN2', f: { brightness: 100, highlight: -10, saturate: 104, temp: -8, sharp: 28, vignette: 28 } },
  { id: 'autumnvm5', name: '秋日电影·VM5', f: { brightness: 84, contrast: 128, highlight: -35, shadow: 26, fade: 16, saturate: 70, temp: 20, grain: 28, tintAmt: 50, tintS: '#3f5d4a', tintH: '#6a5a8a' } },
  { id: 'kingdom',   name: '月升王国·VM10', f: { brightness: 96, contrast: 125, highlight: -15, shadow: 30, saturate: 70, temp: 12, grain: 35, tintAmt: 50, tintS: '#b06a35', tintH: '#d8b45a' } },
  { id: 'orangenblu',name: '蓝橙胶卷·TC5', f: { brightness: 88, contrast: 125, highlight: -25, shadow: 26, saturate: 96, temp: 14, grain: 18, tintAmt: 55, tintH: '#c8a05a' } },
  { id: 'picnic',    name: '清新野餐',    f: { brightness: 104, contrast: 104, highlight: 12, shadow: 10, saturate: 108 } },
  { id: 'ambient',   name: '氛围胶片·TC5', f: { brightness: 96, contrast: 90, saturate: 110, temp: -6, grain: 8 } },
];
/* 注意：此表必须与 app.js 的 STYLE_PRESETS 保持同步。改一处须同步另一处 + check-engine 校验。 */

/* ===================== 渲染一帧（复刻 exportCanvasOfCurrent 的顺序：bake CSS → sharpen → tone） ===================== */
function renderPreset(rgba, W, H, preset) {
  const f = Object.assign({}, DEFAULT_F, preset.f);
  // 注意：必须用 Buffer.from(rgba) 做真拷贝；rgba.slice() 是共享内存的视图，会把结果写穿回源缓冲
  const data = Buffer.from(rgba);
  for (let i = 0; i < W * H; i++) {
    const o = i * 4;
    const c = applyCssFinal([data[o], data[o + 1], data[o + 2]], f);
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2];
  }
  if ((f.sharp || 0) > 0) { const s = sharpen(data, W, H, f.sharp); data.set(s); }
  applyTone(data, W, H, f);
  return data;
}
const DEFAULT_F = { brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0 };

/* ===================== PNG 解码 ===================== */
const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504E47) throw new Error('不是 PNG 文件');
  let pos = 8, width, height, bitDepth, colorType;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data.readUInt8(8); colorType = data.readUInt8(9);
      if (bitDepth !== 8) throw new Error('仅支持 8bit PNG（当前 ' + bitDepth + 'bit）');
      if (colorType !== 0 && colorType !== 2 && colorType !== 4 && colorType !== 6) throw new Error('不支持的颜色类型 colorType=' + colorType);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];          // 每像素通道数
  const stride = width * ch;
  const out = Buffer.alloc(width * height * 4);
  let p = 0, prev = Buffer.alloc(stride);                      // prev 存上一行 RGBA(bpp 对应) 紧凑值
  function paeth(a, b, c) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); return pa <= pb && pa <= pc ? a : (pb <= pc ? b : c); }
  // prev 用每像素 ch 个字节紧凑表示，便于按通道 unfilter
  for (let y = 0; y < height; y++) {
    const ft = raw[p++];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const v = raw[p + x];
      const a = x >= ch ? row[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let r;
      if (ft === 0) r = v;
      else if (ft === 1) r = v + a;
      else if (ft === 2) r = v + b;
      else if (ft === 3) r = v + Math.floor((a + b) / 2);
      else if (ft === 4) r = v + paeth(a, b, c);
      else throw new Error('未知滤波 ' + ft);
      row[x] = r & 0xFF;
    }
    p += stride;
    // 转为 RGBA 输出行
    const dst = y * width * 4;
    for (let x = 0; x < width; x++) {
      let ri, gi, bi, ai;
      if (colorType === 6) { ri = row[x*4]; gi = row[x*4+1]; bi = row[x*4+2]; ai = row[x*4+3]; }
      else if (colorType === 2) { ri = row[x*3]; gi = row[x*3+1]; bi = row[x*3+2]; ai = 255; }
      else if (colorType === 4) { ri = row[x*2]; gi = row[x*2]; bi = row[x*2]; ai = row[x*2+1]; }
      else { ri = row[x]; gi = row[x]; bi = row[x]; ai = 255; }
      out[dst + x*4] = ri; out[dst + x*4+1] = gi; out[dst + x*4+2] = bi; out[dst + x*4+3] = ai;
    }
    prev = row;
  }
  return { width, height, data: out };
}
function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type, 'ascii'); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; rgba.copy ? rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride) : Buffer.from(rgba).copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ===================== 降采样（把大图缩到目标宽度，双线性近似） ===================== */
function downscale(rgba, W, H, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  const sx = W / tw, sy = H / th;
  for (let y = 0; y < th; y++) {
    const syi = y * sy, y0 = Math.floor(syi), yf = syi - y0;
    for (let x = 0; x < tw; x++) {
      const sxi = x * sx, x0 = Math.floor(sxi), xf = sxi - x0;
      function px(xx, yy) { xx = Math.min(W - 1, Math.max(0, xx)); yy = Math.min(H - 1, Math.max(0, yy)); const i = (yy * W + xx) * 4; return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]; }
      const a = px(x0, y0), b = px(x0 + 1, y0), c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
      const o = (y * tw + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const top = a[ch] + (b[ch] - a[ch]) * xf, bot = c[ch] + (d[ch] - c[ch]) * xf;
        out[o + ch] = Math.round(top + (bot - top) * yf);
      }
    }
  }
  return out;
}

/* ===================== 内置测试图（覆盖肤色/天空蓝/草木绿/暖红/中性灰阶 与高光阴影） ===================== */
function makeTestImage(W, H) {
  const t = Buffer.alloc(W * H * 4);
  function set(x, y, r, g, b) { const i = (y * W + x) * 4; t[i] = r; t[i + 1] = g; t[i + 2] = b; t[i + 3] = 255; }
  // 天空渐变（左上）
  for (let y = 0; y < H / 2; y++) { for (let x = 0; x < W; x++) { const c = y / (H / 2); set(x, y, Math.round(120 + 120 * c), Math.round(170 + 70 * c), Math.round(225 - 60 * c)); } }
  // 下方草地
  for (let y = H / 2; y < H; y++) { for (let x = 0; x < W; x++) { const nx = x / W; set(x, y, Math.round(35 + 80 * nx), Math.round(130 + 60 * (1 - nx)), Math.round(45 + 40 * nx)); } }
  // 中央圆盘：中性灰阶（测灰平衡）+ 肤色 + 纯色块
  const cx = W * 0.62, cy = H * 0.45, R = Math.min(W, H) * 0.28;
  for (let y = Math.max(0, Math.round(cy - R)); y < Math.min(H, Math.round(cy + R)); y++) {
    for (let x = Math.max(0, Math.round(cx - R)); x < Math.min(W, Math.round(cx + R)); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > R * R) continue;
      set(x, y, 128, 128, 128); // 基底中性灰
    }
  }
  // 灰阶条（中间灰盘横幅，逐列 12..243，测亮度/对比后中性是否漂移）
  const sw = W * 0.4, sh = H * 0.08, bw = Math.max(1, Math.round(sw / 8));
  for (let g = 0; g < 8; g++) { const v = Math.round(12 + g * 33); for (let y = Math.round(H*0.16); y < Math.round(H*0.24); y++) for (let x = Math.round(cx - sw/2 + g*bw); x < Math.round(cx - sw/2 + (g+1)*bw); x++) set(x, y, v, v, v); }
  // 肤色竖条
  for (let y = Math.round(H*0.58); y < Math.round(H*0.78); y++) for (let x = Math.round(W*0.10); x < Math.round(W*0.22); x++) set(x, y, 224, 168, 138);
  // 暖橙 (测暖色曲线)
  for (let y = Math.round(H*0.7); y < Math.round(H*0.82); y++) for (let x = Math.round(W*0.75); x < Math.round(W*0.95); x++) set(x, y, 214, 120, 40);
  // 冷蓝（测冷色）
  for (let y = Math.round(H*0.6); y < Math.round(H*0.7); y++) for (let x = Math.round(W*0.82); x < Math.round(W*0.95); x++) set(x, y, 60, 130, 200);
  // 深阴影块 / 高光白（测掩码）
  for (let y = Math.round(H*0.9); y < Math.round(H*0.97); y++) for (let x = Math.round(W*0.06); x < Math.round(W*0.2); x++) set(x, y, 22, 22, 22);
  for (let y = Math.round(H*0.9); y < Math.round(H*0.97); y++) for (let x = Math.round(W*0.3); x < Math.round(W*0.44); x++) set(x, y, 244, 244, 244);
  return t;
}

/* ===================== 主流程 ===================== */
function main() {
  const root = path.resolve(__dirname, '..');
  const outDir = path.join(root, 'preset-previews');
  fs.mkdirSync(outDir, { recursive: true });
  if (process.argv.includes('--verify')) {
    // 回读校验：确认 PNG 可解码往返，并打印各预设全图均值（便于快速核对算法方向）
    let src;
    const img = decodePNG(fs.readFileSync(fs.readdirSync(outDir).map((n) => path.join(outDir, n)).find((p) => p.endsWith('-none.png'))));
    const enc = encodePNG(img.width, img.height, img.data);
    if (decodePNG(enc).data.equals(img.data)) console.log('PNG 编解码往返一致 ✓');
    for (const p of STYLE_PRESETS) {
      const f = fs.readdirSync(outDir).find((n) => n.endsWith('-' + p.id + '.png'));
      if (!f) continue;
      const d = decodePNG(fs.readFileSync(path.join(outDir, f))).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      console.log((p.name + '              ').slice(0, 14), 'R' + Math.round(r / n), 'G' + Math.round(g / n), 'B' + Math.round(b / n));
    }
    return;
  }
  const input = process.argv[2];
  let src, sw, sh;
  if (input && fs.existsSync(input)) {
    const img = decodePNG(fs.readFileSync(input));
    const maxW = 520;
    src = img.data; sw = img.width; sh = img.height;
    if (sw > maxW) { const th = Math.max(1, Math.round(sh * maxW / sw)); src = downscale(src, sw, sh, maxW, th); sw = maxW; sh = th; }
    console.log('输入图：' + input + ' (' + img.width + 'x' + img.height + ' → ' + sw + 'x' + sh + ')');
  } else {
    sw = 460; sh = 420; src = makeTestImage(sw, sh);
    console.log('未提供 PNG，使用内置测试图（' + sw + 'x' + sh + '）');
  }
  const cells = [];
  const gap = 0, pad = 0;
  for (let i = 0; i < STYLE_PRESETS.length; i++) {
    const p = STYLE_PRESETS[i];
    const n = String(i + 1).padStart(2, '0');
    const out = renderPreset(src, sw, sh, p);
    const file = n + '-' + p.id + '.png';
    fs.writeFileSync(path.join(outDir, file), encodePNG(sw, sh, out));
    cells.push({ n, id: p.id, name: p.name, file });
    console.log('渲染 ' + p.name + ' → preset-previews/' + file);
  }
  // 生成对比 HTML
  let rows = '';
  cells.forEach((c) => { rows += '<figure><img src="preset-previews/' + c.file + '" alt="' + c.name + '"><figcaption>' + c.n + ' ' + c.name + '</figcaption></figure>'; });
  const html = '<!doctype html><meta charset="utf-8">' +
    '<title>绿角犀看图 · 26 预设对比</title>' +
    '<style>body{margin:0;padding:24px;background:#F5F4F7;font-family:system-ui,sans-serif;color:#1C1C1C;}' +
    'h1{color:#2C9678;font-size:18px;margin:0 0 18px;} .grid{display:flex;flex-wrap:wrap;gap:4px;max-width:1500px;}' +
    'figure{margin:0;background:#fff;border:1px solid #373834;padding:6px;text-align:center;box-sizing:border-box;}' +
    'img{display:block;max-width:460px;width:100%;height:auto;} figcaption{font-size:12px;color:#373834;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}</style>' +
    '<h1>绿角犀看图 · ' + STYLE_PRESETS.length + ' 个风格预设对比' + (input ? '（输入图：' + path.basename(input) + '）' : '（内置测试图）') + '</h1>' +
    '<div class="grid">' + rows + '</div>';
  fs.writeFileSync(path.join(root, 'preset-previews.html'), html);
  console.log('\n完成。打开 preset-previews.html 查看对比；预设图在 preset-previews/ 目录。');
}
if (require.main === module) main();
module.exports = { STYLE_PRESETS, renderPreset, applyCssFinal, applyTone, sharpen, makeTestImage, decodePNG, encodePNG, downscale, DEFAULT_F };