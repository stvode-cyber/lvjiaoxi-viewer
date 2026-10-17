// js/edit.js — 美图管线 + AI + 抠图 + 修图
// 依赖：state/els/settings/desktop/editUndo/editRedo（window.__API__ 注入）
(function() {
  'use strict';
  window.__API__ = window.__API__ || {};
  const __API = window.__API__;

  // ---- 编辑撤销 / 重做：对可编辑参数态（滤镜/文字/马赛克/裁剪/高级队列）快照，恢复后重渲预览 ----
  const UNDO_MAX = 40;
  let editUndo = [], editRedo = [];
  __API.editUndo = editUndo; __API.editRedo = editRedo;

  // ============ 自定义参数预设（localStorage 持久化） ============
  const MY_STYLE_KEY = 'lvjx_my_styles';
  const MY_STYLE_MAX = 10;

  // ===== 高级处理队列（OpenCV / AI，导出时依序应用）=====
  const CV_DEFAULT_URL = 'https://docs.opencv.org/4.10.0/opencv.js';
  const ORT_DIR = './assets/ort';                 // 本地内置 onnxruntime-web（离线可用）
  const ORT_CDN_URL = ORT_DIR + '/ort.min.js';
  const ORT_WASM = 'ort-wasm-simd-threaded.wasm';
  let cvLoading = null, ortLoading = null, aiSession = null, aiSessionUrl = null;

  // AI 超分辨率（onnxruntime-web；模型约定输入 1×3×H×W float32 0-1，输出同布局放大图）
  // 内置轻量离线超分模型（sub_pixel_cnn_2016，单通道 Y，3×，瓦片推理；~0.24MB 随包内嵌）
  const DEFAULT_AI_MODEL = './assets/sub_pixel_cnn.onnx';
  const SR_IN = 224, SR_OUT = 672, SR_SCALE = 3, SR_PAD = 12; // 瓦片 224→672，步长 212 带重叠防接缝

  // ===== 美工（美图秀秀式）：风格预设 / 美颜 / 边框 / 文字 / 马赛克 =====
  // 风格预设：CSS filter 组合，与手动滑杆同一管线（非破坏、可微调、可叠加滤镜链）
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
    // ---- 以下按美图秀秀公开配方（show.meitu.com 用户调色参数）映射 ----
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
    // ---- 2026-10-17 新增：insar 流行风 + 韩系 + 暗黑 ----
    { id: 'softteal',  name: '温柔青·insar', f: { brightness: 98, contrast: 108, highlight: 18, shadow: -12, saturate: 88, temp: -18, grain: 6 } },
    { id: 'summer',    name: '夏日通透',   f: { brightness: 106, contrast: 102, highlight: 28, shadow: 8, saturate: 112, temp: 4 } },
    { id: 'darkfilm',  name: '暗黑胶片',   f: { brightness: 82, contrast: 138, highlight: -35, shadow: -8, saturate: 78, grain: 22, sharp: 18, vignette: 14 } },
    { id: 'matte',     name: '奶油质感',   f: { brightness: 102, contrast: 94, highlight: -8, shadow: 18, fade: 22, saturate: 92, grain: 8, sharp: -10 } },
    { id: 'kpop',      name: '韩系冷白',   f: { brightness: 108, contrast: 104, saturate: 82, temp: -32, highlight: 6, grain: 4, sharp: 12 } },
  ];

  // 一键美颜多档：轻度/自然/精致 — 每档联动「提亮 + 磨皮」参数，单次快照
  const BEAUTY_PRESETS = [
    { id: 'light',   name: '轻度', white: 20, smooth: 0  },
    { id: 'natural', name: '自然', white: 40, smooth: 35 },
    { id: 'fancy',   name: '精致', white: 55, smooth: 65 },
  ];

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function tempCss(t) {
    const a = Math.min(1, Math.abs(t) / 100);
    if (t > 0) return ' sepia(' + (a * 0.35).toFixed(3) + ') saturate(' + (1 + a * 0.4).toFixed(3) + ') hue-rotate(-' + (a * 12).toFixed(1) + 'deg)';
    if (t < 0) return ' hue-rotate(' + (a * 18).toFixed(1) + 'deg) brightness(' + Math.round(100 - a * 6) + '%)';
    return '';
  }

  function filterCss() {
    const f = __API.state.filters;
    let s = 'brightness(' + f.brightness + '%) contrast(' + f.contrast + '%) saturate(' + f.saturate + '%) grayscale(' + f.gray + '%)';
    if (f.blur > 0) s += ' blur(' + (+f.blur).toFixed(1) + 'px)';
    s += tempCss(f.temp || 0);
    return s;
  }

  function applyFilters() { if (__API.els.image) __API.els.image.style.filter = filterCss(); renderEditPreview(); }

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }

  function smstep(e0, e1, v) {
    // 支持升序与降序区间（e0>e1 表示越靠近 e1 值越大的曲线），如 smstep(0.5, 0, lum) = 阴影掩码
    const t = (v - e0) / ((e1 - e0) || 1e-6);
    const s = __API.clamp(t, 0, 1);
    return s * s * (3 - 2 * s);
  }

  function needsTone(f) {
    return !!(f && (
      ((f.highlight || 0) !== 0) || ((f.shadow || 0) !== 0) ||
      (f.fade || 0) > 0 || (f.grain || 0) > 0 || (f.vignette || 0) > 0 ||
      ((f.tintAmt || 0) > 0 && (f.tintH || f.tintS)) ||
      // HSL 分通道：色相偏移 != 0 / 饱和度 != 100 / 明度偏移 != 0
      (f.hslH !== undefined && f.hslH !== 0) ||
      (f.hslS !== undefined && f.hslS !== 100) ||
      (f.hslL !== undefined && f.hslL !== 0)
    ));
  }

  function tonal(f, W, H) {
    const cx = (W - 1) / 2, cy = (H - 1) / 2;
    return {
      hl: (f.highlight || 0) / 100, sh: (f.shadow || 0) / 100,
      fade: (f.fade || 0) / 100, grain: (f.grain || 0) / 100, vig: (f.vignette || 0) / 100,
      tintAmt: (f.tintAmt || 0) / 100,
      th: f.tintH ? hexToRgb(f.tintH) : null, ts: f.tintS ? hexToRgb(f.tintS) : null,
      useHl: (f.highlight || 0) !== 0 || (!!f.tintH && (f.tintAmt || 0) > 0),
      useSh: (f.shadow || 0) !== 0 || (!!f.tintS && (f.tintAmt || 0) > 0),
      cx, cy, invMax: 1 / Math.sqrt(cx * cx + cy * cy),
      // HSL 分通道参数
      hslH: (f.hslH || 0) / 180,              // -180..180° → -1..1
      hslS: (f.hslS !== undefined ? f.hslS : 100) / 100, // 0..200% → 0..2
      hslL: (f.hslL || 0) / 100,              // -100..100% → -1..1
      useHsl: (f.hslH || 0) !== 0 || (f.hslS !== undefined && f.hslS !== 100) || (f.hslL || 0) !== 0,
    };
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h, s;
    if (mx === mn) { h = 0; s = 0; }
    else {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      switch (mx) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  function gnash(x, y) {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n & 0x3fffffff) / 0x3fffffff;
  }

  function toneRows(d, W, y0, y1, cfg) {
    const { hl, sh, fade, grain, vig, tintAmt, th, ts, useHl, useSh, cx, cy, invMax, hslH, hslS, hslL, useHsl } = cfg;
    const gAmp = grain * 30;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let r = d[i], g = d[i + 1], b = d[i + 2];
        // ===== HSL 分通道（在 highlight/shadow 之前执行，确保色彩调整先于明暗）=====
        if (useHsl) {
          let H, S, L;
          rgbToHsl(r, g, b, H = 0, S = 0, L = 0);
          // 色相偏移：-1..1 映射 -180°..180°，加模 1.0
          H = ((H + hslH) % 1 + 1) % 1;
          // 饱和度缩放：0..2（1.0 是原值）
          S = __API.clamp(S * hslS, 0, 1);
          // 明度偏移：-1..1（+ 提亮 / - 压暗），叠加到 L
          L = __API.clamp(L + hslL * 0.5, 0, 1);  // 0.5 系数避免一次调到底
          const rgb = hslToRgb(H, S, L);
          r = rgb[0]; g = rgb[1]; b = rgb[2];
        }
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const hm = useHl ? smstep(0.42, 1.0, lum) : 0;   // 高光掩码（含中亮部，越亮越强）
        const sm = useSh ? smstep(0.5, 0.0, lum) : 0;     // 阴影掩码（越暗越强）
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
        d[i] = __API.clamp(r, 0, 255); d[i + 1] = __API.clamp(g, 0, 255); d[i + 2] = __API.clamp(b, 0, 255);
      }
    }
  }

  function applyTone(ctx, W, H, f) {   // 预览：小画布同步处理
    if (!needsTone(f) || !ctx || !ctx.getImageData || !ctx.putImageData) return;
    let img;
    try { img = ctx.getImageData(0, 0, W, H); } catch (e) { return; }
    toneRows(img.data, W, 0, H, tonal(f, W, H));
    ctx.putImageData(img, 0, 0);
  }

  async function applyToneChunked(canvas, f) {  // 导出：全尺寸分块异步处理，避免卡 UI
    if (!needsTone(f)) return canvas;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || !ctx.getImageData || !ctx.putImageData) return canvas;
    let img;
    try { img = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) { return canvas; }
    const cfg = tonal(f, canvas.width, canvas.height);
    const CHUNK = 96;
    for (let y0 = 0; y0 < canvas.height; y0 += CHUNK) {
      toneRows(img.data, canvas.width, y0, Math.min(canvas.height, y0 + CHUNK), cfg);
      if (y0 + CHUNK < canvas.height) await new Promise((r) => setTimeout(r, 0));
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function editSnap() {
    return JSON.stringify({
      f: __API.state.filters, t: __API.state.texts || [], m: __API.state.mosaic || [], e: __API.state.eraser || [], c: __API.state.crop || null,
      o: __API.state.ops || [], s: __API.state.slim || null, df: __API.state.deform || [],
      mm: __API.state.mosaicMode || false, em: __API.state.eraserMode || false, sm: __API.state.slimMode || false, dm: __API.state.deformMode || null,
    });
  }

  function restoreEdit(snap) {
    const s = JSON.parse(snap);
    __API.state.filters = s.f; __API.state.texts = s.t; __API.state.mosaic = s.m; __API.state.eraser = s.e || []; __API.state.crop = s.c; __API.state.ops = s.o;
    if (s.s) __API.state.slim = s.s; if (s.df) __API.state.deform = s.df;
    __API.state.mosaicMode = !!s.mm; __API.state.eraserMode = !!s.em; __API.state.slimMode = !!s.sm; __API.state.deformMode = s.dm || null;
    __API.syncFilterUI(); applyFilters();
    if (__API.state.textSel && !__API.state.texts.some((x) => x.id === __API.state.textSel)) __API.state.textSel = null;
    if (document.getElementById('txtStyle')) { /* txt 属性输入区由用户重新选中加载 */ }
    updateOpsUI(); updateSlimUI(); updateDeformUI(); renderEditPreview();
  }

  function updateEditUndoButtons() {
    if (__API.els.btnUndo) __API.els.btnUndo.disabled = __API.editUndo.length === 0;
    if (__API.els.btnRedo) __API.els.btnRedo.disabled = __API.editRedo.length === 0;
  }

  function pushUndo() {
    __API.editUndo.push(editSnap()); if (__API.editUndo.length > UNDO_MAX) __API.editUndo.shift();
    __API.editRedo.length = 0; updateEditUndoButtons(); if (__API.els.editTimeline) renderEditTimeline();
  }

  function undoEdit() {
    if (!__API.editUndo.length) { __API.toast('没有可撤销的编辑'); return; }
    __API.editRedo.push(editSnap()); const prev = __API.editUndo.pop();
    restoreEdit(prev); updateEditUndoButtons(); __API.toast('已撤销'); if (__API.els.editTimeline) renderEditTimeline();
  }

  function redoEdit() {
    if (!__API.editRedo.length) { __API.toast('没有可重做的编辑'); return; }
    __API.editUndo.push(editSnap()); const next = __API.editRedo.pop();
    restoreEdit(next); updateEditUndoButtons(); __API.toast('已重做'); if (__API.els.editTimeline) renderEditTimeline();
  }

  function clearEditHistory() { __API.editUndo = []; __API.editRedo = []; updateEditUndoButtons(); if (__API.els.editTimeline) renderEditTimeline(); }

  function loadMyStyles() {
    try { return JSON.parse(localStorage.getItem(MY_STYLE_KEY) || '[]'); } catch { return []; }
  }

  function saveMyStylesList(list) {
    localStorage.setItem(MY_STYLE_KEY, JSON.stringify(list.slice(0, MY_STYLE_MAX)));
  }

  function summarizeSnap(snap, idx, isCurrent) {
    const s = JSON.parse(snap);
    const f = s.f || {};
    const parts = [];
    if (f.brightness !== undefined && f.brightness !== 100) parts.push(f.brightness > 100 ? '亮' + (f.brightness - 100) : '暗' + (100 - f.brightness));
    if (f.contrast !== undefined && f.contrast !== 100) parts.push(f.contrast > 100 ? '对比+' : '对比-');
    if (f.saturate !== undefined && f.saturate !== 100) parts.push(f.saturate > 100 ? '饱和+' : '饱和-');
    if (f.gray === 100) parts.push('黑白');
    if (f.temp !== undefined && f.temp !== 0) parts.push(f.temp > 0 ? '暖' + f.temp : '冷' + (-f.temp));
    if (f.sharp > 0) parts.push('锐化');
    if (f.grain > 0) parts.push('颗粒');
    if (f.vignette > 0) parts.push('暗角');
    if (s.o && s.o.length) parts.push('磨皮×' + s.o.length);
    if (s.s && s.s.enabled) parts.push(s.s.mode === 'face' ? '瘦脸' : '瘦身');
    if (parts.length === 0) parts.push('原图');
    return (idx + ': ' + parts.join(' ')).slice(0, 20);
  }

  function renderMyStyles() {
    if (!__API.els.myStyleGrid) return;
    __API.els.myStyleGrid.innerHTML = '';
    const list = loadMyStyles();
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '还没有保存的风格。调好参数后点「保存当前」即可。';
      __API.els.myStyleGrid.appendChild(empty);
      return;
    }
    list.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'btn style-cell del-btn'; b.type = 'button';
      b.textContent = s.name; b.dataset.myStyle = String(i);
      b.title = '应用「' + s.name + '」';
      b.addEventListener('click', () => { applyMyStyle(i); });
      const del = document.createElement('span');
      del.className = 'del-x'; del.textContent = '✕'; del.title = '删除';
      del.addEventListener('click', (e) => { e.stopPropagation(); deleteMyStyle(i); });
      b.appendChild(del);
      __API.els.myStyleGrid.appendChild(b);
    });
  }

  function saveCurrentStyle() {
    const list = loadMyStyles();
    const def = { brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0, hslH: 0, hslS: 100, hslL: 0 };
    const snap = editSnap();
    const s = JSON.parse(snap);
    // 简单命名：如果是黑白 / 暖色调等有特征的，自动命名；否则用时间戳
    const f = s.f || {};
    let autoName = '';
    if (f.gray === 100) autoName = '黑白质感';
    else if ((f.temp || 0) > 30) autoName = '暖阳暖调';
    else if ((f.temp || 0) < -30) autoName = '冷色氛围';
    else if ((f.brightness || 100) > 115) autoName = '明亮清新';
    else if ((f.brightness || 100) < 85) autoName = '暗调电影';
    else autoName = '我的风格';
    let name = autoName;
    let n = 1;
    while (list.some((x) => x.name === name)) { name = autoName + ' ' + (++n); }
    list.unshift({ name, snap });
    saveMyStylesList(list);
    renderMyStyles();
    __API.toast('已保存「' + name + '」到我的风格');
  }

  function applyMyStyle(i) {
    const list = loadMyStyles();
    if (!list[i]) return;
    pushUndo();
    restoreEdit(list[i].snap);
    __API.toast('已应用「' + list[i].name + '」');
  }

  function deleteMyStyle(i) {
    const list = loadMyStyles();
    if (!list[i]) return;
    const name = list[i].name;
    list.splice(i, 1);
    saveMyStylesList(list);
    renderMyStyles();
    __API.toast('已删除「' + name + '」');
  }

  function clearAllMyStyles() {
    const list = loadMyStyles();
    if (!list.length) { __API.toast('没有可清空的风格'); return; }
    if (!confirm('确定清空全部 ' + list.length + ' 个自定义风格？此操作不可撤销。')) return;
    localStorage.removeItem(MY_STYLE_KEY);
    renderMyStyles();
    __API.toast('已清空全部自定义风格');
  }

  function renderEditTimeline() {
    if (!__API.els.editTimeline) return;
    __API.els.editTimeline.innerHTML = '';
    const total = __API.editUndo.length + 1 + __API.editRedo.length; // undo steps + current + redo steps
    // 显示：[undo倒序] → [current] → [redo正序]
    // 索引 0..__API.editUndo.length-1 = 过去(可 undo 到)
    // 索引 __API.editUndo.length = 当前状态
    // 索引 __API.editUndo.length+1..total-1 = 未来(可 redo 到)
    // 显示时按时间正序：redo(过去) → undo(未来) 的相反
    // 简化：直接展示 undo 正序 + [当前] + redo 正序
    const items = [];
    __API.editUndo.forEach((s, i) => items.push({ snap: s, idx: i, label: '步骤 ' + (i + 1), state: 'past' }));
    items.push({ snap: editSnap(), idx: __API.editUndo.length, label: '当前', state: 'current' });
    __API.editRedo.forEach((s, i) => items.push({ snap: s, idx: __API.editUndo.length + 1 + i, label: '重做 ' + (i + 1), state: 'future' }));
    if (items.length === 1) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '尚无编辑历史。开始调整图片参数后会自动记录每一步。';
      __API.els.editTimeline.appendChild(empty);
      return;
    }
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'eh-step ' + it.state;
      b.type = 'button';
      const label = summarizeSnap(it.snap, it.idx, it.state === 'current');
      const span = document.createElement('span');
      span.className = 'eh-label';
      span.textContent = label;
      b.appendChild(span);
      if (it.state !== 'current') {
        b.addEventListener('click', () => jumpToHistory(it.snap));
      }
      __API.els.editTimeline.appendChild(b);
    });
  }

  function jumpToHistory(targetSnap) {
    // 计算从当前状态到目标的操作步数
    // 简化方法：先回到初始，再依次 pushUndo 直到 target
    // 但这样太慢。更简单：直接 restore + 重建 undo/redo
    const currentSnap = editSnap();
    // 如果 target 在 __API.editUndo 中（过去），撤销直到找到
    // 如果 target 在 __API.editRedo 中（未来），重做直到找到
    // 用 diff 最快路径：找到 target 在 undo 还是 redo
    const undoIdx = __API.editUndo.lastIndexOf(targetSnap);
    const redoIdx = __API.editRedo.indexOf(targetSnap);
    if (undoIdx >= 0) {
      // 在 undo 里：撤销 (__API.editUndo.length - undoIdx - 1) 次
      const times = __API.editUndo.length - undoIdx - 1;
      for (let i = 0; i < times; i++) { __API.editRedo.push(__API.editUndo.pop()); }
    } else if (redoIdx >= 0) {
      // 在 redo 里：重做 (redoIdx + 1) 次
      const times = redoIdx + 1;
      for (let i = 0; i < times; i++) { __API.editUndo.push(__API.editRedo.shift()); }
    } else {
      // 不在历史里（可能是当前状态的字符串化不同），直接 restore
      // 把当前快照推入 undo
      __API.editUndo.push(currentSnap);
      __API.editRedo.length = 0;
      restoreEdit(targetSnap);
      updateEditUndoButtons();
      renderEditTimeline();
      __API.toast('已跳转到目标步骤');
      return;
    }
    // 最后一次 restore 并更新状态
    restoreEdit(__API.editUndo[__API.editUndo.length - 1] || editSnap());
    updateEditUndoButtons();
    renderEditTimeline();
    __API.toast('已跳转到目标步骤');
  }

  function toggleEditHistory() {
    if (!__API.els.editHistoryPanel) return;
    renderEditTimeline();
    __API.els.editHistoryPanel.hidden = !__API.els.editHistoryPanel.hidden;
  }

  function syncFilterUI() {
    const f = __API.state.filters;
    __API.els.flBrightness.value = f.brightness; __API.els.flBrightnessVal.textContent = f.brightness;
    __API.els.flContrast.value = f.contrast; __API.els.flContrastVal.textContent = f.contrast;
    __API.els.flSaturate.value = f.saturate; __API.els.flSaturateVal.textContent = f.saturate;
    __API.els.flGray.value = f.gray; __API.els.flGrayVal.textContent = f.gray;
    if (__API.els.flTemp) { __API.els.flTemp.value = f.temp; __API.els.flTempVal.textContent = f.temp; }
    if (__API.els.flBlur) { __API.els.flBlur.value = f.blur; __API.els.flBlurVal.textContent = (+f.blur).toFixed(1); }
    if (__API.els.flSharp) { __API.els.flSharp.value = f.sharp; __API.els.flSharpVal.textContent = f.sharp; }
    if (__API.els.flHighlight) { __API.els.flHighlight.value = f.highlight || 0; __API.els.flHighlightVal.textContent = f.highlight || 0; }
    if (__API.els.flShadow) { __API.els.flShadow.value = f.shadow || 0; __API.els.flShadowVal.textContent = f.shadow || 0; }
    if (__API.els.flFade) { __API.els.flFade.value = f.fade || 0; __API.els.flFadeVal.textContent = f.fade || 0; }
    if (__API.els.flGrain) { __API.els.flGrain.value = f.grain || 0; __API.els.flGrainVal.textContent = f.grain || 0; }
    if (__API.els.flVignette) { __API.els.flVignette.value = f.vignette || 0; __API.els.flVignetteVal.textContent = f.vignette || 0; }
    updateOpsUI();
    __API.onExFormatChange();
    __API.syncBeautyBar();
  }
  // 主界面「美图」条：把当前滤镜值反映到常驻滑块/数值（与弹窗侧共用同一 __API.state.filters 源）
  function syncBeautyBar() {
    const f = __API.state.filters;
    const pair = [['miBrightness', 'brightness', 'miBrightnessVal'], ['miContrast', 'contrast', 'miContrastVal'], ['miSaturate', 'saturate', 'miSaturateVal'], ['miTemp', 'temp', 'miTempVal'], ['miSharp', 'sharp', 'miSharpVal']];
    pair.forEach(([id, key, valId]) => {
      if (!els[id]) return;
      els[id].value = f[key];
      if (els[valId]) els[valId].textContent = f[key];
    });
  }
  function onExFormatChange() {
    const fmt = __API.els.exFormat.value;
    __API.els.exQualityField.hidden = (fmt === 'image/png' || fmt === 'image/bmp');
  }

  function resetFilters() {
    __API.state.filters = { brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0, hslH: 0, hslS: 100, hslL: 0 };
    __API.syncFilterUI(); applyFilters();
    __API.toast('滤镜已重置');
  }

  function mimeExt(mime) {
    return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/bmp': '.bmp' })[mime] || '.img';
  }

  function bakeFullCanvas() {
    const item = __API.state.items[__API.state.index];
    if (!item || !item.img) return null;
    const img = item.img;
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const oc = window.__API__.ORIENT_CSS[(item.exif && item.exif.orientation) || 1] || window.__API__.ORIENT_CSS[1];
    let wO = w0, hO = h0;
    if (oc.rot % 180 !== 0) { wO = h0; hO = w0; }
    let w = wO, h = hO;
    if (__API.state.rotation % 180 !== 0) { w = hO; h = wO; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5F4F7'; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(__API.state.rotation * Math.PI / 180);
    if (__API.state.flipH) ctx.scale(-1, 1);
    if (__API.state.flipV) ctx.scale(1, -1);
    ctx.rotate(oc.rot * Math.PI / 180);
    ctx.scale(oc.fx, oc.fy);
    ctx.filter = filterCss();   // 烘焙滤镜
    ctx.drawImage(img, -w0 / 2, -h0 / 2, w0, h0);
    ctx.restore();

    // Logo 水印（单张编辑器上传的 PNG/Logo）
    // 放在 bakeFullCanvas 而非 exportCanvasOfCurrent，确保编辑预览/证件照排版/导出全路径都应用
    if (__API.state.logoWm && __API.state.logoWm.img) {
      __API.drawWatermarkOnCanvas(ctx, w, h, {
        image: __API.state.logoWm.img,
        size: __API.state.logoWm.size,
        opacity: __API.state.logoWm.opacity,
        pos: __API.state.logoWm.pos,
      });
    }

    return canvas;
  }

  async function exportCanvasOfCurrent() {
    let full = bakeFullCanvas();
    if (!full) return null;
    // 瘦身/瘦脸 + 美型变形（大眼/美牙/小脸/丰唇/瘦鼻）合并位移场，一次双线性采样
    if (__API.state.slim.enabled || (__API.state.deform && __API.state.deform.some((d) => (d.strength || 0) > 0))) {
      const df = deformCanvas(full, __API.state.deform, __API.state.slim);
      if (df) full = df;
    }
    // 锐化（3×3 卷积）在烘焙后、裁剪前应用；无像素环境（jsdom）自动跳过
    if (__API.state.filters.sharp > 0) { const s = sharpenCanvas(full, __API.state.filters.sharp); if (s) full = s; }
    // 高级像素质点（高光/暗部/褪色/色调分离/颗粒/暗角）：全分辨率分块异步应用
    full = await applyToneChunked(full, __API.state.filters);
    if (!full || !__API.state.crop) return full;
    const W = full.width, H = full.height;
    const cx = __API.clamp(Math.round(__API.state.crop.x * W), 0, W - 1);
    const cy = __API.clamp(Math.round(__API.state.crop.y * H), 0, H - 1);
    const cw = __API.clamp(Math.round(__API.state.crop.w * W), 1, W - cx);
    const ch = __API.clamp(Math.round(__API.state.crop.h * H), 1, H - cy);
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    const octx = out.getContext('2d');
    octx.fillStyle = '#F5F4F7'; octx.fillRect(0, 0, cw, ch);
    octx.drawImage(full, cx, cy, cw, ch, 0, 0, cw, ch);
    return out;
  }

  function normToPx(crop, W, H) {
    return { x: crop.x * W, y: crop.y * H, w: crop.w * W, h: crop.h * H };
  }

  function sharpenCanvas(canvas, amount) {
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || !ctx.getImageData || !ctx.createImageData || !ctx.putImageData) return null;
    let w, h, src;
    try { w = canvas.width; h = canvas.height; src = ctx.getImageData(0, 0, w, h); } catch (e) { return null; }
    if (!src || !src.data) return null;
    const out = ctx.createImageData(w, h);
    if (!out || !out.data) return null;
    const k = (Math.max(0, Math.min(100, amount)) / 100) * 1.2;
    const a = src.data, b = out.data, row = w * 4;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (y === 0 || y === h - 1 || x === 0 || x === w - 1) {
          b[i] = a[i]; b[i + 1] = a[i + 1]; b[i + 2] = a[i + 2]; b[i + 3] = a[i + 3];
          continue;
        }
        for (let c = 0; c < 3; c++) {
          const center = a[i + c];
          const sum = a[i - row + c] + a[i + row + c] + a[i - 4 + c] + a[i + 4 + c];
          b[i + c] = center + k * (center - sum / 4);  // Uint8ClampedArray 赋值自动截断
        }
        b[i + 3] = a[i + 3];
      }
    }
    try { ctx.putImageData(out, 0, 0); } catch (e) { return null; }
    return canvas;
  }

  function slimWarp(slim) {
    const s = slim || {};
    if (!s.enabled) return null;
    const mode = s.mode === 'body' ? 'body' : 'face';
    const st = Math.max(0, Math.min(1, (s.strength || 0) / 100));       // 0..1
    const cx = __API.clamp(s.cx == null ? 0.5 : s.cx, 0, 1);
    const cy = __API.clamp(s.cy == null ? 0.5 : s.cy, 0, 1);
    // 侧向收缩强度；瘦身含轻微竖直收缩，瘦脸几乎纯横向
    const K = st * 0.5;
    const Kv = mode === 'body' ? st * 0.18 : st * 0.06;
    let rx = s.rx || 0.22, ry = s.ry || 0.22;
    if (mode === 'body') { rx = rx || 0.16; ry = ry || 0.55; }
    else { rx = rx || 0.22; ry = ry || 0.22; }
    rx = Math.max(0.05, rx); ry = Math.max(0.05, ry);
    const invRx2 = 1 / (rx * rx), invRy2 = 1 / (ry * ry);
    return {
      cx, cy, K, Kv, invRx2: invRx2, invRy2: invRy2, on: ((K > 0) || (Kv > 0)),
    };
  }

  function slimDisp(w, nx, ny) {
    const dx0 = nx - w.cx, dy0 = ny - w.cy;
    const g = Math.exp(-(dx0 * dx0 * w.invRx2 + dy0 * dy0 * w.invRy2));
    return { sx: nx - w.K * g * dx0, sy: ny - w.Kv * g * dy0 };
  }

  function bilinear(data, W, H, x, y, out, oi) {
    const x1 = Math.max(0, Math.min(W - 1, x)), x0 = Math.floor(x1), fx = x1 - x0;
    const y1 = Math.max(0, Math.min(H - 1, y)), y0 = Math.floor(y1), fy = y1 - y0;
    const x1c = Math.min(W - 1, x0 + 1), y1c = Math.min(H - 1, y0 + 1);
    const i00 = (y0 * W + x0) * 4, i10 = (y0 * W + x1c) * 4, i01 = (y1c * W + x0) * 4, i11 = (y1c * W + x1c) * 4;
    for (let c = 0; c < 4; c++) {
      const top = data[i00 + c] * (1 - fx) + data[i10 + c] * fx;
      const bot = data[i01 + c] * (1 - fx) + data[i11 + c] * fx;
      out[oi + c] = Math.round(top * (1 - fy) + bot * fy);
    }
  }

  function slimCanvas(canvas, slim) {
    const w = slimWarp(slim);
    if (!w || !w.on) return null;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || !ctx.getImageData || !ctx.createImageData || !ctx.putImageData) return null;
    let src;
    try { src = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) { return null; }
    if (!src || !src.data) return null;
    const W = canvas.width, H = canvas.height;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const octx = out.getContext('2d');
    const dst = ctx.createImageData(W, H);
    if (!dst || !dst.data) return null;  // 无像素环境（jsdom 占位）安全跳过
    const d = dst.data, s = src.data;
    for (let y = 0; y < H; y++) {
      const ny = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5) / W;
        const p = slimDisp(w, nx, ny);
        const oi = (y * W + x) * 4;
        if (p.sx < 0 || p.sx >= W || p.sy < 0 || p.sy >= H) {
          d[oi] = s[oi]; d[oi + 1] = s[oi + 1]; d[oi + 2] = s[oi + 2]; d[oi + 3] = s[oi + 3];
        } else {
          bilinear(s, W, H, p.sx, p.sy, d, oi);
        }
      }
    }
    try { octx.putImageData(dst, 0, 0); } catch (e) { return null; }
    return out;
  }

  function applySlimInPlace(ctx, W, H, slim) {
    const w = slimWarp(slim);
    if (!w || !w.on || !ctx || !ctx.getImageData || !ctx.putImageData) return;
    let id;
    try { id = ctx.getImageData(0, 0, W, H); } catch (e) { return; }
    if (!id || !id.data) return;
    const d = id.data;
    for (let y = 0; y < H; y++) {
      const ny = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5) / W;
        const p = slimDisp(w, nx, ny);
        const oi = (y * W + x) * 4;
        if (p.sx < 0 || p.sx >= W || p.sy < 0 || p.sy >= H) continue;
        bilinear(d, W, H, p.sx, p.sy, d, oi);
      }
    }
    try { ctx.putImageData(id, 0, 0); } catch (e) { /* 跳过 */ }
  }

  function updateSlimUI() {
    const s = __API.state.slim;
    if (__API.els.slimStrength) __API.els.slimStrength.value = s.strength;
    if (__API.els.slimStrengthVal) __API.els.slimStrengthVal.textContent = s.strength;
    if (__API.els.slimRange) __API.els.slimRange.value = Math.max(8, Math.min(60, Math.round(s.rx * 100)));
    if (__API.els.slimRangeVal) __API.els.slimRangeVal.textContent = __API.els.slimRange ? __API.els.slimRange.value : '';
    if (__API.els.slimFace) __API.els.slimFace.classList.toggle('active', s.mode === 'face');
    if (__API.els.slimBody) __API.els.slimBody.classList.toggle('active', s.mode === 'body');
    if (__API.els.slimMode) __API.els.slimMode.classList.toggle('active', __API.state.slimMode);
  }

  function setSlimAnchor(x, y) {
    __API.state.slim.cx = __API.clamp(x, 0, 1); __API.state.slim.cy = __API.clamp(y, 0, 1);
    if (__API.state.slim.strength > 0) __API.state.slim.enabled = true;
    renderEditPreview();
  }

  function drawSlimMarker(ctx, W, H) {
    if (!__API.state.slimMode) return;
    const px = Math.round(__API.state.slim.cx * W), py = Math.round(__API.state.slim.cy * H);
    const R = Math.round((__API.state.slim.mode === 'body' ? __API.state.slim.ry : __API.state.slim.rx) * W);
    ctx.save();
    ctx.strokeStyle = 'rgba(120,220,160,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, Math.max(8, R), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 14, py); ctx.lineTo(px + 14, py);
    ctx.moveTo(px, py - 14); ctx.lineTo(px, py + 14); ctx.stroke();
    ctx.restore();
  }

  function deformMakeKind(kind, strength) {
    // 根据 kind 给默认 rx / ry（基于 0..1 归一化坐标）
    const defs = {
      eye:   { rx: 0.09, ry: 0.07, sign: +1 },   // +1 = 向外拉，-1 = 向内推
      teeth: { rx: 0.10, ry: 0.06, sign: -1 },   // 向上拉 → y 负方向位移（sy 偏移）
      cheek: { rx: 0.10, ry: 0.10, sign: -1 },   // 向内收
      lip:   { rx: 0.08, ry: 0.05, sign: +1 },   // 向外拉
      nose:  { rx: 0.07, ry: 0.10, sign: -1 },   // 向内收 + 鼻尖上抬
    };
    return defs[kind] || defs.eye;
  }

  function deformForce(def, nx, ny) {
    // 归一化高斯作用场，返回 {fx, fy} 位移（单位：归一化坐标量纲）
    const dx0 = nx - def.cx, dy0 = ny - def.cy;
    const g = Math.exp(-(dx0 * dx0 * def.invRx2 + dy0 * dy0 * def.invRy2));
    const K = def.strengthNorm * def.sign;
    let fx = K * g * dx0;  // 横向：向外正、向内负
    let fy = K * g * dy0;  // 纵向
    if (def.kind === 'teeth') { fy = -def.strengthNorm * g * 0.5 * g * 0.5; }  // 向上拉牙齿中心（相对中心 y 更小 = 更靠上）
    if (def.kind === 'lip')   { fy = -def.strengthNorm * g * 0.3; }           // 唇中心向外 = 向下拉（显露出更多下唇/上唇）
    if (def.kind === 'nose')  {
      fx = K * g * dx0;
      fy = -def.strengthNorm * g * 0.4;  // 鼻尖向上
    }
    return { fx, fy };
  }

  function deformBuilders(deformList) {
    // 把 __API.state.deform 数组（存储用）转成可用于采样的 def 对象数组
    return (deformList || []).map((d) => {
      const def0 = deformMakeKind(d.kind || 'eye', d.strength || 0);
      const rx = Math.max(0.03, d.rx || def0.rx);
      const ry = Math.max(0.03, d.ry || def0.ry);
      const st = Math.max(0, Math.min(1, (d.strength || 0) / 100));
      return {
        kind: d.kind || 'eye',
        cx: __API.clamp(d.cx == null ? 0.5 : d.cx, 0, 1),
        cy: __API.clamp(d.cy == null ? 0.5 : d.cy, 0, 1),
        rx, ry,
        invRx2: 1 / (rx * rx), invRy2: 1 / (ry * ry),
        strength: d.strength || 0,
        strengthNorm: st,
        sign: def0.sign,
        on: st > 0.001,
      };
    }).filter((d) => d.on);
  }

  function deformTotalDisp(defs, slimW, nx, ny) {
    // 叠加所有变形 + slim，得到最终位移 {sx, sy}
    let dx = 0, dy = 0;
    // slim 位移
    if (slimW && slimW.on) {
      const p = slimDisp(slimW, nx, ny);
      dx += p.sx - nx;  // slimDisp 返回的是绝对采样坐标，转成位移量
      dy += p.sy - ny;
    }
    // deform 位移
    for (const d of defs) {
      const f = deformForce(d, nx, ny);
      dx += f.fx; dy += f.fy;
    }
    return { sx: nx + dx, sy: ny + dy };
  }

  function deformCanvas(canvas, deformList, slim) {
    const defs = deformBuilders(deformList);
    const sw = slimWarp(slim);
    if (!defs.length && (!sw || !sw.on)) return null;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || !ctx.getImageData || !ctx.createImageData || !ctx.putImageData) return null;
    let src; try { src = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) { return null; }
    if (!src || !src.data) return null;
    const W = canvas.width, H = canvas.height;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const octx = out.getContext('2d');
    const dst = ctx.createImageData(W, H);
    if (!dst || !dst.data) return null;
    const d = dst.data, s = src.data;
    for (let y = 0; y < H; y++) {
      const ny = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5) / W;
        const p = deformTotalDisp(defs, sw, nx, ny);
        const sxAbs = p.sx * W - 0.5, syAbs = p.sy * H - 0.5;
        const oi = (y * W + x) * 4;
        if (sxAbs < 0 || sxAbs >= W || syAbs < 0 || syAbs >= H) {
          d[oi] = s[oi]; d[oi + 1] = s[oi + 1]; d[oi + 2] = s[oi + 2]; d[oi + 3] = s[oi + 3];
        } else {
          bilinear(s, W, H, sxAbs, syAbs, d, oi);
        }
      }
    }
    try { octx.putImageData(dst, 0, 0); } catch (e) { return null; }
    return out;
  }

  function applyDeformInPlace(ctx, W, H, deformList, slim) {
    const defs = deformBuilders(deformList);
    const sw = slimWarp(slim);
    if (!defs.length && (!sw || !sw.on) || !ctx || !ctx.getImageData || !ctx.putImageData) return;
    let id; try { id = ctx.getImageData(0, 0, W, H); } catch (e) { return; }
    if (!id || !id.data) return;
    const d = id.data;
    for (let y = 0; y < H; y++) {
      const ny = (y + 0.5) / H;
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5) / W;
        const p = deformTotalDisp(defs, sw, nx, ny);
        const sxAbs = p.sx * W - 0.5, syAbs = p.sy * H - 0.5;
        const oi = (y * W + x) * 4;
        if (sxAbs < 0 || sxAbs >= W || syAbs < 0 || syAbs >= H) continue;
        bilinear(d, W, H, sxAbs, syAbs, d, oi);
      }
    }
    try { ctx.putImageData(id, 0, 0); } catch (e) { /* 跳过 */ }
  }

  function updateDeformUI() {
    const list = __API.state.deform || [];
    const counts = { eye: 0, teeth: 0, cheek: 0, lip: 0, nose: 0 };
    list.forEach((d) => { if (counts[d.kind] != null) counts[d.kind] += 1; });
    // 已启用变形数量 badge
    const badge = __API.els.deformCount;
    if (badge) {
      const total = list.filter((d) => (d.strength || 0) > 0).length;
      badge.textContent = total ? `(${total})` : '';
    }
    // 类型开关 active 状态
    ['eye', 'teeth', 'cheek', 'lip', 'nose'].forEach((k) => {
      const b = document.getElementById('deform_' + k);
      if (b) b.classList.toggle('active', counts[k] > 0);
    });
    // 锚点模式高亮
    if (__API.els.deformModeBtn) __API.els.deformModeBtn.classList.toggle('active', !!__API.state.deformMode);
  }

  function addDeform(kind) {
    // 找同 kind 的一个（允许同 kind 多个？目前只允许每种一个，用 id=kind）
    const list = __API.state.deform || [];
    const idx = list.findIndex((d) => d.kind === kind);
    let d;
    if (idx >= 0) {
      d = list[idx]; d.strength = (d.strength || 0) + 5;
      if (d.strength > 100) d.strength = 100;
    } else {
      // 给合理初始位置
      let cx = 0.5, cy = 0.45;
      if (kind === 'eye') { cx = 0.38; cy = 0.40; }
      if (kind === 'teeth') { cx = 0.50; cy = 0.62; }
      if (kind === 'cheek') { cx = 0.35; cy = 0.55; }
      if (kind === 'lip') { cx = 0.50; cy = 0.66; }
      if (kind === 'nose') { cx = 0.50; cy = 0.52; }
      const def0 = deformMakeKind(kind, 0);
      d = { kind, cx, cy, strength: 25, rx: def0.rx, ry: def0.ry };
      list.push(d);
    }
    __API.state.deform = list;
    __API.state.deformMode = { kind };  // 进入该 kind 的锚点模式
    pushUndo();
    updateDeformUI();
    renderEditPreview();
  }

  function clearAllDeform() {
    if (!__API.state.deform || !__API.state.deform.length) { __API.toast('没有可清除的变形'); return; }
    __API.state.deform = [];
    __API.state.deformMode = null;
    pushUndo();
    updateDeformUI();
    renderEditPreview();
    __API.toast('已清除所有美型变形');
  }

  function resetDeformKind(kind) {
    const list = (__API.state.deform || []).filter((d) => d.kind !== kind);
    __API.state.deform = list;
    if (__API.state.deformMode && __API.state.deformMode.kind === kind) __API.state.deformMode = null;
    pushUndo();
    updateDeformUI();
    renderEditPreview();
  }

  function setDeformAnchor(kind, x, y) {
    const list = __API.state.deform || [];
    let d = list.find((dd) => dd.kind === kind);
    if (!d) {
      const def0 = deformMakeKind(kind, 0);
      d = { kind, cx: 0.5, cy: 0.5, strength: 25, rx: def0.rx, ry: def0.ry };
      list.push(d); __API.state.deform = list;
    }
    d.cx = __API.clamp(x, 0, 1); d.cy = __API.clamp(y, 0, 1);
    if (d.strength > 0) __API.state.deformMode = { kind };
    renderEditPreview();
  }

  function drawDeformMarkers(ctx, W, H) {
    if (!__API.state.deformMode) return;
    const list = __API.state.deform || [];
    const active = list.find((d) => d.kind === __API.state.deformMode.kind);
    if (!active) return;
    const px = Math.round(active.cx * W), py = Math.round(active.cy * H);
    const R = Math.round(active.rx * W);
    const col = { eye: 'rgba(120,200,255,0.95)', teeth: 'rgba(255,230,120,0.95)', cheek: 'rgba(255,150,200,0.95)', lip: 'rgba(255,120,160,0.95)', nose: 'rgba(180,160,140,0.95)' }[active.kind] || 'rgba(200,200,120,0.95)';
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, Math.max(8, R), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 14, py); ctx.lineTo(px + 14, py);
    ctx.moveTo(px, py - 14); ctx.lineTo(px, py + 14); ctx.stroke();
    ctx.restore();
  }

  function autoEnhance() {
    const item = __API.state.items[__API.state.index];
    if (!item || !item.img) { __API.toast('请先打开图片'); return; }
    const full = __API.makeCanvasOfCurrent(1);  // 不含滤镜的底图，统计更准
    if (!full) { __API.toast('无法生成画布'); return; }
    const ctx = full.getContext && full.getContext('2d');
    if (!ctx || !ctx.getImageData || !ctx.drawImage) { __API.toast('当前环境无法分析像素'); return; }
    try {
      // 下采样到 ≤64px，统计亮度直方图与平均饱和度
      const sw = Math.max(1, Math.min(64, full.width));
      const sh = Math.max(1, Math.round(full.height * sw / Math.max(1, full.width)));
      const small = document.createElement('canvas');
      small.width = sw; small.height = sh;
      const sctx = small.getContext('2d');
      if (!sctx || !sctx.drawImage || !sctx.getImageData) { __API.toast('当前环境无法分析像素'); return; }
      sctx.drawImage(full, 0, 0, sw, sh);
      const data = sctx.getImageData(0, 0, sw, sh).data;
      const hist = new Array(256).fill(0);
      let satSum = 0, n = 0;
      for (let p = 0; p < data.length; p += 4) {
        const r = data[p], g = data[p + 1], bl = data[p + 2];
        const max = Math.max(r, g, bl), min = Math.min(r, g, bl);
        hist[Math.round(0.299 * r + 0.587 * g + 0.114 * bl)]++;
        satSum += max === 0 ? 0 : (max - min) / max; n++;
      }
      const pct = (q) => { let acc = 0; const target = n * q; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i; } return 255; };
      const lo = pct(0.01), hi = pct(0.99);
      const mid = (lo + hi) / 2, range = hi - lo, meanSat = n ? satSum / n : 0;
      const brightness = Math.round(__API.clamp(100 * 128 / Math.max(8, mid), 60, 180));
      const contrast = Math.round(__API.clamp(100 * 255 / Math.max(32, range), 60, 180));
      const saturate = meanSat < 0.12 ? 125 : (meanSat > 0.75 ? 85 : 100);
      pushUndo();
      __API.state.filters.brightness = brightness;
      __API.state.filters.contrast = contrast;
      __API.state.filters.saturate = saturate;
      __API.syncFilterUI(); applyFilters();
      __API.toast('自动增强：亮度 ' + brightness + '% / 对比度 ' + contrast + '% / 饱和度 ' + saturate + '%');
    } catch (e) { __API.toast('无法读取像素：' + (e.message || e)); }
  }

  function initOrtEnv() {
    try {
      if (window.ort && window.ort.env) {
        if (window.ort.env.wasm) {
          window.ort.env.wasm.wasmPaths = ORT_DIR + '/';
          if ('numThreads' in window.ort.env.wasm) window.ort.env.wasm.numThreads = 1;
        }
        if (window.ort.env.backends && window.ort.env.backends.wasm) window.ort.env.backends.wasm.simd = true;
      }
    } catch (e) { /* wasm 环境部分旧版本无 env.backends，忽略 */ }
  }

  function loadScript(src, check) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { const m = check(); clearTimer(); if (m) resolve(m); else reject(new Error('脚本加载不完整')); };
      s.onerror = () => { clearTimer(); reject(new Error('脚本加载失败（需联网）')); };
      document.head.appendChild(s);
      clearTimer();
      let timer = 0;
      function clearTimer() { if (timer) { clearTimeout(timer); timer = 0; } }
      // 轮询兜底：内联/缓存/离线等场景 load 事件可能不触发，超时报错以便上层降级
      const t0 = Date.now();
      timer = setInterval(() => {
        const m = check();
        if (m) { clearTimer(); resolve(m); if (s.remove) s.remove(); }
        else if (Date.now() - t0 > 6000) { clearTimer(); if (s.remove) s.remove(); reject(new Error('脚本加载超时（需联网）')); }
      }, 150);
    });
  }

  function loadOpenCV() {
    if (window.cv && window.cv.Mat) return Promise.resolve(window.cv);
    if (cvLoading) return cvLoading;
    const url = (__API.getSetting('advanced', 'cvUrl') || '').trim() || CV_DEFAULT_URL;
    cvLoading = loadScript(url, () => (window.cv && window.cv.Mat ? window.cv : null));
    return cvLoading;
  }

  function loadOrt() {
    if (window.ort && window.ort.InferenceSession) { initOrtEnv(); return Promise.resolve(window.ort); }
    if (ortLoading) return ortLoading;
    ortLoading = loadScript(ORT_CDN_URL, () => (window.ort && window.ort.InferenceSession ? window.ort : null)).then((o) => { initOrtEnv(); return o; });
    return ortLoading;
  }

  function cvProcess(canvas, op) {
    const cv = window.cv;
    const src = cv.imread(canvas);
    let dst = new cv.Mat();
    try {
      if (op.type === 'median') cv.medianBlur(src, dst, op.k || 5);
      else if (op.type === 'bilateral') cv.bilateralFilter(src, dst, op.d || 5, op.sigma || 75, op.sigma || 75);
      else if (op.type === 'unsharp') {
        const blur = new cv.Mat();
        try { cv.GaussianBlur(src, blur, new cv.Size(0, 0), op.sigma || 2); cv.addWeighted(src, 1 + (op.amount || 0.6), blur, -(op.amount || 0.6), 0, dst); }
        finally { blur.delete(); }
      } else { return canvas; }
      cv.imshow(canvas, dst);
    } finally { try { src.delete(); dst.delete(); } catch (e) {} }
    return canvas;
  }

  function upscaleInterp(canvas, scale) {
    scale = Math.max(1, Math.min(4, Math.round(scale || 2)));
    const nw = Math.round(canvas.width * scale), nh = Math.round(canvas.height * scale);
    const out = document.createElement('canvas');
    out.width = nw; out.height = nh;
    const octx = out.getContext('2d');
    if (!octx || !octx.drawImage) throw new Error('无法写入放大画布');
    octx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in octx) octx.imageSmoothingQuality = 'high';
    octx.drawImage(canvas, 0, 0, nw, nh);
    return out;
  }

  async function loadAiSession(scale) {
    const url = (__API.getSetting('advanced', 'aiModelUrl') || '').trim();
    const modelUrl = url || DEFAULT_AI_MODEL;
    if (!aiSession || aiSessionUrl !== modelUrl) {
      __API.toast(url ? 'AI 模型加载中…（首次可能较慢）' : '离线 AI 超分模型加载中…（首次稍慢）');
      const ort = await loadOrt();
      aiSession = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
      aiSessionUrl = modelUrl;
    }
    return aiSession;
  }

  async function upscaleSRY(session, canvas) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || !ctx.getImageData) throw new Error('无法读取像素');
    const d = ctx.getImageData(0, 0, w, h).data;
    const plane = w * h;
    const Y = new Float32Array(plane), Cb = new Uint8ClampedArray(plane), Cr = new Uint8ClampedArray(plane);
    for (let i = 0; i < plane; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      Y[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      Cb[i] = Math.round(__API.clamp(128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 0, 255));
      Cr[i] = Math.round(__API.clamp(128 + 0.5 * r - 0.418688 * g - 0.081312 * b, 0, 255));
    }
    const ow = w * SR_SCALE, oh = h * SR_SCALE;
    const acc = new Float32Array(ow * oh), cnt = new Int16Array(ow * oh);
    const step = SR_IN - SR_PAD;
    const nx = Math.max(1, Math.ceil((w - SR_IN) / step) + 1);
    const ny = Math.max(1, Math.ceil((h - SR_IN) / step) + 1);
    const inName = session0(session), outName = session1(session), ort = window.ort;
    for (let ty = 0; ty < ny; ty++) {
      for (let tx = 0; tx < nx; tx++) {
        const x0 = Math.min(tx * step, Math.max(0, w - SR_IN));
        const y0 = Math.min(ty * step, Math.max(0, h - SR_IN));
        const input = new Float32Array(SR_IN * SR_IN);
        for (let j = 0; j < SR_IN; j++) {
          const sy = y0 + j;
          for (let i = 0; i < SR_IN; i++) input[j * SR_IN + i] = Y[sy * w + (x0 + i)];
        }
        const feeds = {}; feeds[inName] = new ort.Tensor('float32', input, [1, 1, SR_IN, SR_IN]);
        const res = await session.run(feeds);
        const od = res[outName] ? res[outName].data : null;
        if (!od) throw new Error('模型输出为空');
        const ox0 = x0 * SR_SCALE, oy0 = y0 * SR_SCALE;
        for (let j = 0; j < SR_OUT; j++) {
          const oy = oy0 + j; if (oy >= oh) break;
          for (let i = 0; i < SR_OUT; i++) {
            const ox = ox0 + i; if (ox >= ow) break;
            const idx = oy * ow + ox;
            acc[idx] += od[j * SR_OUT + i]; cnt[idx]++;
          }
        }
      }
    }
    const outCanvas = document.createElement('canvas');
    outCanvas.width = ow; outCanvas.height = oh;
    const octx = outCanvas.getContext('2d');
    const oimg = octx.createImageData(ow, oh);
    const c3 = SR_SCALE;
    for (let yy = 0; yy < oh; yy++) {
      const cby = Math.min(h - 1, Math.floor(yy / c3)) * w;
      for (let xx = 0; xx < ow; xx++) {
        const idx = yy * ow + xx;
        const yv = cnt[idx] ? acc[idx] / cnt[idx] : 0;
        const cbs = Cb[cby + Math.min(w - 1, Math.floor(xx / c3))];
        const crs = Cr[cby + Math.min(w - 1, Math.floor(xx / c3))];
        const yvl = yv * 255;
        const p = idx * 4;
        oimg.data[p] = Math.round(__API.clamp(yvl + 1.402 * (crs - 128), 0, 255));
        oimg.data[p + 1] = Math.round(__API.clamp(yvl - 0.344136 * (cbs - 128) - 0.714136 * (crs - 128), 0, 255));
        oimg.data[p + 2] = Math.round(__API.clamp(yvl + 1.772 * (cbs - 128), 0, 255));
        oimg.data[p + 3] = 255;
      }
    }
    octx.putImageData(oimg, 0, 0);
    return outCanvas;
  }

  async function upscaleNCHW(session, canvas, scale) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    if (!ctx || !ctx.getImageData) throw new Error('无法读取像素');
    const px = ctx.getImageData(0, 0, w, h).data;
    const input = new Float32Array(3 * w * h);   // NCHW
    const plane = w * h;
    for (let i = 0; i < plane; i++) {
      input[i] = px[i * 4] / 255;
      input[plane + i] = px[i * 4 + 1] / 255;
      input[plane * 2 + i] = px[i * 4 + 2] / 255;
    }
    const ort = window.ort;
    const tensor = new ort.Tensor('float32', input, [1, 3, h, w]);
    const feeds = {}; feeds[session0(session)] = tensor;
    const results = await session.run(feeds);
    const out = results[session1(session)];
    if (!out || !out.data) throw new Error('模型输出为空');
    const ow = out.dims[3], oh = out.dims[2], od = out.data, op = ow * oh;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = ow; outCanvas.height = oh;
    const octx = outCanvas.getContext('2d');
    const oimg = octx.createImageData(ow, oh);
    for (let i = 0; i < op; i++) {
      const p = i * 4;
      oimg.data[p] = od[i] * 255; oimg.data[p + 1] = od[op + i] * 255; oimg.data[p + 2] = od[op * 2 + i] * 255; oimg.data[p + 3] = 255;
    }
    octx.putImageData(oimg, 0, 0);
    return outCanvas;
  }

  function resampleToScale(canvas, scale) {
    const nw = Math.round(canvas.width / 3 * scale), nh = Math.round(canvas.height / 3 * scale);
    if (nw === canvas.width && nh === canvas.height) return canvas;
    const out = document.createElement('canvas');
    out.width = nw; out.height = nh;
    const oc = out.getContext('2d');
    oc.imageSmoothingEnabled = true; octxQuality(oc);
    oc.drawImage(canvas, 0, 0, nw, nh);
    return out;
  }

  function octxQuality(oc) { if ('imageSmoothingQuality' in oc) oc.imageSmoothingQuality = 'high'; }

  async function aiUpscale(canvas, scale) {
    scale = Math.max(1, Math.min(4, Math.round(scale || 2)));
    const custom = !!(__API.getSetting('advanced', 'aiModelUrl') || '').trim();
    try {
      const session = await loadAiSession(scale);
      const ai = custom ? await upscaleNCHW(session, canvas, scale) : await upscaleSRY(session, canvas);
      return ai.width === canvas.width * scale ? ai : resampleToScale(ai, scale);
    } catch (e) {
      __API.toast('AI 放大失败（' + (e.message || e) + '），已用插值放大');
      return upscaleInterp(canvas, scale);
    }
  }

  function session0(s) { return s.inputNames && s.inputNames[0] ? s.inputNames[0] : 'input'; }

  function session1(s) { return s.outputNames && s.outputNames[0] ? s.outputNames[0] : 'output'; }

  async function applyPixelOpsAsync(canvas) {
    if (!canvas || !__API.state.ops.length) return canvas;
    for (const op of __API.state.ops.slice()) {
      try {
        if (op.type === 'upscale') canvas = await aiUpscale(canvas, op.scale);
        else { await loadOpenCV(); canvas = cvProcess(canvas, op); }
      } catch (e) { __API.toast('高级处理已跳过一项：' + (e && e.message ? e.message : e)); }
    }
    return canvas;
  }

  function updateOpsUI() {
    if (__API.els.opsReset) __API.els.opsReset.textContent = '清空高级处理（' + __API.state.ops.length + ' 步）';
  }

  function resetOps() {
    pushUndo();
    __API.state.ops = [];
    updateOpsUI();
    __API.toast('已清空高级处理');
  }

  async function onCvBtn(type) {
    if (!__API.state.items[__API.state.index]) { __API.toast('请先打开图片'); return; }
    const op = type === 'median' ? { type: 'median', k: 5 }
      : type === 'bilateral' ? { type: 'bilateral', d: 5, sigma: 75 }
      : { type: 'unsharp', sigma: 2, amount: 0.6 };
    __API.toast('正在加载 AI 画笔引擎…（首次约 8MB）');
    try { await loadOpenCV(); } catch (e) { __API.toast('AI 画笔引擎初始化失败：' + (e.message || e)); return; }
    pushUndo();
    __API.state.ops.push(op);
    updateOpsUI();
    __API.toast('已加入处理队列（共 ' + __API.state.ops.length + ' 步），导出时应用');
  }

  function onAiRun() {
    if (!__API.state.items[__API.state.index]) { __API.toast('请先打开图片'); return; }
    const scale = __API.els.aiScale ? +__API.els.aiScale.value : 2;
    pushUndo();
    __API.state.ops.push({ type: 'upscale', scale: scale });
    updateOpsUI();
    __API.toast('AI 放大（' + scale + '×）已加入队列，导出时离线推理');
  }

  function applyStylePreset(preset) {
    pushUndo();
    __API.state.filters = Object.assign({ brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0, hslH: 0, hslS: 100, hslL: 0 }, preset.f);
    __API.syncFilterUI(); applyFilters();
  }

  function renderStyleGrid() {
    if (!__API.els.styleGrid) return;
    __API.els.styleGrid.innerHTML = '';
    STYLE_PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'btn style-cell'; b.type = 'button';
      b.textContent = p.name; b.dataset.style = p.id;
      b.addEventListener('click', () => { applyStylePreset(p); __API.toast('风格：' + p.name); });
      __API.els.styleGrid.appendChild(b);
    });
  }

  function applyRandomStyle() {
    if (!__API.state.items[__API.state.index]) { __API.toast('请先打开图片'); return; }
    const pool = STYLE_PRESETS.filter((p) => p.id !== 'none');
    const p = pool[Math.floor(Math.random() * pool.length)];
    applyStylePreset(p);
    __API.toast('随机风格配方：' + p.name);
  }

  async function onBeauty(kind, intensity) {
    if (!__API.state.items[__API.state.index]) { __API.toast('请先打开图片'); return; }
    const v = (intensity != null ? intensity : (__API.els.beautyVal ? +__API.els.beautyVal.value : 50));
    if (v <= 0) { __API.toast('请先把强度调到大于 0'); return; }
    const a = v / 100;
    pushUndo();
    if (kind === 'white') {
      __API.state.filters.brightness = Math.round(__API.clamp(__API.state.filters.brightness + 40 * a, 0, 200));
      __API.state.filters.saturate = Math.round(__API.clamp(__API.state.filters.saturate + 5 * a, 0, 200));
      __API.syncFilterUI(); applyFilters();
      __API.toast('美白完成（强度 ' + v + '%）');
    }
    // 磨皮（两种都叠加双边滤波，美白也顺带轻磨）
    try {
      await loadOpenCV();
      __API.state.ops.push({ type: 'bilateral', d: Math.round(3 + 7 * a), sigma: Math.round(40 + 60 * a) });
      updateOpsUI();
      __API.toast('磨皮已加入处理队列（导出时应用，共 ' + __API.state.ops.length + ' 步）');
    } catch (e) { __API.toast('AI 画笔引擎初始化失败：' + (e.message || e)); }
  }

  async function oneClickBeauty(presetId) {
    if (!__API.state.items[__API.state.index]) { __API.toast('请先打开图片'); return; }
    const p = BEAUTY_PRESETS.find((q) => q.id === presetId);
    if (!p) return;
    pushUndo();
    if (p.white > 0) {
      const a = p.white / 100;
      __API.state.filters.brightness = Math.round(__API.clamp(__API.state.filters.brightness + 40 * a, 0, 200));
      __API.state.filters.saturate = Math.round(__API.clamp(__API.state.filters.saturate + 5 * a, 0, 200));
      __API.syncFilterUI(); applyFilters();
    }
    if (p.smooth > 0) {
      try {
        await loadOpenCV();
        const a = p.smooth / 100;
        __API.state.ops.push({ type: 'bilateral', d: Math.round(3 + 7 * a), sigma: Math.round(40 + 60 * a) });
        updateOpsUI();
      } catch (e) { __API.toast('AI 画笔引擎初始化失败：' + (e.message || e)); }
    }
    __API.syncBeautyBar();
    __API.toast('一键美颜「' + p.name + '」已应用');
  }

  function txtDefaults() {
    const pos = __API.els.txtPos ? __API.els.txtPos.value : 'br';
    const map = { br: [0.94, 0.95], bl: [0.06, 0.95], tr: [0.94, 0.07], tl: [0.06, 0.07], c: [0.5, 0.5] };
    const [x, y] = map[pos] || map.br;
    return { x, y };
  }

  function addText() {
    const text = (__API.els.txtInput.value || '').trim();
    if (!text) { __API.toast('请输入文字'); return; }
    const d = txtDefaults();
    const t = {
      id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
      text,
      x: d.x, y: d.y,
      size: __API.els.txtSize ? +__API.els.txtSize.value : 5,
      font: __API.els.txtFont ? __API.els.txtFont.value : 'sans-serif',
      color: __API.els.txtColor ? __API.els.txtColor.value : '#1c1c1c',
      stroke: __API.els.txtStroke ? +__API.els.txtStroke.value : 0,
      anchor: __API.els.txtPos ? __API.els.txtPos.value : 'br',
    };
    pushUndo();
    __API.state.texts.push(t);
    __API.state.textSel = t.id;
    __API.els.txtInput.value = '';
    renderEditPreview();
    __API.toast('已添加文字（可拖拽移动）');
  }

  function selTextAt(nx, ny, canvasW, canvasH) {
    // 命中检测：以文字包围盒（估算宽 = 字数×字号；高 = 字号×1.3）匹配
    let best = null, bestDist = Infinity;
    for (const t of __API.state.texts) {
      const fs = Math.max(8, t.size / 100 * Math.min(canvasW, canvasH));
      const w = t.text.length * fs, h = fs * 1.3;
      const x0 = t.anchor === 'bl' || t.anchor === 'tl' || t.anchor === 'c' ? t.x * canvasW - w / 2 : t.x * canvasW - w;
      const x1 = x0 + w;
      const y0 = t.y * canvasH - h, y1 = t.y * canvasH;
      const cx = __API.clamp(nx * canvasW, x0, x1), cy = __API.clamp(ny * canvasH, y0, y1);
      const dist = Math.hypot(nx * canvasW - cx, ny * canvasH - cy);
      if (dist < Math.max(fs, 12) && dist < bestDist) { best = t; bestDist = dist; }
    }
    return best;
  }

  function drawTexts(ctx, W, H) {
    for (const t of __API.state.texts) {
      const fs = Math.max(8, t.size / 100 * Math.min(W, H));
      ctx.save();
      if (t.type === 'image') {
        // 图片贴纸（Logo/PNG）：用 drawImage 替代 fillText
        // img 可能因为 undo/redo JSON 序列化丢失 → 从 src data URL 懒恢复
        if (!t.img || !t.img.complete) {
          if (t.src) {
            const img = new Image();
            img.onload = () => { t.img = img; renderEditPreview(); }; // 补回后自动重绘
            img.src = t.src;
          }
          ctx.restore(); continue; // 本轮跳过，下一轮重绘
        }
        const imgW = t.img.naturalWidth || 100;
        const imgH = t.img.naturalHeight || 100;
        const ratio = imgW / imgH;
        const targetH = fs;           // 和 emoji 一样的 size 百分比高度
        const targetW = targetH * ratio;
        const cx = t.x * W, cy = t.y * H;
        if (t.anchor === 'c') {
          ctx.drawImage(t.img, cx - targetW / 2, cy - targetH / 2, targetW, targetH);
        } else {
          ctx.drawImage(t.img, cx, cy - targetH, targetW, targetH);
        }
        if (__API.state.textSel === t.id) {
          ctx.strokeStyle = '#2C9678'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          ctx.strokeRect(cx - targetW / 2, cy - targetH / 2, targetW, targetH);
          ctx.setLineDash([]);
        }
      } else {
        // 普通文字 / emoji：fillText + strokeText
        ctx.font = fs + 'px ' + t.font;
        ctx.textAlign = t.anchor === 'bl' || t.anchor === 'tl' || t.anchor === 'c' ? 'center' : 'right';
        ctx.textBaseline = 'alphabetic';
        if (t.stroke > 0) { ctx.lineWidth = t.stroke; ctx.strokeStyle = 'rgba(28,28,28,.75)'; ctx.strokeText(t.text, t.x * W, t.y * H); }
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x * W, t.y * H);
        if (__API.state.textSel === t.id) {
          const w = ctx.measureText ? ctx.measureText(t.text).width : t.text.length * fs;
          ctx.strokeStyle = '#2C9678'; ctx.lineWidth = 1;
          ctx.strokeRect(t.x * W - (ctx.textAlign === 'center' ? w / 2 : w), t.y * H - fs * 1.1, w, fs * 1.3);
        }
      }
      ctx.restore();
    }
  }

  function delSelText() {
    if (!__API.state.textSel) { __API.toast('请先在预览中点选文字'); return; }
    __API.state.texts = __API.state.texts.filter((t) => t.id !== __API.state.textSel);
    __API.state.textSel = null;
    renderEditPreview();
    __API.toast('已删除文字');
  }

  function drawMosaic(ctx, full, W, H) {
    if (!__API.state.mosaic.length) return;
    const cell = Math.max(6, Math.round(Math.min(full.width, full.height) * 0.012));
    for (const m of __API.state.mosaic) {
      const cx = m.x * W, cy = m.y * H;
      const r = m.r * Math.min(W, H);
      const px = Math.round(m.x * full.width), py = Math.round(m.y * full.height);
      const sx = Math.max(0, px - r), sy = Math.max(0, py - r);
      const sw = Math.min(full.width - sx, r * 2), sh = Math.min(full.height - sy, r * 2);
      if (sw <= 0 || sh <= 0) continue;
      const t = document.createElement('canvas');
      t.width = Math.max(1, Math.round(sw / cell)); t.height = Math.max(1, Math.round(sh / cell));
      const tc = t.getContext && t.getContext('2d');
      if (!tc || !tc.drawImage) continue;
      tc.drawImage(full, sx, sy, sw, sh, 0, 0, t.width, t.height);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(t, 0, 0, t.width, t.height, cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  function toggleMosaicMode() {
    __API.state.mosaicMode = !__API.state.mosaicMode;
    if (__API.els.mosaicBtn) __API.els.mosaicBtn.textContent = __API.state.mosaicMode ? '✓ 退出马赛克模式' : '🖌 进入马赛克模式';
    __API.toast(__API.state.mosaicMode ? '马赛克模式：在图上涂抹打码' : '已退出马赛克模式');
  }

  function clearMosaic() {
    __API.state.mosaic = [];
    renderEditPreview();
    __API.toast('已清空马赛克');
  }

  function toggleEraserMode() {
    __API.state.eraserMode = !__API.state.eraserMode;
    if (__API.state.eraserMode) {
      // 互斥：进入消除笔模式时退出其他笔刷模式
      __API.state.mosaicMode = false;
      __API.state.slimMode = false;
      if (__API.state.deformMode) { __API.state.deformMode = null; }
      if (__API.els.mosaicBtn) __API.els.mosaicBtn.textContent = '🖌 进入马赛克模式';
    }
    if (__API.els.eraserBtn) __API.els.eraserBtn.textContent = __API.state.eraserMode ? '✓ 退出消除笔' : '🩹 进入消除笔模式';
    __API.toast(__API.state.eraserMode ? '消除笔：在要消除的物体上涂抹（纹理重复区域效果好）' : '已退出消除笔模式');
  }

  function clearEraser() {
    __API.state.eraser = [];
    renderEditPreview();
    __API.toast('已清空消除笔');
  }

  function eraserRadiusNorm() {
    const v = __API.els.eraserSize ? Number(__API.els.eraserSize.value) : 20;
    return Math.min(0.3, v / 1000); // 归一化半径，最小 0.005，最大 0.3
  }

  function patchMatchInpaint(full, strokes) {
    const W = full.width, H = full.height;
    const data = full.data;
    if (!strokes.length) return;

    // 1. 构建 mask：笔触覆盖的像素标记为 1（uint8）
    const mask = new Uint8Array(W * H);
    for (const s of strokes) {
      const cx = Math.round(s.x * W), cy = Math.round(s.y * H);
      const r = Math.round(s.r * Math.min(W, H));
      const r2 = r * r;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r2) {
            const px = cx + dx, py = cy + dy;
            if (px >= 0 && px < W && py >= 0 && py < H) mask[py * W + px] = 1;
          }
        }
      }
    }

    // 2. 降采样（如果图太大）：最长边 > 800 → 缩到 800 做 inpaint
    let scale = 1;
    let sW = W, sH = H, sData = data, sMask = mask;
    const maxEdge = Math.max(W, H);
    if (maxEdge > 800) {
      scale = 800 / maxEdge;
      sW = Math.round(W * scale); sH = Math.round(H * scale);
      sData = new Uint8ClampedArray(sW * sH * 4);
      sMask = new Uint8Array(sW * sH);
      // 双线性降采样 data 和 mask
      for (let y = 0; y < sH; y++) {
        for (let x = 0; x < sW; x++) {
          const sx = x / scale, sy = y / scale;
          const x0 = Math.floor(sx), y0 = Math.floor(sy);
          const fx = sx - x0, fy = sy - y0;
          const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
          // 对每个通道双线性插值
          for (let c = 0; c < 4; c++) {
            const tl = data[(y0 * W + x0) * 4 + c];
            const tr = data[(y0 * W + x1) * 4 + c];
            const bl = data[(y1 * W + x0) * 4 + c];
            const br = data[(y1 * W + x1) * 4 + c];
            const v = tl * (1 - fx) * (1 - fy) + tr * fx * (1 - fy) + bl * (1 - fx) * fy + br * fx * fy;
            sData[(y * sW + x) * 4 + c] = v | 0;
          }
          // mask 直接取 nearest
          if (mask[Math.min(H - 1, y0) * W + Math.min(W - 1, x0)]) sMask[y * sW + x] = 1;
        }
      }
    }

    // 3. Patch-match 填充（Navier-Stokes 简化版）
    const PATCH = 7;       // 7×7 补丁（奇数）
    const HALF = 3;        // PATCH / 2 floor
    const SEARCH = 15;     // 搜索窗口半径
    const borderMask = new Uint8Array(sW * sH);
    // 3a. 计算哪些像素在 mask 边界（mask 内但有邻居在 mask 外）
    for (let y = 1; y < sH - 1; y++) {
      for (let x = 1; x < sW - 1; x++) {
        if (sMask[y * sW + x] === 1) {
          let isBorder = false;
          for (let dy = -1; dy <= 1 && !isBorder; dy++)
            for (let dx = -1; dx <= 1 && !isBorder; dx++)
              if (sMask[(y + dy) * sW + (x + dx)] === 0) isBorder = true;
          if (isBorder) borderMask[y * sW + x] = 1;
        }
      }
    }

    // 3b. 迭代填充（每次只处理 borderMask 上的像素，向内推进）
    let remaining = 0;
    for (let i = 0; i < sMask.length; i++) if (sMask[i]) remaining++;
    let iter = 0, maxIter = Math.max(20, Math.ceil(Math.sqrt(remaining) / 2));

    while (remaining > 0 && iter < maxIter) {
      iter++;
      let filled = 0;
      const newBorder = new Uint8Array(sW * sH);

      for (let y = HALF; y < sH - HALF; y++) {
        for (let x = HALF; x < sW - HALF; x++) {
          if (!borderMask[y * sW + x]) continue;

          // 在周围 SEARCH×SEARCH 窗口里找非 mask 区域的最佳匹配补丁
          const best = findBestPatch(sData, sMask, x, y, sW, sH, PATCH, HALF, SEARCH);
          if (!best) { borderMask[y * sW + x] = 0; continue; }

          // 复制最佳补丁到当前位置（只填充 mask 内的像素）
          for (let py = 0; py < PATCH; py++) {
            for (let px = 0; px < PATCH; px++) {
              const tx = x - HALF + px, ty = y - HALF + py;
              const sx = best.x - HALF + px, sy = best.y - HALF + py;
              if (tx < 0 || tx >= sW || ty < 0 || ty >= sH) continue;
              if (sx < 0 || sx >= sW || sy < 0 || sy >= sH) continue;
              if (sMask[ty * sW + tx]) {
                const ti = (ty * sW + tx) * 4, si = (sy * sW + sx) * 4;
                sData[ti] = sData[si]; sData[ti + 1] = sData[si + 1];
                sData[ti + 2] = sData[si + 2]; sData[ti + 3] = sData[si + 3];
                sMask[ty * sW + tx] = 0;  // 已填充
              }
            }
          }
          filled++;
        }
      }

      // 重新计算 borderMask（处理后新暴露的边缘）
      borderMask.fill(0);
      for (let y = HALF; y < sH - HALF; y++) {
        for (let x = HALF; x < sW - HALF; x++) {
          if (sMask[y * sW + x] === 1) {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (sMask[(y + dy) * sW + (x + dx)] === 0) { borderMask[y * sW + x] = 1; break; }
              }
              if (borderMask[y * sW + x]) break;
            }
          }
        }
      }

      // 统计剩余
      remaining = 0;
      for (let i = 0; i < sMask.length; i++) if (sMask[i]) remaining++;
      if (filled === 0) break;  // 卡住了
    }

    // 4. 上采样回原分辨率（如果降采样过）
    if (scale < 1) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (!mask[y * W + x]) continue;  // 只处理 mask 覆盖的像素
          const sx = x * scale, sy = y * scale;
          const x0 = Math.floor(sx), y0 = Math.floor(sy);
          const fx = sx - x0, fy = sy - y0;
          const x1 = Math.min(sW - 1, x0 + 1), y1 = Math.min(sH - 1, y0 + 1);
          for (let c = 0; c < 4; c++) {
            const tl = sData[(y0 * sW + x0) * 4 + c];
            const tr = sData[(y0 * sW + x1) * 4 + c];
            const bl = sData[(y1 * sW + x0) * 4 + c];
            const br = sData[(y1 * sW + x1) * 4 + c];
            const v = tl * (1 - fx) * (1 - fy) + tr * fx * (1 - fy) + bl * (1 - fx) * fy + br * fx * fy;
            data[(y * W + x) * 4 + c] = v | 0;
          }
        }
      }
    }
    // 没降采样的情况：sData 就是 data，原地修改的已经生效
  }

  function findBestPatch(data, mask, cx, cy, W, H, PATCH, HALF, SEARCH) {
    let bestX = -1, bestY = -1, bestD = Infinity;
    // 搜索范围：cx±SEARCH, cy±SEARCH
    const x0 = Math.max(HALF, cx - SEARCH), x1 = Math.min(W - HALF - 1, cx + SEARCH);
    const y0 = Math.max(HALF, cy - SEARCH), y1 = Math.min(H - HALF - 1, cy + SEARCH);

    // 目标补丁的 mask：只在 mask=1 时需要匹配（mask=0 的像素不需要被填）
    for (let y = y0; y <= y1; y += 2) {  // +=2 步长加速（半分辨率搜索）
      for (let x = x0; x <= x1; x += 2) {
        if (mask[y * W + x] === 1) continue;  // 源位置不能在 mask 里
        let d = 0, count = 0;
        for (let py = 0; py < PATCH && d < bestD; py++) {
          for (let px = 0; px < PATCH; px++) {
            const tx = cx - HALF + px, ty = cy - HALF + py;
            const sx = x - HALF + px, sy = y - HALF + py;
            if (tx < 0 || tx >= W || ty < 0 || ty >= H) continue;
            if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
            if (mask[sy * W + sx]) continue;  // 源位置不能是 mask
            const di = (ty * W + tx) * 4, si = (sy * W + sx) * 4;
            const dr = data[di] - data[si], dg = data[di + 1] - data[si + 1], db = data[di + 2] - data[si + 2];
            d += dr * dr + dg * dg + db * db;
            count++;
          }
        }
        if (count >= PATCH * PATCH * 0.5 && d < bestD) { bestD = d; bestX = x; bestY = y; }
      }
    }
    if (bestX < 0) return null;
    // 用细搜索在 bestX/bestY 周围 ±2 做精确匹配
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = bestX + dx, y = bestY + dy;
        if (x < HALF || x >= W - HALF || y < HALF || y >= H - HALF) continue;
        if (mask[y * W + x] === 1) continue;
        let d = 0, count = 0;
        for (let py = 0; py < PATCH && d < bestD; py++) {
          for (let px = 0; px < PATCH; px++) {
            const tx = cx - HALF + px, ty = cy - HALF + py;
            const sx = x - HALF + px, sy = y - HALF + py;
            if (mask[sy * W + sx]) continue;
            const di = (ty * W + tx) * 4, si = (sy * W + sx) * 4;
            const dr = data[di] - data[si], dg = data[di + 1] - data[si + 1], db = data[di + 2] - data[si + 2];
            d += dr * dr + dg * dg + db * db;
            count++;
          }
        }
        if (count >= PATCH * PATCH * 0.5 && d < bestD) { bestD = d; bestX = x; bestY = y; }
      }
    }
    return { x: bestX, y: bestY, d: bestD };
  }

  function drawEraser(ctx, full, W, H) {
    if (!__API.state.eraser.length) return;
    // 在 full（ImageData）上做原地 patch-match inpaint
    patchMatchInpaint(full, __API.state.eraser);
    // 再画回 canvas（已经修改了 full.data）
    ctx.putImageData(full, 0, 0);
    // 最后画笔触预览圈（让用户知道涂过哪些地方）
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#2C9678';
    for (const s of __API.state.eraser) {
      const cx = s.x * W, cy = s.y * H, r = s.r * Math.min(W, H);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function renderEditPreview() {
    if (__API.els.editMask.hidden) return;
    const canvas = __API.els.editPreview;
    if (!canvas) return;
    const full = bakeFullCanvas();
    if (!full) return;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return; // jsdom 等无 canvas 环境直接跳过
    const maxW = (__API.els.editPreview.parentElement && __API.els.editPreview.parentElement.clientWidth) || 420;
    const maxH = Math.max(160, Math.round(window.innerHeight * 0.46));
    const scale = Math.min(maxW / full.width, maxH / full.height, 1);
    canvas.width = Math.max(1, Math.round(full.width * scale));
    canvas.height = Math.max(1, Math.round(full.height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 抠图蒙版：先铺棋盘格透明底，再画主体（去背景所见即所得）
    const matted = __API.state.matting.mask ? { m: __API.state.matting.mask, W: __API.state.matting.mW, H: __API.state.matting.mH } : null;
    if (matted) drawChecker(ctx, canvas.width, canvas.height);
    try { ctx.drawImage(full, 0, 0, canvas.width, canvas.height); } catch (e) { return; }
    // 瘦身/瘦脸 + 美型变形：合并位移场就地应用
    try { applyDeformInPlace(ctx, canvas.width, canvas.height, __API.state.deform, __API.state.slim); } catch (e) { /* 无像素环境跳过 */ }
    // 高级像素质点（高光/暗部/褪色/色调分离/颗粒/暗角）：预览分辨率同步应用，与导出算法一致
    try { applyTone(ctx, canvas.width, canvas.height, __API.state.filters); } catch (e) { /* 无像素环境跳过 */ }
    // 美工叠加：消除笔（patch-match inpaint 原图像素）→ 马赛克 → 文字层
    try { drawEraser(ctx, full, canvas.width, canvas.height); } catch (e) { /* 无像素环境跳过 */ }
    try { drawMosaic(ctx, full, canvas.width, canvas.height); } catch (e) { /* 无像素环境跳过 */ }
    try { drawTexts(ctx, canvas.width, canvas.height); } catch (e) { /* 无字体环境跳过 */ }
    if (matted) applyMaskOverlay(ctx, canvas.width, canvas.height, matted);
    drawCropOverlay(ctx, canvas.width, canvas.height);
    drawMatStrokes(ctx, canvas.width, canvas.height);
    try { drawSlimMarker(ctx, canvas.width, canvas.height); } catch (e) { /* 无像素环境跳过 */ }
    try { drawDeformMarkers(ctx, canvas.width, canvas.height); } catch (e) { /* 无像素环境跳过 */ }
  }

  function drawChecker(ctx, W, H) {
    const c = 12;
    ctx.fillStyle = '#e7e7eb';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i * c < W; i++) for (let j = 0; j * c < H; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(i * c, j * c, c, c);
    }
  }

  function applyMaskOverlay(ctx, W, H, mm) {
    if (!ctx.getImageData || typeof ctx.createImageData === 'undefined') return;
    let id;
    try { id = ctx.getImageData(0, 0, W, H); } catch (e) { return; }
    const d = id.data;
    const sx = mm.W / W, sy = mm.H / H;
    for (let y = 0; y < H; y++) {
      const my = Math.min(mm.H - 1, Math.max(0, Math.round(y * sy)));
      const base = my * mm.W;
      for (let x = 0; x < W; x++) {
        const mx = Math.min(mm.W - 1, Math.max(0, Math.round(x * sx)));
        const a = mm.m[base + mx];
        const i = (y * W + x) << 2;
        d[i + 3] = (d[i + 3] * a) >> 8;
      }
    }
    ctx.putImageData(id, 0, 0);
  }

  function drawMatStrokes(ctx, W, H) {
    const s = __API.state.matting.strokes;
    const paint = (arr, color) => {
      for (const st of arr) {
        const cx = st.x * W, cy = st.y * H, r = st.r * Math.min(W, H);
        if (r <= 0.5) continue;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }
    };
    paint(s.fg, 'rgba(44,150,120,.45)');
    paint(s.bg, 'rgba(199,62,66,.45)');
  }

  function matBrushRadiusNorm() {
    const v = __API.els.matSize ? +__API.els.matSize.value : 30;
    return __API.clamp(v / 2 / 100, 0.03, 0.4);
  }

  function drawCropOverlay(ctx, W, H) {
    if (!__API.state.crop) return;
    const px = normToPx(__API.state.crop, W, H);
    ctx.save();
    ctx.fillStyle = 'rgba(28,28,28,.5)';
    ctx.fillRect(0, 0, W, px.y);
    ctx.fillRect(0, px.y + px.h, W, H - px.y - px.h);
    ctx.fillRect(0, px.y, px.x, px.h);
    ctx.fillRect(px.x + px.w, px.y, W - px.x - px.w, px.h);
    ctx.strokeStyle = '#2C9678'; ctx.lineWidth = 2;
    ctx.strokeRect(px.x, px.y, px.w, px.h);
    ctx.strokeStyle = 'rgba(245,244,247,.35)'; ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      const gx = px.x + px.w * i / 3, gy = px.y + px.h * i / 3;
      ctx.beginPath(); ctx.moveTo(gx, px.y); ctx.lineTo(gx, px.y + px.h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px.x, gy); ctx.lineTo(px.x + px.w, gy); ctx.stroke();
    }
    const hs = 7;
    ctx.fillStyle = '#2C9678';
    [[px.x, px.y], [px.x + px.w, px.y], [px.x, px.y + px.h], [px.x + px.w, px.y + px.h]].forEach(([hx, hy]) => {
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
    });
    ctx.restore();
  }

  function previewPoint(e) {
    const r = __API.els.editPreview.getBoundingClientRect();
    return {
      x: __API.clamp((e.clientX - r.left) / r.width, 0, 1),
      y: __API.clamp((e.clientY - r.top) / r.height, 0, 1),
    };
  }

  function hitHandle(p) {
    if (!__API.state.crop) return null;
    const W = __API.els.editPreview.width, H = __API.els.editPreview.height;
    const hs = 12;
    const corners = {
      tl: [__API.state.crop.x, __API.state.crop.y],
      tr: [__API.state.crop.x + __API.state.crop.w, __API.state.crop.y],
      bl: [__API.state.crop.x, __API.state.crop.y + __API.state.crop.h],
      br: [__API.state.crop.x + __API.state.crop.w, __API.state.crop.y + __API.state.crop.h],
    };
    for (const k in corners) {
      const hx = corners[k][0] * W, hy = corners[k][1] * H;
      if (Math.abs(p.x * W - hx) <= hs && Math.abs(p.y * H - hy) <= hs) return k;
    }
    return null;
  }

  function mosaicRadiusNorm() {
    const v = __API.els.mosaicSize ? +__API.els.mosaicSize.value : 30;
    return __API.clamp(v / 2 / 100, 0.03, 0.4);  // 笔刷值 10–80 → 归一化半径 0.05–0.4
  }

  function onPreviewDown(e) {
    if (__API.els.editMask.hidden) return;
    const p = previewPoint(e);
    // 瘦身/瘦脸锚点模式：按下即定位/拖动锚点
    if (__API.state.slimMode) {
      __API.state.slimDrag = true;
      setSlimAnchor(p.x, p.y);
      if (__API.els.editPreview.setPointerCapture) { try { __API.els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault();
      return;
    }
    // 抠图模式：按下即开始涂抹前景/背景笔迹
    if (__API.state.matting.mode !== 'none') {
      __API.state.matting.strokes[__API.state.matting.mode].push({ x: p.x, y: p.y, r: matBrushRadiusNorm() });
      __API.state.matting.mask = null;  // 修改笔迹后需重新抠图
      renderEditPreview();
      if (__API.els.editPreview.setPointerCapture) { try { __API.els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault();
      return;
    }
    // 马赛克模式：按下即开始涂抹
    if (__API.state.mosaicMode) {
      __API.state.mosaicPainting = true;
      __API.state.mosaic.push({ x: p.x, y: p.y, r: mosaicRadiusNorm() });
      renderEditPreview();
      if (__API.els.editPreview.setPointerCapture) { try { __API.els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault();
      return;
    }
    // 消除笔模式：按下即涂抹笔触（每次 renderEditPreview 都会完整跑 patch-match inpaint）
    if (__API.state.eraserMode) {
      __API.state.eraserPainting = true;
      __API.state.eraser.push({ x: p.x, y: p.y, r: eraserRadiusNorm() });
      editSnap();  // 消除笔涂抹也算一次编辑快照（撤销需要）
      renderEditPreview();
      if (__API.els.editPreview.setPointerCapture) { try { __API.els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault();
      return;
    }
    // 文字优先：点中文字 → 拖拽 / 选中（有文字时不再落入裁剪逻辑）
    if (__API.state.texts.length) {
      const hit = selTextAt(p.x, p.y, __API.els.editPreview.width, __API.els.editPreview.height);
      if (hit) {
        __API.state.textSel = hit.id;
        __API.state.textDrag = { id: hit.id, start: p, origin: { x: hit.x, y: hit.y } };
        renderEditPreview();
        if (__API.els.editPreview.setPointerCapture) { try { __API.els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
        e.preventDefault();
        return;
      }
      __API.state.textSel = null;
    }
    const h = hitHandle(p);
    if (h) __API.state.cropDrag = { mode: 'resize', handle: h, start: p };
    else if (__API.state.crop && p.x >= __API.state.crop.x && p.x <= __API.state.crop.x + __API.state.crop.w && p.y >= __API.state.crop.y && p.y <= __API.state.crop.y + __API.state.crop.h) {
      __API.state.cropDrag = { mode: 'move', start: p, origin: { x: __API.state.crop.x, y: __API.state.crop.y } };
    } else {
      __API.state.crop = { x: p.x, y: p.y, w: 0, h: 0 };
      __API.state.cropDrag = { mode: 'new', start: p };
    }
    if (__API.els.editPreview.setPointerCapture) { try { __API.els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
    e.preventDefault();
  }

  function onPreviewMove(e) {
    const p = previewPoint(e);
    // 瘦身/瘦脸锚点拖动
    if (__API.state.slimDrag) { setSlimAnchor(p.x, p.y); return; }
    // 抠图笔迹拖绘
    if (__API.state.matting.mode !== 'none' && (e.buttons & 1)) {
      __API.state.matting.strokes[__API.state.matting.mode].push({ x: p.x, y: p.y, r: matBrushRadiusNorm() });
      __API.state.matting.mask = null;
      renderEditPreview();
      return;
    }
    // 马赛克涂抹
    if (__API.state.mosaicPainting) {
      __API.state.mosaic.push({ x: p.x, y: p.y, r: mosaicRadiusNorm() });
      renderEditPreview();
      return;
    }
    // 消除笔涂抹
    if (__API.state.eraserPainting) {
      __API.state.eraser.push({ x: p.x, y: p.y, r: eraserRadiusNorm() });
      renderEditPreview();
      return;
    }
    // 文字拖拽
    if (__API.state.textDrag) {
      const t = __API.state.texts.find((x) => x.id === __API.state.textDrag.id);
      if (t) {
        t.x = __API.clamp(__API.state.textDrag.origin.x + (p.x - __API.state.textDrag.start.x), 0, 1);
        t.y = __API.clamp(__API.state.textDrag.origin.y + (p.y - __API.state.textDrag.start.y), 0, 1);
        renderEditPreview();
      }
      return;
    }
    if (!__API.state.cropDrag) return;
    const MIN = 0.02;
    if (__API.state.cropDrag.mode === 'new') {
      const s = __API.state.cropDrag.start;
      __API.state.crop = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    } else if (__API.state.cropDrag.mode === 'move') {
      const dx = p.x - __API.state.cropDrag.start.x, dy = p.y - __API.state.cropDrag.start.y;
      __API.state.crop.x = __API.clamp(__API.state.cropDrag.origin.x + dx, 0, 1 - __API.state.crop.w);
      __API.state.crop.y = __API.clamp(__API.state.cropDrag.origin.y + dy, 0, 1 - __API.state.crop.h);
    } else if (__API.state.cropDrag.mode === 'resize') {
      let c = __API.state.crop;
      let left = c.x, top = c.y, right = c.x + c.w, bottom = c.y + c.h;
      if (__API.state.cropDrag.handle === 'tl') { left = p.x; top = p.y; }
      else if (__API.state.cropDrag.handle === 'tr') { right = p.x; top = p.y; }
      else if (__API.state.cropDrag.handle === 'bl') { left = p.x; bottom = p.y; }
      else if (__API.state.cropDrag.handle === 'br') { right = p.x; bottom = p.y; }
      left = __API.clamp(left, 0, right - MIN); right = __API.clamp(right, left + MIN, 1);
      top = __API.clamp(top, 0, bottom - MIN); bottom = __API.clamp(bottom, top + MIN, 1);
      __API.state.crop = { x: left, y: top, w: right - left, h: bottom - top };
    }
    renderEditPreview();
  }

  function onPreviewUp(e) {
    if (__API.state.slimDrag) { __API.state.slimDrag = false; return; }
    if (__API.state.mosaicPainting) { __API.state.mosaicPainting = false; return; }
    if (__API.state.eraserPainting) { __API.state.eraserPainting = false; return; }
    if (__API.state.textDrag) { __API.state.textDrag = null; return; }
    if (!__API.state.cropDrag) return;
    if (__API.state.cropDrag.mode === 'new' && (__API.state.crop.w < 0.01 || __API.state.crop.h < 0.01)) __API.state.crop = null;
    __API.state.cropDrag = null;
    if (__API.els.editPreview.releasePointerCapture && e.pointerId != null) { try { __API.els.editPreview.releasePointerCapture(e.pointerId); } catch (_) {} }
    renderEditPreview();
  }

  function resetCrop() {
    __API.state.crop = null;
    renderEditPreview();
    __API.toast('已重置裁剪');
  }

  function setMatBrush(mode) {
    __API.state.matting.mode = __API.state.matting.mode === mode ? 'none' : mode;  // 再点一次取消画笔
    updateMattingUI();
  }

  function updateMattingUI() {
    if (!__API.els.matFg) return;
    __API.els.matFg.textContent = __API.state.matting.mode === 'fg' ? '✓ 前景笔（涂抹中）' : '🖌 前景笔';
    __API.els.matBg.textContent = __API.state.matting.mode === 'bg' ? '✓ 背景笔（涂抹中）' : '🧹 背景笔';
    if (__API.els.matSizeVal) __API.els.matSizeVal.textContent = __API.els.matSize ? __API.els.matSize.value : '';
    const n = __API.state.matting.strokes.fg.length + __API.state.matting.strokes.bg.length;
    if (__API.els.matStatus) {
      if (__API.state.matting.mask) __API.els.matStatus.textContent = '抠图完成 ✅ — 可继续涂抹微调，「清除笔迹」重来。';
      else if (n > 0) __API.els.matStatus.textContent = '已标记 ' + n + ' 笔 — 点「✨ 一键抠图」生成透明蒙版。';
      else __API.els.matStatus.textContent = '未涂抹 — 先在前景/背景画笔中选择一种，在预览图上涂抹标记。';
    }
  }

  function matSamples(sc, bw, bh, fgIdx, bgIdx) {
    const strike = (arr, set) => {
      for (const st of arr) {
        const cx = st.x * bw, cy = st.y * bh;
        const r = __API.clamp(st.r, 0.02, 1) * Math.min(bw, bh);
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(bw - 1, Math.ceil(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(bh - 1, Math.ceil(cy + r));
        const r2 = r * r;
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
          const dx = xx - cx, dy = yy - cy;
          if (dx * dx + dy * dy <= r2) set.add(yy * bw + xx);
        }
      }
    };
    strike(sc.bg, bgIdx);
    strike(sc.fg, fgIdx);
    // 背景样本为空时，自动取图像四边缩进带作背景（便于「一键」）
    if (bgIdx.size === 0) {
      for (let yy = 0; yy < bh; yy++) { bgIdx.add(yy * bw + 0); bgIdx.add(yy * bw + bw - 1); }
      for (let xx = 0; xx < bw; xx++) { bgIdx.add(xx); bgIdx.add((bh - 1) * bw + xx); }
    }
  }

  function matStats(idxIter, n, d) {
    const sum = [0, 0, 0], sum2 = [0, 0, 0];
    let cnt = 0;
    for (const i of idxIter) { cnt++; const k = i << 2; sum[0] += d[k]; sum[1] += d[k + 1]; sum[2] += d[k + 2]; }
    if (cnt === 0) cnt = 1;
    const mu = sum.map((v) => v / cnt);
    for (const i of idxIter) { const k = i << 2; for (let c = 0; c < 3; c++) { const dv = d[k + c] - mu[c]; sum2[c] += dv * dv; } }
    const varArr = sum2.map((v) => Math.max(20, v / cnt));  // 最小方差 20 保证软边
    return { mu, varArr };
  }

  function matSegment(d, bw, bh, fgf, fgb, fgIdx, bgIdx) {
    const a = new Uint8Array(bw * bh);
    const fmu = fgf.mu, fv = fgf.varArr, bmu = fgb.mu, bv = fgb.varArr;
    let anyA = false;
    for (let i = 0; i < bw * bh; i++) {
      const k = i << 2;
      let lf = 0, lb = 0;
      for (let c = 0; c < 3; c++) {
        const dvf = d[k + c] - fmu[c], dvb = d[k + c] - bmu[c];
        lf -= (dvf * dvf) / (2 * fv[c]);
        lb -= (dvb * dvb) / (2 * bv[c]);
      }
      const pf = Math.exp(lf), pb = Math.exp(lb);
      let al = pf / (pf + pb + 1e-9);
      if (fgIdx.has(i)) al = 1;
      if (bgIdx.has(i)) al = 0;
      if (al > 0) anyA = true;
      a[i] = Math.round(al * 255);
    }
    // 边缘感知羽化（引导双边滤波，彩色图引导）：迭代 12 次
    matBilateral(a, d, bw, bh, 12);
    return a;
  }

  function matBilateral(a, d, bw, bh, iters) {
    const tmp = new Uint8Array(bw * bh);
    const sigmaS = Math.max(1.2, Math.min(bw, bh) / 60);
    const spa = Math.exp(-1 / (2 * sigmaS * sigmaS));
    for (let it = 0; it < iters; it++) {
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const idx = y * bw + x, k = idx << 2;
        let acc = 0, wsum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const ni = ny * bw + nx, nk = ni << 2;
          let rng = 1;
          if (d) {
            rng = 1 + 3 * Math.abs(d[k] - d[nk]) / 255 + 3 * Math.abs(d[k + 1] - d[nk + 1]) / 255 + 3 * Math.abs(d[k + 2] - d[nk + 2]) / 255;
            rng = Math.exp(-(rng - 1));
          }
          const w = rng * ((dx === 0 && dy === 0) ? 1 : spa);
          acc += a[ni] * w; wsum += w;
        }
        tmp[idx] = (acc / (wsum || 1));
      }
      a.set(tmp);
    }
  }

  function runMatting() {
    const full = bakeFullCanvas();
    if (!full || !full.getContext) return false;
    const s = __API.state.matting.strokes;
    const MAX = 512;
    const bw = Math.max(16, Math.min(MAX, full.width));
    const bh = Math.max(16, Math.min(MAX, full.height));
    // 工作画布
    const wc = document.createElement('canvas');
    wc.width = bw; wc.height = bh;
    const wctx = wc.getContext && wc.getContext('2d');
    if (!wctx || !wctx.drawImage) return false;
    wctx.drawImage(full, 0, 0, bw, bh);
    let id = null;
    try { id = wctx.getImageData(0, 0, bw, bh); } catch (e) { return false; }
    const d = id.data;
    const fgIdx = new Set(), bgIdx = new Set();
    matSamples(s, bw, bh, fgIdx, bgIdx);
    if (fgIdx.size === 0) { __API.toast('请先用前景笔在主体上涂抹'); updateMattingUI(); return false; }
    const fgf = matStats(fgIdx, fgIdx.size, d);
    const fgb = matStats(bgIdx, bgIdx.size, d);
    __API.state.matting.mask = matSegment(d, bw, bh, fgf, fgb, fgIdx, bgIdx);
    __API.state.matting.mW = bw; __API.state.matting.mH = bh;
    __API.toast('抠图完成 ✅');
    updateMattingUI();
    renderEditPreview();
    return true;
  }

  function clearMatting() {
    __API.state.matting.strokes = { fg: [], bg: [] };
    __API.state.matting.mask = null;
    __API.state.matting.mW = 0; __API.state.matting.mH = 0;
    __API.state.matting.mode = 'none';
    updateMattingUI();
    renderEditPreview();
    __API.toast('已清除抠图笔迹');
  }

  async function exportMatting() {
    const item = __API.state.items[__API.state.index];
    if (!item) return;
    if (!__API.state.matting.mask) { __API.toast('请先执行「一键抠图」'); return; }
    const full = bakeFullCanvas();
    if (!full || !full.getContext || !full.getContext('2d')) return;
    const W = full.width, H = full.height;
    const mm = __API.state.matting.mask, mW = __API.state.matting.mW, mH = __API.state.matting.mH;
    // 全分辨率稀疏蒙版（双线性 + 软边）
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const gy = Math.min(mH - 1, (y * mH / H) | 0);
      const fy = y * mH / H, gy0 = (fy | 0), gy1 = Math.min(mH - 1, gy0 + 1), ty = fy - gy0;
      for (let x = 0; x < W; x++) {
        const fx = x * mW / W, gx0 = (fx | 0), gx1 = Math.min(mW - 1, gx0 + 1), tx = fx - gx0;
        const a00 = mm[gy0 * mW + gx0], a01 = mm[gy0 * mW + gx1],
              a10 = mm[gy1 * mW + gx0], a11 = mm[gy1 * mW + gx1];
        const v = (a00 * (1 - tx) + a01 * tx) * (1 - ty) + (a10 * (1 - tx) + a11 * tx) * ty;
        out[(y * W + x)] = v;
      }
    }
    const oc = document.createElement('canvas');
    oc.width = W; oc.height = H;
    const octx = oc.getContext && oc.getContext('2d');
    if (!octx || !octx.drawImage) return;
    octx.drawImage(full, 0, 0, W, H);
    let od = null;
    try { od = octx.getImageData(0, 0, W, H); } catch (e) { return; }
    const dd = od.data;
    for (let i = 0; i < W * H; i++) dd[(i << 2) + 3] = (dd[(i << 2) + 3] * out[i]) >> 8;
    octx.putImageData(od, 0, 0);
    const blob = await canvasToBlob(oc, 'image/png');
    if (!blob) return;
    const name = stripExt(item.name) + '-透明.png';
    __API.download(blob, name);
    __API.toast('已导出透明 PNG：' + name);
  }

  async function exportCurrent() {
    const item = __API.state.items[__API.state.index];
    if (!item) return;
    try { await loadImage(item); } catch (e) { __API.toast('无法加载图片'); return; }
    let canvas = await exportCanvasOfCurrent();
    if (!canvas) return;
    // 美工烘焙：消除笔（全尺寸 inpaint）→ 马赛克 → 文字 → 边框（OpenCV/AI 之后、编码之前）
    if (__API.state.eraser.length) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        try {
          const full = ctx.getImageData(0, 0, canvas.width, canvas.height);
          drawEraser(ctx, full, canvas.width, canvas.height);
        } catch (e) { /* 跳过 */ }
      }
    }
    if (__API.state.mosaic.length) {
      const ctx = canvas.getContext('2d');
      if (ctx) { try { drawMosaic(ctx, canvas, canvas.width, canvas.height); } catch (e) { /* 跳过 */ } }
    }
    if (__API.state.texts.length) {
      const ctx = canvas.getContext('2d');
      if (ctx) { try { drawTexts(ctx, canvas.width, canvas.height); } catch (e) { /* 跳过 */ } }
    }
    canvas = applyBorder(canvas);
    if (__API.state.ops.length) {
      __API.toast('正在应用 ' + __API.state.ops.length + ' 步高级处理…');
      canvas = await applyPixelOpsAsync(canvas);
      if (!canvas) return;
    }
    const fmt = __API.els.exFormat.value;
    const base = stripExt(item.name) + mimeExt(fmt);
    if (fmt === 'image/bmp') {
      let data; try { data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height); } catch (e) { __API.toast('导出失败：无法读取像素'); return; }
      __API.download(new Blob([encodeBMP(data)], { type: 'image/bmp' }), base);
      __API.toast('已导出 BMP：' + base);
      return;
    }
    const quality = (+__API.els.exQuality.value) / 100;
    canvas.toBlob((blob) => {
      if (!blob) { __API.toast('导出失败'); return; }
      __API.download(blob, base);
      __API.toast('已导出：' + base);
    }, fmt, quality);
  }
  // 注册公共 API
  __API.tempCss = tempCss;
  __API.filterCss = filterCss;
  __API.applyFilters = applyFilters;
  __API.editSnap = editSnap;
  __API.restoreEdit = restoreEdit;
  __API.updateEditUndoButtons = updateEditUndoButtons;
  __API.pushUndo = pushUndo;
  __API.undoEdit = undoEdit;
  __API.redoEdit = redoEdit;
  __API.clearEditHistory = clearEditHistory;
  __API.summarizeSnap = summarizeSnap;
  __API.renderEditTimeline = renderEditTimeline;
  __API.jumpToHistory = jumpToHistory;
  __API.toggleEditHistory = toggleEditHistory;
  __API.needsTone = needsTone;
  __API.tonal = tonal;
  __API.rgbToHsl = rgbToHsl;
  __API.hslToRgb = hslToRgb;
  __API.toneRows = toneRows;
  __API.applyTone = applyTone;
  __API.applyToneChunked = applyToneChunked;
  __API.resetFilters = resetFilters;
  __API.mimeExt = mimeExt;
  __API.bakeFullCanvas = bakeFullCanvas;
  __API.exportCanvasOfCurrent = exportCanvasOfCurrent;
  __API.normToPx = normToPx;
  __API.sharpenCanvas = sharpenCanvas;
  __API.clamp = clamp;
  __API.slimWarp = slimWarp;
  __API.slimDisp = slimDisp;
  __API.bilinear = bilinear;
  __API.slimCanvas = slimCanvas;
  __API.applySlimInPlace = applySlimInPlace;
  __API.updateSlimUI = updateSlimUI;
  __API.setSlimAnchor = setSlimAnchor;
  __API.drawSlimMarker = drawSlimMarker;
  __API.deformMakeKind = deformMakeKind;
  __API.deformForce = deformForce;
  __API.deformBuilders = deformBuilders;
  __API.deformTotalDisp = deformTotalDisp;
  __API.deformCanvas = deformCanvas;
  __API.applyDeformInPlace = applyDeformInPlace;
  __API.updateDeformUI = updateDeformUI;
  __API.addDeform = addDeform;
  __API.clearAllDeform = clearAllDeform;
  __API.resetDeformKind = resetDeformKind;
  __API.setDeformAnchor = setDeformAnchor;
  __API.drawDeformMarkers = drawDeformMarkers;
  __API.autoEnhance = autoEnhance;
  __API.cvProcess = cvProcess;
  __API.upscaleInterp = upscaleInterp;
  __API.loadOrt = loadOrt;
  __API.loadOpenCV = loadOpenCV;
  __API.loadAiSession = loadAiSession;
  __API.aiUpscale = aiUpscale;
  __API.applyPixelOpsAsync = applyPixelOpsAsync;
  __API.updateOpsUI = updateOpsUI;
  __API.resetOps = resetOps;
  __API.onCvBtn = onCvBtn;
  __API.onAiRun = onAiRun;
  __API.applyStylePreset = applyStylePreset;
  __API.renderStyleGrid = renderStyleGrid;
  __API.applyRandomStyle = applyRandomStyle;
  __API.onBeauty = onBeauty;
  __API.oneClickBeauty = oneClickBeauty;
  __API.txtDefaults = txtDefaults;
  __API.addText = addText;
  __API.selTextAt = selTextAt;
  __API.drawTexts = drawTexts;
  __API.delSelText = delSelText;
  __API.drawMosaic = drawMosaic;
  __API.toggleMosaicMode = toggleMosaicMode;
  __API.clearMosaic = clearMosaic;
  __API.toggleEraserMode = toggleEraserMode;
  __API.clearEraser = clearEraser;
  __API.drawEraser = drawEraser;
  __API.renderEditPreview = renderEditPreview;
  __API.drawChecker = drawChecker;
  __API.applyMaskOverlay = applyMaskOverlay;
  __API.drawCropOverlay = drawCropOverlay;
  __API.onPreviewDown = onPreviewDown;
  __API.onPreviewMove = onPreviewMove;
  __API.onPreviewUp = onPreviewUp;
  __API.resetCrop = resetCrop;
  __API.setMatBrush = setMatBrush;
  __API.updateMattingUI = updateMattingUI;
  __API.runMatting = runMatting;
  __API.clearMatting = clearMatting;
  __API.exportMatting = exportMatting;
  __API.patchMatchInpaint = patchMatchInpaint;
  __API.findBestPatch = findBestPatch;
  __API.exportCurrent = exportCurrent;
  __API.syncFilterUI = syncFilterUI;
  __API.syncBeautyBar = syncBeautyBar;
  __API.onExFormatChange = onExFormatChange;
  __API.UNDO_MAX = UNDO_MAX;
  __API.MY_STYLE_KEY = MY_STYLE_KEY;
  __API.MY_STYLE_MAX = MY_STYLE_MAX;
  __API.STYLE_PRESETS = STYLE_PRESETS;
  __API.BEAUTY_PRESETS = BEAUTY_PRESETS;

  // ============ __API__ 公共接口注册 ============
  __API.clamp = clamp;
  __API.tempCss = tempCss;
  __API.filterCss = filterCss;
  __API.applyFilters = applyFilters;
  __API.hexToRgb = hexToRgb;
  __API.smstep = smstep;
  __API.needsTone = needsTone;
  __API.tonal = tonal;
  __API.rgbToHsl = rgbToHsl;
  __API.hslToRgb = hslToRgb;
  __API.gnash = gnash;
  __API.toneRows = toneRows;
  __API.applyTone = applyTone;
  __API.applyToneChunked = applyToneChunked;
  __API.editSnap = editSnap;
  __API.restoreEdit = restoreEdit;
  __API.updateEditUndoButtons = updateEditUndoButtons;
  __API.pushUndo = pushUndo;
  __API.undoEdit = undoEdit;
  __API.redoEdit = redoEdit;
  __API.clearEditHistory = clearEditHistory;
  __API.loadMyStyles = loadMyStyles;
  __API.saveMyStylesList = saveMyStylesList;
  __API.summarizeSnap = summarizeSnap;
  __API.renderMyStyles = renderMyStyles;
  __API.saveCurrentStyle = saveCurrentStyle;
  __API.applyMyStyle = applyMyStyle;
  __API.deleteMyStyle = deleteMyStyle;
  __API.clearAllMyStyles = clearAllMyStyles;
  __API.renderEditTimeline = renderEditTimeline;
  __API.jumpToHistory = jumpToHistory;
  __API.toggleEditHistory = toggleEditHistory;
  __API.syncFilterUI = syncFilterUI;
  __API.syncBeautyBar = syncBeautyBar;
  __API.onExFormatChange = onExFormatChange;
  __API.resetFilters = resetFilters;
  __API.mimeExt = mimeExt;
  __API.bakeFullCanvas = bakeFullCanvas;
  __API.exportCanvasOfCurrent = exportCanvasOfCurrent;
  __API.normToPx = normToPx;
  __API.sharpenCanvas = sharpenCanvas;
  __API.slimWarp = slimWarp;
  __API.slimDisp = slimDisp;
  __API.bilinear = bilinear;
  __API.slimCanvas = slimCanvas;
  __API.applySlimInPlace = applySlimInPlace;
  __API.updateSlimUI = updateSlimUI;
  __API.setSlimAnchor = setSlimAnchor;
  __API.drawSlimMarker = drawSlimMarker;
  __API.deformMakeKind = deformMakeKind;
  __API.deformForce = deformForce;
  __API.deformBuilders = deformBuilders;
  __API.deformTotalDisp = deformTotalDisp;
  __API.deformCanvas = deformCanvas;
  __API.applyDeformInPlace = applyDeformInPlace;
  __API.updateDeformUI = updateDeformUI;
  __API.addDeform = addDeform;
  __API.clearAllDeform = clearAllDeform;
  __API.resetDeformKind = resetDeformKind;
  __API.setDeformAnchor = setDeformAnchor;
  __API.drawDeformMarkers = drawDeformMarkers;
  __API.autoEnhance = autoEnhance;
  __API.initOrtEnv = initOrtEnv;
  __API.loadScript = loadScript;
  __API.loadOpenCV = loadOpenCV;
  __API.loadOrt = loadOrt;
  __API.cvProcess = cvProcess;
  __API.upscaleInterp = upscaleInterp;
  __API.loadAiSession = loadAiSession;
  __API.upscaleSRY = upscaleSRY;
  __API.upscaleNCHW = upscaleNCHW;
  __API.resampleToScale = resampleToScale;
  __API.octxQuality = octxQuality;
  __API.aiUpscale = aiUpscale;
  __API.session0 = session0;
  __API.session1 = session1;
  __API.applyPixelOpsAsync = applyPixelOpsAsync;
  __API.updateOpsUI = updateOpsUI;
  __API.resetOps = resetOps;
  __API.onCvBtn = onCvBtn;
  __API.onAiRun = onAiRun;
  __API.applyStylePreset = applyStylePreset;
  __API.renderStyleGrid = renderStyleGrid;
  __API.applyRandomStyle = applyRandomStyle;
  __API.onBeauty = onBeauty;
  __API.oneClickBeauty = oneClickBeauty;
  __API.txtDefaults = txtDefaults;
  __API.addText = addText;
  __API.selTextAt = selTextAt;
  __API.drawTexts = drawTexts;
  __API.delSelText = delSelText;
  __API.drawMosaic = drawMosaic;
  __API.toggleMosaicMode = toggleMosaicMode;
  __API.clearMosaic = clearMosaic;
  __API.toggleEraserMode = toggleEraserMode;
  __API.clearEraser = clearEraser;
  __API.eraserRadiusNorm = eraserRadiusNorm;
  __API.patchMatchInpaint = patchMatchInpaint;
  __API.findBestPatch = findBestPatch;
  __API.drawEraser = drawEraser;
  __API.renderEditPreview = renderEditPreview;
  __API.drawChecker = drawChecker;
  __API.applyMaskOverlay = applyMaskOverlay;
  __API.drawMatStrokes = drawMatStrokes;
  __API.matBrushRadiusNorm = matBrushRadiusNorm;
  __API.drawCropOverlay = drawCropOverlay;
  __API.previewPoint = previewPoint;
  __API.hitHandle = hitHandle;
  __API.mosaicRadiusNorm = mosaicRadiusNorm;
  __API.onPreviewDown = onPreviewDown;
  __API.onPreviewMove = onPreviewMove;
  __API.onPreviewUp = onPreviewUp;
  __API.resetCrop = resetCrop;
  __API.setMatBrush = setMatBrush;
  __API.updateMattingUI = updateMattingUI;
  __API.matSamples = matSamples;
  __API.matStats = matStats;
  __API.matSegment = matSegment;
  __API.matBilateral = matBilateral;
  __API.runMatting = runMatting;
  __API.clearMatting = clearMatting;
  __API.exportMatting = exportMatting;
  __API.exportCurrent = exportCurrent;
})();
