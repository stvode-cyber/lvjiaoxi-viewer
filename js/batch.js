// js/batch.js — 海报 + 水印 + 证件照 + DPI + 批量操作
// 依赖：state/els/settings/desktop（window.__API__ 注入）
(function() {
  'use strict';
  window.__API__ = window.__API__ || {};
  const __API = window.__API__;

  const ID_DPI = 300;

  const ID_MM2PX = (mm) => Math.round(mm / 25.4 * ID_DPI);

  const ID_PHOTO_SIZES = {
    '1inch':   { name: '一寸',     w: 25, h: 35 },
    '2inch':   { name: '二寸',     w: 35, h: 49 },
    's1inch':  { name: '小一寸',   w: 22, h: 32 },
    's2inch':  { name: '小二寸',   w: 35, h: 45 },
    'passport':{ name: '护照签证',  w: 33, h: 48 },
  };

  const ID_CANVAS_SIZES = {
    'A4':     { name: 'A4 纸',      w: 210, h: 297 },
    '6inch':  { name: '6寸照片',    w: 152, h: 102 },
    '5inch':  { name: '5寸照片',    w: 127, h: 89  },
    '4R':     { name: '4R(7寸)',    w: 178, h: 127 },
  };

  const BORDER_PRESETS = {
    none:       { padPct: 0,      bg: '#F5F4F7', rad: 0 },
    white:      { padPct: 0.05,   bg: '#F5F4F7', rad: 0 },
    black:      { padPct: 0.05,   bg: '#1C1C1C', rad: 0 },
    'white-thick': { padPct: 0.15, bg: '#F5F4F7', rad: 0 },
    // 拍立得（底部留白更大，贴照片贴纸效果）
    polaroid:   { padPct: 0.08,   bg: '#FFFFFF', rad: 0.02, bottomExtra: 0.18 },
    // 复古米黄 + 内阴影
    vintage:    { padPct: 0.06,   bg: '#F5EDDC', rad: 0.03, innerShadow: true },
    // 投影边框（悬浮卡片）
    shadow:     { padPct: 0.03,   bg: '#FFFFFF', rad: 0.04, shadowBlurPct: 0.08, shadowColor: 'rgba(0,0,0,0.35)' },
    // 渐变边框（从左下到右上）
    gradient:   { padPct: 0.06,   rad: 0.06, gradient: ['#FF6B6B', '#4ECDC4', '#45B7D1'] },
    // 对角斜角（45° 切角）
    diagonal:   { padPct: 0.08,   bg: '#F5F4F7', rad: 0, cornerCutPct: 0.15 },
  };

  // ============================================================
  let idPhotoResultCanvas = null; // 最近一次生成的排版画布（供导出）

  // ============ 批量处理 ============
  let batchTab = 'convert';
  let batchCancelled = false;

  function borderSpec() {
    const mode = __API.els.borderMode ? __API.els.borderMode.value : 'none';
    const rad = __API.els.borderRadius ? +__API.els.borderRadius.value : 0;
    return { mode, rad };
  }

  function applyBorder(canvas) {
    const { mode, rad } = borderSpec();
    if (mode === 'none' && rad <= 0) return canvas;
    const preset = BORDER_PRESETS[mode] || BORDER_PRESETS.white;
    let padPct = preset.padPct || 0;
    let pad = Math.round(Math.min(canvas.width, canvas.height) * padPct);
    // polaroid 底部额外留白（贴标题/日期）
    if (preset.bottomExtra) pad = Math.round(Math.min(canvas.width, canvas.height) * preset.bottomExtra);
    const out = document.createElement('canvas');
    out.width = canvas.width + pad * 2; out.height = canvas.height + pad;
    const ctx = out.getContext('2d');
    if (!ctx || !ctx.drawImage) return canvas;

    // 背景填充
    if (preset.gradient) {
      const grad = ctx.createLinearGradient(0, 0, out.width, out.height);
      preset.gradient.forEach((c, i) => grad.addColorStop(i / (preset.gradient.length - 1), c));
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = preset.bg || '#F5F4F7';
    }
    ctx.fillRect(0, 0, out.width, out.height);

    // 四角圆角
    const canvasRad = rad > 0 ? Math.round(Math.min(canvas.width, canvas.height) * rad) :
                      preset.rad > 0 ? Math.round(Math.min(canvas.width, canvas.height) * preset.rad) : 0;

    if (mode === 'shadow') {
      // 悬浮卡片效果：圆角 + 外投影
      ctx.save();
      ctx.shadowColor = preset.shadowColor;
      ctx.shadowBlur = Math.round(Math.min(canvas.width, canvas.height) * preset.shadowBlurPct);
      ctx.shadowOffsetX = Math.round(Math.min(canvas.width, canvas.height) * 0.02);
      ctx.shadowOffsetY = Math.round(Math.min(canvas.width, canvas.height) * 0.03);
      ctx.fillStyle = '#FFFFFF';
      roundRectPath(ctx, pad, pad, canvas.width, canvas.height, canvasRad);
      ctx.fill();
      ctx.restore();
      ctx.drawImage(canvas, pad, pad);
    } else if (mode === 'vintage' && preset.innerShadow) {
      // 内阴影：先画原图 + clip 圆角 + 画一层深色圆角矩形做内阴影
      ctx.save();
      roundRectPath(ctx, pad, pad, canvas.width, canvas.height, canvasRad);
      ctx.clip();
      ctx.drawImage(canvas, pad, pad);
      ctx.restore();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = Math.round(Math.min(canvas.width, canvas.height) * 0.04);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 2;
      roundRectPath(ctx, pad, pad, canvas.width, canvas.height, canvasRad);
      ctx.stroke();
      ctx.restore();
    } else if (mode === 'polaroid' || mode === 'diagonal') {
      // 圆角/斜角 clip + 原图
      ctx.save();
      if (canvasRad > 0) {
        roundRectPath(ctx, pad, pad, canvas.width, canvas.height, canvasRad);
      } else if (mode === 'diagonal') {
        const cut = Math.round(Math.min(canvas.width, canvas.height) * (preset.cornerCutPct || 0.15));
        ctx.beginPath();
        ctx.moveTo(pad + cut, pad);                       // 左上切角点
        ctx.lineTo(pad + canvas.width - cut, pad);       // 右上
        ctx.lineTo(pad + canvas.width, pad + cut);       // 右上切角点
        ctx.lineTo(pad + canvas.width, pad + canvas.height - cut); // 右下
        ctx.lineTo(pad + canvas.width - cut, pad + canvas.height); // 右下切角点
        ctx.lineTo(pad + cut, pad + canvas.height);      // 左下
        ctx.lineTo(pad, pad + canvas.height - cut);      // 左下切角点
        ctx.lineTo(pad, pad + cut);                      // 左上
        ctx.closePath();
      }
      if (canvasRad > 0 || mode === 'diagonal') ctx.clip();
      ctx.drawImage(canvas, pad, pad);
      ctx.restore();
    } else {
      // gradient 或普通模式
      if (canvasRad > 0) {
        ctx.save();
        roundRectPath(ctx, pad, pad, canvas.width, canvas.height, canvasRad);
        ctx.clip();
        ctx.drawImage(canvas, pad, pad);
        ctx.restore();
      } else ctx.drawImage(canvas, pad, pad);
    }
    return out;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function initEmojiBar() {
    const bar = __API.els.emojiBar; if (!bar) return;
    bar.innerHTML = '';
    window.__API__.EMOJI_PRESETS.forEach((e) => {
      const btn = document.createElement('button');
      btn.textContent = e;
      btn.style.cssText = 'font-size:18px;border:none;background:transparent;cursor:pointer;padding:2px 4px;border-radius:4px;line-height:1';
      btn.title = e;
      btn.addEventListener('click', () => addSticker(e));
      bar.appendChild(btn);
    });
  }

  function addSticker(emoji) {
    pushUndo();
    const size = __API.els.emojiSize ? +__API.els.emojiSize.value : 8;
    const t = {
      id: 'e' + Date.now() + Math.random().toString(36).slice(2, 6),
      text: emoji,
      x: 0.5, y: 0.5,
      size,
      font: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
      color: '#1c1c1c',
      stroke: 0,
      anchor: 'c',
      type: 'emoji',
    };
    __API.state.texts.push(t);
    __API.state.textSel = t.id;
    renderEditPreview();
  }

  function addImageSticker(img, dataUrl, name) {
    pushUndo();
    const size = __API.els.emojiSize ? +__API.els.emojiSize.value : 8;
    const t = {
      id: 'i' + Date.now() + Math.random().toString(36).slice(2, 6),
      text: name || '贴纸',
      x: 0.5, y: 0.5,
      size,           // 百分比高度（和 emoji 一致）
      font: 'sans-serif',
      color: '#1c1c1c',
      stroke: 0,
      anchor: 'c',
      type: 'image',
      img: img,       // Image 对象（drawImage 用）
      src: dataUrl,   // data URL（持久化用）
    };
    __API.state.texts.push(t);
    __API.state.textSel = t.id;
    renderEditPreview();
    __API.toast('🖼 图片贴纸已添加（可拖拽调整）');
  }

  function clearStickers() {
    pushUndo();
    __API.state.texts = __API.state.texts.filter((t) => t.type !== 'emoji' && t.type !== 'image');
    __API.state.textSel = null;
    renderEditPreview();
    __API.toast('已清空贴纸');
  }

  function buildIdPhotoCanvas(src, sizeKey, canvasKey, padMM, bgColor) {
    const ph = ID_PHOTO_SIZES[sizeKey];
    const ch = ID_CANVAS_SIZES[canvasKey];
    if (!ph || !ch) return null;

    // px 转换
    const pw = ID_MM2PX(ph.w);
    const phh = ID_MM2PX(ph.h);   // 避免和 BORDER_PRESETS 的 'none' 字段冲突
    const cw = ID_MM2PX(ch.w);
    const chh = ID_MM2PX(ch.h);
    const pad = ID_MM2PX(padMM || 2); // 默认 2mm 白边

    // 创建目标 canvas
    const out = document.createElement('canvas');
    out.width = cw; out.height = chh;
    const ctx = out.getContext('2d');
    if (!ctx) return null;

    // 1. 填底色
    ctx.fillStyle = bgColor || '#FFFFFF';
    ctx.fillRect(0, 0, cw, chh);

    // 2. 计算平铺网格（白边间距）
    const cols = Math.floor((cw - pad * 2 + pad) / (pw + pad));
    const rows = Math.floor((chh - pad * 2 + pad) / (phh + pad));
    const total = cols * rows;
    if (cols <= 0 || rows <= 0) return null;

    // 3. 把源图按证件照比例裁剪（短边对齐，居中）
    // 先把源图缩放到 "证件照目标尺寸的倍数"（保证清晰）
    const srcW = src.naturalWidth || src.width;
    const srcH = src.naturalHeight || src.height;

    // 证件照是 portrait（竖版），src 裁剪成相同长宽比
    const targetRatio = pw / phh;
    let sx = 0, sy = 0, sw = srcW, sh = srcH;
    const srcRatio = srcW / srcH;
    if (srcRatio > targetRatio) {
      // 源图太宽 → 裁左右
      sw = srcH * targetRatio;
      sx = (srcW - sw) / 2;
    } else {
      // 源图太矮 → 裁上下
      sh = srcW / targetRatio;
      sy = (srcH - sh) / 2;
    }

    // 4. 循环平铺 drawImage
    const offsetX = pad;
    const offsetY = pad;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dx = offsetX + c * (pw + pad);
        const dy = offsetY + r * (phh + pad);
        try {
          ctx.drawImage(src, sx, sy, sw, sh, dx, dy, pw, phh);
        } catch (e) { /* 某格 drawImage 失败不影响其他格 */ }
      }
    }

    // 5. 可选：画裁切线（虚线灰色，方便打印后裁剪）
    // 为了简洁默认不画，需要再加 UI 开关
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= cols; c++) {
        const x = offsetX + c * (pw + pad) - pad / 2;
        const y = offsetY + r * (phh + pad) - pad / 2;
        ctx.beginPath();
        if (c < cols && r < rows) {
          // 只在格子边界画短线（不画完整线避免太密）
          ctx.moveTo(x + pad / 4, y);
          ctx.lineTo(x + pad * 3 / 4, y);
          ctx.moveTo(x, y + pad / 4);
          ctx.lineTo(x, y + pad * 3 / 4);
        }
      }
    }
    ctx.setLineDash([]);

    // 在右下角标注尺寸信息（小字号，方便后续识别）
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(ph.name + ' ' + ph.w + '×' + ph.h + 'mm  ' + total + '张  @300DPI', cw - 10, chh - 8);

    return { canvas: out, cols, rows, total };
  }

  function renderIdPhotoPreview() {
    if (!__API.els.idPhotoSize) return;
    const item = __API.state.items[__API.state.index];
    if (!item) { __API.toast('请先打开一张照片'); return; }

    const sizeKey = __API.els.idPhotoSize.value;
    const canvasKey = __API.els.idPhotoCanvas.value;
    const padMM = +(__API.els.idPhotoPad?.value || 2);
    const bg = __API.els.idPhotoBg?.value || '#FFFFFF';

    // 用全尺寸烘焙图（包含滤镜/裁剪/旋转）
    const full = bakeFullCanvas();
    if (!full) { __API.toast('无法处理当前图片'); return; }

    const result = buildIdPhotoCanvas(full, sizeKey, canvasKey, padMM, bg);
    if (!result) { __API.toast('排版失败，画布/尺寸不兼容'); return; }

    idPhotoResultCanvas = result.canvas;
    __API.state.idPhotoInfo = { sizeKey, canvasKey, total: result.total };

    // 缩放到 editPreview 大小显示（保持长宽比，居中）
    const canvas = __API.els.editPreview;
    if (!canvas) return;
    const pv = canvas.parentElement;
    if (!pv) return;

    const maxW = (pv.clientWidth || 420) * 0.95;
    const maxH = Math.max(160, Math.round(window.innerHeight * 0.46));
    const ratio = result.canvas.width / result.canvas.height;
    let dispW = maxW, dispH = maxW / ratio;
    if (dispH > maxH) { dispH = maxH; dispW = maxH * ratio; }

    // 设置 canvas 为排版尺寸（这样导出的分辨率就是 300DPI 标准）
    canvas.width = result.canvas.width;
    canvas.height = result.canvas.height;
    canvas.style.width = dispW + 'px';
    canvas.style.height = dispH + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(result.canvas, 0, 0);

    __API.toast('排版预览：' + ID_PHOTO_SIZES[sizeKey].name + ' × ' + ID_CANVAS_SIZES[canvasKey].name + ' = ' + result.total + ' 张');
  }

  function exportIdPhoto() {
    if (!idPhotoResultCanvas) { __API.toast('请先生成排版预览'); return; }
    const info = __API.state.idPhotoInfo || {};
    const fname = '证件照_' + (ID_PHOTO_SIZES[info.sizeKey]?.name || '') + '_' + (ID_CANVAS_SIZES[info.canvasKey]?.name || '') + '_' + Date.now() + '.jpg';

    idPhotoResultCanvas.toBlob((blob) => {
      if (!blob) { __API.toast('导出失败'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
      __API.toast('✅ 已保存 ' + fname);
    }, 'image/jpeg', 0.95);
  }

  function generatePoster() {
    const title = (__API.els.posterTitle.value || '').trim();
    const subtitle = (__API.els.posterSubtitle.value || '').trim();
    const layout = __API.els.posterLayout ? __API.els.posterLayout.value : 'center';
    if (!title && !subtitle) { __API.toast('请至少填写主标题或副标题'); return; }
    pushUndo();
    // 先移除上一个海报生成的文字（type: 'poster'）
    __API.state.texts = __API.state.texts.filter((t) => t.type !== 'poster');
    const makeText = (opts) => ({
      id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6),
      text: opts.text,
      x: opts.x, y: opts.y,
      size: opts.size,
      font: opts.font || '"Microsoft YaHei", sans-serif',
      color: opts.color || '#1c1c1c',
      stroke: opts.stroke || 0,
      anchor: opts.anchor || 'c',
      type: 'poster',
    });
    const posters = [];
    if (layout === 'top') {
      if (title) posters.push(makeText({ text: title, x: 0.5, y: 0.08, size: 8, color: '#FFFFFF', stroke: 4 }));
      if (subtitle) posters.push(makeText({ text: subtitle, x: 0.5, y: 0.92, size: 5, color: '#FFFFFF', stroke: 3 }));
    } else if (layout === 'center') {
      if (title) posters.push(makeText({ text: title, x: 0.5, y: 0.45, size: 10, color: '#1c1c1c' }));
      if (subtitle) posters.push(makeText({ text: subtitle, x: 0.5, y: 0.6, size: 5, color: '#666666' }));
    } else if (layout === 'bottom') {
      if (title) posters.push(makeText({ text: title, x: 0.5, y: 0.85, size: 7, color: '#FFFFFF', stroke: 3 }));
      if (subtitle) posters.push(makeText({ text: subtitle, x: 0.5, y: 0.93, size: 4, color: '#F0F0F0', stroke: 2 }));
    } else if (layout === 'price') {
      if (title) posters.push(makeText({ text: title, x: 0.5, y: 0.3, size: 6, color: '#FF6B6B' }));
      if (subtitle) posters.push(makeText({ text: subtitle, x: 0.5, y: 0.55, size: 14, color: '#FF2D55', font: '"Microsoft YaHei", sans-serif', stroke: 5 }));
      // 装饰线
      posters.push(makeText({ text: '————', x: 0.5, y: 0.7, size: 4, color: '#CCCCCC' }));
    }
    __API.state.texts.push(...posters);
    if (posters.length) __API.state.textSel = posters[0].id;
    renderEditPreview();
    __API.toast('海报文字已生成（可拖拽移动）');
  }

  function openBatch() {
    if (!__API.state.items.length) { __API.toast('请先打开图片'); return; }
    __API.els.batchScope.textContent = '作用范围：全部 ' + __API.state.items.length + ' 张';
    __API.els.batchMask.hidden = false;
    if (__API.els.btPreset && !__API.els.btPreset.options.length) {
      STYLE_PRESETS.forEach((p) => {
        if (p.id === 'none') return;
        const o = document.createElement('option');
        o.value = p.id; o.textContent = p.name;
        __API.els.btPreset.appendChild(o);
      });
    }
    switchBatchTab('convert');
    updateRenamePreview();
  }

  function switchBatchTab(tab) {
    batchTab = tab;
    window.__API__.$$('.batch-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    window.__API__.$$('.batch-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    if (tab === 'rename') updateRenamePreview();
    else if (tab === 'convert') renderCvPreview();
    else if (tab === 'resize') { updateRsUI(); renderRsPreview(); }
    else if (tab === 'tone') renderTonePreview();
    else if (tab === 'compress') { updateCompressUI(); renderCompressPreview(); }
    else if (tab === 'watermark') { updateWmUI(); renderWmPreview(); }
  }

  function updateWmUI() {
    if (__API.els.wmSizeVal) __API.els.wmSizeVal.textContent = __API.els.wmSize.value;
    if (__API.els.wmOpacityVal) __API.els.wmOpacityVal.textContent = __API.els.wmOpacity.value;
    if (__API.els.wmMarginVal) __API.els.wmMarginVal.textContent = __API.els.wmMargin.value;
  }

  function drawWatermarkOnCanvas(ctx, W, H, opts) {
    const text = opts.text || '';
    const img = opts.image;

    // ===== 图片水印（Logo PNG 叠加）=====
    if (img && (img.naturalWidth || img.width)) {
      const sizePct = opts.size !== undefined ? opts.size : 8;       // 短边百分比（Logo 默认比文字大）
      const opacity = opts.opacity !== undefined ? opts.opacity / 100 : 0.8; // Logo 默认更清晰
      const pos = opts.pos || 'br';
      const marginPct = opts.margin !== undefined ? opts.margin / 100 : 0.03;
      const minEdge = Math.min(W, H);
      const margin = Math.max(4, marginPct * minEdge);

      // 目标高度（和文字水印用同样 size 百分比口径）
      const targetH = Math.max(8, sizePct / 100 * minEdge);
      const ratio = (img.naturalWidth || img.width) / (img.naturalHeight || img.height);
      const targetW = targetH * ratio;

      ctx.save();
      ctx.globalAlpha = opacity;

      let dx, dy;
      if (pos === 'tl') { dx = margin; dy = margin; }
      else if (pos === 'tc') { dx = (W - targetW) / 2; dy = margin; }
      else if (pos === 'tr') { dx = W - margin - targetW; dy = margin; }
      else if (pos === 'ml') { dx = margin; dy = (H - targetH) / 2; }
      else if (pos === 'mc') { dx = (W - targetW) / 2; dy = (H - targetH) / 2; }
      else if (pos === 'mr') { dx = W - margin - targetW; dy = (H - targetH) / 2; }
      else if (pos === 'bl') { dx = margin; dy = H - margin - targetH; }
      else if (pos === 'bc') { dx = (W - targetW) / 2; dy = H - margin - targetH; }
      else if (pos === 'br') { dx = W - margin - targetW; dy = H - margin - targetH; }
      else if (pos === 'tile') {
        // 平铺 Logo：每 3 个位置一格，适当缩小
        const tileH = targetH * 0.7;
        const tileW = targetW * 0.7;
        const gapX = tileW * 2.5, gapY = tileH * 2.5;
        ctx.globalAlpha = opacity * 0.4;
        for (let gy = gapY / 2; gy < H; gy += gapY) {
          for (let gx = gapX / 2; gx < W; gx += gapX) {
            ctx.drawImage(img, gx - tileW / 2, gy - tileH / 2, tileW, tileH);
          }
        }
        ctx.restore();
        return ctx;
      }

      // 单点 Logo 叠加（保持长宽比，透明 PNG 天然保留透明区域）
      ctx.drawImage(img, dx, dy, targetW, targetH);
      ctx.restore();
      return ctx;
    }

    // ===== 文字水印（原有逻辑不变）=====
    if (!text) return ctx;
    const sizePct = opts.size !== undefined ? opts.size : 5;      // 短边百分比
    const opacity = opts.opacity !== undefined ? opts.opacity / 100 : 0.6;
    const color = opts.color || '#ffffff';
    const pos = opts.pos || 'br';
    const marginPct = opts.margin !== undefined ? opts.margin / 100 : 0.03;
    const minEdge = Math.min(W, H);
    const fontSize = Math.max(8, sizePct / 100 * minEdge);
    const margin = Math.max(4, marginPct * minEdge);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = fontSize + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(text);
    const tw = metrics.width;
    // 位置计算
    let x, y, anchorX, anchorY;
    if (pos === 'tl') { x = margin; y = margin + fontSize; anchorX = 'left'; anchorY = 'top'; }
    else if (pos === 'tc') { x = W / 2; y = margin + fontSize; anchorX = 'center'; anchorY = 'top'; }
    else if (pos === 'tr') { x = W - margin; y = margin + fontSize; anchorX = 'right'; anchorY = 'top'; }
    else if (pos === 'ml') { x = margin; y = H / 2; anchorX = 'left'; anchorY = 'middle'; }
    else if (pos === 'mc') { x = W / 2; y = H / 2; anchorX = 'center'; anchorY = 'middle'; }
    else if (pos === 'mr') { x = W - margin; y = H / 2; anchorX = 'right'; anchorY = 'middle'; }
    else if (pos === 'bl') { x = margin; y = H - margin; anchorX = 'left'; anchorY = 'bottom'; }
    else if (pos === 'bc') { x = W / 2; y = H - margin; anchorX = 'center'; anchorY = 'bottom'; }
    else if (pos === 'br') { x = W - margin; y = H - margin; anchorX = 'right'; anchorY = 'bottom'; }
    else if (pos === 'tile') { // 平铺
      ctx.globalAlpha = opacity * 0.4;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const gapX = tw * 1.8, gapY = fontSize * 2.2;
      for (let gy = gapY / 2; gy < H; gy += gapY) {
        for (let gx = gapX / 2; gx < W; gx += gapX) {
          // 轻微斜体 + 旋转 -30°
          ctx.save();
          ctx.translate(gx, gy);
          ctx.rotate(-Math.PI / 6);
          ctx.fillStyle = color;
          ctx.fillText(text, 0, 0);
          ctx.restore();
        }
      }
      ctx.restore();
      return ctx;
    }
    // 单点：加描边 + 填充
    ctx.textAlign = anchorX; ctx.textBaseline = anchorY;
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = Math.max(1, fontSize / 14);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
    return ctx;
  }

  async function renderWmPreview() {
    const cv = __API.els.wmPreview, lbl = __API.els.wmPreviewLabel;
    if (!cv || !lbl) return;
    const it = __API.state.items[__API.state.index] || __API.state.items[0];
    const ctx = cv.getContext('2d');
    if (!it || !it.img) { lbl.textContent = '水印预览：无图片'; ctx.clearRect(0, 0, cv.width, cv.height); return; }
    ctx.clearRect(0, 0, cv.width, cv.height);
    // 按比例缩放原图到 200x200 内
    const scale = Math.min(cv.width / it.img.naturalWidth, cv.height / it.img.naturalHeight);
    const dw = it.img.naturalWidth * scale, dh = it.img.naturalHeight * scale;
    const dx = (cv.width - dw) / 2, dy = (cv.height - dh) / 2;
    ctx.drawImage(it.img, dx, dy, dw, dh);
    // 画水印（参数从 DOM 读）
    __API.drawWatermarkOnCanvas(ctx, dw, dh, {
      text: __API.els.wmText ? __API.els.wmText.value : '',
      size: __API.els.wmSize ? +__API.els.wmSize.value : 5,
      opacity: __API.els.wmOpacity ? +__API.els.wmOpacity.value : 60,
      color: __API.els.wmColor ? __API.els.wmColor.value : '#ffffff',
      pos: __API.els.wmPos ? __API.els.wmPos.value : 'br',
      margin: __API.els.wmMargin ? +__API.els.wmMargin.value : 3,
    });
    lbl.textContent = '水印预览：' + it.name;
  }

  async function batchWatermark(it) {
    const fmt = __API.els.wmFormat ? __API.els.wmFormat.value : 'image/jpeg';
    const text = __API.els.wmText ? __API.els.wmText.value.trim() : '';
    if (!text) { __API.toast('请先输入水印文字'); return null; }
    await loadImage(it);
    if (!it.img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = it.img.naturalWidth;
    canvas.height = it.img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(it.img, 0, 0);
    __API.drawWatermarkOnCanvas(ctx, canvas.width, canvas.height, {
      text,
      size: __API.els.wmSize ? +__API.els.wmSize.value : 5,
      opacity: __API.els.wmOpacity ? +__API.els.wmOpacity.value : 60,
      color: __API.els.wmColor ? __API.els.wmColor.value : '#ffffff',
      pos: __API.els.wmPos ? __API.els.wmPos.value : 'br',
      margin: __API.els.wmMargin ? +__API.els.wmMargin.value : 3,
    });
    const mime = fmt === 'image/jpeg' ? 'image/jpeg' : fmt === 'image/webp' ? 'image/webp' : 'image/png';
    const quality = mime === 'image/png' ? undefined : 0.92;
    return new Promise((res) => { canvas.toBlob(res, mime, quality); });
  }

  function updateCompressUI() {
    const f = __API.els.cpFormat ? __API.els.cpFormat.value : 'same';
    __API.els.cpQualityVal.textContent = __API.els.cpQuality.value;
    const lossy = f !== 'image/png';
    __API.els.cpQualityField.hidden = !lossy;
    __API.els.cpQuality.disabled = !lossy;
  }

  async function renderCompressPreview() {
    const cv = __API.els.cpPreview, lbl = __API.els.cpPreviewLabel;
    if (!cv || !lbl) return;
    const it = __API.state.items[__API.state.index] || __API.state.items[0];
    if (!it || !it.img) { lbl.textContent = '压缩预览：无图片'; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    const fmtSel = __API.els.cpFormat ? __API.els.cpFormat.value : 'same';
    const quality = __API.els.cpQuality ? Number(__API.els.cpQuality.value) || 75 : 75;
    const maxEdge = __API.els.cpMaxEdge ? Number(__API.els.cpMaxEdge.value) || 0 : 0;
    const ow = it.img.naturalWidth, oh = it.img.naturalHeight;
    let w = ow, h = oh;
    if (maxEdge > 0 && Math.max(ow, oh) > maxEdge) {
      const s = maxEdge / Math.max(ow, oh);
      w = Math.max(1, Math.round(ow * s));
      h = Math.max(1, Math.round(oh * s));
    }
    const realFmt = fmtSel === 'same' ? mimeFromName(it.name, 'image/jpeg') : fmtSel;
    const fmtName = CP_EXT[realFmt] ? CP_EXT[realFmt].slice(1).toUpperCase() : realFmt;
    try {
      // 缩略预览画布（≤240 边）
      const MAX = 240;
      const s = Math.min(1, MAX / w, MAX / h);
      const pw = Math.max(1, Math.round(w * s)), ph = Math.max(1, Math.round(h * s));
      const pc = document.createElement('canvas');
      pc.width = pw; pc.height = ph;
      const pctx = pc.getContext('2d');
      pctx.drawImage(it.img, 0, 0, pw, ph);
      // 估算输出体积：全目标尺寸重编码到 Blob
      const full = document.createElement('canvas');
      full.width = w; full.height = h;
      full.getContext('2d').drawImage(it.img, 0, 0, w, h);
      const blob = await canvasToBlob(full, realFmt, realFmt === 'image/png' ? undefined : quality);
      const kb = blob && blob.size ? (blob.size / 1024).toFixed(1) : '?';
      cv.width = MAX; cv.height = MAX;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, MAX, MAX);
      ctx.drawImage(pc, (MAX - pw) / 2, (MAX - ph) / 2, pw, ph);
      const lossy = realFmt !== 'image/png';
      lbl.textContent = '压缩预览：' + w + '×' + h + ' · ' + fmtName + (lossy ? ' q' + quality : ' 无损') + ' · 估算 ' + kb + ' KB';
    } catch (e) { lbl.textContent = '压缩预览：渲染失败'; }
  }

  async function renderCvPreview() {
    const cv = __API.els.cvPreview, lbl = __API.els.cvPreviewLabel;
    if (!cv || !lbl) return;
    const it = __API.state.items[__API.state.index] || __API.state.items[0];
    if (!it || !it.img) { lbl.textContent = '转换预览：无图片'; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    const fmt = __API.els.cvFormat ? __API.els.cvFormat.value : 'image/jpeg';
    const q = __API.els.cvQuality ? Number(__API.els.cvQuality.value) || 92 : 92;
    const iw = it.img.naturalWidth, ih = it.img.naturalHeight;
    const fmtLabel = (fmt.split('/')[1] || 'img').toUpperCase();
    try {
      const MAX = 240, s = Math.min(1, MAX / iw, MAX / ih);
      const pw = Math.max(1, Math.round(iw * s)), ph = Math.max(1, Math.round(ih * s));
      cv.width = MAX; cv.height = MAX;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, MAX, MAX);
      ctx.drawImage(it.img, (MAX - pw) / 2, (MAX - ph) / 2, pw, ph);
      // 估算输出体积：整图重编码到工作画布再 toBlob（不能直接对 img 调 toBlob）
      const full = document.createElement('canvas');
      full.width = iw; full.height = ih;
      full.getContext('2d').drawImage(it.img, 0, 0, iw, ih);
      const blob = await canvasToBlob(full, fmt, fmt === 'image/png' ? undefined : q);
      const kb = blob && blob.size ? (blob.size / 1024).toFixed(1) : '?';
      lbl.textContent = '转换预览：' + iw + '×' + ih + ' · ' + fmtLabel + (fmt === 'image/png' ? ' 无损' : ' q' + q) + ' · 估算 ' + kb + ' KB';
    } catch (e) { lbl.textContent = '转换预览：渲染失败'; }
  }

  async function renderRsPreview() {
    const cv = __API.els.rsPreview, lbl = __API.els.rsPreviewLabel;
    if (!cv || !lbl) return;
    const it = __API.state.items[__API.state.index] || __API.state.items[0];
    if (!it || !it.img) { lbl.textContent = '调整尺寸预览：无图片'; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    const iw = it.img.naturalWidth, ih = it.img.naturalHeight;
    let dw, dh;
    if (__API.els.rsMode.value === 'percent') {
      const p = (+__API.els.rsPercent.value) / 100;
      dw = Math.max(1, Math.round(iw * p)); dh = Math.max(1, Math.round(ih * p));
    } else {
      dw = Math.max(1, +__API.els.rsWidth.value || iw);
      dh = __API.els.rsLockRatio.checked ? Math.max(1, Math.round(dw * ih / iw)) : Math.max(1, +__API.els.rsHeight.value || ih);
    }
    const fmt = __API.els.rsFormat.value;
    const fmtLabel = (fmt.split('/')[1] || 'img').toUpperCase();
    try {
      const MAX = 240, s = Math.min(1, MAX / dw, MAX / dh);
      const pw = Math.max(1, Math.round(dw * s)), ph = Math.max(1, Math.round(dh * s));
      const pc = document.createElement('canvas'); pc.width = pw; pc.height = ph;
      const pcx = pc.getContext('2d');
      pcx.imageSmoothingEnabled = (__API.els.rsResample.value !== 'pixelated');
      pcx.drawImage(it.img, 0, 0, pw, ph);
      cv.width = MAX; cv.height = MAX;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, MAX, MAX);
      ctx.drawImage(pc, (MAX - pw) / 2, (MAX - ph) / 2, pw, ph);
      const blob = await canvasToBlob(pc, fmt, fmt === 'image/png' ? undefined : 0.92);
      const kb = blob && blob.size ? (blob.size / 1024).toFixed(1) : '?';
      lbl.textContent = '调整尺寸预览：' + iw + '×' + ih + ' → ' + dw + '×' + dh + ' · ' + fmtLabel + ' · 估算 ' + kb + ' KB';
    } catch (e) { lbl.textContent = '调整尺寸预览：渲染失败'; }
  }

  function updateRsUI() {
    const ex = __API.els.rsMode && __API.els.rsMode.value === 'exact';
    if (__API.els.rsPercentField) __API.els.rsPercentField.hidden = ex;
    if (__API.els.rsExactField) __API.els.rsExactField.hidden = !ex;
  }

  function switchEditTab(tab) {
    window.__API__.$$('.edit-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    window.__API__.$$('.edit-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
  }

  function updateRenamePreview() {
    const tpl = __API.els.rnTemplate.value;
    const box = __API.els.rnPreview; box.innerHTML = '';
    __API.state.items.slice(0, 50).forEach((it, i) => {
      const newName = applyRenameTemplate(tpl, it.name, i);
      const div = document.createElement('div'); div.className = 'rp-row';
      div.innerHTML = `<span class="rp-old">${__API.escapeHtml(it.name)}</span><span class="rp-arrow">→</span><span class="rp-new">${__API.escapeHtml(newName)}</span>`;
      box.appendChild(div);
    });
    if (__API.state.items.length > 50) { const d = document.createElement('div'); d.className = 'rp-row'; d.textContent = '… 共 ' + __API.state.items.length + ' 张'; box.appendChild(d); }
  }

  function applyRenameTemplate(tpl, name, idx) {
    const ext = __API.extOf(name) ? '.' + __API.extOf(name) : '';
    const base = window.__API__.stripExt(name);
    const date = new Date();
    const y = date.getFullYear(), mo = window.__API__.pad(date.getMonth() + 1, 2), d = window.__API__.pad(date.getDate(), 2);
    const today = y + '-' + mo + '-' + d;
    const map = {
      '{name}': base,
      '{n}': String(idx + 1),
      '{n:3}': window.__API__.pad(idx + 1, 3),
      '{date}': today,
      '{date:YYYYMMDD}': '' + y + mo + d,
    };
    let out = tpl.replace(/\{n:3\}|\{n\}|\{name\}|\{date:YYYYMMDD\}|\{date\}/g, (m) => map[m]);
    if (!out.toLowerCase().endsWith(ext.toLowerCase())) out += ext;
    return out;
  }

  async function runBatch() {
    if (!__API.state.items.length) return;
    const items = __API.state.items;
    batchCancelled = false;
    __API.els.batchProgress.hidden = false;
    __API.els.batchReport.hidden = true;
    __API.els.batchCancel.hidden = false;
    __API.els.batchRun.disabled = true;
    const entries = []; // {name, data}
    const n = items.length;
    let fail = 0;
    try {
      for (let i = 0; i < n; i++) {
        if (batchCancelled) break;
        const it = items[i];
        try {
          await loadImage(it);
          let blob = null, name = it.name;
          if (batchTab === 'convert') blob = await batchConvert(it);
          else if (batchTab === 'resize') { blob = await batchResize(it); name = window.__API__.stripExt(it.name) + extFromMime(getSettingResampleFormat()); }
          else if (batchTab === 'rename') { blob = await fileToBlob(it.file); name = applyRenameTemplate(__API.els.rnTemplate.value, it.name, i); }
          else if (batchTab === 'tone') { blob = await batchTone(it, __API.els.btPreset.value, __API.els.btFormat.value); if (__API.els.btKeepName.checked) name = window.__API__.stripExt(it.name) + extFromMime(__API.els.btFormat.value); }
          else if (batchTab === 'compress') { const r = await batchCompress(it); blob = r.blob; name = r.name; }
          else if (batchTab === 'watermark') { blob = await batchWatermark(it); if (blob) name = window.__API__.stripExt(it.name) + extFromMime(__API.els.wmFormat.value); }
          if (blob) entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
          else fail++;
        } catch (err) {
          fail++;
          console.warn('批量项处理失败:', it.name, err);
        }
        const p = Math.round(((i + 1) / n) * 100);
        __API.els.batchBarFill.style.width = p + '%';
        __API.els.batchProgressText.textContent = (i + 1) + ' / ' + n;
      }
      if (entries.length) {
        const zip = makeZip(entries);
        __API.download(new Blob([zip], { type: 'application/zip' }), 'batch_output.zip');
      }
      const summary = '批量' + (batchCancelled ? '已取消' : '完成') + '：成功 ' + entries.length + ' · 失败 ' + fail + ' · 跳过 ' + Math.max(0, n - entries.length - fail) + (entries.length ? '，已下载 ZIP' : '，无文件输出');
      __API.els.batchReport.hidden = false;
      __API.els.batchReport.textContent = summary;
      __API.toast(summary);
    } finally {
      __API.els.batchRun.disabled = false;
      __API.els.batchCancel.hidden = true;
      setTimeout(() => {
        __API.els.batchProgress.hidden = true;
        __API.els.batchBarFill.style.width = '0%';
        __API.els.batchProgressText.textContent = '0 / 0';
        __API.els.batchReport.hidden = true;
      }, 2500);
    }
  }

  function getSettingResampleFormat() { return __API.els.rsFormat.value; }

  function extFromMime(m) { return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[m] || '.img'; }

  async function batchTone(item, presetId, fmt) {
    const preset = STYLE_PRESETS.find((p) => p.id === presetId) || STYLE_PRESETS[0];
    const f = Object.assign({ brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0, hslH: 0, hslS: 100, hslL: 0 }, preset.f);
    const canvas = document.createElement('canvas');
    canvas.width = item.img.naturalWidth; canvas.height = item.img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(item.img, 0, 0);
    const toned = await applyToneChunked(canvas, f);
    if (!toned) throw new Error('滤镜处理失败');
    return new Promise((resolve) => toned.toBlob((b) => resolve(b), fmt, 92));
  }

  function mimeFromName(name, fb) {
    const e = __API.extOf(name).toLowerCase();
    const m = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp' }[e];
    return m || fb;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
  }

  async function batchCompress(item) {
    const fmtSel = __API.els.cpFormat.value;
    const quality = Number(__API.els.cpQuality.value) || 75;
    const maxEdge = Number(__API.els.cpMaxEdge.value) || 0;
    const ow = item.img.naturalWidth, oh = item.img.naturalHeight;
    let w = ow, h = oh;
    if (maxEdge > 0 && Math.max(ow, oh) > maxEdge) {
      const s = maxEdge / Math.max(ow, oh);
      w = Math.max(1, Math.round(ow * s));
      h = Math.max(1, Math.round(oh * s));
    }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(item.img, 0, 0, w, h);
    const realFmt = fmtSel === 'same' ? mimeFromName(item.name, 'image/jpeg') : fmtSel;
    const blob = await canvasToBlob(canvas, realFmt, realFmt === 'image/png' ? undefined : quality);
    let name = item.name;
    if (fmtSel !== 'same') name = window.__API__.stripExt(item.name) + (CP_EXT[realFmt] || '.img');
    return { blob, name };
  }

  async function renderTonePreview() {
    const cv = __API.els.btPreview, lbl = __API.els.btPreviewLabel;
    if (!cv || !lbl) return;
    const it = __API.state.items[__API.state.index] || __API.state.items[0];
    if (!it || !it.img) { lbl.textContent = '滤镜预览：无图片'; return; }
    const p = STYLE_PRESETS.find((q) => q.id === (__API.els.btPreset ? __API.els.btPreset.value : ''));
    if (!p) { lbl.textContent = '滤镜预览：未选中'; return; }
    lbl.textContent = '滤镜预览：「' + p.name + '」';
    const MAX = 240, ctx = cv.getContext('2d');
    const src = it.img; cv.width = MAX; cv.height = MAX;
    try {
      let srcCv = src;
      if (src.naturalWidth > MAX || src.naturalHeight > MAX) {
        const s = Math.min(1, MAX / src.naturalWidth, MAX / src.naturalHeight);
        srcCv = document.createElement('canvas');
        srcCv.width = Math.max(1, Math.round(src.naturalWidth * s));
        srcCv.height = Math.max(1, Math.round(src.naturalHeight * s));
        srcCv.getContext('2d').drawImage(src, 0, 0, srcCv.width, srcCv.height);
      }
      const f = Object.assign({ brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0, hslH: 0, hslS: 100, hslL: 0 }, p.f || {});
      const out = await applyToneChunked(srcCv, f);
      ctx.clearRect(0, 0, MAX, MAX);
      if (out) ctx.drawImage(out, 0, 0, out.width, out.height, (MAX - out.width) / 2, (MAX - out.height) / 2, out.width, out.height);
    } catch (e) { ctx.clearRect(0, 0, MAX, MAX); lbl.textContent = '滤镜预览：渲染失败'; }
  }

  function batchConvert(item) {
    return new Promise((resolve) => {
      const fmt = __API.els.cvFormat.value;
      const canvas = document.createElement('canvas');
      canvas.width = item.img.naturalWidth; canvas.height = item.img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (fmt === 'image/png' || fmt === 'image/webp') ctx.fillStyle = '#F5F4F7';
      if (fmt !== 'image/png') ctx.fillStyle = '#F5F4F7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(item.img, 0, 0);
      const quality = (+__API.els.cvQuality.value) / 100;
      if (fmt === 'image/bmp') {
        let data; try { data = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) { resolve(null); return; }
        resolve(new Blob([encodeBMP(data)], { type: 'image/bmp' }));
      } else {
        canvas.toBlob((b) => resolve(b), fmt, quality);
      }
    });
  }

  function batchResize(item) {
    return new Promise((resolve) => {
      const mode = __API.els.rsMode.value;
      const iw = item.img.naturalWidth, ih = item.img.naturalHeight;
      let dw, dh;
      if (mode === 'percent') {
        const p = (+__API.els.rsPercent.value) / 100;
        dw = Math.max(1, Math.round(iw * p)); dh = Math.max(1, Math.round(ih * p));
      } else {
        dw = Math.max(1, +__API.els.rsWidth.value || iw);
        if (__API.els.rsLockRatio.checked) dh = Math.max(1, Math.round(dw * ih / iw));
        else dh = Math.max(1, +__API.els.rsHeight.value || ih);
      }
      const canvas = document.createElement('canvas'); canvas.width = dw; canvas.height = dh;
      const ctx = canvas.getContext('2d');
      const res = __API.els.rsResample.value;
      ctx.imageSmoothingEnabled = (res !== 'pixelated');
      if (res === 'pixelated') ctx.imageSmoothingEnabled = false;
      if (res === 'high') { ctx.imageSmoothingQuality = 'high'; }
      ctx.drawImage(item.img, 0, 0, dw, dh);
      const fmt = __API.els.rsFormat.value;
      const dpi = (+__API.els.rsDpi.value) || 0;
      canvas.toBlob(async (b) => {
        try { resolve(await embedDpi(b, fmt, dpi)); }
        catch (e) { resolve(b); }
      }, fmt, 0.92);
    });
  }

  function fileToBlob(file) { return file.arrayBuffer ? file.arrayBuffer().then((b) => new Blob([b], { type: file.type })) : fetch(URL.createObjectURL(file)).then((r) => r.blob()); }

  function encodeBMP(imageData) {
    const w = imageData.width, h = imageData.height;
    const rowSize = Math.floor((24 * w + 31) / 32) * 4;
    const fileSize = 54 + rowSize * h;
    const buf = new ArrayBuffer(fileSize);
    const dv = new DataView(buf);
    dv.setUint8(0, 0x42); dv.setUint8(1, 0x4D);
    dv.setUint32(2, fileSize, true);
    dv.setUint32(10, 54, true);
    dv.setUint32(14, 40, true);
    dv.setUint32(18, w, true);
    dv.setUint32(22, h, true);
    dv.setUint16(26, 1, true);
    dv.setUint16(28, 24, true);
    const data = imageData.data;
    let off = 54;
    for (let y = h - 1; y >= 0; y--) {
      let p = y * w * 4;
      for (let x = 0; x < w; x++) {
        dv.setUint8(off++, data[p + 2]);
        dv.setUint8(off++, data[p + 1]);
        dv.setUint8(off++, data[p]);
        p += 4;
      }
      while (off % 4 !== 0) off++;
    }
    return buf;
  }

  function setPngDpi(bytes, dpi) {
    if (!dpi || dpi <= 0) return bytes;
    if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) return bytes;
    const ppm = Math.max(1, Math.round(dpi * 39.37007874));
    const chunk = new Uint8Array(21); // len(4)+type(4)+data(9)+crc(4)
    chunk[0] = 0; chunk[1] = 0; chunk[2] = 0; chunk[3] = 9;          // 数据长度 9
    chunk[4] = 0x70; chunk[5] = 0x48; chunk[6] = 0x59; chunk[7] = 0x73; // 'pHYs'
    chunk[8] = (ppm >>> 24) & 0xFF; chunk[9] = (ppm >>> 16) & 0xFF; chunk[10] = (ppm >>> 8) & 0xFF; chunk[11] = ppm & 0xFF;
    chunk[12] = (ppm >>> 24) & 0xFF; chunk[13] = (ppm >>> 16) & 0xFF; chunk[14] = (ppm >>> 8) & 0xFF; chunk[15] = ppm & 0xFF;
    chunk[16] = 1;                                                    // unit = 米
    const c = crc32(chunk.subarray(4, 17));                          // CRC 覆盖 type+data
    chunk[17] = (c >>> 24) & 0xFF; chunk[18] = (c >>> 16) & 0xFF; chunk[19] = (c >>> 8) & 0xFF; chunk[20] = c & 0xFF;
    const ihdrLen = (bytes[8] << 24) | (bytes[9] << 16) | (bytes[10] << 8) | bytes[11];
    const insertPos = 8 + 12 + ihdrLen;                              // 签名(8) + IHDR 整块(12+len)
    const out = new Uint8Array(bytes.length + chunk.length);
    out.set(bytes.subarray(0, insertPos), 0);
    out.set(chunk, insertPos);
    out.set(bytes.subarray(insertPos), insertPos + chunk.length);
    return out;
  }

  function setJpegDpi(bytes, dpi) {
    if (!dpi || dpi <= 0) return bytes;
    if (bytes.length < 2 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return bytes;
    let pos = 2;
    if (bytes.length >= pos + 4 && bytes[pos] === 0xFF && bytes[pos + 1] === 0xE0) {
      const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
      const isJfif = pos + 4 + 5 <= bytes.length && bytes[pos + 4] === 0x4A && bytes[pos + 5] === 0x46 && bytes[pos + 6] === 0x49 && bytes[pos + 7] === 0x46 && bytes[pos + 8] === 0x00;
      if (isJfif && len >= 16) {
        const p = pos + 4 + 5 + 2; // 跳过 'JFIF\0' + 版本(2)
        bytes[p] = 1; bytes[p + 1] = (dpi >>> 8) & 0xFF; bytes[p + 2] = dpi & 0xFF;
        bytes[p + 3] = (dpi >>> 8) & 0xFF; bytes[p + 4] = dpi & 0xFF;
        return bytes;
      }
    }
    const app0 = new Uint8Array(18);
    app0[0] = 0xFF; app0[1] = 0xE0; app0[2] = 0; app0[3] = 16;       // APP0，长度 16
    app0[4] = 0x4A; app0[5] = 0x46; app0[6] = 0x49; app0[7] = 0x46; app0[8] = 0x00; // 'JFIF\0'
    app0[9] = 0x01; app0[10] = 0x01;                                 // 版本 1.01
    app0[11] = 1;                                                    // 单位=点/英寸
    app0[12] = (dpi >>> 8) & 0xFF; app0[13] = dpi & 0xFF;
    app0[14] = (dpi >>> 8) & 0xFF; app0[15] = dpi & 0xFF;
    app0[16] = 0; app0[17] = 0;                                      // 缩略图 0x0
    const out = new Uint8Array(bytes.length + app0.length);
    out.set(bytes.subarray(0, 2), 0);
    out.set(app0, 2);
    out.set(bytes.subarray(2), 2 + app0.length);
    return out;
  }

  function buildExifTiff(dpi) {
    const t = new Uint8Array(66);
    const dv = new DataView(t.buffer);
    dv.setUint16(0, 0x4949, true);   // 'II' 小端
    dv.setUint16(2, 0x002A, true);   // 42
    dv.setUint32(4, 8, true);        // IFD0 偏移 = 8
    dv.setUint16(8, 3, true);        // IFD0 条目数 = 3
    const writeEntry = (off, tag, type, count, val) => { dv.setUint16(off, tag, true); dv.setUint16(off + 2, type, true); dv.setUint32(off + 4, count, true); dv.setUint32(off + 8, val, true); };
    writeEntry(10, 0x011A, 5, 1, 50);  // XResolution (RATIONAL, 指向数据区 50)
    writeEntry(22, 0x011B, 5, 1, 58);  // YResolution (RATIONAL, 指向数据区 58)
    writeEntry(34, 0x0128, 3, 1, 2);   // ResolutionUnit = 2 (英寸)
    dv.setUint32(46, 0, true);       // 下一个 IFD = 0
    dv.setUint32(50, dpi, true); dv.setUint32(54, 1, true); // X = dpi/1
    dv.setUint32(58, dpi, true); dv.setUint32(62, 1, true); // Y = dpi/1
    return t;
  }

  function setWebpDpi(bytes, dpi) {
    if (!dpi || dpi <= 0) return bytes;
    if (bytes.length < 12 || bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return bytes; // RIFF
    if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return bytes; // WEBP
    const tiff = buildExifTiff(dpi);
    const payload = new Uint8Array(6 + tiff.length);
    payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0); // 'Exif\0\0'
    payload.set(tiff, 6);
    const bodyLen = payload.length;
    const chunk = new Uint8Array(8 + bodyLen + (bodyLen & 1)); // 偶数字节填充
    chunk.set([0x45, 0x58, 0x49, 0x46], 0); // 'EXIF'
    chunk[4] = bodyLen & 0xFF; chunk[5] = (bodyLen >>> 8) & 0xFF; chunk[6] = (bodyLen >>> 16) & 0xFF; chunk[7] = (bodyLen >>> 24) & 0xFF;
    chunk.set(payload, 8);
    // 查找已存在的 EXIF 块以便替换，否则插入到第一个块之前
    let pos = 12, exifStart = -1, exifEnd = -1;
    while (pos + 8 <= bytes.length) {
      const fourcc = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
      const size = (bytes[pos + 4] | (bytes[pos + 5] << 8) | (bytes[pos + 6] << 16) | (bytes[pos + 7] << 24)) >>> 0;
      const bodyEnd = pos + 8 + size + (size & 1);
      if (fourcc === 'EXIF') { exifStart = pos; exifEnd = bodyEnd; break; }
      if (bodyEnd > bytes.length) break;
      pos = bodyEnd;
    }
    let out;
    if (exifStart >= 0) {
      out = new Uint8Array(bytes.length - (exifEnd - exifStart) + chunk.length);
      out.set(bytes.subarray(0, exifStart), 0);
      out.set(chunk, exifStart);
      out.set(bytes.subarray(exifEnd), exifStart + chunk.length);
    } else {
      const at = 12;
      out = new Uint8Array(bytes.length + chunk.length);
      out.set(bytes.subarray(0, at), 0);
      out.set(chunk, at);
      out.set(bytes.subarray(at), at + chunk.length);
    }
    const fileSize = out.length - 8;
    out[4] = fileSize & 0xFF; out[5] = (fileSize >>> 8) & 0xFF; out[6] = (fileSize >>> 16) & 0xFF; out[7] = (fileSize >>> 24) & 0xFF;
    return out;
  }

  async function embedDpi(blob, fmt, dpi) {
    if (!blob || !dpi || dpi <= 0) return blob;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let out;
    if (fmt === 'image/png') out = setPngDpi(bytes, dpi);
    else if (fmt === 'image/jpeg') out = setJpegDpi(bytes, dpi);
    else if (fmt === 'image/webp') out = setWebpDpi(bytes, dpi);
    else return blob;
    return new Blob([out], { type: fmt });
  }

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = window.__API__.CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function makeZip(entries) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const dosTime = 0, dosDate = (10 << 5) | 1; // 简单日期
    entries.forEach((e) => {
      const nameBytes = enc.encode(e.name);
      const crc = crc32(e.data);
      const size = e.data.length;
      const local = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true);
      lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      chunks.push(local, e.data);
      // central
      const cent = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cent.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint16(38, 0, true);
      cv.setUint32(42, offset, true);
      cent.set(nameBytes, 46);
      central.push(cent);
      offset += local.length + e.data.length;
    });
    const centralSize = central.reduce((s, c) => s + c.length, 0);
    const centralOffset = offset;
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true); ev.setUint32(16, centralOffset, true);
    ev.setUint16(20, 0, true);
    const all = [].concat(chunks, central, [end]);
    return concatBytes(all);
  }

  function concatBytes(arrs) {
    let total = 0; arrs.forEach((a) => total += a.length);
    const out = new Uint8Array(total);
    let p = 0;
    arrs.forEach((a) => {
      // a 可能是 Uint8Array 或 ArrayBuffer-backed；统一为 Uint8Array
      const u = a instanceof Uint8Array ? a : new Uint8Array(a);
      out.set(u, p); p += u.length;
    });
    return out;
  }
  // 注册公共 API
  __API.borderSpec = borderSpec;
  __API.applyBorder = applyBorder;
  __API.roundRectPath = roundRectPath;
  __API.initEmojiBar = initEmojiBar;
  __API.addSticker = addSticker;
  __API.addImageSticker = addImageSticker;
  __API.clearStickers = clearStickers;
  __API.buildIdPhotoCanvas = buildIdPhotoCanvas;
  __API.renderIdPhotoPreview = renderIdPhotoPreview;
  __API.exportIdPhoto = exportIdPhoto;
  __API.generatePoster = generatePoster;
  __API.openBatch = openBatch;
  __API.switchBatchTab = switchBatchTab;
  __API.switchEditTab = switchEditTab;
  __API.updateWmUI = updateWmUI;
  __API.updateCompressUI = updateCompressUI;
  __API.drawWatermarkOnCanvas = drawWatermarkOnCanvas;
  __API.renderWmPreview = renderWmPreview;
  __API.batchWatermark = batchWatermark;
  __API.renderCvPreview = renderCvPreview;
  __API.renderRsPreview = renderRsPreview;
  __API.updateRsUI = updateRsUI;
  __API.updateRenamePreview = updateRenamePreview;
  __API.applyRenameTemplate = applyRenameTemplate;
  __API.runBatch = runBatch;
  __API.batchTone = batchTone;
  __API.batchCompress = batchCompress;
  __API.renderTonePreview = renderTonePreview;
  __API.batchConvert = batchConvert;
  __API.batchResize = batchResize;
  __API.canvasToBlob = canvasToBlob;
  __API.encodeBMP = encodeBMP;
  __API.setPngDpi = setPngDpi;
  __API.setJpegDpi = setJpegDpi;
  __API.setWebpDpi = setWebpDpi;
  __API.embedDpi = embedDpi;
  __API.buildExifTiff = buildExifTiff;
  __API.renderCompressPreview = renderCompressPreview;
  __API.switchEditTab = switchEditTab;
  __API.makeZip = makeZip;
  __API.crc32 = crc32;
  __API.concatBytes = concatBytes;
  __API.getSettingResampleFormat = getSettingResampleFormat;
  __API.extFromMime = extFromMime;
  __API.mimeFromName = mimeFromName;
  __API.fileToBlob = fileToBlob;
  __API.batchTab = batchTab;
  __API.batchCancelled = batchCancelled;
  __API.idPhotoResultCanvas = idPhotoResultCanvas;
  __API.ID_DPI = ID_DPI;
  __API.ID_MM2PX = ID_MM2PX;
  __API.ID_PHOTO_SIZES = ID_PHOTO_SIZES;
  __API.ID_CANVAS_SIZES = ID_CANVAS_SIZES;
  __API.BORDER_PRESETS = BORDER_PRESETS;

  // ============ __API__ 公共接口注册 ============
  __API.borderSpec = borderSpec;
  __API.applyBorder = applyBorder;
  __API.roundRectPath = roundRectPath;
  __API.initEmojiBar = initEmojiBar;
  __API.addSticker = addSticker;
  __API.addImageSticker = addImageSticker;
  __API.clearStickers = clearStickers;
  __API.buildIdPhotoCanvas = buildIdPhotoCanvas;
  __API.renderIdPhotoPreview = renderIdPhotoPreview;
  __API.exportIdPhoto = exportIdPhoto;
  __API.generatePoster = generatePoster;
  __API.openBatch = openBatch;
  __API.switchBatchTab = switchBatchTab;
  __API.updateWmUI = updateWmUI;
  __API.drawWatermarkOnCanvas = drawWatermarkOnCanvas;
  __API.renderWmPreview = renderWmPreview;
  __API.batchWatermark = batchWatermark;
  __API.updateCompressUI = updateCompressUI;
  __API.renderCompressPreview = renderCompressPreview;
  __API.renderCvPreview = renderCvPreview;
  __API.renderRsPreview = renderRsPreview;
  __API.updateRsUI = updateRsUI;
  __API.switchEditTab = switchEditTab;
  __API.updateRenamePreview = updateRenamePreview;
  __API.applyRenameTemplate = applyRenameTemplate;
  __API.runBatch = runBatch;
  __API.getSettingResampleFormat = getSettingResampleFormat;
  __API.extFromMime = extFromMime;
  __API.batchTone = batchTone;
  __API.mimeFromName = mimeFromName;
  __API.canvasToBlob = canvasToBlob;
  __API.batchCompress = batchCompress;
  __API.renderTonePreview = renderTonePreview;
  __API.batchConvert = batchConvert;
  __API.batchResize = batchResize;
  __API.fileToBlob = fileToBlob;
  __API.encodeBMP = encodeBMP;
  __API.setPngDpi = setPngDpi;
  __API.setJpegDpi = setJpegDpi;
  __API.buildExifTiff = buildExifTiff;
  __API.setWebpDpi = setWebpDpi;
  __API.embedDpi = embedDpi;
  __API.crc32 = crc32;
  __API.makeZip = makeZip;
  __API.concatBytes = concatBytes;
})();
