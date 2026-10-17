// js/init.js — 初始化 + 设置 + 主题 + 双页漫画 + cacheDom + init()
// 依赖：state, els, desktop, toast, showImage, renderThumbWindow, updateChrome, isLoggedIn, pushSettings, syncFilterUI, syncBeautyBar, updateSlimUI, updateDeformUI, updateOpsUI, renderRecentInline, registerServiceWorker, initAuth, refreshAccountUI, renderFavList, renderHistList, flushQueue, isHeicItem, decodeHeicToUrl
(function() {
  window.__API__ = window.__API__ || {};

  // ============ 工具函数 ============
  function naturalCompare(a, b) {
    const ra = /(\d+)/g, rb = /(\d+)/g; let ma, mb, x, y;
    while (true) {
      ma = ra.exec(a); mb = rb.exec(b);
      if (!ma && !mb) return a < b ? -1 : a > b ? 1 : 0;
      if (!ma) return -1; if (!mb) return 1;
      x = a.slice(0, ma.index) || ''; y = b.slice(0, mb.index) || '';
      if (x !== y) return x < y ? -1 : 1;
      if (+ma[1] !== +mb[1]) return +ma[1] - +mb[1];
    }
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  let toastTimer = null;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function showLoadingError(name) {
    const l = window.__API__.els.loading;
    if (!l) return;
    l.classList.add('is-error');
    const t = l.querySelector('.loading-text');
    if (t) t.textContent = '解码失败：' + name;
  }
  function resetLoading() {
    window.__API__.els.loading.classList.remove('is-error');
    const t = window.__API__.els.loading.querySelector('.loading-text');
    if (t) t.textContent = '解码中…';
  }

  // ============ 设置 ============
  const SETTINGS_KEY = 'qjviewer_settings_v1';
  const DEFAULT_SETTINGS = {
    general: { openLastFolder: false, closeBehavior: 'exit', minimizeToTray: false, autoStart: false },
    view: { defaultZoom: 'fit', wheelMode: 'zoom', loop: true, rememberRotation: false, renderMode: 'smooth', wallpaperMode: 'fit', recursive: true },
    slideshow: { interval: 5, transition: 'fade', order: 'forward' },
    files: { recursive: true, menuText: '用绿角犀看图打开' },
    advanced: { preloadSize: 20, autoUpdate: true, cloudApiBase: '', cvUrl: '', aiModelUrl: '' },
  };
  const SETTINGS_SCHEMA = [
    { group: 'general', key: 'openLastFolder', label: '启动时打开上次文件夹', desc: 'Web 原型下无法自动打开，需桌面版', type: 'toggle' },
    { group: 'general', key: 'closeBehavior', label: '关闭按钮行为（托盘需桌面版）', type: 'select', options: [['exit', '退出程序'], ['tray', '最小化到托盘（需桌面版）']] },
    { group: 'general', key: 'minimizeToTray', label: '最小化到系统托盘（需桌面版）', type: 'toggle' },
    { group: 'general', key: 'autoStart', label: '开机自启动（需桌面版）', type: 'toggle' },
    { group: 'view', key: 'defaultZoom', label: '默认缩放模式', type: 'select', options: [['fit', '适应窗口'], ['actual', '实际大小']] },
    { group: 'view', key: 'wheelMode', label: '滚轮行为', desc: '缩放 = 滚轮缩放，Ctrl+滚轮翻页；翻页 = 反之', type: 'select', options: [['zoom', '缩放（Ctrl+滚轮翻页）'], ['page', '翻页（Ctrl+滚轮缩放）']] },
    { group: 'view', key: 'loop', label: '翻页循环', type: 'toggle' },
    { group: 'view', key: 'rememberRotation', label: '记住旋转状态', type: 'toggle' },
    { group: 'view', key: 'renderMode', label: '放大渲染模式', type: 'select', options: [['smooth', '平滑'], ['pixelated', '像素化']] },
    { group: 'view', key: 'wallpaperMode', label: '设为壁纸模式（Web 下载）', desc: 'Web 原型无法设置系统壁纸，按所选模式合成后下载', type: 'select', options: [['fit', '适应（留边）'], ['fill', '拉伸（铺满）'], ['center', '居中'], ['tile', '平铺']] },
    { group: 'slideshow', key: 'interval', label: '默认间隔（秒）', type: 'range', min: 1, max: 20, step: 1 },
    { group: 'slideshow', key: 'transition', label: '转场特效', type: 'select', options: [['fade', '淡入淡出'], ['left', '左滑'], ['right', '右滑'], ['up', '上滑'], ['down', '下滑'], ['zoom', '缩放'], ['none', '无']] },
    { group: 'slideshow', key: 'order', label: '播放顺序', type: 'select', options: [['forward', '正序'], ['reverse', '倒序'], ['random', '随机']] },
    { group: 'files', key: 'recursive', label: '递归子文件夹', type: 'toggle' },
    { group: 'files', key: 'menuText', label: '右键菜单文字', desc: 'Web 原型下仅作记录，需桌面版写入注册表', type: 'text' },
    { group: 'advanced', key: 'preloadSize', label: '预加载缓存大小（张）', type: 'range', min: 5, max: 50, step: 1 },
    { group: 'advanced', key: 'autoUpdate', label: '自动检查更新（需桌面版）', type: 'toggle' },
    { group: 'advanced', key: 'cloudApiBase', label: '云端账户服务器地址', desc: '留空使用本地 mock（http://localhost:8787）；接真实后端时填写其地址', type: 'text' },
    { group: 'advanced', key: 'cvUrl', label: 'OpenCV.js 地址', desc: '图片工具「高级处理」的 opencv.js 地址，留空用默认 docs.opencv.org', type: 'text' },
    { group: 'advanced', key: 'aiModelUrl', label: '自定义 AI 超分模型地址（.onnx）', desc: '留空使用内置轻量离线模型（离线真·AI）；自定义需符合约定输入 1×3×H×W float32', type: 'text' },
  ];
  const GROUP_LABELS = { general: '通用', view: '看图', slideshow: '幻灯片', files: '文件关联', advanced: '高级', shortcuts: '快捷键', manual: '使用说明', about: '关于' };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      const saved = JSON.parse(raw);
      const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      for (const g in saved) for (const k in saved[g]) if (g in merged && k in merged[g]) merged[g][k] = saved[g][k];
      return merged;
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(window.__API__.settings)); } catch (e) {}
    if (typeof window.__API__.isLoggedIn === 'function' && window.__API__.isLoggedIn()) window.__API__.pushSettings();
  }
  function getSetting(group, key) { return window.__API__.settings[group] ? window.__API__.settings[group][key] : undefined; }

  // ============ 深色主题（2026-10-17 · S2） ============
  const THEME_KEY = 'qjviewer_theme_v1';
  function applyTheme(t) {
    const isDark = t === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const btn = window.__API__.els.btnTheme;
    if (btn) btn.textContent = isDark ? '🌙' : '🌞';
  }
  function loadTheme() {
    try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  }
  function toggleTheme() {
    const next = loadTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    window.__API__.applyTheme(next);
  }

  // ============ 双页漫画模式（2026-10-17 · A2） ============
  const COMIC_KEY = 'qjviewer_comic_v1';
  function applyComicMode(on) {
    window.__API__.state.comicMode = !!on;
    const show = !!window.__API__.state.archivePath && !!on;
    if (window.__API__.els.dualStage) window.__API__.els.dualStage.hidden = !show;
    if (window.__API__.els.imgWrap) window.__API__.els.imgWrap.hidden = show;
    if (window.__API__.els.btnComicMode) {
      window.__API__.els.btnComicMode.hidden = !window.__API__.state.archivePath;
      window.__API__.els.btnComicMode.classList.toggle('active', !!on);
    }
  }
  function toggleComicMode() {
    if (!window.__API__.state.archivePath) { window.__API__.toast('📖 双页模式仅在压缩包浏览时可用'); return; }
    const next = !window.__API__.state.comicMode;
    try { localStorage.setItem(COMIC_KEY, next ? '1' : '0'); } catch {}
    window.__API__.applyComicMode(next);
    if (next && window.__API__.state.index % 2 !== 0) { window.__API__.state.index = window.__API__.state.index - 1; }
    window.__API__.showImage(window.__API__.state.index);
  }
  function renderDualPage(index) {
    window.__API__.els.loading.hidden = false;
    const leftItem = window.__API__.state.items[index];
    const rightItem = window.__API__.state.items[index + 1] || null;
    const loadOne = (item, imgEl) => {
      if (!item) { imgEl.hidden = true; imgEl.removeAttribute('src'); return; }
      window.__API__.resolveItemSrc(item).then((url) => {
        imgEl.hidden = false;
        imgEl.src = url;
      }).catch((e) => { imgEl.hidden = true; });
    };
    loadOne(leftItem, window.__API__.els.imageLeft);
    if (rightItem) loadOne(rightItem, window.__API__.els.imageRight);
    else { window.__API__.els.imageRight.hidden = true; window.__API__.els.imageRight.removeAttribute('src'); }
    window.__API__.els.loading.hidden = true;
    window.__API__.updateChrome();
    window.__API__.highlightThumb(index);
    if (window.__API__.state.slide.active) { window.__API__.state.slide.pendingNext = false; window.__API__.startSlideshow(); }
  }

  // ============ cacheDom ============
  function cacheDom() {
    const ids = [
      'btnOpenFiles', 'btnOpenDir', 'fileInput', 'dirInput',
      'btnZoomOut', 'btnZoomFit', 'btnZoomIn', 'btnRotL', 'btnRotR', 'btnFlipH', 'btnFlipV',
      'btnCopy', 'btnEdit', 'btnBeauty', 'btnInfo', 'btnTheme', 'btnSlide', 'btnBatch', 'btnComicMode', 'btnSettings', 'btnFull',
      'btnSnap', 'btnUndo', 'btnRedo',
      'viewer', 'stage', 'image', 'imgWrap', 'dualStage', 'imageLeft', 'imgWrapLeft', 'imageRight', 'imgWrapRight', 'emptyHint', 'loading',
      'navPrev', 'navNext', 'edgeLeft', 'edgeRight', 'counter', 'jumpInput',
      'thumbBar', 'thumbs', 'thumbSearch', 'thumbCount',
      'beautyBar', 'bottomNav',
      'infoPanel', 'infoClose', 'infoBody',
      'ctxMenu',
      'settingsMask', 'settingsClose', 'settingsNav', 'settingsForm', 'settingsReset',
      'batchMask', 'batchClose', 'batchScope', 'batchTabs', 'batchBody',
      'cvQuality', 'cvQualityVal', 'cvNaming', 'cvOutput', 'cvFormat', 'cvQualityField', 'cvPreview', 'cvPreviewLabel',
      'rsMode', 'rsPercent', 'rsPercentVal', 'rsPercentField', 'rsExactField', 'rsWidth', 'rsHeight', 'rsLockRatio', 'rsResample', 'rsFormat', 'rsDpi', 'rsPreview', 'rsPreviewLabel',
      'rnTemplate', 'rnPreview', 'batchProgress', 'batchBarFill', 'batchProgressText', 'batchRun', 'batchCancel', 'batchReport', 'btPreset', 'btFormat', 'btKeepName', 'btPreview', 'btPreviewLabel',
      'cpFormat', 'cpQuality', 'cpQualityVal', 'cpQualityField', 'cpMaxEdge', 'cpPreview', 'cpPreviewLabel', 'wmText', 'wmSize', 'wmSizeVal', 'wmOpacity', 'wmOpacityVal', 'wmColor', 'wmPos', 'wmMargin', 'wmMarginVal', 'wmFormat', 'wmPreview', 'wmPreviewLabel', 'wmPresetCopyright', 'wmPresetPhotographer',
      'aboutMask', 'aboutClose', 'aboutBody',
      'editMask', 'editClose', 'editName', 'editPreview', 'cropReset',
      'flBrightness', 'flBrightnessVal', 'flContrast', 'flContrastVal', 'flSaturate', 'flSaturateVal', 'flGray', 'flGrayVal', 'flReset', 'flAdvancedToggle',
      'flTemp', 'flTempVal', 'flHslH', 'flHslHVal', 'flHslS', 'flHslSVal', 'flHslL', 'flHslLVal', 'flBlur', 'flBlurVal', 'flSharp', 'flSharpVal',
      'flHighlight', 'flHighlightVal', 'flShadow', 'flShadowVal', 'flFade', 'flFadeVal', 'flGrain', 'flGrainVal', 'flVignette', 'flVignetteVal', 'flTintH', 'flTintS', 'flTintAmt', 'flTintAmtVal',
      'btnAutoEnhance', 'cvDenoise', 'cvBilateral', 'cvSharp', 'opsReset', 'aiScale', 'aiRun',
      'styleGrid', 'beautyVal', 'beautyValVal', 'beautySmooth', 'beautyWhite',
      'borderMode', 'borderRadius', 'emojiBar', 'emojiSize', 'emojiSizeVal', 'emojiClear', 'stickerUploadBtn', 'stickerUpload', 'posterTitle', 'posterSubtitle', 'posterLayout', 'posterGenerate', 'idPhotoSize', 'idPhotoCanvas', 'idPhotoPad', 'idPhotoBg', 'idPhotoGen', 'idPhotoExport', 'idPhotoReset', 'idPhotoInfo', 'logoWmUploadBtn', 'logoWmUpload', 'logoWmStatus', 'logoWmSize', 'logoWmSizeVal', 'logoWmOpacity', 'logoWmOpacityVal', 'logoWmPos', 'logoWmClear', 'gifFps', 'gifLoop', 'gifWidth', 'gifQuality', 'gifQuantize', 'gifEncode', 'gifCancel', 'gifStatus', 'gifPreview', 'gifPresetWeChat', 'gifPresetVideo', 'gifPresetMeme', 'idPhotoPresetStandard', 'idPhotoPresetPassport',
      'txtInput', 'txtAdd', 'txtFont', 'txtColor', 'txtSize', 'txtSizeVal', 'txtStroke', 'txtStrokeVal', 'txtPos', 'txtDel',
      'mosaicBtn', 'mosaicSize', 'mosaicSizeVal', 'mosaicClear', 'eraserBtn', 'eraserSize', 'eraserSizeVal', 'eraserClear',
      'matFg', 'matBg', 'matRun', 'matClear', 'matExport', 'matSize', 'matSizeVal', 'matStatus',
      'exFormat', 'exQuality', 'exQualityVal', 'exQualityField', 'exRun',
      'slimFace', 'slimBody', 'slimMode', 'slimStrength', 'slimStrengthVal', 'slimRange', 'slimRangeVal', 'slimReset',
      'deform_eye', 'deform_teeth', 'deform_cheek', 'deform_lip', 'deform_nose',
      'deformCount', 'deformClearAll', 'deformModeBtn', 'deformKindSel', 'deformStrength', 'deformStrengthVal',
      'slideBar', 'slidePrev', 'slidePlay', 'slideFill', 'slideNext', 'slideExit',
      'toast',
      'accountBtn', 'btnFav',
      'authMask', 'authClose', 'authTitle', 'authTab', 'authUser', 'authPass', 'authNick', 'authErr', 'authSubmit',
      'cloudMask', 'cloudClose', 'cloudStatus', 'cloudSyncNow', 'cloudLogout',
      'favList', 'histList', 'profNick', 'profAvatar', 'profSave', 'pwdOld', 'pwdNew', 'pwdSave',
      'manualMask', 'manualClose', 'manualBody', 'btnManual',
      'btnRecent', 'recentMask', 'recentClose', 'recentList', 'recentHint', 'recentClear', 'recentInline',
      'miBrightness', 'miBrightnessVal', 'miContrast', 'miContrastVal', 'miSaturate', 'miSaturateVal', 'miTemp', 'miTempVal', 'miSharp', 'miSharpVal',
      'miBeautyVal', 'miBeautySmooth', 'miBeautyWhite', 'miBeautyLight', 'miBeautyNatural', 'miBeautyFancy', 'miEnhance', 'miMore',
      'miRecipe', 'miRecipeRandom', 'recipeRandom',
      'saveMyStyle', 'clearMyStyles', 'myStyleGrid',
      'editHistoryBtn', 'editHistoryClose', 'editHistoryPanel', 'editTimeline',
    ];
    ids.forEach((id) => { window.__API__.els[id] = document.getElementById(id); });
  }

  // ============ init() ============
  function init() {
    window.__API__.cacheDom();
    window.__API__.applyTheme(loadTheme());
    if (typeof window.__API__.bindEvents === 'function') window.__API__.bindEvents();
    if (typeof window.__API__.renderRecentInline === 'function') window.__API__.renderRecentInline();
    if (!window.__API__.state.items.length) window.__API__.els.emptyHint.hidden = false;
    if (typeof window.__API__.registerServiceWorker === 'function') window.__API__.registerServiceWorker();
    if (typeof window.__API__.initAuth === 'function') window.__API__.initAuth().then(() => {
      if (typeof window.__API__.refreshAccountUI === 'function') window.__API__.refreshAccountUI();
      if (typeof window.__API__.renderFavList === 'function') window.__API__.renderFavList();
      if (typeof window.__API__.renderHistList === 'function') window.__API__.renderHistList();
      if (typeof window.__API__.flushQueue === 'function') window.__API__.flushQueue();
    });
    if (typeof window !== 'undefined') window.addEventListener('online', () => { if (typeof window.__API__.isLoggedIn === 'function' && window.__API__.isLoggedIn()) window.__API__.flushQueue(); });
  }

  // 注册到 API
  window.__API__.naturalCompare = naturalCompare;
  window.__API__.escapeHtml = escapeHtml;
  window.__API__.download = download;
  window.__API__.toast = toast;
  window.__API__.showLoadingError = showLoadingError;
  window.__API__.resetLoading = resetLoading;
  window.__API__.SETTINGS_KEY = SETTINGS_KEY;
  window.__API__.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  window.__API__.SETTINGS_SCHEMA = SETTINGS_SCHEMA;
  window.__API__.GROUP_LABELS = GROUP_LABELS;
  window.__API__.loadSettings = loadSettings;
  window.__API__.saveSettings = saveSettings;
  window.__API__.getSetting = getSetting;
  window.__API__.THEME_KEY = THEME_KEY;
  window.__API__.applyTheme = applyTheme;
  window.__API__.loadTheme = loadTheme;
  window.__API__.toggleTheme = toggleTheme;
  window.__API__.COMIC_KEY = COMIC_KEY;
  window.__API__.applyComicMode = applyComicMode;
  window.__API__.toggleComicMode = toggleComicMode;
  window.__API__.renderDualPage = renderDualPage;
  window.__API__.cacheDom = cacheDom;
  window.__API__.init = init;
})();



