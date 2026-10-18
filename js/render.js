// js/render.js — 图像渲染 + 缩放/旋转/翻页 + 缩略图
// 依赖：state, els, desktop, editUndo/editRedo, getSetting, showImage, loadImage, resetLoading, showLoadingError, toast, renderInfo, readExif, recordHistory, detectLongImage, renderEditPreview, syncFilterUI, syncBeautyBar, updateSlimUI, updateDeformUI, updateOpsUI, resolveItemSrc, renderThumbWindow, highlightThumb, THUMB_HALF_WIN, extOf, $$
(function() {
  window.__API__ = window.__API__ || {};

  // EXIF orientation → 基变换（顺时针角度 + 缩放因子）；与旧 applyExifOrientation 几何一致
  const ORIENT_CSS = {
    1: { rot: 0, fx: 1, fy: 1 },
    2: { rot: 0, fx: -1, fy: 1 },
    3: { rot: 180, fx: 1, fy: 1 },
    4: { rot: 0, fx: 1, fy: -1 },
    5: { rot: 90, fx: -1, fy: 1 },
    6: { rot: 90, fx: 1, fy: 1 },
    7: { rot: 270, fx: -1, fy: 1 },
    8: { rot: 270, fx: 1, fy: 1 },
  };

  function currentOrient() {
    const it = window.__API__.state.items[window.__API__.state.index];
    return (it && it.exif && it.exif.orientation) || 1;
  }
  function orientSwaps(o) { return o === 5 || o === 6 || o === 7 || o === 8; }
  // 考虑 EXIF orientation 与用户旋转后的屏幕实际尺寸
  function displayDims() {
    const it = window.__API__.state.items[window.__API__.state.index];
    if (!it) return { w: 1, h: 1 };
    let w = it.natW || (it.img ? it.img.naturalWidth : 1);
    let h = it.natH || (it.img ? it.img.naturalHeight : 1);
    if (orientSwaps(currentOrient())) { const t = w; w = h; h = t; }
    if ((window.__API__.state.rotation % 180) !== 0) { const t = w; w = h; h = t; }
    return { w: w || 1, h: h || 1 };
  }

  function detectLongImage(item) {
    const nw = item.natW || (item.img ? item.img.naturalWidth : 0);
    const nh = item.natH || (item.img ? item.img.naturalHeight : 0);
    if (!nw || !nh) { window.__API__.state.isLongImage = false; return; }
    const thr = window.__API__.settings?.view?.longImageThreshold || 1.7;
    window.__API__.state.isLongImage = nh / nw > thr;
    if (window.__API__.state.isLongImage && window.__API__.state.mode === 'fit') {
      window.__API__.state.offsetX = 0; window.__API__.state.offsetY = 0;
      applyTransform(); clampOffset();
    }
  }

  function computeFit() {
    const { w, h } = displayDims();
    if (!w || !h) return;
    const sw = window.__API__.els.stage.clientWidth, sh = window.__API__.els.stage.clientHeight;
    let fit = Math.min(sw / w, sh / h);
    fit = Math.min(fit, 2.5);
    window.__API__.state.fitScale = fit;
  }

  function applyTransform() {
    const oc = ORIENT_CSS[currentOrient()] || ORIENT_CSS[1];
    const sx = window.__API__.state.flipH ? -window.__API__.state.scale : window.__API__.state.scale;
    const sy = window.__API__.state.flipV ? -window.__API__.state.scale : window.__API__.state.scale;
    window.__API__.els.image.style.transform = `translate(${window.__API__.state.offsetX}px, ${window.__API__.state.offsetY}px) rotate(${window.__API__.state.rotation}deg) scale(${sx}, ${sy}) rotate(${oc.rot}deg) scale(${oc.fx}, ${oc.fy})`;
  }
  function applyFit() {
    window.__API__.state.scale = window.__API__.state.fitScale || 1; window.__API__.state.offsetX = 0; window.__API__.state.offsetY = 0; window.__API__.state.mode = 'fit';
    applyTransform(); clampOffset();
  }
  function applyActual() {
    window.__API__.state.scale = 1; window.__API__.state.offsetX = 0; window.__API__.state.offsetY = 0; window.__API__.state.mode = 'actual';
    applyTransform(); clampOffset();
  }
  function clampOffset() {
    const o = currentOrient();
    if ((window.__API__.state.rotation % 180 !== 0) || orientSwaps(o)) return;
    const { w, h } = displayDims();
    const dw = w * window.__API__.state.scale, dh = h * window.__API__.state.scale;
    const sw = window.__API__.els.stage.clientWidth, sh = window.__API__.els.stage.clientHeight;
    if (dw <= sw && dh <= sh) { window.__API__.state.offsetX = 0; window.__API__.state.offsetY = 0; applyTransform(); return; }
    const ox = Math.max(0, (dw - sw) / 2), oy = Math.max(0, (dh - sh) / 2);
    window.__API__.state.offsetX = Math.max(-ox, Math.min(ox, window.__API__.state.offsetX));
    window.__API__.state.offsetY = Math.max(-oy, Math.min(oy, window.__API__.state.offsetY));
    applyTransform();
  }

  function zoomAt(mx, my, newScale) {
    newScale = Math.max(0.05, Math.min(50, newScale));
    const cx = window.__API__.els.stage.clientWidth / 2, cy = window.__API__.els.stage.clientHeight / 2;
    const rot = window.__API__.state.rotation * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const sx = window.__API__.state.flipH ? -window.__API__.state.scale : window.__API__.state.scale;
    const sy = window.__API__.state.flipV ? -window.__API__.state.scale : window.__API__.state.scale;
    const sx2 = window.__API__.state.flipH ? -newScale : newScale;
    const sy2 = window.__API__.state.flipV ? -newScale : newScale;
    const dx = mx - cx, dy = my - cy;
    const ddx = dx - window.__API__.state.offsetX, ddy = dy - window.__API__.state.offsetY;
    const rx = cos * ddx + sin * ddy, ry = -sin * ddx + cos * ddy;
    const px = rx / sx, py = ry / sy;
    const spx = sx2 * px, spy = sy2 * py;
    const rspx = cos * spx - sin * spy, rspy = sin * spx + cos * spy;
    window.__API__.state.offsetX = dx - rspx; window.__API__.state.offsetY = dy - rspy;
    window.__API__.state.scale = newScale; window.__API__.state.mode = 'free';
    applyTransform(); clampOffset(); updateZoomLabel();
  }
  function zoomByCenter(factor) {
    const cx = window.__API__.els.stage.clientWidth / 2, cy = window.__API__.els.stage.clientHeight / 2;
    zoomAt(cx, cy, window.__API__.state.scale * factor);
  }
  function updateZoomLabel() {
    window.__API__.els.btnZoomFit.textContent = Math.round(window.__API__.state.scale * 100) + '%';
  }

  function rotate(dir) {
    window.__API__.state.rotation = (window.__API__.state.rotation + dir * 90 + 360) % 360;
    computeFit();
    if (window.__API__.state.mode === 'fit') applyFit(); else { applyTransform(); clampOffset(); }
    if (window.__API__.els.infoPanel.hidden === false) window.__API__.renderInfo();
    if (!window.__API__.els.editMask.hidden) window.__API__.renderEditPreview();
  }
  function flip(h) {
    if (h) window.__API__.state.flipH = !window.__API__.state.flipH; else window.__API__.state.flipV = !window.__API__.state.flipV;
    applyTransform(); clampOffset();
    if (!window.__API__.els.editMask.hidden) window.__API__.renderEditPreview();
  }

  function next() { window.__API__.state.comicMode ? window.__API__.showImage(window.__API__.state.index + 2) : window.__API__.showImage(window.__API__.state.index + 1); }
  function prev() { window.__API__.state.comicMode ? window.__API__.showImage(window.__API__.state.index - 2) : window.__API__.showImage(window.__API__.state.index - 1); }

  function updateChrome() {
    const has = window.__API__.state.items.length > 0;
    window.__API__.els.navPrev.hidden = !has; window.__API__.els.navNext.hidden = !has;
    window.__API__.els.edgeLeft.hidden = !has; window.__API__.els.edgeRight.hidden = !has;
    window.__API__.els.counter.hidden = !has;
    applyThumbVisibility();
    if (has) window.__API__.els.counter.textContent = (window.__API__.state.index + 1) + ' / ' + window.__API__.state.items.length;
  }

  let fsHideTimer = null;
  function scheduleFsHide() {
    clearTimeout(fsHideTimer);
    if (!document.fullscreenElement) return;
    fsHideTimer = setTimeout(() => {
      if (document.fullscreenElement && window.__API__.state.showThumbs && window.__API__.state.items.length) window.__API__.els.thumbBar.hidden = true;
    }, 3000);
  }
  function applyThumbVisibility() {
    const has = window.__API__.state.items.length > 0;
    clearTimeout(fsHideTimer);
    if (!has) { window.__API__.els.thumbBar.hidden = true; return; }
    if (document.fullscreenElement) {
      if (window.__API__.state.showThumbs) { window.__API__.els.thumbBar.hidden = false; scheduleFsHide(); }
      else { window.__API__.els.thumbBar.hidden = true; }
    } else {
      window.__API__.els.thumbBar.hidden = !window.__API__.state.showThumbs;
    }
  }

  function openJump() {
    if (!window.__API__.state.items.length) return;
    window.__API__.els.jumpInput.hidden = false; window.__API__.els.counter.hidden = true;
    window.__API__.els.jumpInput.value = window.__API__.state.index + 1;
    window.__API__.els.jumpInput.focus(); window.__API__.els.jumpInput.select();
  }
  function closeJump() {
    window.__API__.els.jumpInput.hidden = true; window.__API__.els.counter.hidden = !!(!window.__API__.state.items.length);
    updateChrome();
  }
  function goToIndex(n) {
    const total = window.__API__.state.items.length;
    if (!total) return;
    n = Math.max(1, Math.min(total, Math.floor(n) || 1));
    window.__API__.showImage(n - 1);
  }
  function applyThumbFilter() {
    const q = (window.__API__.els.thumbSearch.value || '').trim().toLowerCase();
    if (window.__API__.state.thumbFilter !== q) {
      window.__API__.state.thumbFilter = q;
      window.__API__.state.thumbWindow = null;
      const targetIdx = window.__API__.state.index >= 0 ? window.__API__.state.index : 0;
      window.__API__.renderThumbWindow(q ? 0 : targetIdx);
      if (q) {
        let shown = 0;
        $$('.thumb').forEach((t) => {
          const it = window.__API__.state.items[+t.dataset.index];
          const hit = !it || !q || it.name.toLowerCase().includes(q);
          t.style.display = hit ? '' : 'none';
          if (hit) shown++;
        });
        window.__API__.els.thumbCount.textContent = shown + ' / ' + window.__API__.state.items.length;
      }
      return;
    }
    let shown = 0;
    $$('.thumb').forEach((t) => {
      const it = window.__API__.state.items[+t.dataset.index];
      const hit = !it || !q || it.name.toLowerCase().includes(q);
      t.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    window.__API__.els.thumbCount.textContent = q ? (shown + ' / ' + window.__API__.state.items.length) : '';
  }

  const THUMB_HALF_WIN = 3;
  function renderThumbWindow(centerIdx) {
    if (!window.__API__.state.items.length) return;
    window.__API__.els.thumbBar.hidden = false;
    const total = window.__API__.state.items.length;
    const center = Math.max(0, Math.min(total - 1, centerIdx));
    const hasFilter = window.__API__.els.thumbSearch && (window.__API__.els.thumbSearch.value || '').trim();
    const start = hasFilter ? 0 : Math.max(0, center - THUMB_HALF_WIN);
    const end = hasFilter ? total - 1 : Math.min(total - 1, center + THUMB_HALF_WIN);
    if (window.__API__.state.thumbWindow && window.__API__.state.thumbWindow.start === start && window.__API__.state.thumbWindow.end === end) {
      window.__API__.highlightThumb(window.__API__.state.index >= 0 ? window.__API__.state.index : center);
      return;
    }
    window.__API__.state.thumbWindow = { start, end };
    const wrap = window.__API__.els.thumbs;
    wrap.innerHTML = '';
    for (let i = start; i <= end; i++) {
      const item = window.__API__.state.items[i];
      const div = document.createElement('div');
      div.className = 'thumb' + (i === window.__API__.state.index ? ' active' : '');
      div.dataset.index = i;
      div.innerHTML = `<span class="t-index">${i + 1}</span><span class="t-fmt">${window.__API__.extOf(item.name)}</span>`;
      div.addEventListener('click', () => window.__API__.showImage(i));
      wrap.appendChild(div);
      if (item.thumbUrl) {
        const im = document.createElement('img'); im.src = item.thumbUrl; div.insertBefore(im, div.firstChild);
      } else {
        setTimeout(() => genThumb(item, div), 0);
      }
    }
    if (hasFilter && typeof window.__API__.applyThumbFilter === 'function') window.__API__.applyThumbFilter();
  }
  function genThumb(item, div) {
    const im = new Image();
    im.onload = () => {
      try {
        const size = 120;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const r = Math.min(im.naturalWidth / size, im.naturalHeight / size) || 1;
        const dw = im.naturalWidth / r, dh = im.naturalHeight / r;
        ctx.drawImage(im, (size - dw) / 2, (size - dh) / 2, dw, dh);
        item.thumbUrl = canvas.toDataURL('image/jpeg', 0.7);
        if (div.isConnected) { const img = document.createElement('img'); img.src = item.thumbUrl; div.insertBefore(img, div.firstChild); }
      } catch (e) {}
    };
    im.onerror = () => {
      if (!window.__API__.desktop.available() || !item.path || item.fallbackThumbTried) return;
      item.fallbackThumbTried = true;
      window.__API__.desktop.invoke('decode_fallback', { path: item.path }).then((url) => {
        if (url) im.src = url;
      }).catch(() => {});
    };
    window.__API__.resolveItemSrc(item).then((src) => { im.src = src; }).catch(() => {});
  }
  function highlightThumb(index) {
    const w = window.__API__.state.thumbWindow;
    if (w && (index < w.start || index > w.end)) {
      window.__API__.renderThumbWindow(index);
      return;
    }
    $$('.thumb').forEach((t) => {
      const active = +t.dataset.index === index;
      t.classList.toggle('active', active);
      if (active && typeof t.scrollIntoView === 'function') t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
  }

  function preloadAround(index) {
    const cap = window.__API__.getSetting('advanced', 'preloadSize') || 20;
    const idxs = [index - 2, index - 1, index + 1, index + 2];
    idxs.forEach((i) => {
      if (i < 0 || i >= window.__API__.state.items.length) return;
      if (window.__API__.state.cache.has(i)) {
        const v = window.__API__.state.cache.get(i); window.__API__.state.cache.delete(i); window.__API__.state.cache.set(i, v); return;
      }
      const it = window.__API__.state.items[i];
      if (it.broken) return;
      if (it.file && it.file.size > 50 * 1024 * 1024) return;
      const img = new Image();
      img.onload = () => { window.__API__.state.cache.set(i, img); trimCache(cap); };
      img.onerror = () => {};
      window.__API__.resolveItemSrc(it).then((src) => { img.src = src; }).catch(() => {});
    });
    trimCache(cap);
  }
  function trimCache(cap) {
    while (window.__API__.state.cache.size > cap) { const k = window.__API__.state.cache.keys().next().value; window.__API__.state.cache.delete(k); }
  }

  // 注册到 API
  window.__API__.ORIENT_CSS = ORIENT_CSS;
  window.__API__.showImage = showImage;
  window.__API__.currentOrient = currentOrient;
  window.__API__.orientSwaps = orientSwaps;
  window.__API__.displayDims = displayDims;
  window.__API__.detectLongImage = detectLongImage;
  window.__API__.computeFit = computeFit;
  window.__API__.applyTransform = applyTransform;
  window.__API__.applyFit = applyFit;
  window.__API__.applyActual = applyActual;
  window.__API__.clampOffset = clampOffset;
  window.__API__.zoomAt = zoomAt;
  window.__API__.zoomByCenter = zoomByCenter;
  window.__API__.updateZoomLabel = updateZoomLabel;
  window.__API__.rotate = rotate;
  window.__API__.flip = flip;
  window.__API__.next = next;
  window.__API__.prev = prev;
  window.__API__.updateChrome = updateChrome;
  window.__API__.scheduleFsHide = scheduleFsHide;
  window.__API__.applyThumbVisibility = applyThumbVisibility;
  window.__API__.openJump = openJump;
  window.__API__.closeJump = closeJump;
  window.__API__.goToIndex = goToIndex;
  window.__API__.applyThumbFilter = applyThumbFilter;
  window.__API__.THUMB_HALF_WIN = THUMB_HALF_WIN;
  window.__API__.renderThumbWindow = renderThumbWindow;
  window.__API__.genThumb = genThumb;
  window.__API__.highlightThumb = highlightThumb;
  window.__API__.preloadAround = preloadAround;
  window.__API__.trimCache = trimCache;

  // showImage 是最大函数，直接 inline 在这里
  function showImage(index, opts) {
    opts = opts || {};
    if (!window.__API__.state.items.length) return;
    const loop = window.__API__.getSetting('view', 'loop');
    if (loop) { index = (index + window.__API__.state.items.length) % window.__API__.state.items.length; }
    else { index = Math.max(0, Math.min(window.__API__.state.items.length - 1, index)); }
    window.__API__.state.index = index;
    const item = window.__API__.state.items[index];

    if (window.__API__.state.comicMode) { return window.__API__.renderDualPage(index); }

    if (!window.__API__.getSetting('view', 'rememberRotation')) {
      window.__API__.state.rotation = 0; window.__API__.state.flipH = false; window.__API__.state.flipV = false;
    }
    window.__API__.state.filters = { brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0, hslH: 0, hslS: 100, hslL: 0 };
    window.__API__.state.slim = { enabled: false, mode: window.__API__.state.slim.mode || 'face', strength: 0, cx: 0.5, cy: 0.5, rx: 0.22, ry: 0.22 };
    window.__API__.state.slimMode = false;
    window.__API__.state.deform = []; window.__API__.state.deformMode = null;
    window.__API__.state.crop = null; window.__API__.state.cropDrag = null;
    window.__API__.state.ops = []; window.__API__.state.logoWm = null;
    window.__API__.state.matting = { mode: 'none', strokes: { fg: [], bg: [] }, mask: null, mW: 0, mH: 0 };
    window.__API__.state.texts = []; window.__API__.state.textSel = null; window.__API__.state.textDrag = null;
    window.__API__.state.mosaic = []; window.__API__.state.mosaicMode = false; window.__API__.state.mosaicPainting = false;
    window.__API__.state.eraser = []; window.__API__.state.eraserMode = false; window.__API__.state.eraserPainting = false;
    window.__API__.editUndo = []; window.__API__.editRedo = [];
    if (window.__API__.els.mosaicBtn) window.__API__.els.mosaicBtn.textContent = '🖌 进入马赛克模式';
    window.__API__.syncFilterUI(); window.__API__.syncBeautyBar();
    if (typeof window.__API__.updateSlimUI === 'function') window.__API__.updateSlimUI();
    if (typeof window.__API__.updateDeformUI === 'function') window.__API__.updateDeformUI();
    if (typeof window.__API__.updateOpsUI === 'function') window.__API__.updateOpsUI();
    window.__API__.state.mode = window.__API__.getSetting('view', 'defaultZoom') === 'actual' ? 'actual' : 'fit';

    window.__API__.els.loading.hidden = false;
    window.__API__.resetLoading();

    const finish = (img) => {
      window.__API__.els.loading.hidden = true;
      window.__API__.els.image.hidden = false;
      window.__API__.desktop.flog('showImage finish hidden=false path=' + String(item.path) + ' urlHead=' + String(item.url).slice(0, 22));
      item.broken = false;
      item.natW = img.naturalWidth || item.natW;
      item.natH = img.naturalHeight || item.natH;
      window.__API__.els.image.src = img.src;
      if (window.__API__.state.slide.active) {}
      else if (opts.fade !== false) { window.__API__.els.image.classList.remove('fade'); void window.__API__.els.image.offsetWidth; window.__API__.els.image.classList.add('fade'); }
      window.__API__.computeFit();
      if (window.__API__.state.mode === 'actual') window.__API__.applyActual();
      else window.__API__.applyFit();
      window.__API__.updateZoomLabel();
      window.__API__.updateChrome();
      window.__API__.highlightThumb(index);
      window.__API__.preloadAround(index);
      if (window.__API__.els.infoPanel.hidden === false) window.__API__.renderInfo();
      if (!item.exif && (item.type === 'image/jpeg' || item.type === 'image/png')) window.__API__.readExif(item);
      window.__API__.recordHistory(item);
      window.__API__.detectLongImage(item);
      if (typeof window.__API__.renderEditPreview === 'function') window.__API__.renderEditPreview();
    };

    const cached = window.__API__.state.cache.get(index);
    if (cached && cached.complete && cached.naturalWidth) { finish(cached); }
    else {
      const loadOrFetch = () => {
        if (!item.url && item.path && window.__API__.desktop.available()) {
          window.__API__.desktop.invoke('get_image_data', { path: item.path }).then((url) => {
            if (!url) { window.__API__.els.image.hidden = true; window.__API__.showLoadingError(item.name); window.__API__.toast('无法加载：' + item.name); return; }
            item.url = url;
            doLoadImage();
          }).catch(() => { window.__API__.els.image.hidden = true; window.__API__.showLoadingError(item.name); window.__API__.toast('无法加载：' + item.name); });
        } else {
          doLoadImage();
        }
      };
      const doLoadImage = () => {
        window.__API__.loadImage(item).then((img) => {
          window.__API__.state.cache.set(index, img);
          if (window.__API__.state.index === index) finish(img);
        }).catch(() => {
          const fail = () => { window.__API__.els.image.hidden = true; window.__API__.desktop.flog('showImage CATCH broken path=' + String(item.path) + ' urlHead=' + String(item.url).slice(0, 22)); item.broken = true; window.__API__.showLoadingError(item.name); window.__API__.toast('无法解码：' + item.name); };
          if (!window.__API__.desktop.available() || !item.path || item.fallbackTried) { fail(); return; }
          item.fallbackTried = true;
          window.__API__.desktop.invoke('decode_fallback', { path: item.path }).then((url) => {
            if (!url) { fail(); return; }
            item.url = url;
            window.__API__.state.cache.delete(index);
            window.__API__.renderThumbWindow(index);
            return window.__API__.loadImage(item).then((img) => { window.__API__.state.cache.set(index, img); if (window.__API__.state.index === index) finish(img); });
          }).catch(fail);
        });
      };
      loadOrFetch();
    }
  }

  // 重新注册 showImage（覆盖前面的）
  window.__API__.showImage = showImage;
})();



