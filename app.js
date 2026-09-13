/* 绿角犀看图 · Web 原型 — 核心逻辑
 * 覆盖 PRD 5.2~5.6；5.1 系统集成层以 Web 能力替代并在「关于」中标注。
 * 纯前端、零依赖、离线可用（双击 index.html 即可运行）。
 */
(function () {
  'use strict';

  // ============ 工具函数 ============
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const IMG_EXT = ['jpg','jpeg','png','gif','webp','avif','svg','bmp','ico','apng','tif','tiff','heic','heif','tga','psd'];
  const NATIVE_EXT = ['jpg','jpeg','png','gif','webp','avif','svg','bmp','ico','apng'];

  function extOf(name) {
    const m = /\.([a-z0-9]+)$/i.exec(name);
    return m ? m[1].toLowerCase() : '';
  }
  function isImageFile(name) {
    return IMG_EXT.includes(extOf(name));
  }
  function formatBytes(n) {
    if (!n && n !== 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
    return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  function pad(n, len) { return String(n).padStart(len, '0'); }
  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d)) return '—';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2) + '-' + pad(d.getDate(), 2) +
      ' ' + pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2);
  }
  // 自然排序（数字感知）：img2 < img10
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
  // ============ 桌面桥接（Tauri，Web 安全降级）============
  // 仅在运行于 Tauri 环境（window.__TAURI__.core.invoke）时启用；纯 Web 下所有方法自动降级为原有行为，不影响功能。
  const desktop = {
    available() { return !!(window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke); },
    async invoke(cmd, args) {
      if (!this.available()) throw new Error('no-tauri');
      return window.__TAURI__.core.invoke(cmd, args || {});
    },
    // 桌面版：用真实本地路径执行系统操作；Web 无 path 时返回 false 走降级
    async setWallpaper(item) {
      if (!this.available() || !item.path) return false;
      await this.invoke('set_wallpaper', { path: item.path }); return true;
    },
    async reveal(item) {
      if (!this.available() || !item.path) return false;
      await this.invoke('reveal_in_explorer', { path: item.path }); return true;
    },
    async copyImage(blob) {
      if (!this.available()) return false;
      const buf = new Uint8Array(await blob.arrayBuffer());
      await this.invoke('copy_image', { bytes: Array.from(buf) }); return true;
    },
    // 桌面版：从本地路径加载图片列表（Rust 解码后端格式后返回 data URL 条目）
    async loadPaths(paths, recursive) {
      if (!this.available() || !paths || !paths.length) return false;
      const entries = await this.invoke('load_paths', { paths, recursive: !!recursive });
      this.flog('loadPaths got entries=' + (Array.isArray(entries) ? entries.length : String(entries)));
      if (!Array.isArray(entries)) return false;
      const items = entries.map((e) => ({
        name: e.name, size: e.size || 0, lastModified: e.lastModified || 0,
        type: e.mime || 'image/*', url: e.url, path: e.path || null, file: null,
      }));
      state.items.forEach((it) => { if (it.url && it.url.indexOf('blob:') === 0) URL.revokeObjectURL(it.url); if (it.displayUrl && it.displayUrl.indexOf('blob:') >= 0) URL.revokeObjectURL(it.displayUrl); });
      state.items = items; state.index = -1;
      els.emptyHint.hidden = true; // 与 Web loadFiles 一致：加载后隐藏空态提示，避免覆盖主视区
      if (items.length) {
        renderThumbs();
        // 打开单张图片时会一并加载同文件夹相邻图，需定位到所打开的那张；
        // 打开文件夹/多文件则保持从第 0 张开始。
        let idx = 0;
        if (paths.length) {
          const found = items.findIndex((it) => it.path && paths.includes(it.path));
          if (found >= 0) idx = found;
        }
        this.flog('loadPaths items=' + items.length + ' idx=' + idx + ' firstPath=' + String(items[0] && items[0].path));
        showImage(idx);
        this.flog('loadPaths after showImage(' + idx + ') imageHidden=' + els.image.hidden);
        recordRecentFromLoad(paths, entries);
      }
      updateChrome();
      return true;
    },
    async flog(message) {
      try { if (this.available()) await this.invoke('flog', { message }); } catch (e) {}
    },
  };

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ============ 设置 ============
  const SETTINGS_KEY = 'qjviewer_settings_v1';
  const DEFAULT_SETTINGS = {
    general: {
      openLastFolder: false,
      closeBehavior: 'exit',
      minimizeToTray: false,
      autoStart: false,
    },
    view: {
      defaultZoom: 'fit',
      wheelMode: 'zoom',
      loop: true,
      rememberRotation: false,
      renderMode: 'smooth',
      wallpaperMode: 'fit',
      recursive: true,
    },
    slideshow: {
      interval: 5,
      transition: 'fade',
      order: 'forward',
    },
    files: {
      recursive: true,
      menuText: '用绿角犀看图打开',
    },
    advanced: {
      preloadSize: 20,
      autoUpdate: true,
      cloudApiBase: '',
      cvUrl: '',
      aiModelUrl: '',
    },
  };
  // 设置表单 Schema：{group,key,label,desc,type,options,min,max,step}
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

  let settings = loadSettings();
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      const saved = JSON.parse(raw);
      // 合并默认，避免缺字段
      const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      for (const g in saved) for (const k in saved[g]) if (g in merged && k in merged[g]) merged[g][k] = saved[g][k];
      return merged;
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
    if (isLoggedIn()) pushSettings();
  }
  function getSetting(group, key) { return settings[group] ? settings[group][key] : undefined; }

  // ============ 快捷键（可自定义，PRD 5.1「快捷键自定义」的 Web 可行实现）============
  const KEYMAP_KEY = 'qjviewer_keymap_v1';
  const KEYMAP_SCHEMA = [
    { action: 'prev', label: '上一张' },
    { action: 'next', label: '下一张' },
    { action: 'home', label: '第一张 (Home)' },
    { action: 'end', label: '最后一张 (End)' },
    { action: 'zoomIn', label: '放大' },
    { action: 'zoomOut', label: '缩小' },
    { action: 'rotateL', label: '左旋转' },
    { action: 'rotateR', label: '右旋转' },
    { action: 'flipH', label: '水平翻转' },
    { action: 'flipV', label: '垂直翻转' },
    { action: 'info', label: '信息面板' },
    { action: 'slideshow', label: '幻灯片' },
    { action: 'fullscreen', label: '全屏' },
    { action: 'toggleThumbs', label: '显示/隐藏缩略图' },
    { action: 'copy', label: '复制到剪贴板' },
    { action: 'edit', label: '图片工具' },
    { action: 'jump', label: '跳转序号' },
    { action: 'closeInfo', label: '关闭信息面板 (Esc)' },
  ];
  const DEFAULT_KEYMAP = {
    prev: ['arrowleft', 'pageup'],
    next: ['arrowright', 'pagedown'],
    home: ['home'],
    end: ['end'],
    zoomIn: ['='],
    zoomOut: ['-'],
    rotateL: ['l'],
    rotateR: ['r'],
    flipH: ['h'],
    flipV: ['v'],
    info: ['i'],
    slideshow: ['s'],
    fullscreen: ['f'],
    toggleThumbs: ['tab'],
    copy: ['ctrl+c', 'meta+c'],
    edit: ['e'],
    jump: ['g'],
    closeInfo: ['escape'],
  };
  let keymap = loadKeymap();
  function loadKeymap() {
    try {
      const base = JSON.parse(JSON.stringify(DEFAULT_KEYMAP));
      const raw = localStorage.getItem(KEYMAP_KEY);
      if (!raw) return base;
      const saved = JSON.parse(raw);
      for (const a in base) if (Array.isArray(saved[a])) base[a] = saved[a];
      return base;
    } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_KEYMAP)); }
  }
  function saveKeymap() { try { localStorage.setItem(KEYMAP_KEY, JSON.stringify(keymap)); } catch (e) {} }
  function keyCombo(e) {
    const parts = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.metaKey) parts.push('meta');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    let k = e.key;
    if (k === ' ') k = 'space';
    else if (k === '+') k = '=';
    else if (k === '_') k = '-';
    else if (k.length === 1) k = k.toLowerCase();
    else k = k.toLowerCase();
    parts.push(k);
    return parts.join('+');
  }
  const KEY_DISP = { ctrl: 'Ctrl', meta: 'Win', alt: 'Alt', shift: 'Shift', space: '空格', arrowleft: '←', arrowright: '→', arrowup: '↑', arrowdown: '↓', escape: 'Esc', tab: 'Tab', enter: 'Enter', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown' };
  function prettyCombo(c) { return (c || '').split('+').map((p) => KEY_DISP[p] || (p.length === 1 ? p.toUpperCase() : p)).join('+'); }
  let comboLookup = null;
  function buildComboLookup() {
    comboLookup = {};
    for (const a in keymap) (keymap[a] || []).forEach((c) => { if (c) comboLookup[c] = a; });
  }
  buildComboLookup();
  let capturingAction = null;
  function runAction(a) {
    switch (a) {
      case 'prev': prev(); break;
      case 'next': next(); break;
      case 'home': showImage(0); break;
      case 'end': showImage(state.items.length - 1); break;
      case 'zoomIn': zoomByCenter(1.2); break;
      case 'zoomOut': zoomByCenter(1 / 1.2); break;
      case 'rotateL': rotate(-1); break;
      case 'rotateR': rotate(1); break;
      case 'flipH': flip(true); break;
      case 'flipV': flip(false); break;
      case 'info': toggleInfo(); break;
      case 'slideshow': startSlideshow(); break;
      case 'fullscreen': if (document.fullscreenElement) exitFullscreen(); else enterFullscreen(); break;
      case 'toggleThumbs': state.showThumbs = !state.showThumbs; updateChrome(); break;
      case 'copy': copyCurrentImage(); break;
      case 'edit': openEdit(); break;
      case 'jump': openJump(); break;
      case 'closeInfo': els.infoPanel.hidden = true; break;
    }
  }

  // ============ 状态 ============
  const state = {
    items: [],            // {file,name,url,size,lastModified,type,img,thumbUrl,natW,natH,exif}
    index: -1,
    scale: 1, fitScale: 1,
    offsetX: 0, offsetY: 0,
    rotation: 0, flipH: false, flipV: false,
    isLongImage: false,    // 长图（height/width > 1.7）自动滚轮翻页模式
    mode: 'fit',          // fit | actual | free
    dragging: false, dragStart: null,
    touch: null, lastTapTime: 0, panelDrag: null, panelTouchId: null,
    cache: new Map(),     // index -> HTMLImageElement (预加载)
    showThumbs: true,
    filters: { brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0, hslH: 0, hslS: 100, hslL: 0 },
    ops: [],             // 高级处理队列（OpenCV / AI），导出时依序应用
    texts: [],           // 文字层 [{id,x,y,size%,font,color,stroke,text,pos}]（归一化坐标）
    textSel: null,       // 选中的文字 id
    mosaic: [],          // 马赛克笔触 [{x,y,r}]（归一化坐标，r 为归一化半径）
    mosaicMode: false,   // 预览画布处于马赛克涂抹模式
    slimMode: false,     // 预览画布处于瘦身/瘦脸锚点拖拽模式
    slim: { enabled: false, mode: 'face', strength: 0, cx: 0.5, cy: 0.5, rx: 0.22, ry: 0.22 },  // 瘦身/瘦脸局部液化
    crop: null,
    mosaicPainting: false,  // 马赛克涂抹进行中（模块级指针状态）
    textDrag: null,         // 当前拖拽中的文字 {id,start,origin}
    cropDrag: null,         // 当前裁剪拖拽 {mode,handle,start,origin}
    matting: { mode: 'none', strokes: { fg: [], bg: [] }, mask: null, mW: 0, mH: 0 },  // 一键抠图：笔刷模式 + 前景/背景笔触 + 分割掩码
    slide: { active: false, paused: false, timer: null, order: 'forward', interval: 5000, raf: null, last: 0, elapsed: 0, played: [] },
  };

  // ============ DOM 引用 ============
  const els = {};
  function cacheDom() {
    [
      'btnOpenFiles', 'btnOpenDir', 'fileInput', 'dirInput',
      'btnZoomOut', 'btnZoomFit', 'btnZoomIn', 'btnRotL', 'btnRotR', 'btnFlipH', 'btnFlipV',
      'btnCopy', 'btnEdit', 'btnInfo', 'btnSlide', 'btnBatch', 'btnSettings', 'btnFull',
      'btnSnap', 'btnUndo', 'btnRedo',
      'viewer', 'stage', 'image', 'imgWrap', 'emptyHint', 'loading',
      'navPrev', 'navNext', 'edgeLeft', 'edgeRight', 'counter', 'jumpInput',
      'thumbBar', 'thumbs', 'thumbSearch', 'thumbCount',
      'infoPanel', 'infoClose', 'infoBody',
      'ctxMenu',
      'settingsMask', 'settingsClose', 'settingsNav', 'settingsForm', 'settingsReset',
      'batchMask', 'batchClose', 'batchScope', 'batchTabs', 'batchBody',
      'cvQuality', 'cvQualityVal', 'cvNaming', 'cvOutput', 'cvFormat', 'cvQualityField', 'cvPreview', 'cvPreviewLabel',
      'rsMode', 'rsPercent', 'rsPercentVal', 'rsPercentField', 'rsExactField', 'rsWidth', 'rsHeight', 'rsLockRatio', 'rsResample', 'rsFormat', 'rsDpi', 'rsPreview', 'rsPreviewLabel',
      'rnTemplate', 'rnPreview', 'batchProgress', 'batchBarFill', 'batchProgressText', 'batchRun', 'batchCancel', 'batchReport', 'btPreset', 'btFormat', 'btKeepName', 'btPreview', 'btPreviewLabel',
      'cpFormat', 'cpQuality', 'cpQualityVal', 'cpQualityField', 'cpMaxEdge', 'cpPreview', 'cpPreviewLabel', 'wmText', 'wmSize', 'wmSizeVal', 'wmOpacity', 'wmOpacityVal', 'wmColor', 'wmPos', 'wmMargin', 'wmMarginVal', 'wmFormat', 'wmPreview', 'wmPreviewLabel',
      'aboutMask', 'aboutClose', 'aboutBody',
      'editMask', 'editClose', 'editName', 'editPreview', 'cropReset',
      'flBrightness', 'flBrightnessVal', 'flContrast', 'flContrastVal', 'flSaturate', 'flSaturateVal', 'flGray', 'flGrayVal', 'flReset',
      'flTemp', 'flTempVal', 'flHslH', 'flHslHVal', 'flHslS', 'flHslSVal', 'flHslL', 'flHslLVal', 'flBlur', 'flBlurVal', 'flSharp', 'flSharpVal',
      'flHighlight', 'flHighlightVal', 'flShadow', 'flShadowVal', 'flFade', 'flFadeVal', 'flGrain', 'flGrainVal', 'flVignette', 'flVignetteVal', 'flTintH', 'flTintS', 'flTintAmt', 'flTintAmtVal',
      'btnAutoEnhance', 'cvDenoise', 'cvBilateral', 'cvSharp', 'opsReset', 'aiScale', 'aiRun',
      'styleGrid', 'beautyVal', 'beautyValVal', 'beautySmooth', 'beautyWhite',
      'borderMode', 'borderRadius',
      'txtInput', 'txtAdd', 'txtFont', 'txtColor', 'txtSize', 'txtSizeVal', 'txtStroke', 'txtStrokeVal', 'txtPos', 'txtDel',
      'mosaicBtn', 'mosaicSize', 'mosaicSizeVal', 'mosaicClear',
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
    ].forEach((id) => { els[id] = document.getElementById(id); });
  }

  // ============ 文件加载层 ============
  function buildItems(fileList, recursive) {
    let files = Array.from(fileList).filter((f) => isImageFile(f.name));
    if (!files.length) { toast('未找到图片文件'); return; }
    // 排序：目录路径 + 文件名 自然排序
    files.sort((a, b) => {
      const pa = (a.webkitRelativePath || a.name), pb = (b.webkitRelativePath || b.name);
      return naturalCompare(pa, pb);
    });
    // 释放旧 URL
    state.items.forEach((it) => { if (it.url) URL.revokeObjectURL(it.url); if (it.displayUrl && it.displayUrl.indexOf('blob:') >= 0) URL.revokeObjectURL(it.displayUrl); });
    state.items = files.map((f) => ({
      file: f, name: f.name, size: f.size, lastModified: f.lastModified,
      type: f.type || ('image/' + extOf(f.name)),
      url: URL.createObjectURL(f), img: null, thumbUrl: null, natW: 0, natH: 0, exif: null,
    }));
    state.cache.clear();
    state.index = -1;
    els.emptyHint.hidden = true;
    els.viewer.querySelector('.empty-hint') && (els.emptyHint.hidden = true);
    showImage(0);
    renderThumbs();
    updateChrome();
  }

  function openFiles() { els.fileInput.click(); }
  function openDir() { els.dirInput.click(); }

  // 拖放（含目录递归）
  function traverseEntry(entry, out) {
    return new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => { out.push(f); resolve(); });
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readBatch = () => reader.readEntries((ents) => {
          if (!ents.length) { resolve(); return; }
          Promise.all(ents.map((en) => traverseEntry(en, out))).then(readBatch);
        });
        readBatch();
      } else resolve();
    });
  }
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; });
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); dragDepth = 0;
    const dt = e.dataTransfer;
    const out = [];
    const entries = [];
    for (const item of dt.items) {
      const en = item.webkitGetAsEntry && item.webkitGetAsEntry();
      if (en) entries.push(en);
    }
    if (entries.length) {
      for (const en of entries) await traverseEntry(en, out);
      buildItems(out, getSetting('view', 'recursive'));
    } else if (dt.files && dt.files.length) {
      buildItems(dt.files, getSetting('view', 'recursive'));
    }
  });

  // ============ HEIC / HEIF 动态解码 ============
  // WebView2 / Chrome 原生不支持 HEIC。内置 libheif-wasm（118系 de265 HEVC 离线解码器，自包含 bundle 内嵌 wasm），
  // 仅当检测到 HEIC 时才把 bundle 作为 CommonJS 文本求值注入浏览器运行时，完全离线可用、无需服务端/联网。
  let heicFactory = null; // 已解析的 libheif 模块（Promise）

  // 浏览器式 CJS 求值器：libheif-bundle.js 是 UMD/CJS 包，浏览器无 module/exports，故包一层伪装。
  // 同时补齐 __dirname/process 等浏览器缺失的 Node 全局，全部设为无害 shim。
  function evaluateCjsBundle(code) {
    const mod = { exports: {} };
    const noRequire = function () { throw new Error('libheif bundle 不应 require 外部模块'); };
    const processShim = {
      env: {}, platform: 'browser', version: '', argv: [], arch: 'web',
      cwd: function () { return '/'; },
      nextTick: function (f) { if (typeof f === 'function') { try { queueMicrotask(f); } catch (e) { Promise.resolve().then(f); } } },
    };
    const fn = new Function(
      'module', 'exports', 'require', 'process', 'global',
      'Buffer', '__dirname', '__filename',
      code + '\n;return module.exports;'
    );
    return fn(mod, mod.exports, noRequire, processShim, { console }, null, '/', '/libheif-bundle.js');
  }

  // 返回 libheif 模块（含 HeifDecoder / heif_js_decode_image2 等）。测试可通过 window.__libheifModule 注入桩。
  function loadLibheif() {
    if (window.__libheifModule) return Promise.resolve(window.__libheifModule);
    if (heicFactory) return heicFactory;
    heicFactory = (async function () {
      // 优先本地内置 bundle（离线可用），CDN 兜底（网络可达时）
      const srcs = [
        './libheif-bundle.js',
        'https://unpkg.com/tn098-libheif-wasm/libheif-wasm/libheif-bundle.js',
        'https://cdn.jsdelivr.net/npm/tn098-libheif-wasm/libheif-wasm/libheif-bundle.js',
      ];
      let lastErr = null;
      for (const src of srcs) {
        try {
          const res = await fetch(src);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const code = await res.text();
          const factory = evaluateCjsBundle(code);
          if (typeof factory !== 'function') throw new Error('libheif bundle 导出异常');
          return await factory();
        } catch (err) { lastErr = err; }
      }
      throw lastErr || new Error('无法加载 libheif');
    })();
    return heicFactory;
  }

  function isHeicItem(item) {
    if (!item) return false;
    const ext = extOf(item.name || '');
    if (ext === 'heic' || ext === 'heif') return true;
    if (item.url && item.url.indexOf('data:image/heic') === 0) return true;
    if (item.type && String(item.type).indexOf('heic') >= 0) return true;
    return false;
  }

  // 把 data:image/heic;base64,... 或 File 转成 Blob
  function toSourceBlob(item) {
    if (item.file instanceof Blob) return Promise.resolve(item.file);
    if (item.url && item.url.indexOf('data:image/heic;base64,') === 0) {
      const b64 = item.url.slice('data:image/heic;base64,'.length);
      try {
        const bin = atob(b64);
        const len = bin.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
        return Promise.resolve(new Blob([bytes], { type: 'image/heic' }));
      } catch (e) { return Promise.reject(e); }
    }
    return Promise.reject(new Error('无可用 HEIC 数据源'));
  }

  // RGBA 像素 → <img> 可用 PNG 对象 URL。此函数可被测试替换注入（jsdom 无 canvas）。返回 URL（调用方 revoke）。
  function pixelsToBlobUrl(data, w, h, stride) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前环境无 canvas，无法转换 HEIC');
    const img = ctx.createImageData(w, h);
    if (stride === w * 4) {
      img.data.set(data.subarray(0, w * h * 4));
    } else {
      for (let y = 0; y < h; y++) img.data.set(data.subarray(y * stride, y * stride + w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(URL.createObjectURL(blob)); else reject(new Error('HEIC 像素转 PNG 失败'));
      }, 'image/png');
    });
  }

  // 转码 HEIC 为 PNG 对象 URL（libheif 离线解码 RGBA → canvas → PNG）。调用方负责 revoke。
  async function decodeHeicToUrl(item) {
    const m = await loadLibheif();
    const src = await toSourceBlob(item);
    const buf = new Uint8Array(await src.arrayBuffer());
    const dec = new m.HeifDecoder();
    const imgs = await dec.decode(buf);
    const im = imgs && imgs[0];
    if (!im) throw new Error('HEIC 无可用图像');
    const out = await m.heif_js_decode_image2(
      im.handle,
      m.heif_colorspace.heif_colorspace_RGB,
      m.heif_chroma.heif_chroma_interleaved_RGBA
    );
    if (!out || out.code) throw new Error('HEIC 解码失败');
    const w = im.get_width(), h = im.get_height();
    const ch = (out.channels || []).find(function (c) { return c.id === m.heif_channel.heif_channel_interleaved; });
    if (!ch || !ch.data) throw new Error('HEIC 无像素数据');
    const stride = ch.stride || (w * 4);
    try { if (out.image) m.heif_image_release(out.image); } catch (e) { /* 释放即可 */ }
    return pixelsToBlobUrl(ch.data, w, h, stride);
  }

  // 解析 <img> 可用的源 URL：普通格式用原 URL；HEIC 转码一次并缓存到 item.displayUrl，后续复用。
  function resolveItemSrc(item) {
    if (!isHeicItem(item)) return Promise.resolve(item.url);
    if (item.displayUrl) return Promise.resolve(item.displayUrl);
    return decodeHeicToUrl(item).then((u) => { item.displayUrl = u; return u; });
  }

  // ============ 图像加载 ============
  function loadImage(item) {
    return new Promise((resolve, reject) => {
      if (item.img && item.img.complete && item.img.naturalWidth) { resolve(item.img); return; }
      resolveItemSrc(item).then((src) => {
        const img = new Image();
        img.onload = () => { item.img = img; item.natW = img.naturalWidth; item.natH = img.naturalHeight; resolve(img); };
        img.onerror = () => reject(new Error('解码失败: ' + item.name));
        img.src = src;
      }).catch((err) => reject(err));
    });
  }

  // 解码中/解码失败 的 loading 覆盖层状态
  function resetLoading() {
    els.loading.classList.remove('is-error');
    const t = els.loading.querySelector('.loading-text');
    if (t) t.textContent = '解码中…';
  }
  function showLoadingError(name) {
    els.loading.classList.add('is-error');
    const t = els.loading.querySelector('.loading-text');
    if (t) t.textContent = '无法解码：' + name + '（该格式可能需要桌面版后端解码）';
  }

  // ============ 显示图片 ============
  function showImage(index, opts) {
    opts = opts || {};
    if (!state.items.length) return;
    const loop = getSetting('view', 'loop');
    if (loop) { index = (index + state.items.length) % state.items.length; }
    else { index = Math.max(0, Math.min(state.items.length - 1, index)); }
    state.index = index;
    const item = state.items[index];

    if (!getSetting('view', 'rememberRotation')) {
      state.rotation = 0; state.flipH = false; state.flipV = false;
    }
    // 美工状态随图切换重置（滤镜按既有行为在切图时保留由 resetFilters 显式清）
    state.texts = []; state.textSel = null;
    state.mosaic = []; state.mosaicMode = false; state.mosaicPainting = false; state.textDrag = null; state.cropDrag = null;
    if (els.mosaicBtn) els.mosaicBtn.textContent = '🖌 进入马赛克模式';
    state.mode = getSetting('view', 'defaultZoom') === 'actual' ? 'actual' : 'fit';

    els.loading.hidden = false;
    resetLoading();

    const finish = (img) => {
      els.loading.hidden = true;
      els.image.hidden = false;
      desktop.flog('showImage finish hidden=false path=' + String(item.path) + ' urlHead=' + String(item.url).slice(0, 22));
      item.broken = false;
      item.natW = img.naturalWidth || item.natW;
      item.natH = img.naturalHeight || item.natH;
      els.image.src = img.src;
      if (state.slide.active) { /* 幻灯片转场由 applyTransition 作用于 imgWrap，避免与图片自身 transform 冲突 */ }
      else if (opts.fade !== false) { els.image.classList.remove('fade'); void els.image.offsetWidth; els.image.classList.add('fade'); }
      computeFit();
      if (state.mode === 'actual') applyActual();
      else applyFit();
      updateZoomLabel();
      updateChrome();
      highlightThumb(index);
      preloadAround(index);
      if (els.infoPanel.hidden === false) renderInfo();
      // 自动读取 EXIF（延迟，避免阻塞）
      if (!item.exif && item.type === 'image/jpeg') readExif(item);
      // 记录浏览历史（登录态下自动上传云端）
      recordHistory(item);
      // 长图检测：height/width > 1.7（对应约 16:9 的反面），自动启用滚轮翻页模式
      detectLongImage(item);
    };

    const cached = state.cache.get(index);
    if (cached && cached.complete && cached.naturalWidth) { finish(cached); }
    else {
      loadImage(item).then((img) => { state.cache.set(index, img); if (state.index === index) finish(img); })
        .catch(() => { els.image.hidden = true; desktop.flog('showImage CATCH broken path=' + String(item.path) + ' urlHead=' + String(item.url).slice(0, 22)); item.broken = true; showLoadingError(item.name); toast('无法解码：' + item.name); });
    }
  }

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
    const it = state.items[state.index];
    return (it && it.exif && it.exif.orientation) || 1;
  }
  function orientSwaps(o) { return o === 5 || o === 6 || o === 7 || o === 8; }
  // 考虑 EXIF orientation 与用户旋转后的屏幕实际尺寸
  function displayDims() {
    const it = state.items[state.index];
    if (!it) return { w: 1, h: 1 };
    let w = it.natW || (it.img ? it.img.naturalWidth : 1);
    let h = it.natH || (it.img ? it.img.naturalHeight : 1);
    if (orientSwaps(currentOrient())) { const t = w; w = h; h = t; }
    if ((state.rotation % 180) !== 0) { const t = w; w = h; h = t; }
    return { w: w || 1, h: h || 1 };
  }

  function detectLongImage(item) {
    // 长图判定：height / width > 1.7（漫画党刚需，约等于 1200×2000 以上的竖图）
    const nw = item.natW || (item.img ? item.img.naturalWidth : 0);
    const nh = item.natH || (item.img ? item.img.naturalHeight : 0);
    if (!nw || !nh) { state.isLongImage = false; return; }
    state.isLongImage = nh / nw > 1.7;
    // 长图在 fit 模式下自动定位到顶端（offsetY = 0 就是顶端，已由 applyFit 默认保证）
    // 如果是 free/actual 模式且 offsetY 在中间，自动拉到顶端方便阅读
    if (state.isLongImage && state.mode === 'fit') {
      state.offsetX = 0; state.offsetY = 0;
      applyTransform(); clampOffset();
    }
  }

  function computeFit() {
    const { w, h } = displayDims();
    if (!w || !h) return;
    const sw = els.stage.clientWidth, sh = els.stage.clientHeight;
    let fit = Math.min(sw / w, sh / h);
    fit = Math.min(fit, 2.5);
    state.fitScale = fit;
  }

  function applyTransform() {
    const oc = ORIENT_CSS[currentOrient()] || ORIENT_CSS[1];
    const sx = state.flipH ? -state.scale : state.scale;
    const sy = state.flipV ? -state.scale : state.scale;
    els.image.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) rotate(${state.rotation}deg) scale(${sx}, ${sy}) rotate(${oc.rot}deg) scale(${oc.fx}, ${oc.fy})`;
  }
  function applyFit() {
    state.scale = state.fitScale || 1; state.offsetX = 0; state.offsetY = 0; state.mode = 'fit';
    applyTransform(); clampOffset();
  }
  function applyActual() {
    state.scale = 1; state.offsetX = 0; state.offsetY = 0; state.mode = 'actual';
    applyTransform(); clampOffset();
  }
  function clampOffset() {
    const o = currentOrient();
    if ((state.rotation % 180 !== 0) || orientSwaps(o)) return; // 旋转/翻转态放开边界
    const { w, h } = displayDims();
    const dw = w * state.scale, dh = h * state.scale;
    const sw = els.stage.clientWidth, sh = els.stage.clientHeight;
    if (dw <= sw && dh <= sh) { state.offsetX = 0; state.offsetY = 0; applyTransform(); return; }
    const ox = Math.max(0, (dw - sw) / 2), oy = Math.max(0, (dh - sh) / 2);
    state.offsetX = Math.max(-ox, Math.min(ox, state.offsetX));
    state.offsetY = Math.max(-oy, Math.min(oy, state.offsetY));
    applyTransform();
  }

  // 锚点缩放（支持旋转/翻转）
  function zoomAt(mx, my, newScale) {
    newScale = Math.max(0.05, Math.min(50, newScale));
    const cx = els.stage.clientWidth / 2, cy = els.stage.clientHeight / 2;
    const rot = state.rotation * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const sx = state.flipH ? -state.scale : state.scale;
    const sy = state.flipV ? -state.scale : state.scale;
    const sx2 = state.flipH ? -newScale : newScale;
    const sy2 = state.flipV ? -newScale : newScale;
    const dx = mx - cx, dy = my - cy;
    const ddx = dx - state.offsetX, ddy = dy - state.offsetY;
    const rx = cos * ddx + sin * ddy, ry = -sin * ddx + cos * ddy;
    const px = rx / sx, py = ry / sy;
    const spx = sx2 * px, spy = sy2 * py;
    const rspx = cos * spx - sin * spy, rspy = sin * spx + cos * spy;
    state.offsetX = dx - rspx; state.offsetY = dy - rspy;
    state.scale = newScale; state.mode = 'free';
    applyTransform(); clampOffset(); updateZoomLabel();
  }
  function zoomByCenter(factor) {
    const cx = els.stage.clientWidth / 2, cy = els.stage.clientHeight / 2;
    zoomAt(cx, cy, state.scale * factor);
  }
  function updateZoomLabel() {
    els.btnZoomFit.textContent = Math.round(state.scale * 100) + '%';
  }

  function rotate(dir) {
    state.rotation = (state.rotation + dir * 90 + 360) % 360;
    computeFit();
    if (state.mode === 'fit') applyFit(); else { applyTransform(); clampOffset(); }
    if (els.infoPanel.hidden === false) renderInfo();
    if (!els.editMask.hidden) renderEditPreview();
  }
  function flip(h) {
    if (h) state.flipH = !state.flipH; else state.flipV = !state.flipV;
    applyTransform(); clampOffset();
    if (!els.editMask.hidden) renderEditPreview();
  }

  // ============ 翻页与导航 ============
  function next() { showImage(state.index + 1); }
  function prev() { showImage(state.index - 1); }

  function updateChrome() {
    const has = state.items.length > 0;
    els.navPrev.hidden = !has; els.navNext.hidden = !has;
    els.edgeLeft.hidden = !has; els.edgeRight.hidden = !has;
    els.counter.hidden = !has;
    applyThumbVisibility();
    if (has) els.counter.textContent = (state.index + 1) + ' / ' + state.items.length;
  }

  // 缩略图栏可见性：全屏模式下 3 秒后自动隐藏，鼠标移动重新显示；非全屏按 showThumbs 决定。
  let fsHideTimer = null;
  function scheduleFsHide() {
    clearTimeout(fsHideTimer);
    if (!document.fullscreenElement) return;
    fsHideTimer = setTimeout(() => {
      if (document.fullscreenElement && state.showThumbs && state.items.length) els.thumbBar.hidden = true;
    }, 3000);
  }
  function applyThumbVisibility() {
    const has = state.items.length > 0;
    clearTimeout(fsHideTimer);
    if (!has) { els.thumbBar.hidden = true; return; }
    if (document.fullscreenElement) {
      if (state.showThumbs) { els.thumbBar.hidden = false; scheduleFsHide(); }
      else { els.thumbBar.hidden = true; }
    } else {
      els.thumbBar.hidden = !state.showThumbs;
    }
  }

  // 跳转到指定序号（计数器点击 / G 快捷键）
  function openJump() {
    if (!state.items.length) return;
    els.jumpInput.hidden = false; els.counter.hidden = true;
    els.jumpInput.value = state.index + 1;
    els.jumpInput.focus(); els.jumpInput.select();
  }
  function closeJump() {
    els.jumpInput.hidden = true; els.counter.hidden = !!(!state.items.length);
    updateChrome();
  }
  function goToIndex(n) {
    const total = state.items.length;
    if (!total) return;
    n = Math.max(1, Math.min(total, Math.floor(n) || 1));
    showImage(n - 1);
  }
  function applyThumbFilter() {
    const q = (els.thumbSearch.value || '').trim().toLowerCase();
    let shown = 0;
    $$('.thumb').forEach((t) => {
      const it = state.items[+t.dataset.index];
      const hit = !it || !q || it.name.toLowerCase().includes(q);
      t.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    els.thumbCount.textContent = q ? (shown + ' / ' + state.items.length) : '';
  }

  function renderThumbs() {
    if (!state.items.length) return;
    els.thumbBar.hidden = false;
    const wrap = els.thumbs;
    wrap.innerHTML = '';
    state.items.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'thumb' + (i === state.index ? ' active' : '');
      div.dataset.index = i;
      div.innerHTML = `<span class="t-index">${i + 1}</span><span class="t-fmt">${extOf(item.name)}</span>`;
      div.addEventListener('click', () => showImage(i));
      wrap.appendChild(div);
      // 懒生成缩略图
      if (!item.thumbUrl) {
        setTimeout(() => genThumb(item, div), 0);
      } else {
        const im = document.createElement('img'); im.src = item.thumbUrl; div.insertBefore(im, div.firstChild);
      }
    });
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
    resolveItemSrc(item).then((src) => { im.src = src; }).catch(() => {});
  }
  function highlightThumb(index) {
    $$('.thumb').forEach((t) => {
      const active = +t.dataset.index === index;
      t.classList.toggle('active', active);
      if (active && typeof t.scrollIntoView === 'function') t.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
  }

  // 预加载（LRU，前后各2张）
  function preloadAround(index) {
    const cap = getSetting('advanced', 'preloadSize') || 20;
    const idxs = [index - 2, index - 1, index + 1, index + 2];
    idxs.forEach((i) => {
      if (i < 0 || i >= state.items.length) return;
      if (state.cache.has(i)) { // 提到最近
        const v = state.cache.get(i); state.cache.delete(i); state.cache.set(i, v); return;
      }
      const it = state.items[i];
      if (it.broken) return; // 已损坏图片不再重试预加载
      if (it.file && it.file.size > 50 * 1024 * 1024) return; // 大图不预加载
      const img = new Image();
      img.onload = () => { state.cache.set(i, img); trimCache(cap); };
      img.onerror = () => {};
      resolveItemSrc(it).then((src) => { img.src = src; }).catch(() => {});
    });
    trimCache(cap);
  }
  function trimCache(cap) {
    while (state.cache.size > cap) { const k = state.cache.keys().next().value; state.cache.delete(k); }
  }

  // ============ 信息面板 + EXIF ============
  function renderInfo() {
    const item = state.items[state.index];
    if (!item) return;
    let html = '';
    html += row('文件名', escapeHtml(item.name));
    html += row('格式', (extOf(item.name) || '—').toUpperCase());
    html += row('尺寸', item.natW && item.natH ? `${item.natW} × ${item.natH} px` : '—');
    html += row('文件大小', formatBytes(item.size));
    html += row('修改时间', formatDate(item.lastModified));
    html += row('当前缩放', Math.round(state.scale * 100) + '%');
    if (item.exif) {
      const e = item.exif;
      if (e.camera) { html += '<div class="info-group-title">相机信息 (EXIF)</div>'; html += row('设备', escapeHtml(e.camera)); }
      if (e.datetime) html += row('拍摄时间', escapeHtml(e.datetime));
      if (e.params) { html += row('光圈', e.params.fnumber || '—'); html += row('快门', e.params.exposure || '—'); html += row('ISO', e.params.iso || '—'); html += row('焦距', e.params.focal || '—'); }
      if (e.gps) html += row('GPS', escapeHtml(e.gps));
    } else if (item.type === 'image/jpeg') {
      html += '<div class="info-group-title">相机信息 (EXIF)</div>';
      html += row('', '读取中…');
    } else {
      html += '<div class="info-group-title">相机信息 (EXIF)</div>';
      html += row('', '该格式无 EXIF');
    }
    html += '<div class="info-actions"><button class="btn sm" id="infoCopy">复制信息</button></div>';
    els.infoBody.innerHTML = html;
    const cp = $('#infoCopy');
    if (cp) cp.addEventListener('click', () => copyInfoText(item));
  }
  function row(k, v) { return `<div class="info-row"><span class="k">${k}</span><span class="v">${v}</span></div>`; }
  function copyInfoText(item) {
    const lines = [
      '文件名: ' + item.name,
      '格式: ' + (extOf(item.name) || '—').toUpperCase(),
      '尺寸: ' + (item.natW && item.natH ? `${item.natW} × ${item.natH} px` : '—'),
      '大小: ' + formatBytes(item.size),
      '修改: ' + formatDate(item.lastModified),
      '缩放: ' + Math.round(state.scale * 100) + '%',
    ];
    if (item.exif) {
      const e = item.exif;
      if (e.camera) lines.push('设备: ' + e.camera);
      if (e.datetime) lines.push('拍摄: ' + e.datetime);
      if (e.params) { lines.push('光圈: ' + (e.params.fnumber || '—')); lines.push('快门: ' + (e.params.exposure || '—')); lines.push('ISO: ' + (e.params.iso || '—')); lines.push('焦距: ' + (e.params.focal || '—')); }
      if (e.gps) lines.push('GPS: ' + e.gps);
    }
    copyText(lines.join('\n'));
    toast('信息已复制');
  }

  function readExif(item) {
    try {
      const slice = item.file.slice(0, 256 * 1024);
      slice.arrayBuffer().then((buf) => {
        const exif = parseExif(buf);
        item.exif = exif;
        if (els.infoPanel.hidden === false && state.index >= 0 && state.items[state.index] === item) renderInfo();
        // EXIF 方向就绪后，若仍是当前图则重套显示方向（PRD 5.2 自动正向显示）
        if (state.index >= 0 && state.items[state.index] === item) {
          computeFit();
          if (state.mode === 'actual') applyActual(); else applyFit();
        }
      }).catch(() => {});
    } catch (e) {}
  }

  // 轻量 JPEG EXIF 解析
  function parseExif(buffer) {
    try {
      const dv = new DataView(buffer);
      if (dv.getUint16(0) !== 0xFFD8) return null; // not JPEG
      let off = 2;
      while (off < dv.byteLength - 4) {
        const marker = dv.getUint16(off);
        if ((marker & 0xFF00) !== 0xFF00) break;
        if (marker === 0xFFE1) { // APP1
          const segLen = dv.getUint16(off + 2);
          const start = off + 4;
          if (dv.getUint32(start) === 0x45786966) { // "Exif"
            return parseTiff(new DataView(buffer, start + 6, segLen - 6), buffer);
          }
          return null;
        }
        if (marker === 0xFFDA) break; // image data start
        off += 2 + dv.getUint16(off + 2);
      }
    } catch (e) {}
    return null;
  }
  function parseTiff(tiff, fullBuf) {
    const result = { params: {}, camera: '', datetime: '', gps: '' };
    try {
      const le = tiff.getUint16(0) === 0x4949; // II
      const get16 = (o) => tiff.getUint16(o, le);
      const get32 = (o) => tiff.getUint32(o, le);
      const ifd0 = get32(4);
      const tags = readIfd(tiff, ifd0, le, get16, get32);
      const g = (t) => tags[t];
      if (g(0x010F)) result.camera = readAscii(tiff, g(0x010F), le, get32);
      if (g(0x0110) && result.camera) result.camera += ' ' + readAscii(tiff, g(0x0110), le, get32);
      else if (g(0x0110)) result.camera = readAscii(tiff, g(0x0110), le, get32);
      result.orientation = g(0x0112) ? get16(g(0x0112) + 8) : 1;
      if (g(0x0132)) result.datetime = readAscii(tiff, g(0x0132), le, get32);
      if (g(0x8827)) result.params.iso = String(get16(g(0x8827) + 8));
      if (g(0x829A)) result.params.exposure = ratStr(tiff, g(0x829A), le, get32);
      if (g(0x829D)) result.params.fnumber = 'f/' + ratStr(tiff, g(0x829D), le, get32);
      if (g(0x920A)) result.params.focal = ratStr(tiff, g(0x920A), le, get32) + ' mm';
      // EXIF sub-IFD for datetime original
      if (g(0x8769)) {
        const exifIfd = readIfd(tiff, get32(g(0x8769)), le, get16, get32);
        if (exifIfd[0x9003]) result.datetime = readAscii(tiff, exifIfd[0x9003], le, get32);
      }
      if (g(0x8825)) {
        const gpsIfd = readIfd(tiff, get32(g(0x8825)), le, get16, get32);
        const lat = gpsCoord(tiff, gpsIfd[0x0002], le, get32);
        const lon = gpsCoord(tiff, gpsIfd[0x0004], le, get32);
        if (lat && lon) result.gps = lat.toFixed(4) + ', ' + lon.toFixed(4);
      }
    } catch (e) {}
    return result;
  }
  function readIfd(tiff, base, le, get16, get32) {
    const tags = {};
    try {
      const count = get16(base);
      for (let i = 0; i < count; i++) {
        const entry = base + 2 + i * 12;
        const id = get16(entry);
        const valOff = get32(entry + 8);
        tags[id] = valOff;
      }
    } catch (e) {}
    return tags;
  }
  function readAscii(tiff, valOff) {
    return readAsciiData(tiff, valOff, true);
  }
  function ratStr(tiff, valOff, le, get32) {
    try {
      const num = get32(valOff), den = get32(valOff + 4);
      if (!den) return '—';
      const v = num / den;
      return v >= 1 ? v.toFixed(1) : v.toFixed(4).replace(/0+$/, '');
    } catch (e) { return '—'; }
  }
  function gpsCoord(tiff, valOff, le, get32) {
    try {
      const d = get32(valOff) / get32(valOff + 4);
      const m = get32(valOff + 8) / get32(valOff + 12);
      const s = get32(valOff + 16) / get32(valOff + 20);
      return d + m / 60 + s / 3600;
    } catch (e) { return null; }
  }
  // 为 readAscii 提供正确实现（覆盖上面占位）
  function readAsciiData(tiff, valOff, le) {
    try {
      let s = '';
      let i = 0;
      while (true) {
        const c = tiff.getUint8(valOff + i);
        if (c === 0) break;
        s += String.fromCharCode(c); i++;
        if (i > 256) break;
      }
      return s.trim();
    } catch (e) { return ''; }
  }

  // ============ 复制到剪贴板 / 导出变换后位图 ============
  function makeCanvasOfCurrent(scale) {
    const item = state.items[state.index];
    if (!item || !item.img) return null;
    const img = item.img;
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const oc = ORIENT_CSS[(item.exif && item.exif.orientation) || 1] || ORIENT_CSS[1];
    // orientation 旋转会交换宽高；再叠加用户旋转
    let wO = w0, hO = h0;
    if (oc.rot % 180 !== 0) { wO = h0; hO = w0; }
    let w = wO, h = hO;
    if (state.rotation % 180 !== 0) { w = hO; h = wO; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5F4F7'; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(state.rotation * Math.PI / 180);
    if (state.flipH) ctx.scale(-1, 1);
    if (state.flipV) ctx.scale(1, -1);
    ctx.rotate(oc.rot * Math.PI / 180);
    ctx.scale(oc.fx, oc.fy);
    ctx.drawImage(img, -w0 / 2, -h0 / 2, w0, h0);
    ctx.restore();
    return canvas;
  }
  // 注：EXIF orientation 现已统一由 ORIENT_CSS + makeCanvasOfCurrent/exportCanvasOfCurrent 处理（含画布宽高交换），不再单独调用 applyExifOrientation。
  async function copyCurrentImage() {
    const item = state.items[state.index];
    if (!item) return;
    try { await loadImage(item); } catch (e) { toast('无法加载图片'); return; }
    const canvas = makeCanvasOfCurrent(1);
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      try {
        if (await desktop.copyImage(blob).catch(() => false)) { toast('已复制到剪贴板'); return; }
        if (navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          toast('已复制到剪贴板');
        } else throw new Error('no clipboard');
      } catch (e) {
        download(blob, stripExt(item.name) + '_copy.png');
        toast('剪贴板不可用，已下载 PNG');
      }
    }, 'image/png');
  }
  // 按壁纸模式把源图合成到标准 1920x1080 画布
  const WP_W = 1920, WP_H = 1080;
  function composeWallpaper(src, mode) {
    const c = document.createElement('canvas');
    c.width = WP_W; c.height = WP_H;
    const ctx = c.getContext('2d');
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    if (mode === 'fill') {
      ctx.drawImage(src, 0, 0, WP_W, WP_H);
    } else if (mode === 'tile') {
      const scale = Math.min(1, 512 / Math.max(sw, sh));
      const tw = Math.max(1, Math.round(sw * scale)), th = Math.max(1, Math.round(sh * scale));
      for (let y = 0; y < WP_H; y += th) for (let x = 0; x < WP_W; x += tw) ctx.drawImage(src, x, y, tw, th);
    } else {
      const fit = Math.min(WP_W / sw, WP_H / sh);
      let dw, dh;
      if (mode === 'center') { const s = Math.min(1, fit); dw = sw * s; dh = sh * s; ctx.fillStyle = '#1C1C1C'; ctx.fillRect(0, 0, WP_W, WP_H); }
      else { dw = sw * fit; dh = sh * fit; }
      ctx.drawImage(src, (WP_W - dw) / 2, (WP_H - dh) / 2, dw, dh);
    }
    return c;
  }
  async function setWallpaper() {
    const item = state.items[state.index];
    if (!item) return;
    if (await desktop.setWallpaper(item).catch(() => false)) { toast('已设置为桌面壁纸'); return; }
    try { await loadImage(item); } catch (e) { toast('无法加载图片'); return; }
    const src = makeCanvasOfCurrent(1);
    if (!src) { toast('无法生成壁纸'); return; }
    const mode = getSetting('view', 'wallpaperMode') || 'fit';
    const canvas = composeWallpaper(src, mode);
    const label = { fit: '适应', fill: '拉伸', center: '居中', tile: '平铺' }[mode] || '适应';
    canvas.toBlob((blob) => { download(blob, stripExt(item.name) + '_wallpaper_' + mode + '.png'); toast('壁纸图片（' + label + '）已下载（Web 原型无法直接设置系统壁纸）'); }, 'image/png');
  }
  async function revealInExplorer() {
    const item = state.items[state.index];
    if (!item) return;
    if (await desktop.reveal(item).catch(() => false)) { toast('已在资源管理器中定位'); return; }
    // Web 无法获取真实本地路径
    copyText(item.name);
    toast('已复制文件名（Web 原型无法获取完整本地路径）');
  }
  function stripExt(name) { return name.replace(/\.[^.]+$/, ''); }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
    ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove();
  }

  // ============ 图片工具：滤镜 + 导出 ============
  // 色温近似（CSS filter 组合，预览与导出用同一串，所见即所得）：-100 冷 / +100 暖
  function tempCss(t) {
    const a = Math.min(1, Math.abs(t) / 100);
    if (t > 0) return ' sepia(' + (a * 0.35).toFixed(3) + ') saturate(' + (1 + a * 0.4).toFixed(3) + ') hue-rotate(-' + (a * 12).toFixed(1) + 'deg)';
    if (t < 0) return ' hue-rotate(' + (a * 18).toFixed(1) + 'deg) brightness(' + Math.round(100 - a * 6) + '%)';
    return '';
  }
  function filterCss() {
    const f = state.filters;
    let s = 'brightness(' + f.brightness + '%) contrast(' + f.contrast + '%) saturate(' + f.saturate + '%) grayscale(' + f.gray + '%)';
    if (f.blur > 0) s += ' blur(' + (+f.blur).toFixed(1) + 'px)';
    s += tempCss(f.temp || 0);
    return s;
  }
  function applyFilters() { if (els.image) els.image.style.filter = filterCss(); renderEditPreview(); }

  // ---- 编辑撤销 / 重做：对可编辑参数态（滤镜/文字/马赛克/裁剪/高级队列）快照，恢复后重渲预览 ----
  const UNDO_MAX = 40;
  let editUndo = [], editRedo = [];
  function editSnap() {
    return JSON.stringify({
      f: state.filters, t: state.texts || [], m: state.mosaic || [], c: state.crop || null,
      o: state.ops || [], s: state.slim || null, df: state.deform || [],
      mm: state.mosaicMode || false, sm: state.slimMode || false, dm: state.deformMode || null,
    });
  }
  function restoreEdit(snap) {
    const s = JSON.parse(snap);
    state.filters = s.f; state.texts = s.t; state.mosaic = s.m; state.crop = s.c; state.ops = s.o;
    if (s.s) state.slim = s.s; if (s.df) state.deform = s.df;
    state.mosaicMode = !!s.mm; state.slimMode = !!s.sm; state.deformMode = s.dm || null;
    syncFilterUI(); applyFilters();
    if (state.textSel && !state.texts.some((x) => x.id === state.textSel)) state.textSel = null;
    if (document.getElementById('txtStyle')) { /* txt 属性输入区由用户重新选中加载 */ }
    updateOpsUI(); updateSlimUI(); updateDeformUI(); renderEditPreview();
  }
  function updateEditUndoButtons() {
    if (els.btnUndo) els.btnUndo.disabled = editUndo.length === 0;
    if (els.btnRedo) els.btnRedo.disabled = editRedo.length === 0;
  }
  function pushUndo() {
    editUndo.push(editSnap()); if (editUndo.length > UNDO_MAX) editUndo.shift();
    editRedo.length = 0; updateEditUndoButtons(); if (els.editTimeline) renderEditTimeline();
  }
  function undoEdit() {
    if (!editUndo.length) { toast('没有可撤销的编辑'); return; }
    editRedo.push(editSnap()); const prev = editUndo.pop();
    restoreEdit(prev); updateEditUndoButtons(); toast('已撤销'); if (els.editTimeline) renderEditTimeline();
  }
  function redoEdit() {
    if (!editRedo.length) { toast('没有可重做的编辑'); return; }
    editUndo.push(editSnap()); const next = editRedo.pop();
    restoreEdit(next); updateEditUndoButtons(); toast('已重做'); if (els.editTimeline) renderEditTimeline();
  }
  function clearEditHistory() { editUndo = []; editRedo = []; updateEditUndoButtons(); if (els.editTimeline) renderEditTimeline(); }

  // ============ 自定义参数预设（localStorage 持久化） ============
  const MY_STYLE_KEY = 'lvjx_my_styles';
  const MY_STYLE_MAX = 10;
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
    if (!els.myStyleGrid) return;
    els.myStyleGrid.innerHTML = '';
    const list = loadMyStyles();
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '还没有保存的风格。调好参数后点「保存当前」即可。';
      els.myStyleGrid.appendChild(empty);
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
      els.myStyleGrid.appendChild(b);
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
    toast('已保存「' + name + '」到我的风格');
  }
  function applyMyStyle(i) {
    const list = loadMyStyles();
    if (!list[i]) return;
    pushUndo();
    restoreEdit(list[i].snap);
    toast('已应用「' + list[i].name + '」');
  }
  function deleteMyStyle(i) {
    const list = loadMyStyles();
    if (!list[i]) return;
    const name = list[i].name;
    list.splice(i, 1);
    saveMyStylesList(list);
    renderMyStyles();
    toast('已删除「' + name + '」');
  }
  function clearAllMyStyles() {
    const list = loadMyStyles();
    if (!list.length) { toast('没有可清空的风格'); return; }
    if (!confirm('确定清空全部 ' + list.length + ' 个自定义风格？此操作不可撤销。')) return;
    localStorage.removeItem(MY_STYLE_KEY);
    renderMyStyles();
    toast('已清空全部自定义风格');
  }

  // ============ 编辑历史时间线 UI ============
  function renderEditTimeline() {
    if (!els.editTimeline) return;
    els.editTimeline.innerHTML = '';
    const total = editUndo.length + 1 + editRedo.length; // undo steps + current + redo steps
    // 显示：[undo倒序] → [current] → [redo正序]
    // 索引 0..editUndo.length-1 = 过去(可 undo 到)
    // 索引 editUndo.length = 当前状态
    // 索引 editUndo.length+1..total-1 = 未来(可 redo 到)
    // 显示时按时间正序：redo(过去) → undo(未来) 的相反
    // 简化：直接展示 undo 正序 + [当前] + redo 正序
    const items = [];
    editUndo.forEach((s, i) => items.push({ snap: s, idx: i, label: '步骤 ' + (i + 1), state: 'past' }));
    items.push({ snap: editSnap(), idx: editUndo.length, label: '当前', state: 'current' });
    editRedo.forEach((s, i) => items.push({ snap: s, idx: editUndo.length + 1 + i, label: '重做 ' + (i + 1), state: 'future' }));
    if (items.length === 1) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = '尚无编辑历史。开始调整图片参数后会自动记录每一步。';
      els.editTimeline.appendChild(empty);
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
      els.editTimeline.appendChild(b);
    });
  }
  function jumpToHistory(targetSnap) {
    // 计算从当前状态到目标的操作步数
    // 简化方法：先回到初始，再依次 pushUndo 直到 target
    // 但这样太慢。更简单：直接 restore + 重建 undo/redo
    const currentSnap = editSnap();
    // 如果 target 在 editUndo 中（过去），撤销直到找到
    // 如果 target 在 editRedo 中（未来），重做直到找到
    // 用 diff 最快路径：找到 target 在 undo 还是 redo
    const undoIdx = editUndo.lastIndexOf(targetSnap);
    const redoIdx = editRedo.indexOf(targetSnap);
    if (undoIdx >= 0) {
      // 在 undo 里：撤销 (editUndo.length - undoIdx - 1) 次
      const times = editUndo.length - undoIdx - 1;
      for (let i = 0; i < times; i++) { editRedo.push(editUndo.pop()); }
    } else if (redoIdx >= 0) {
      // 在 redo 里：重做 (redoIdx + 1) 次
      const times = redoIdx + 1;
      for (let i = 0; i < times; i++) { editUndo.push(editRedo.shift()); }
    } else {
      // 不在历史里（可能是当前状态的字符串化不同），直接 restore
      // 把当前快照推入 undo
      editUndo.push(currentSnap);
      editRedo.length = 0;
      restoreEdit(targetSnap);
      updateEditUndoButtons();
      renderEditTimeline();
      toast('已跳转到目标步骤');
      return;
    }
    // 最后一次 restore 并更新状态
    restoreEdit(editUndo[editUndo.length - 1] || editSnap());
    updateEditUndoButtons();
    renderEditTimeline();
    toast('已跳转到目标步骤');
  }
  function toggleEditHistory() {
    if (!els.editHistoryPanel) return;
    renderEditTimeline();
    els.editHistoryPanel.hidden = !els.editHistoryPanel.hidden;
  }

  // ---- 高级像素质点（美图秀秀式：高光 / 暗部 / 褪色 / 色调分离 / 颗粒 / 暗角）----
  // 预览（小画布，同步）与导出（全尺寸，异步分块）走同一套算法，所见即所得。
  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function smstep(e0, e1, v) {
    // 支持升序与降序区间（e0>e1 表示越靠近 e1 值越大的曲线），如 smstep(0.5, 0, lum) = 阴影掩码
    const t = (v - e0) / ((e1 - e0) || 1e-6);
    const s = clamp(t, 0, 1);
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
  // RGB 0-255 → HSL (H,S,L 都是 0-1)
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
  // HSL (H,S,L 都是 0-1) → RGB [r, g, b] 0-255
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
  // 确定性伪随机（按像素坐标散列）：预览/导出一致，且不引入 Canvas 污染
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
          S = clamp(S * hslS, 0, 1);
          // 明度偏移：-1..1（+ 提亮 / - 压暗），叠加到 L
          L = clamp(L + hslL * 0.5, 0, 1);  // 0.5 系数避免一次调到底
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
        d[i] = clamp(r, 0, 255); d[i + 1] = clamp(g, 0, 255); d[i + 2] = clamp(b, 0, 255);
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
  function openEdit(tab) {
    const item = state.items[state.index];
    if (!item) { toast('请先打开图片'); return; }
    els.editName.textContent = item.name;
    syncFilterUI();
    renderStyleGrid();
    renderMyStyles();
    switchEditTab(typeof tab === 'string' ? tab : 'beauty');
    els.editMask.hidden = false;
    renderEditPreview();
  }
  function syncFilterUI() {
    const f = state.filters;
    els.flBrightness.value = f.brightness; els.flBrightnessVal.textContent = f.brightness;
    els.flContrast.value = f.contrast; els.flContrastVal.textContent = f.contrast;
    els.flSaturate.value = f.saturate; els.flSaturateVal.textContent = f.saturate;
    els.flGray.value = f.gray; els.flGrayVal.textContent = f.gray;
    if (els.flTemp) { els.flTemp.value = f.temp; els.flTempVal.textContent = f.temp; }
    if (els.flBlur) { els.flBlur.value = f.blur; els.flBlurVal.textContent = (+f.blur).toFixed(1); }
    if (els.flSharp) { els.flSharp.value = f.sharp; els.flSharpVal.textContent = f.sharp; }
    if (els.flHighlight) { els.flHighlight.value = f.highlight || 0; els.flHighlightVal.textContent = f.highlight || 0; }
    if (els.flShadow) { els.flShadow.value = f.shadow || 0; els.flShadowVal.textContent = f.shadow || 0; }
    if (els.flFade) { els.flFade.value = f.fade || 0; els.flFadeVal.textContent = f.fade || 0; }
    if (els.flGrain) { els.flGrain.value = f.grain || 0; els.flGrainVal.textContent = f.grain || 0; }
    if (els.flVignette) { els.flVignette.value = f.vignette || 0; els.flVignetteVal.textContent = f.vignette || 0; }
    updateOpsUI();
    onExFormatChange();
    syncBeautyBar();
  }
  // 主界面「美图」条：把当前滤镜值反映到常驻滑块/数值（与弹窗侧共用同一 state.filters 源）
  function syncBeautyBar() {
    const f = state.filters;
    const pair = [['miBrightness', 'brightness', 'miBrightnessVal'], ['miContrast', 'contrast', 'miContrastVal'], ['miSaturate', 'saturate', 'miSaturateVal'], ['miTemp', 'temp', 'miTempVal'], ['miSharp', 'sharp', 'miSharpVal']];
    pair.forEach(([id, key, valId]) => {
      if (!els[id]) return;
      els[id].value = f[key];
      if (els[valId]) els[valId].textContent = f[key];
    });
  }
  function onExFormatChange() {
    const fmt = els.exFormat.value;
    els.exQualityField.hidden = (fmt === 'image/png' || fmt === 'image/bmp');
  }
  function resetFilters() {
    state.filters = { brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0, hslH: 0, hslS: 100, hslL: 0 };
    syncFilterUI(); applyFilters();
    toast('滤镜已重置');
  }
  function mimeExt(mime) {
    return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/bmp': '.bmp' })[mime] || '.img';
  }
  // 把旋转/翻转/EXIF/滤镜烘焙到一张画布（用于导出 / 预览，未裁剪）
  function bakeFullCanvas() {
    const item = state.items[state.index];
    if (!item || !item.img) return null;
    const img = item.img;
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const oc = ORIENT_CSS[(item.exif && item.exif.orientation) || 1] || ORIENT_CSS[1];
    let wO = w0, hO = h0;
    if (oc.rot % 180 !== 0) { wO = h0; hO = w0; }
    let w = wO, h = hO;
    if (state.rotation % 180 !== 0) { w = hO; h = wO; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#F5F4F7'; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(state.rotation * Math.PI / 180);
    if (state.flipH) ctx.scale(-1, 1);
    if (state.flipV) ctx.scale(1, -1);
    ctx.rotate(oc.rot * Math.PI / 180);
    ctx.scale(oc.fx, oc.fy);
    ctx.filter = filterCss();   // 烘焙滤镜
    ctx.drawImage(img, -w0 / 2, -h0 / 2, w0, h0);
    ctx.restore();
    return canvas;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  // 在 bakeFullCanvas 基础上应用裁剪（归一化矩形，坐标空间 = 已旋转/翻转后的画布）
  async function exportCanvasOfCurrent() {
    let full = bakeFullCanvas();
    if (!full) return null;
    // 瘦身/瘦脸 + 美型变形（大眼/美牙/小脸/丰唇/瘦鼻）合并位移场，一次双线性采样
    if (state.slim.enabled || (state.deform && state.deform.some((d) => (d.strength || 0) > 0))) {
      const df = deformCanvas(full, state.deform, state.slim);
      if (df) full = df;
    }
    // 锐化（3×3 卷积）在烘焙后、裁剪前应用；无像素环境（jsdom）自动跳过
    if (state.filters.sharp > 0) { const s = sharpenCanvas(full, state.filters.sharp); if (s) full = s; }
    // 高级像素质点（高光/暗部/褪色/色调分离/颗粒/暗角）：全分辨率分块异步应用
    full = await applyToneChunked(full, state.filters);
    if (!full || !state.crop) return full;
    const W = full.width, H = full.height;
    const cx = clamp(Math.round(state.crop.x * W), 0, W - 1);
    const cy = clamp(Math.round(state.crop.y * H), 0, H - 1);
    const cw = clamp(Math.round(state.crop.w * W), 1, W - cx);
    const ch = clamp(Math.round(state.crop.h * H), 1, H - cy);
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

  // ===== 照片处理：锐化（3×3 反锐化掩模，仅导出路径应用）=====
  // v' = center + k·(center - avg(4邻)) ；边缘行/列保持原值；jsdom 等无像素环境返回 null
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

  // ===== 照片处理：瘦身 / 瘦脸（局部液化位移场 + 反向映射 + 双线性采样）=====
  // 同一位移场公式预览（小画布）与导出（全尺寸）共用，所见即所得。
  // 对每个目标像素 (x,y)（归一化坐标）：dx/dy 把像素向锚点方向收缩，作用随二维高斯衰减。
  function slimWarp(slim) {
    const s = slim || {};
    if (!s.enabled) return null;
    const mode = s.mode === 'body' ? 'body' : 'face';
    const st = Math.max(0, Math.min(1, (s.strength || 0) / 100));       // 0..1
    const cx = clamp(s.cx == null ? 0.5 : s.cx, 0, 1);
    const cy = clamp(s.cy == null ? 0.5 : s.cy, 0, 1);
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
  // 计算目标像素 (nx,ny) 应采样的源坐标（双线性偏移）
  function slimDisp(w, nx, ny) {
    const dx0 = nx - w.cx, dy0 = ny - w.cy;
    const g = Math.exp(-(dx0 * dx0 * w.invRx2 + dy0 * dy0 * w.invRy2));
    return { sx: nx - w.K * g * dx0, sy: ny - w.Kv * g * dy0 };
  }
  // 双线性采样源 ImageData 的单像素（RGBA 四通道），越界 clamp
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
  // 全尺寸导出：读源像素 → 反向映射 + 双线性采样到新 canvas；无像素环境返回 null
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
  // 预览：就地修改已绘制的小画布像素（与 applyTone 同款）；无像素环境跳过
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
  // 同步瘦身瘦脸 UI 控件到 state
  function updateSlimUI() {
    const s = state.slim;
    if (els.slimStrength) els.slimStrength.value = s.strength;
    if (els.slimStrengthVal) els.slimStrengthVal.textContent = s.strength;
    if (els.slimRange) els.slimRange.value = Math.max(8, Math.min(60, Math.round(s.rx * 100)));
    if (els.slimRangeVal) els.slimRangeVal.textContent = els.slimRange ? els.slimRange.value : '';
    if (els.slimFace) els.slimFace.classList.toggle('active', s.mode === 'face');
    if (els.slimBody) els.slimBody.classList.toggle('active', s.mode === 'body');
    if (els.slimMode) els.slimMode.classList.toggle('active', state.slimMode);
  }
  // 程序化设置锚点（测试/拖拽共用）：拖拽先记原值用于位移计算
  function setSlimAnchor(x, y) {
    state.slim.cx = clamp(x, 0, 1); state.slim.cy = clamp(y, 0, 1);
    if (state.slim.strength > 0) state.slim.enabled = true;
    renderEditPreview();
  }
  // 绘制瘦身锚点标注（半透明十字圈）
  function drawSlimMarker(ctx, W, H) {
    if (!state.slimMode) return;
    const px = Math.round(state.slim.cx * W), py = Math.round(state.slim.cy * H);
    const R = Math.round((state.slim.mode === 'body' ? state.slim.ry : state.slim.rx) * W);
    ctx.save();
    ctx.strokeStyle = 'rgba(120,220,160,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, Math.max(8, R), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px - 14, py); ctx.lineTo(px + 14, py);
    ctx.moveTo(px, py - 14); ctx.lineTo(px, py + 14); ctx.stroke();
    ctx.restore();
  }

  // ===== 局部美型变形（大眼/美牙/小脸/丰唇/瘦鼻）=====
  // 每个变形 = {id, kind, cx, cy, strength, rx, ry}
  // kind: 'eye'  向外拉（眼睛放大）
  //       'teeth' 向上拉（牙齿显露更多，视觉上变白变齐）
  //       'cheek' 向内收（小脸蛋）
  //       'lip' 唇中心向外拉（丰满嘴唇）
  //       'nose' 鼻尖向上 + 鼻翼向内（瘦鼻）
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
    // 把 state.deform 数组（存储用）转成可用于采样的 def 对象数组
    return (deformList || []).map((d) => {
      const def0 = deformMakeKind(d.kind || 'eye', d.strength || 0);
      const rx = Math.max(0.03, d.rx || def0.rx);
      const ry = Math.max(0.03, d.ry || def0.ry);
      const st = Math.max(0, Math.min(1, (d.strength || 0) / 100));
      return {
        kind: d.kind || 'eye',
        cx: clamp(d.cx == null ? 0.5 : d.cx, 0, 1),
        cy: clamp(d.cy == null ? 0.5 : d.cy, 0, 1),
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
  // 全尺寸导出：slim + deform 合并位移场，一次双线性采样
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
  // ===== deform UI 同步 & 交互 =====
  function updateDeformUI() {
    const list = state.deform || [];
    const counts = { eye: 0, teeth: 0, cheek: 0, lip: 0, nose: 0 };
    list.forEach((d) => { if (counts[d.kind] != null) counts[d.kind] += 1; });
    // 已启用变形数量 badge
    const badge = els.deformCount;
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
    if (els.deformModeBtn) els.deformModeBtn.classList.toggle('active', !!state.deformMode);
  }
  // 添加一个新变形（默认定位到脸中心偏上 20%）
  function addDeform(kind) {
    // 找同 kind 的一个（允许同 kind 多个？目前只允许每种一个，用 id=kind）
    const list = state.deform || [];
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
    state.deform = list;
    state.deformMode = { kind };  // 进入该 kind 的锚点模式
    pushUndo();
    updateDeformUI();
    renderEditPreview();
  }
  // 清除所有变形
  function clearAllDeform() {
    if (!state.deform || !state.deform.length) { toast('没有可清除的变形'); return; }
    state.deform = [];
    state.deformMode = null;
    pushUndo();
    updateDeformUI();
    renderEditPreview();
    toast('已清除所有美型变形');
  }
  // 重置某一类变形
  function resetDeformKind(kind) {
    const list = (state.deform || []).filter((d) => d.kind !== kind);
    state.deform = list;
    if (state.deformMode && state.deformMode.kind === kind) state.deformMode = null;
    pushUndo();
    updateDeformUI();
    renderEditPreview();
  }
  // 程序化设置 deform 锚点（测试/拖拽共用）
  function setDeformAnchor(kind, x, y) {
    const list = state.deform || [];
    let d = list.find((dd) => dd.kind === kind);
    if (!d) {
      const def0 = deformMakeKind(kind, 0);
      d = { kind, cx: 0.5, cy: 0.5, strength: 25, rx: def0.rx, ry: def0.ry };
      list.push(d); state.deform = list;
    }
    d.cx = clamp(x, 0, 1); d.cy = clamp(y, 0, 1);
    if (d.strength > 0) state.deformMode = { kind };
    renderEditPreview();
  }
  function drawDeformMarkers(ctx, W, H) {
    if (!state.deformMode) return;
    const list = state.deform || [];
    const active = list.find((d) => d.kind === state.deformMode.kind);
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

  // ===== 照片处理：自动增强（直方图分析 → 自动调滑块，非破坏性）=====
  function autoEnhance() {
    const item = state.items[state.index];
    if (!item || !item.img) { toast('请先打开图片'); return; }
    const full = makeCanvasOfCurrent(1);  // 不含滤镜的底图，统计更准
    if (!full) { toast('无法生成画布'); return; }
    const ctx = full.getContext && full.getContext('2d');
    if (!ctx || !ctx.getImageData || !ctx.drawImage) { toast('当前环境无法分析像素'); return; }
    try {
      // 下采样到 ≤64px，统计亮度直方图与平均饱和度
      const sw = Math.max(1, Math.min(64, full.width));
      const sh = Math.max(1, Math.round(full.height * sw / Math.max(1, full.width)));
      const small = document.createElement('canvas');
      small.width = sw; small.height = sh;
      const sctx = small.getContext('2d');
      if (!sctx || !sctx.drawImage || !sctx.getImageData) { toast('当前环境无法分析像素'); return; }
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
      const brightness = Math.round(clamp(100 * 128 / Math.max(8, mid), 60, 180));
      const contrast = Math.round(clamp(100 * 255 / Math.max(32, range), 60, 180));
      const saturate = meanSat < 0.12 ? 125 : (meanSat > 0.75 ? 85 : 100);
      pushUndo();
      state.filters.brightness = brightness;
      state.filters.contrast = contrast;
      state.filters.saturate = saturate;
      syncFilterUI(); applyFilters();
      toast('自动增强：亮度 ' + brightness + '% / 对比度 ' + contrast + '% / 饱和度 ' + saturate + '%');
    } catch (e) { toast('无法读取像素：' + (e.message || e)); }
  }

  // ===== 高级处理队列（OpenCV / AI，导出时依序应用）=====
  const CV_DEFAULT_URL = 'https://docs.opencv.org/4.10.0/opencv.js';
  const ORT_DIR = './assets/ort';                 // 本地内置 onnxruntime-web（离线可用）
  const ORT_CDN_URL = ORT_DIR + '/ort.min.js';
  const ORT_WASM = 'ort-wasm-simd-threaded.wasm';
  let cvLoading = null, ortLoading = null, aiSession = null, aiSessionUrl = null;
  // ORT 离线配置：wasm 同目录加载 + 单线程（免 Worker 脚本），确保纯离线可推理
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
    const url = (getSetting('advanced', 'cvUrl') || '').trim() || CV_DEFAULT_URL;
    cvLoading = loadScript(url, () => (window.cv && window.cv.Mat ? window.cv : null));
    return cvLoading;
  }
  function loadOrt() {
    if (window.ort && window.ort.InferenceSession) { initOrtEnv(); return Promise.resolve(window.ort); }
    if (ortLoading) return ortLoading;
    ortLoading = loadScript(ORT_CDN_URL, () => (window.ort && window.ort.InferenceSession ? window.ort : null)).then((o) => { initOrtEnv(); return o; });
    return ortLoading;
  }

  // OpenCV 单步处理（cv.imread/imshow 就地写回 canvas）
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

  // 高质量插值放大（canvas 分两档插值；Lanczos-like：高缩放用两级线性，等效超分降级）
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

  // AI 超分辨率（onnxruntime-web；模型约定输入 1×3×H×W float32 0-1，输出同布局放大图）
  // 内置轻量离线超分模型（sub_pixel_cnn_2016，单通道 Y，3×，瓦片推理；~0.24MB 随包内嵌）
  const DEFAULT_AI_MODEL = './assets/sub_pixel_cnn.onnx';
  const SR_IN = 224, SR_OUT = 672, SR_SCALE = 3, SR_PAD = 12; // 瓦片 224→672，步长 212 带重叠防接缝

  // 加载 onnx session：优先用户自定义；否则内置离线模型
  async function loadAiSession(scale) {
    const url = (getSetting('advanced', 'aiModelUrl') || '').trim();
    const modelUrl = url || DEFAULT_AI_MODEL;
    if (!aiSession || aiSessionUrl !== modelUrl) {
      toast(url ? 'AI 模型加载中…（首次可能较慢）' : '离线 AI 超分模型加载中…（首次稍慢）');
      const ort = await loadOrt();
      aiSession = await ort.InferenceSession.create(modelUrl, { executionProviders: ['wasm'] });
      aiSessionUrl = modelUrl;
    }
    return aiSession;
  }

  // 内置单通道超分：Y 走模型 3× 瓦片推理，Cb/Cr 最近邻放大 3× 后合成为 RGB
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
      Cb[i] = Math.round(clamp(128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 0, 255));
      Cr[i] = Math.round(clamp(128 + 0.5 * r - 0.418688 * g - 0.081312 * b, 0, 255));
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
        oimg.data[p] = Math.round(clamp(yvl + 1.402 * (crs - 128), 0, 255));
        oimg.data[p + 1] = Math.round(clamp(yvl - 0.344136 * (cbs - 128) - 0.714136 * (crs - 128), 0, 255));
        oimg.data[p + 2] = Math.round(clamp(yvl + 1.772 * (cbs - 128), 0, 255));
        oimg.data[p + 3] = 255;
      }
    }
    octx.putImageData(oimg, 0, 0);
    return outCanvas;
  }

  // 自定义 3 通道模型路径（约定 1×3×H×W float32 0-1 → 输出同布局）
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

  // 兜底：放大画布到精确 scale（内置模型为 3×，2×/4× 时再重取样对齐）
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

  // AI 超分入口：内置离线模型（默认）走单通道瓦片；自定义 3 通道模型走 NCHW；失败降级插值
  async function aiUpscale(canvas, scale) {
    scale = Math.max(1, Math.min(4, Math.round(scale || 2)));
    const custom = !!(getSetting('advanced', 'aiModelUrl') || '').trim();
    try {
      const session = await loadAiSession(scale);
      const ai = custom ? await upscaleNCHW(session, canvas, scale) : await upscaleSRY(session, canvas);
      return ai.width === canvas.width * scale ? ai : resampleToScale(ai, scale);
    } catch (e) {
      toast('AI 放大失败（' + (e.message || e) + '），已用插值放大');
      return upscaleInterp(canvas, scale);
    }
  }
  function session0(s) { return s.inputNames && s.inputNames[0] ? s.inputNames[0] : 'input'; }
  function session1(s) { return s.outputNames && s.outputNames[0] ? s.outputNames[0] : 'output'; }

  // 依序应用高级处理队列（失败项跳过并提示，不阻断导出）
  async function applyPixelOpsAsync(canvas) {
    if (!canvas || !state.ops.length) return canvas;
    for (const op of state.ops.slice()) {
      try {
        if (op.type === 'upscale') canvas = await aiUpscale(canvas, op.scale);
        else { await loadOpenCV(); canvas = cvProcess(canvas, op); }
      } catch (e) { toast('高级处理已跳过一项：' + (e && e.message ? e.message : e)); }
    }
    return canvas;
  }
  function updateOpsUI() {
    if (els.opsReset) els.opsReset.textContent = '清空高级处理（' + state.ops.length + ' 步）';
  }
  function resetOps() {
    pushUndo();
    state.ops = [];
    updateOpsUI();
    toast('已清空高级处理');
  }
  async function onCvBtn(type) {
    if (!state.items[state.index]) { toast('请先打开图片'); return; }
    const op = type === 'median' ? { type: 'median', k: 5 }
      : type === 'bilateral' ? { type: 'bilateral', d: 5, sigma: 75 }
      : { type: 'unsharp', sigma: 2, amount: 0.6 };
    toast('正在加载 OpenCV…（首次约 8MB）');
    try { await loadOpenCV(); } catch (e) { toast('OpenCV 加载失败：' + (e.message || e)); return; }
    pushUndo();
    state.ops.push(op);
    updateOpsUI();
    toast('已加入处理队列（共 ' + state.ops.length + ' 步），导出时应用');
  }
  function onAiRun() {
    if (!state.items[state.index]) { toast('请先打开图片'); return; }
    const scale = els.aiScale ? +els.aiScale.value : 2;
    pushUndo();
    state.ops.push({ type: 'upscale', scale: scale });
    updateOpsUI();
    toast('AI 放大（' + scale + '×）已加入队列，导出时离线推理');
  }

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
  ];
  function applyStylePreset(preset) {
    pushUndo();
    state.filters = Object.assign({ brightness: 100, contrast: 100, saturate: 100, gray: 0, temp: 0, blur: 0, sharp: 0, highlight: 0, shadow: 0, fade: 0, grain: 0, vignette: 0, tintH: null, tintS: null, tintAmt: 0, hslH: 0, hslS: 100, hslL: 0 }, preset.f);
    syncFilterUI(); applyFilters();
  }
  function renderStyleGrid() {
    if (!els.styleGrid) return;
    els.styleGrid.innerHTML = '';
    STYLE_PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'btn style-cell'; b.type = 'button';
      b.textContent = p.name; b.dataset.style = p.id;
      b.addEventListener('click', () => { applyStylePreset(p); toast('风格：' + p.name); });
      els.styleGrid.appendChild(b);
    });
  }
  // 随机套用一套风格配方（主界面 / 风格配方面板共用）
  function applyRandomStyle() {
    if (!state.items[state.index]) { toast('请先打开图片'); return; }
    const pool = STYLE_PRESETS.filter((p) => p.id !== 'none');
    const p = pool[Math.floor(Math.random() * pool.length)];
    applyStylePreset(p);
    toast('随机风格配方：' + p.name);
  }

  // 美颜（OpenCV）：磨皮 = 双边滤波；美白 = 亮度提升 + 轻度磨皮；强度映射滤镜参数
  async function onBeauty(kind, intensity) {
    if (!state.items[state.index]) { toast('请先打开图片'); return; }
    const v = (intensity != null ? intensity : (els.beautyVal ? +els.beautyVal.value : 50));
    if (v <= 0) { toast('请先把强度调到大于 0'); return; }
    const a = v / 100;
    pushUndo();
    if (kind === 'white') {
      state.filters.brightness = Math.round(clamp(state.filters.brightness + 40 * a, 0, 200));
      state.filters.saturate = Math.round(clamp(state.filters.saturate + 5 * a, 0, 200));
      syncFilterUI(); applyFilters();
      toast('美白完成（强度 ' + v + '%）');
    }
    // 磨皮（两种都叠加双边滤波，美白也顺带轻磨）
    try {
      await loadOpenCV();
      state.ops.push({ type: 'bilateral', d: Math.round(3 + 7 * a), sigma: Math.round(40 + 60 * a) });
      updateOpsUI();
      toast('磨皮已加入处理队列（导出时应用，共 ' + state.ops.length + ' 步）');
    } catch (e) { toast('OpenCV 加载失败：' + (e.message || e)); }
  }

  // 一键美颜多档：轻度/自然/精致 — 每档联动「提亮 + 磨皮」参数，单次快照
  const BEAUTY_PRESETS = [
    { id: 'light',   name: '轻度', white: 20, smooth: 0  },
    { id: 'natural', name: '自然', white: 40, smooth: 35 },
    { id: 'fancy',   name: '精致', white: 55, smooth: 65 },
  ];
  async function oneClickBeauty(presetId) {
    if (!state.items[state.index]) { toast('请先打开图片'); return; }
    const p = BEAUTY_PRESETS.find((q) => q.id === presetId);
    if (!p) return;
    pushUndo();
    if (p.white > 0) {
      const a = p.white / 100;
      state.filters.brightness = Math.round(clamp(state.filters.brightness + 40 * a, 0, 200));
      state.filters.saturate = Math.round(clamp(state.filters.saturate + 5 * a, 0, 200));
      syncFilterUI(); applyFilters();
    }
    if (p.smooth > 0) {
      try {
        await loadOpenCV();
        const a = p.smooth / 100;
        state.ops.push({ type: 'bilateral', d: Math.round(3 + 7 * a), sigma: Math.round(40 + 60 * a) });
        updateOpsUI();
      } catch (e) { toast('OpenCV 加载失败：' + (e.message || e)); }
    }
    syncBeautyBar();
    toast('一键美颜「' + p.name + '」已应用');
  }

  // 边框（纯 Canvas）：pad = min(w,h)*pct；圆角用归一化半径（相对短边）
  function borderSpec() {
    const mode = els.borderMode ? els.borderMode.value : 'none';
    const rad = els.borderRadius ? +els.borderRadius.value : 0;
    return { mode, rad };
  }
  function applyBorder(canvas) {
    const { mode, rad } = borderSpec();
    if (mode === 'none' && rad <= 0) return canvas;
    const padMap = { none: 0, white: 0.05, black: 0.05, 'white-thick': 0.15 };
    const padPct = padMap[mode] || 0;
    const pad = Math.round(Math.min(canvas.width, canvas.height) * padPct);
    const out = document.createElement('canvas');
    out.width = canvas.width + pad * 2; out.height = canvas.height + pad * 2;
    const ctx = out.getContext('2d');
    if (!ctx || !ctx.drawImage) return canvas;
    ctx.fillStyle = mode === 'black' ? '#1C1C1C' : '#F5F4F7';
    ctx.fillRect(0, 0, out.width, out.height);
    if (rad > 0) {
      const r = Math.round(Math.min(canvas.width, canvas.height) * rad);
      ctx.save();
      roundRectPath(ctx, pad, pad, canvas.width, canvas.height, r);
      ctx.clip();
      ctx.drawImage(canvas, pad, pad);
      ctx.restore();
    } else ctx.drawImage(canvas, pad, pad);
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

  // 文字层：默认 9 宫格锚点 pos，可拖拽（归一化坐标）
  function txtDefaults() {
    const pos = els.txtPos ? els.txtPos.value : 'br';
    const map = { br: [0.94, 0.95], bl: [0.06, 0.95], tr: [0.94, 0.07], tl: [0.06, 0.07], c: [0.5, 0.5] };
    const [x, y] = map[pos] || map.br;
    return { x, y };
  }
  function addText() {
    const text = (els.txtInput.value || '').trim();
    if (!text) { toast('请输入文字'); return; }
    const d = txtDefaults();
    const t = {
      id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
      text,
      x: d.x, y: d.y,
      size: els.txtSize ? +els.txtSize.value : 5,
      font: els.txtFont ? els.txtFont.value : 'sans-serif',
      color: els.txtColor ? els.txtColor.value : '#1c1c1c',
      stroke: els.txtStroke ? +els.txtStroke.value : 0,
      anchor: els.txtPos ? els.txtPos.value : 'br',
    };
    pushUndo();
    state.texts.push(t);
    state.textSel = t.id;
    els.txtInput.value = '';
    renderEditPreview();
    toast('已添加文字（可拖拽移动）');
  }
  function selTextAt(nx, ny, canvasW, canvasH) {
    // 命中检测：以文字包围盒（估算宽 = 字数×字号；高 = 字号×1.3）匹配
    let best = null, bestDist = Infinity;
    for (const t of state.texts) {
      const fs = Math.max(8, t.size / 100 * Math.min(canvasW, canvasH));
      const w = t.text.length * fs, h = fs * 1.3;
      const x0 = t.anchor === 'bl' || t.anchor === 'tl' || t.anchor === 'c' ? t.x * canvasW - w / 2 : t.x * canvasW - w;
      const x1 = x0 + w;
      const y0 = t.y * canvasH - h, y1 = t.y * canvasH;
      const cx = clamp(nx * canvasW, x0, x1), cy = clamp(ny * canvasH, y0, y1);
      const dist = Math.hypot(nx * canvasW - cx, ny * canvasH - cy);
      if (dist < Math.max(fs, 12) && dist < bestDist) { best = t; bestDist = dist; }
    }
    return best;
  }
  function drawTexts(ctx, W, H) {
    for (const t of state.texts) {
      const fs = Math.max(8, t.size / 100 * Math.min(W, H));
      ctx.save();
      ctx.font = fs + 'px ' + t.font;
      ctx.textAlign = t.anchor === 'bl' || t.anchor === 'tl' || t.anchor === 'c' ? 'center' : 'right';
      ctx.textBaseline = 'alphabetic';
      if (t.stroke > 0) { ctx.lineWidth = t.stroke; ctx.strokeStyle = 'rgba(28,28,28,.75)'; ctx.strokeText(t.text, t.x * W, t.y * H); }
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x * W, t.y * H);
      if (state.textSel === t.id) {
        const w = ctx.measureText ? ctx.measureText(t.text).width : t.text.length * fs;
        ctx.strokeStyle = '#2C9678'; ctx.lineWidth = 1;
        ctx.strokeRect(t.x * W - (ctx.textAlign === 'center' ? w / 2 : w), t.y * H - fs * 1.1, w, fs * 1.3);
      }
      ctx.restore();
    }
  }
  function delSelText() {
    if (!state.textSel) { toast('请先在预览中点选文字'); return; }
    state.texts = state.texts.filter((t) => t.id !== state.textSel);
    state.textSel = null;
    renderEditPreview();
    toast('已删除文字');
  }

  // 马赛克：笔触存归一化圆；渲染 = 该区域像素化（对 full 先缩小再放大回来）
  function drawMosaic(ctx, full, W, H) {
    if (!state.mosaic.length) return;
    const cell = Math.max(6, Math.round(Math.min(full.width, full.height) * 0.012));
    for (const m of state.mosaic) {
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
    state.mosaicMode = !state.mosaicMode;
    if (els.mosaicBtn) els.mosaicBtn.textContent = state.mosaicMode ? '✓ 退出马赛克模式' : '🖌 进入马赛克模式';
    toast(state.mosaicMode ? '马赛克模式：在图上涂抹打码' : '已退出马赛克模式');
  }
  function clearMosaic() {
    state.mosaic = [];
    renderEditPreview();
    toast('已清空马赛克');
  }

  // ===== 编辑预览 + 裁剪交互 =====
  function renderEditPreview() {
    if (els.editMask.hidden) return;
    const canvas = els.editPreview;
    if (!canvas) return;
    const full = bakeFullCanvas();
    if (!full) return;
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return; // jsdom 等无 canvas 环境直接跳过
    const maxW = (els.editPreview.parentElement && els.editPreview.parentElement.clientWidth) || 420;
    const maxH = Math.max(160, Math.round(window.innerHeight * 0.46));
    const scale = Math.min(maxW / full.width, maxH / full.height, 1);
    canvas.width = Math.max(1, Math.round(full.width * scale));
    canvas.height = Math.max(1, Math.round(full.height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 抠图蒙版：先铺棋盘格透明底，再画主体（去背景所见即所得）
    const matted = state.matting.mask ? { m: state.matting.mask, W: state.matting.mW, H: state.matting.mH } : null;
    if (matted) drawChecker(ctx, canvas.width, canvas.height);
    try { ctx.drawImage(full, 0, 0, canvas.width, canvas.height); } catch (e) { return; }
    // 瘦身/瘦脸 + 美型变形：合并位移场就地应用
    try { applyDeformInPlace(ctx, canvas.width, canvas.height, state.deform, state.slim); } catch (e) { /* 无像素环境跳过 */ }
    // 高级像素质点（高光/暗部/褪色/色调分离/颗粒/暗角）：预览分辨率同步应用，与导出算法一致
    try { applyTone(ctx, canvas.width, canvas.height, state.filters); } catch (e) { /* 无像素环境跳过 */ }
    // 美工叠加：马赛克（预览用缩放画布像素化，烘焙在导出用全尺寸重算）与文字层
    try { drawMosaic(ctx, full, canvas.width, canvas.height); } catch (e) { /* 无像素环境跳过 */ }
    try { drawTexts(ctx, canvas.width, canvas.height); } catch (e) { /* 无字体环境跳过 */ }
    if (matted) applyMaskOverlay(ctx, canvas.width, canvas.height, matted);
    drawCropOverlay(ctx, canvas.width, canvas.height);
    drawMatStrokes(ctx, canvas.width, canvas.height);
    try { drawSlimMarker(ctx, canvas.width, canvas.height); } catch (e) { /* 无像素环境跳过 */ }
    try { drawDeformMarkers(ctx, canvas.width, canvas.height); } catch (e) { /* 无像素环境跳过 */ }
  }
  // 棋盘格透明底（抠图预览用）
  function drawChecker(ctx, W, H) {
    const c = 12;
    ctx.fillStyle = '#e7e7eb';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i * c < W; i++) for (let j = 0; j * c < H; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(i * c, j * c, c, c);
    }
  }
  // 用蒙版把画布像素 alpha 乘上透明度（软边羽化）
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
  // 画笔笔迹叠加（前景绿 / 背景红）
  function drawMatStrokes(ctx, W, H) {
    const s = state.matting.strokes;
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
    const v = els.matSize ? +els.matSize.value : 30;
    return clamp(v / 2 / 100, 0.03, 0.4);
  }
  function drawCropOverlay(ctx, W, H) {
    if (!state.crop) return;
    const px = normToPx(state.crop, W, H);
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
    const r = els.editPreview.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left) / r.width, 0, 1),
      y: clamp((e.clientY - r.top) / r.height, 0, 1),
    };
  }
  function hitHandle(p) {
    if (!state.crop) return null;
    const W = els.editPreview.width, H = els.editPreview.height;
    const hs = 12;
    const corners = {
      tl: [state.crop.x, state.crop.y],
      tr: [state.crop.x + state.crop.w, state.crop.y],
      bl: [state.crop.x, state.crop.y + state.crop.h],
      br: [state.crop.x + state.crop.w, state.crop.y + state.crop.h],
    };
    for (const k in corners) {
      const hx = corners[k][0] * W, hy = corners[k][1] * H;
      if (Math.abs(p.x * W - hx) <= hs && Math.abs(p.y * H - hy) <= hs) return k;
    }
    return null;
  }
  function mosaicRadiusNorm() {
    const v = els.mosaicSize ? +els.mosaicSize.value : 30;
    return clamp(v / 2 / 100, 0.03, 0.4);  // 笔刷值 10–80 → 归一化半径 0.05–0.4
  }
  function onPreviewDown(e) {
    if (els.editMask.hidden) return;
    const p = previewPoint(e);
    // 瘦身/瘦脸锚点模式：按下即定位/拖动锚点
    if (state.slimMode) {
      state.slimDrag = true;
      setSlimAnchor(p.x, p.y);
      if (els.editPreview.setPointerCapture) { try { els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault();
      return;
    }
    // 抠图模式：按下即开始涂抹前景/背景笔迹
    if (state.matting.mode !== 'none') {
      state.matting.strokes[state.matting.mode].push({ x: p.x, y: p.y, r: matBrushRadiusNorm() });
      state.matting.mask = null;  // 修改笔迹后需重新抠图
      renderEditPreview();
      if (els.editPreview.setPointerCapture) { try { els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault();
      return;
    }
    // 马赛克模式：按下即开始涂抹
    if (state.mosaicMode) {
      state.mosaicPainting = true;
      state.mosaic.push({ x: p.x, y: p.y, r: mosaicRadiusNorm() });
      renderEditPreview();
      if (els.editPreview.setPointerCapture) { try { els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault();
      return;
    }
    // 文字优先：点中文字 → 拖拽 / 选中（有文字时不再落入裁剪逻辑）
    if (state.texts.length) {
      const hit = selTextAt(p.x, p.y, els.editPreview.width, els.editPreview.height);
      if (hit) {
        state.textSel = hit.id;
        state.textDrag = { id: hit.id, start: p, origin: { x: hit.x, y: hit.y } };
        renderEditPreview();
        if (els.editPreview.setPointerCapture) { try { els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
        e.preventDefault();
        return;
      }
      state.textSel = null;
    }
    const h = hitHandle(p);
    if (h) state.cropDrag = { mode: 'resize', handle: h, start: p };
    else if (state.crop && p.x >= state.crop.x && p.x <= state.crop.x + state.crop.w && p.y >= state.crop.y && p.y <= state.crop.y + state.crop.h) {
      state.cropDrag = { mode: 'move', start: p, origin: { x: state.crop.x, y: state.crop.y } };
    } else {
      state.crop = { x: p.x, y: p.y, w: 0, h: 0 };
      state.cropDrag = { mode: 'new', start: p };
    }
    if (els.editPreview.setPointerCapture) { try { els.editPreview.setPointerCapture(e.pointerId); } catch (_) {} }
    e.preventDefault();
  }
  function onPreviewMove(e) {
    const p = previewPoint(e);
    // 瘦身/瘦脸锚点拖动
    if (state.slimDrag) { setSlimAnchor(p.x, p.y); return; }
    // 抠图笔迹拖绘
    if (state.matting.mode !== 'none' && (e.buttons & 1)) {
      state.matting.strokes[state.matting.mode].push({ x: p.x, y: p.y, r: matBrushRadiusNorm() });
      state.matting.mask = null;
      renderEditPreview();
      return;
    }
    // 马赛克涂抹
    if (state.mosaicPainting) {
      state.mosaic.push({ x: p.x, y: p.y, r: mosaicRadiusNorm() });
      renderEditPreview();
      return;
    }
    // 文字拖拽
    if (state.textDrag) {
      const t = state.texts.find((x) => x.id === state.textDrag.id);
      if (t) {
        t.x = clamp(state.textDrag.origin.x + (p.x - state.textDrag.start.x), 0, 1);
        t.y = clamp(state.textDrag.origin.y + (p.y - state.textDrag.start.y), 0, 1);
        renderEditPreview();
      }
      return;
    }
    if (!state.cropDrag) return;
    const MIN = 0.02;
    if (state.cropDrag.mode === 'new') {
      const s = state.cropDrag.start;
      state.crop = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    } else if (state.cropDrag.mode === 'move') {
      const dx = p.x - state.cropDrag.start.x, dy = p.y - state.cropDrag.start.y;
      state.crop.x = clamp(state.cropDrag.origin.x + dx, 0, 1 - state.crop.w);
      state.crop.y = clamp(state.cropDrag.origin.y + dy, 0, 1 - state.crop.h);
    } else if (state.cropDrag.mode === 'resize') {
      let c = state.crop;
      let left = c.x, top = c.y, right = c.x + c.w, bottom = c.y + c.h;
      if (state.cropDrag.handle === 'tl') { left = p.x; top = p.y; }
      else if (state.cropDrag.handle === 'tr') { right = p.x; top = p.y; }
      else if (state.cropDrag.handle === 'bl') { left = p.x; bottom = p.y; }
      else if (state.cropDrag.handle === 'br') { right = p.x; bottom = p.y; }
      left = clamp(left, 0, right - MIN); right = clamp(right, left + MIN, 1);
      top = clamp(top, 0, bottom - MIN); bottom = clamp(bottom, top + MIN, 1);
      state.crop = { x: left, y: top, w: right - left, h: bottom - top };
    }
    renderEditPreview();
  }
  function onPreviewUp(e) {
    if (state.slimDrag) { state.slimDrag = false; return; }
    if (state.mosaicPainting) { state.mosaicPainting = false; return; }
    if (state.textDrag) { state.textDrag = null; return; }
    if (!state.cropDrag) return;
    if (state.cropDrag.mode === 'new' && (state.crop.w < 0.01 || state.crop.h < 0.01)) state.crop = null;
    state.cropDrag = null;
    if (els.editPreview.releasePointerCapture && e.pointerId != null) { try { els.editPreview.releasePointerCapture(e.pointerId); } catch (_) {} }
    renderEditPreview();
  }
  function resetCrop() {
    state.crop = null;
    renderEditPreview();
    toast('已重置裁剪');
  }
  // ===== 一键抠图（离线智能去背） =====
  function setMatBrush(mode) {
    state.matting.mode = state.matting.mode === mode ? 'none' : mode;  // 再点一次取消画笔
    updateMattingUI();
  }
  function updateMattingUI() {
    if (!els.matFg) return;
    els.matFg.textContent = state.matting.mode === 'fg' ? '✓ 前景笔（涂抹中）' : '🖌 前景笔';
    els.matBg.textContent = state.matting.mode === 'bg' ? '✓ 背景笔（涂抹中）' : '🧹 背景笔';
    if (els.matSizeVal) els.matSizeVal.textContent = els.matSize ? els.matSize.value : '';
    const n = state.matting.strokes.fg.length + state.matting.strokes.bg.length;
    if (els.matStatus) {
      if (state.matting.mask) els.matStatus.textContent = '抠图完成 ✅ — 可继续涂抹微调，「清除笔迹」重来。';
      else if (n > 0) els.matStatus.textContent = '已标记 ' + n + ' 笔 — 点「✨ 一键抠图」生成透明蒙版。';
      else els.matStatus.textContent = '未涂抹 — 先在前景/背景画笔中选择一种，在预览图上涂抹标记。';
    }
  }
  // 栅格化笔迹 → 前景/背景样本下标集合（在 bw*bh 的工作分辨率上）
  function matSamples(sc, bw, bh, fgIdx, bgIdx) {
    const strike = (arr, set) => {
      for (const st of arr) {
        const cx = st.x * bw, cy = st.y * bh;
        const r = clamp(st.r, 0.02, 1) * Math.min(bw, bh);
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
  // 颜色空间分布（逐通道均值/方差的高斯，加小 epsilon 防退化）
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
  // 逐像素分类 → alpha 0-255（likelihood 比），再边缘感知羽化
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
  // 运行分割：在工作分辨率推理，蒙版存 state.matting.mask，预览即时可见
  function runMatting() {
    const full = bakeFullCanvas();
    if (!full || !full.getContext) return false;
    const s = state.matting.strokes;
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
    if (fgIdx.size === 0) { toast('请先用前景笔在主体上涂抹'); updateMattingUI(); return false; }
    const fgf = matStats(fgIdx, fgIdx.size, d);
    const fgb = matStats(bgIdx, bgIdx.size, d);
    state.matting.mask = matSegment(d, bw, bh, fgf, fgb, fgIdx, bgIdx);
    state.matting.mW = bw; state.matting.mH = bh;
    toast('抠图完成 ✅');
    updateMattingUI();
    renderEditPreview();
    return true;
  }
  function clearMatting() {
    state.matting.strokes = { fg: [], bg: [] };
    state.matting.mask = null;
    state.matting.mW = 0; state.matting.mH = 0;
    state.matting.mode = 'none';
    updateMattingUI();
    renderEditPreview();
    toast('已清除抠图笔迹');
  }
  // 导出透明 PNG：全尺寸重建 + 蒙版双线性放大软边
  async function exportMatting() {
    const item = state.items[state.index];
    if (!item) return;
    if (!state.matting.mask) { toast('请先执行「一键抠图」'); return; }
    const full = bakeFullCanvas();
    if (!full || !full.getContext || !full.getContext('2d')) return;
    const W = full.width, H = full.height;
    const mm = state.matting.mask, mW = state.matting.mW, mH = state.matting.mH;
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
    download(blob, name);
    toast('已导出透明 PNG：' + name);
  }
  async function exportCurrent() {
    const item = state.items[state.index];
    if (!item) return;
    try { await loadImage(item); } catch (e) { toast('无法加载图片'); return; }
    let canvas = await exportCanvasOfCurrent();
    if (!canvas) return;
    // 美工烘焙：马赛克（全尺寸重算）→ 文字 → 边框（OpenCV/AI 之后、编码之前）
    if (state.mosaic.length) {
      const ctx = canvas.getContext('2d');
      if (ctx) { try { drawMosaic(ctx, canvas, canvas.width, canvas.height); } catch (e) { /* 跳过 */ } }
    }
    if (state.texts.length) {
      const ctx = canvas.getContext('2d');
      if (ctx) { try { drawTexts(ctx, canvas.width, canvas.height); } catch (e) { /* 跳过 */ } }
    }
    canvas = applyBorder(canvas);
    if (state.ops.length) {
      toast('正在应用 ' + state.ops.length + ' 步高级处理…');
      canvas = await applyPixelOpsAsync(canvas);
      if (!canvas) return;
    }
    const fmt = els.exFormat.value;
    const base = stripExt(item.name) + mimeExt(fmt);
    if (fmt === 'image/bmp') {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      download(new Blob([encodeBMP(data)], { type: 'image/bmp' }), base);
      toast('已导出 BMP：' + base);
      return;
    }
    const quality = (+els.exQuality.value) / 100;
    canvas.toBlob((blob) => {
      if (!blob) { toast('导出失败'); return; }
      download(blob, base);
      toast('已导出：' + base);
    }, fmt, quality);
  }

  // ============ 幻灯片 ============
  function startSlideshow() {
    if (!state.items.length) return;
    state.slide.active = true; state.slide.paused = false;
    state.slide.interval = (getSetting('slideshow', 'interval') || 5) * 1000;
    state.slide.order = getSetting('slideshow', 'order') || 'forward';
    state.slide.played = [];
    enterFullscreen();
    els.slideBar.hidden = false;
    els.slidePlay.textContent = '⏸';
    state.slide.last = performance.now(); state.slide.elapsed = 0;
    tickSlide();
  }
  function tickSlide() {
    if (!state.slide.active) return;
    const step = (ts) => {
      if (!state.slide.active) return;
      const dt = ts - state.slide.last; state.slide.last = ts;
      if (!state.slide.paused) {
        state.slide.elapsed += dt;
        const p = Math.min(1, state.slide.elapsed / state.slide.interval);
        els.slideFill.style.width = (p * 100) + '%';
        if (state.slide.elapsed >= state.slide.interval) { state.slide.elapsed = 0; slideNext(); }
      }
      state.slide.raf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(state.slide.raf);
    state.slide.raf = requestAnimationFrame(step);
  }
  function slideNext() {
    showImage(nextIndex());
    applyTransition();
  }
  function slidePrev() {
    showImage(prevIndex());
    applyTransition();
  }
  function nextIndex() {
    const n = state.items.length;
    if (state.slide.order === 'random') {
      if (state.slide.played.length >= n) state.slide.played = [];
      let i; do { i = Math.floor(Math.random() * n); } while (state.slide.played.includes(i) && state.slide.played.length < n);
      state.slide.played.push(i); return i;
    }
    if (state.slide.order === 'reverse') return state.index - 1;
    return state.index + 1;
  }
  function prevIndex() {
    if (state.slide.order === 'reverse') return state.index + 1;
    return state.index - 1;
  }
  function applyTransition() {
    const t = getSetting('slideshow', 'transition') || 'fade';
    const map = { fade: 'fadeIn 0.3s', left: 'slideL 0.3s', right: 'slideR 0.3s', up: 'slideU 0.3s', down: 'slideD 0.3s', zoom: 'zoomIn 0.3s', none: 'none' };
    els.imgWrap.style.animation = 'none'; void els.imgWrap.offsetWidth; els.imgWrap.style.animation = map[t] || 'fadeIn 0.3s';
  }
  function stopSlideshow() {
    state.slide.active = false;
    cancelAnimationFrame(state.slide.raf);
    els.slideBar.hidden = true;
    els.slideFill.style.width = '0%';
    exitFullscreen();
  }
  function toggleSlidePlay() {
    state.slide.paused = !state.slide.paused;
    els.slidePlay.textContent = state.slide.paused ? '▶' : '⏸';
    state.slide.last = performance.now();
  }

  // ============ 全屏 ============
  function enterFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }
  function exitFullscreen() {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  // ============ 右键菜单 ============
  function showCtxMenu(x, y) {
    const m = els.ctxMenu;
    m.style.left = Math.min(x, window.innerWidth - 200) + 'px';
    m.style.top = Math.min(y, window.innerHeight - 180) + 'px';
    m.hidden = false;
  }
  // 事件绑定在 bindEvents() 中完成（需等 cacheDom 之后）

  // ============ 信息面板切换 ============
  function toggleInfo() {
    els.infoPanel.hidden = !els.infoPanel.hidden;
    if (els.infoPanel.hidden === false) renderInfo();
  }

  // ============ 设置 UI ============
  let settingsGroup = 'general';
  function openSettings() {
    capturingAction = null;
    buildSettingsNav();
    renderSettingsForm();
    els.settingsMask.hidden = false;
  }
  function buildSettingsNav() {
    const nav = els.settingsNav; nav.innerHTML = '';
    Object.keys(GROUP_LABELS).forEach((g) => {
      const b = document.createElement('button');
      b.textContent = GROUP_LABELS[g];
      b.className = g === settingsGroup ? 'active' : '';
      b.addEventListener('click', () => { settingsGroup = g; buildSettingsNav(); renderSettingsForm(); });
      nav.appendChild(b);
    });
  }
  function renderSettingsForm() {
    const form = els.settingsForm; form.innerHTML = '';
    if (settingsGroup === 'shortcuts') { renderKeymapForm(); return; }
    if (settingsGroup === 'manual') { renderStaticSection(manualContent()); return; }
    if (settingsGroup === 'about') { renderStaticSection(aboutContent()); return; }
    SETTINGS_SCHEMA.filter((s) => s.group === settingsGroup).forEach((s) => form.appendChild(settingRow(s)));
  }
  function renderStaticSection(html) {
    const form = els.settingsForm;
    const wrap = document.createElement('div'); wrap.className = 'static-help';
    wrap.innerHTML = html;
    form.appendChild(wrap);
  }
  function renderKeymapForm() {
    const form = els.settingsForm;
    form.innerHTML = '';
    const hint = document.createElement('div'); hint.className = 'desc';
    hint.textContent = capturingAction ? '请按下新的快捷键…（Esc 取消）' : '点击右侧按钮后按下按键即可重新绑定；冲突的按键会自动让出。';
    form.appendChild(hint);
    KEYMAP_SCHEMA.forEach(({ action, label }) => {
      const row = document.createElement('div'); row.className = 'setting-row';
      const left = document.createElement('div'); left.innerHTML = `<div class="label">${escapeHtml(label)}</div>`;
      const val = document.createElement('div');
      const btn = document.createElement('button'); btn.className = 'btn key-bind'; btn.dataset.action = action;
      const combos = (keymap[action] || []).filter(Boolean);
      btn.textContent = capturingAction === action ? '按下按键…' : (combos.length ? combos.map(prettyCombo).join(' / ') : '（未绑定）');
      btn.addEventListener('click', () => startCapture(action));
      val.appendChild(btn);
      row.appendChild(left); row.appendChild(val);
      form.appendChild(row);
    });
    const reset = document.createElement('button'); reset.className = 'btn'; reset.textContent = '恢复默认快捷键';
    reset.style.marginTop = '10px';
    reset.addEventListener('click', () => { keymap = JSON.parse(JSON.stringify(DEFAULT_KEYMAP)); saveKeymap(); buildComboLookup(); renderKeymapForm(); toast('已恢复默认快捷键'); });
    form.appendChild(reset);
  }
  function startCapture(action) { capturingAction = action; renderKeymapForm(); }
  function settingRow(s) {
    const row = document.createElement('div'); row.className = 'setting-row';
    const left = document.createElement('div');
    left.innerHTML = `<div class="label">${s.label}</div>` + (s.desc ? `<div class="desc">${escapeHtml(s.desc)}</div>` : '');
    const val = document.createElement('div');
    const cur = getSetting(s.group, s.key);
    if (s.type === 'toggle') {
      const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = cur ? '开' : '关';
      btn.style.background = cur ? 'var(--accent-soft)' : ''; btn.style.color = cur ? 'var(--accent)' : '';
      btn.addEventListener('click', () => { settings[s.group][s.key] = !cur; saveSettings(); applySettingLive(s.group, s.key); renderSettingsForm(); });
      val.appendChild(btn);
    } else if (s.type === 'select') {
      const sel = document.createElement('select');
      s.options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === cur) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', () => { settings[s.group][s.key] = sel.value; saveSettings(); applySettingLive(s.group, s.key); });
      val.appendChild(sel);
    } else if (s.type === 'range') {
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = s.min; inp.max = s.max; inp.step = s.step || 1; inp.value = cur;
      const lab = document.createElement('span'); lab.textContent = cur; lab.style.marginLeft = '8px';
      inp.addEventListener('input', () => { lab.textContent = inp.value; });
      inp.addEventListener('change', () => { settings[s.group][s.key] = +inp.value; saveSettings(); applySettingLive(s.group, s.key); });
      val.appendChild(inp); val.appendChild(lab);
    } else if (s.type === 'text') {
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = cur || '';
      inp.addEventListener('change', () => { settings[s.group][s.key] = inp.value; saveSettings(); applySettingLive(s.group, s.key); });
      val.appendChild(inp);
    }
    row.appendChild(left); row.appendChild(val);
    return row;
  }
  function applySettingLive(group, key) {
    if (group === 'view' && key === 'renderMode') {
      els.image.classList.toggle('pixelated', getSetting('view', 'renderMode') === 'pixelated');
    } else if (group === 'view' && key === 'loop') {
      // 影响翻页逻辑，下次翻页生效
    } else if (group === 'slideshow' && key === 'interval') {
      state.slide.interval = (getSetting('slideshow', 'interval') || 5) * 1000;
    }
  }

  // ============ 批量处理 ============
  let batchTab = 'convert';
  function openBatch() {
    if (!state.items.length) { toast('请先打开图片'); return; }
    els.batchScope.textContent = '作用范围：全部 ' + state.items.length + ' 张';
    els.batchMask.hidden = false;
    if (els.btPreset && !els.btPreset.options.length) {
      STYLE_PRESETS.forEach((p) => {
        if (p.id === 'none') return;
        const o = document.createElement('option');
        o.value = p.id; o.textContent = p.name;
        els.btPreset.appendChild(o);
      });
    }
    switchBatchTab('convert');
    updateRenamePreview();
  }
  function switchBatchTab(tab) {
    batchTab = tab;
    $$('.batch-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.batch-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    if (tab === 'rename') updateRenamePreview();
    else if (tab === 'convert') renderCvPreview();
    else if (tab === 'resize') { updateRsUI(); renderRsPreview(); }
    else if (tab === 'tone') renderTonePreview();
    else if (tab === 'compress') { updateCompressUI(); renderCompressPreview(); }
    else if (tab === 'watermark') { updateWmUI(); renderWmPreview(); }
  }
  // ===== 批量加水印 =====
  function updateWmUI() {
    if (els.wmSizeVal) els.wmSizeVal.textContent = els.wmSize.value;
    if (els.wmOpacityVal) els.wmOpacityVal.textContent = els.wmOpacity.value;
    if (els.wmMarginVal) els.wmMarginVal.textContent = els.wmMargin.value;
  }
  // 纯函数：在 canvas ctx 上画文字水印，返回同 ctx（可链式调用）
  // 参考：drawTexts(ctx, W, H)（state.texts 版），这里是批量独立参数版
  function drawWatermarkOnCanvas(ctx, W, H, opts) {
    const text = opts.text || '';
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
    const cv = els.wmPreview, lbl = els.wmPreviewLabel;
    if (!cv || !lbl) return;
    const it = state.items[state.index] || state.items[0];
    const ctx = cv.getContext('2d');
    if (!it || !it.img) { lbl.textContent = '水印预览：无图片'; ctx.clearRect(0, 0, cv.width, cv.height); return; }
    ctx.clearRect(0, 0, cv.width, cv.height);
    // 按比例缩放原图到 200x200 内
    const scale = Math.min(cv.width / it.img.naturalWidth, cv.height / it.img.naturalHeight);
    const dw = it.img.naturalWidth * scale, dh = it.img.naturalHeight * scale;
    const dx = (cv.width - dw) / 2, dy = (cv.height - dh) / 2;
    ctx.drawImage(it.img, dx, dy, dw, dh);
    // 画水印（参数从 DOM 读）
    drawWatermarkOnCanvas(ctx, dw, dh, {
      text: els.wmText ? els.wmText.value : '',
      size: els.wmSize ? +els.wmSize.value : 5,
      opacity: els.wmOpacity ? +els.wmOpacity.value : 60,
      color: els.wmColor ? els.wmColor.value : '#ffffff',
      pos: els.wmPos ? els.wmPos.value : 'br',
      margin: els.wmMargin ? +els.wmMargin.value : 3,
    });
    lbl.textContent = '水印预览：' + it.name;
  }
  async function batchWatermark(it) {
    const fmt = els.wmFormat ? els.wmFormat.value : 'image/jpeg';
    const text = els.wmText ? els.wmText.value.trim() : '';
    if (!text) { toast('请先输入水印文字'); return null; }
    await loadImage(it);
    if (!it.img) return null;
    const canvas = document.createElement('canvas');
    canvas.width = it.img.naturalWidth;
    canvas.height = it.img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(it.img, 0, 0);
    drawWatermarkOnCanvas(ctx, canvas.width, canvas.height, {
      text,
      size: els.wmSize ? +els.wmSize.value : 5,
      opacity: els.wmOpacity ? +els.wmOpacity.value : 60,
      color: els.wmColor ? els.wmColor.value : '#ffffff',
      pos: els.wmPos ? els.wmPos.value : 'br',
      margin: els.wmMargin ? +els.wmMargin.value : 3,
    });
    const mime = fmt === 'image/jpeg' ? 'image/jpeg' : fmt === 'image/webp' ? 'image/webp' : 'image/png';
    const quality = mime === 'image/png' ? undefined : 0.92;
    return new Promise((res) => { canvas.toBlob(res, mime, quality); });
  }
  function updateCompressUI() {
    const f = els.cpFormat ? els.cpFormat.value : 'same';
    els.cpQualityVal.textContent = els.cpQuality.value;
    const lossy = f !== 'image/png';
    els.cpQualityField.hidden = !lossy;
    els.cpQuality.disabled = !lossy;
  }
  // 批量压缩实时预览：按当前格式/质量/最长边把首张图重编码到缩略画布，估算输出体积
  async function renderCompressPreview() {
    const cv = els.cpPreview, lbl = els.cpPreviewLabel;
    if (!cv || !lbl) return;
    const it = state.items[state.index] || state.items[0];
    if (!it || !it.img) { lbl.textContent = '压缩预览：无图片'; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    const fmtSel = els.cpFormat ? els.cpFormat.value : 'same';
    const quality = els.cpQuality ? Number(els.cpQuality.value) || 75 : 75;
    const maxEdge = els.cpMaxEdge ? Number(els.cpMaxEdge.value) || 0 : 0;
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
  // 格式转换实时预览：按 cvFormat/cvQuality 重编码活动图，展示尺寸/格式/体积
  async function renderCvPreview() {
    const cv = els.cvPreview, lbl = els.cvPreviewLabel;
    if (!cv || !lbl) return;
    const it = state.items[state.index] || state.items[0];
    if (!it || !it.img) { lbl.textContent = '转换预览：无图片'; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    const fmt = els.cvFormat ? els.cvFormat.value : 'image/jpeg';
    const q = els.cvQuality ? Number(els.cvQuality.value) || 92 : 92;
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
  // 调整尺寸实时预览：按 rsMode/percent|exact/lockRatio 计算目标尺寸，绘制缩放后结果
  async function renderRsPreview() {
    const cv = els.rsPreview, lbl = els.rsPreviewLabel;
    if (!cv || !lbl) return;
    const it = state.items[state.index] || state.items[0];
    if (!it || !it.img) { lbl.textContent = '调整尺寸预览：无图片'; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
    const iw = it.img.naturalWidth, ih = it.img.naturalHeight;
    let dw, dh;
    if (els.rsMode.value === 'percent') {
      const p = (+els.rsPercent.value) / 100;
      dw = Math.max(1, Math.round(iw * p)); dh = Math.max(1, Math.round(ih * p));
    } else {
      dw = Math.max(1, +els.rsWidth.value || iw);
      dh = els.rsLockRatio.checked ? Math.max(1, Math.round(dw * ih / iw)) : Math.max(1, +els.rsHeight.value || ih);
    }
    const fmt = els.rsFormat.value;
    const fmtLabel = (fmt.split('/')[1] || 'img').toUpperCase();
    try {
      const MAX = 240, s = Math.min(1, MAX / dw, MAX / dh);
      const pw = Math.max(1, Math.round(dw * s)), ph = Math.max(1, Math.round(dh * s));
      const pc = document.createElement('canvas'); pc.width = pw; pc.height = ph;
      const pcx = pc.getContext('2d');
      pcx.imageSmoothingEnabled = (els.rsResample.value !== 'pixelated');
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
  // 尺寸模式显隐更新（percent/exact）
  function updateRsUI() {
    const ex = els.rsMode && els.rsMode.value === 'exact';
    if (els.rsPercentField) els.rsPercentField.hidden = ex;
    if (els.rsExactField) els.rsExactField.hidden = !ex;
  }
  function switchEditTab(tab) {
    $$('.edit-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.edit-pane').forEach((p) => p.classList.toggle('active', p.dataset.pane === tab));
  }
  function updateRenamePreview() {
    const tpl = els.rnTemplate.value;
    const box = els.rnPreview; box.innerHTML = '';
    state.items.slice(0, 50).forEach((it, i) => {
      const newName = applyRenameTemplate(tpl, it.name, i);
      const div = document.createElement('div'); div.className = 'rp-row';
      div.innerHTML = `<span class="rp-old">${escapeHtml(it.name)}</span><span class="rp-arrow">→</span><span class="rp-new">${escapeHtml(newName)}</span>`;
      box.appendChild(div);
    });
    if (state.items.length > 50) { const d = document.createElement('div'); d.className = 'rp-row'; d.textContent = '… 共 ' + state.items.length + ' 张'; box.appendChild(d); }
  }
  function applyRenameTemplate(tpl, name, idx) {
    const ext = extOf(name) ? '.' + extOf(name) : '';
    const base = stripExt(name);
    const date = new Date();
    const y = date.getFullYear(), mo = pad(date.getMonth() + 1, 2), d = pad(date.getDate(), 2);
    const today = y + '-' + mo + '-' + d;
    const map = {
      '{name}': base,
      '{n}': String(idx + 1),
      '{n:3}': pad(idx + 1, 3),
      '{date}': today,
      '{date:YYYYMMDD}': '' + y + mo + d,
    };
    let out = tpl.replace(/\{n:3\}|\{n\}|\{name\}|\{date:YYYYMMDD\}|\{date\}/g, (m) => map[m]);
    if (!out.toLowerCase().endsWith(ext.toLowerCase())) out += ext;
    return out;
  }

  let batchCancelled = false;
  async function runBatch() {
    if (!state.items.length) return;
    const items = state.items;
    batchCancelled = false;
    els.batchProgress.hidden = false;
    els.batchReport.hidden = true;
    els.batchCancel.hidden = false;
    els.batchRun.disabled = true;
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
          else if (batchTab === 'resize') { blob = await batchResize(it); name = stripExt(it.name) + extFromMime(getSettingResampleFormat()); }
          else if (batchTab === 'rename') { blob = await fileToBlob(it.file); name = applyRenameTemplate(els.rnTemplate.value, it.name, i); }
          else if (batchTab === 'tone') { blob = await batchTone(it, els.btPreset.value, els.btFormat.value); if (els.btKeepName.checked) name = stripExt(it.name) + extFromMime(els.btFormat.value); }
          else if (batchTab === 'compress') { const r = await batchCompress(it); blob = r.blob; name = r.name; }
          else if (batchTab === 'watermark') { blob = await batchWatermark(it); if (blob) name = stripExt(it.name) + extFromMime(els.wmFormat.value); }
          if (blob) entries.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
          else fail++;
        } catch (err) {
          fail++;
          console.warn('批量项处理失败:', it.name, err);
        }
        const p = Math.round(((i + 1) / n) * 100);
        els.batchBarFill.style.width = p + '%';
        els.batchProgressText.textContent = (i + 1) + ' / ' + n;
      }
      if (entries.length) {
        const zip = makeZip(entries);
        download(new Blob([zip], { type: 'application/zip' }), 'batch_output.zip');
      }
      const summary = '批量' + (batchCancelled ? '已取消' : '完成') + '：成功 ' + entries.length + ' · 失败 ' + fail + ' · 跳过 ' + Math.max(0, n - entries.length - fail) + (entries.length ? '，已下载 ZIP' : '，无文件输出');
      els.batchReport.hidden = false;
      els.batchReport.textContent = summary;
      toast(summary);
    } finally {
      els.batchRun.disabled = false;
      els.batchCancel.hidden = true;
      setTimeout(() => {
        els.batchProgress.hidden = true;
        els.batchBarFill.style.width = '0%';
        els.batchProgressText.textContent = '0 / 0';
        els.batchReport.hidden = true;
      }, 2500);
    }
  }
  function getSettingResampleFormat() { return els.rsFormat.value; }
  function extFromMime(m) { return { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[m] || '.img'; }

  // 批量套滤镜：把 STYLE_PRESETS 预设应用到单张原图，输出为指定格式 Blob
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
  // 批量压缩：统一质量控制 + 最长边等比缩放，输出指定/原格式 Blob
  const CP_EXT = { 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/png': '.png' };
  function mimeFromName(name, fb) {
    const e = extOf(name).toLowerCase();
    const m = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', bmp: 'image/bmp' }[e];
    return m || fb;
  }
  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
  }
  async function batchCompress(item) {
    const fmtSel = els.cpFormat.value;
    const quality = Number(els.cpQuality.value) || 75;
    const maxEdge = Number(els.cpMaxEdge.value) || 0;
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
    if (fmtSel !== 'same') name = stripExt(item.name) + (CP_EXT[realFmt] || '.img');
    return { blob, name };
  }
  // 批量滤镜实时预览：把第一张原图缩略+套选中滤镜，所见即所得
  async function renderTonePreview() {
    const cv = els.btPreview, lbl = els.btPreviewLabel;
    if (!cv || !lbl) return;
    const it = state.items[state.index] || state.items[0];
    if (!it || !it.img) { lbl.textContent = '滤镜预览：无图片'; return; }
    const p = STYLE_PRESETS.find((q) => q.id === (els.btPreset ? els.btPreset.value : ''));
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

  // ============ 最近打开（PRD 5.1 Jumplist 的 Web 等价物，原「规划中」） ============
  const RECENT_KEY = 'lvjiaoxi_viewer_recent_v1';
  const RECENT_MAX = 12;
  function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; } }
  function saveRecent(list) { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) {} }
  function basenameOf(p) { const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i >= 0 ? p.slice(i + 1) : p; }
  function relTime(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return '刚刚';
    if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
    if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
    if (d < 86400 * 30) return Math.floor(d / 86400) + ' 天前';
    return new Date(ts).toLocaleDateString();
  }
  // entry: { kind:'folder'|'files', path?, name, count, ts, names? }
  function addRecent(entry) {
    entry.ts = Date.now();
    let list = loadRecent();
    // 同毫秒追加会导致 ts 重复（removeRecent 按 ts 删会误删多条）→ 递增保唯一
    while (list.some((e) => e.ts === entry.ts)) entry.ts += 1;
    list = list.filter((e) =>
      !((entry.kind === 'folder' && e.kind === 'folder' && e.path === entry.path) ||
        (entry.kind === 'files' && e.kind === 'files' && e.name === entry.name)));
    list.unshift(entry);
    if (list.length > RECENT_MAX) list = list.slice(0, RECENT_MAX);
    saveRecent(list);
    renderRecent();
    renderRecentInline();
  }
  function addRecentFolder(path, count) {
    if (!path) return;
    addRecent({ kind: 'folder', path: String(path), name: basenameOf(String(path)), count: count | 0 });
  }
  function addRecentFiles(files) {
    const list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    // 兼容「字符串数组」（如测试）与「FileList/文件对象」（含桌面端 .path）
    const arr = list.map((f) =>
      (typeof f === 'string') ? { name: f, path: null } : { name: f.name, path: f.path || null });
    const names = arr.map((f) => f.name);
    const paths = arr.map((f) => f.path).filter(Boolean);
    const label = names.length === 1 ? names[0] : (names[0] + ' 等 ' + names.length + ' 个文件');
    const entry = { kind: 'files', name: label, count: names.length, names: names.slice(0, 24) };
    if (paths.length) entry.paths = paths;   // 桌面端（Tauri）存完整路径，便于一键重开
    addRecent(entry);
  }
  // 桌面端注入路径（右键菜单/双击关联/拖放/单实例参数）加载成功后记录「最近打开」：
  // 单路径按返回条目判断文件/文件夹，多路径归为文件组；空结果不记录。
  function recordRecentFromLoad(paths, entries) {
    if (!Array.isArray(paths) || !Array.isArray(entries) || !entries.length) return;
    const pathList = paths.map(String).filter(Boolean);
    if (pathList.length === 1) {
      const root = pathList[0];
      // 单文件：唯一返回条目的 path 与入参一致；文件夹则返回子图路径，与入参不同
      const only = entries.length === 1 ? String(entries[0].path || '') : '';
      if (only && only.toLowerCase() === root.toLowerCase()) {
        // 与对话框打开风格一致：显示文件名、存完整路径便于一键重开（如右键「用绿角犀看图打开」）
        addRecent({ kind: 'files', name: basenameOf(root), count: 1, names: [basenameOf(root)], paths: [root] });
      } else {
        addRecent({ kind: 'folder', path: root, name: basenameOf(root), count: entries.length });
      }
      return;
    }
    // 多个路径（如多文件拖放）：转对象统一处理（name 显示文件名、path 存完整路径）
    addRecentFiles(pathList.map((p) => ({ name: basenameOf(p), path: p })));
  }
  function getRecent() { return loadRecent().slice().sort((a, b) => b.ts - a.ts); }
  function removeRecent(ts) { saveRecent(loadRecent().filter((e) => e.ts !== ts)); renderRecent(); renderRecentInline(); }
  function clearRecent() { saveRecent([]); renderRecent(); renderRecentInline(); }
  function renderRecent() {
    if (!els.recentList) return;
    const list = getRecent();
    if (!list.length) {
      els.recentList.innerHTML = '<li class="recent-empty">还没有记录。打开图片或文件夹后会出现在这里。</li>';
      els.recentHint.textContent = '';
      return;
    }
    els.recentHint.textContent = '共 ' + list.length + ' 条 · 点击可重新打开';
    els.recentList.innerHTML = list.map((e) => {
      const icon = e.kind === 'folder' ? '📁' : '🖼️';
      const sub = (e.kind === 'folder' ? (e.count + ' 张 · ') : '') + relTime(e.ts) + (e.kind === 'files' ? ' · ' + (e.path || '') : '');
      return '<li class="recent-item" data-ts="' + e.ts + '" title="' + escapeHtml(e.name) + '">'
        + '<span class="r-icon">' + icon + '</span>'
        + '<span class="r-main"><span class="r-name">' + escapeHtml(e.name) + '</span>'
        + '<span class="r-sub">' + escapeHtml(sub) + '</span></span>'
        + '<span class="r-del" data-del="' + e.ts + '" title="移除">✕</span></li>';
    }).join('');
  }
  function renderRecentInline() {
    if (!els.recentInline) return;
    const list = getRecent().slice(0, 6);
    if (!list.length) { els.recentInline.hidden = true; return; }
    els.recentInline.hidden = false;
    const items = list.map((e) => {
      const ts = e.ts;
      const path = e.kind === 'files' ? (e.paths && e.paths[0]) : (e.kind === 'folder' ? e.path : '');
      const ph = e.kind === 'folder' ? '📁' : '🖼️';
      return '<button class="recent-thumb" data-ts="' + ts + '"'
        + (path ? ' data-path="' + escapeHtml(path) + '"' : '')
        + ' title="' + escapeHtml(e.name) + '"><span class="t-ph">' + ph + '</span></button>';
    }).join('');
    els.recentInline.innerHTML = '<div class="recent-inline-title">最近打开</div><div class="recent-thumbs">' + items + '</div>';
    requestRecentThumbs();
  }
  // 空态缩略图：桌面端用 first_thumb 异步读取真实图片；失败/Web 下保留占位图标
  async function requestRecentThumbs() {
    if (!els.recentInline || !desktop.available()) return;
    const btns = [...els.recentInline.querySelectorAll('.recent-thumb[data-path]')];
    for (const b of btns) {
      const path = b.getAttribute('data-path');
      if (!path) continue;
      try {
        const url = await desktop.invoke('first_thumb', { path });
        if (!url || !b.isConnected) continue;
        const img = document.createElement('img');
        img.alt = '';
        img.onload = () => { if (b.isConnected) { const ph = b.querySelector('.t-ph'); if (ph) ph.replaceWith(img); } };
        img.src = url;
      } catch (e) { /* 无法读取时保留占位图标 */ }
    }
  }
  function openRecent() {
    renderRecent();
    els.recentMask.hidden = false;
  }
  function reopen(entry) {
    els.recentMask.hidden = true;
    // 桌面端（Tauri）：用存储的完整路径经后端 load_paths 一键重开（文件夹递归、文件组逐张）
    const paths = entry.kind === 'folder'
      ? (entry.path ? [entry.path] : [])
      : (entry.paths || []);
    if (desktop.available() && paths.length) {
      desktop.loadPaths(paths, getSetting('files', 'recursive'))
        .then((ok) => { if (!ok) toast('打开失败：' + entry.name); })
        .catch(() => toast('打开失败：' + entry.name));
      return;
    }
    // Web 降级：无持久路径，引导重新选择
    if (entry.kind === 'folder') { toast('请重新选择文件夹：' + entry.name); els.dirInput.click(); }
    else { toast('请重新选择文件'); els.fileInput.click(); }
  }

  function batchConvert(item) {
    return new Promise((resolve) => {
      const fmt = els.cvFormat.value;
      const canvas = document.createElement('canvas');
      canvas.width = item.img.naturalWidth; canvas.height = item.img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (fmt === 'image/png' || fmt === 'image/webp') ctx.fillStyle = '#F5F4F7';
      if (fmt !== 'image/png') ctx.fillStyle = '#F5F4F7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(item.img, 0, 0);
      const quality = (+els.cvQuality.value) / 100;
      if (fmt === 'image/bmp') {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        resolve(new Blob([encodeBMP(data)], { type: 'image/bmp' }));
      } else {
        canvas.toBlob((b) => resolve(b), fmt, quality);
      }
    });
  }
  function batchResize(item) {
    return new Promise((resolve) => {
      const mode = els.rsMode.value;
      const iw = item.img.naturalWidth, ih = item.img.naturalHeight;
      let dw, dh;
      if (mode === 'percent') {
        const p = (+els.rsPercent.value) / 100;
        dw = Math.max(1, Math.round(iw * p)); dh = Math.max(1, Math.round(ih * p));
      } else {
        dw = Math.max(1, +els.rsWidth.value || iw);
        if (els.rsLockRatio.checked) dh = Math.max(1, Math.round(dw * ih / iw));
        else dh = Math.max(1, +els.rsHeight.value || ih);
      }
      const canvas = document.createElement('canvas'); canvas.width = dw; canvas.height = dh;
      const ctx = canvas.getContext('2d');
      const res = els.rsResample.value;
      ctx.imageSmoothingEnabled = (res !== 'pixelated');
      if (res === 'pixelated') ctx.imageSmoothingEnabled = false;
      if (res === 'high') { ctx.imageSmoothingQuality = 'high'; }
      ctx.drawImage(item.img, 0, 0, dw, dh);
      const fmt = els.rsFormat.value;
      const dpi = (+els.rsDpi.value) || 0;
      canvas.toBlob(async (b) => {
        try { resolve(await embedDpi(b, fmt, dpi)); }
        catch (e) { resolve(b); }
      }, fmt, 0.92);
    });
  }
  function fileToBlob(file) { return file.arrayBuffer ? file.arrayBuffer().then((b) => new Blob([b], { type: file.type })) : fetch(URL.createObjectURL(file)).then((r) => r.blob()); }

  // BMP 24-bit 编码
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

  // ============ DPI 嵌入（PRD 5.5 批量调整尺寸） ============
  // PNG：在 IHDR 之后插入 pHYs 块（单位=米，ppm = dpi * 39.37007874）
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
  // JPEG：FFD8 后确保存在 JFIF APP0，写入 X/Y 密度（单位=点/英寸）
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
  // WebP：在 EXIF 元数据块（'EXIF'）中写入最小 TIFF，含 X/YResolution + ResolutionUnit=英寸
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

  // ZIP (store, 无压缩) + CRC32
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
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

  // ============ 关于 / 快捷键 / 系统集成说明 ============
  function aboutContent() {
    return `
      <h3>绿角犀看图 <span style="font-size:13px;color:#888;font-weight:normal">v0.1.0</span></h3>
      <p>基于 PRD《绿角犀看图桌面版》实现的纯前端原型，零依赖、离线可用。覆盖 5.2~5.6 全部功能模块；5.1 系统集成层以 Web 能力替代（见下表）。</p>
      <h3>系统集成（5.1）对照</h3>
      <ul>
        <li>文件类型关联 <span class="badge os">需桌面版</span> — Web 用「图片 / 文件夹」按钮与拖放替代。</li>
        <li>右键菜单集成 <span class="badge os">需桌面版</span> — Web 在图片上右键显示内置菜单（复制/信息/壁纸/定位）。</li>
        <li>系统托盘 / 窗口管理 <span class="badge os">需桌面版</span> — Web 用浏览器标签页管理。</li>
        <li>任务栏 Jumplist <span class="badge os">需桌面版</span> — Web 用缩略图栏 + 最近列表（规划中）。</li>
        <li>命令行启动 <span class="badge os">需桌面版</span> — 第二阶段用 Tauri 包装 EXE 后支持。</li>
        <li>文件夹加载 <span class="badge web">Web 支持</span> — 拖放文件夹 / 「文件夹」按钮递归遍历（webkitdirectory）。</li>
        <li>复制到剪贴板 <span class="badge web">Web 支持</span> — Clipboard API（含旋转/翻转状态，降级下载）。</li>
      </ul>
      <h3>快捷键</h3>
      <ul>
        <li><kbd>←</kbd>/<kbd>→</kbd> 或 <kbd>PageUp</kbd>/<kbd>PageDown</kbd> 翻页</li>
        <li><kbd>+</kbd>/<kbd>-</kbd> 缩放 · 滚轮缩放（Ctrl+滚轮翻页，可在设置互换）</li>
        <li><kbd>L</kbd>/<kbd>R</kbd> 左/右旋转 · <kbd>H</kbd>/<kbd>V</kbd> 水平/垂直翻转</li>
        <li><kbd>双击</kbd> 适应窗口 ↔ 2.5x · <kbd>I</kbd> 信息 · <kbd>S</kbd> 幻灯片 · <kbd>F</kbd> 全屏 · <kbd>Esc</kbd> 退出</li>
        <li><kbd>Tab</kbd> 显隐缩略图栏 · <kbd>Ctrl</kbd>+<kbd>C</kbd> 复制图片</li>
      </ul>
      <h3>性能说明</h3>
      <p>缩放/旋转使用 CSS <code>transform</code> GPU 加速；缩略图、预加载（LRU，最大 ${getSetting('advanced', 'preloadSize')} 张）均在内存完成。HEIC/RAW/TIFF/PSD 等需后端解码的格式，在桌面版由 Rust 解码后传入，本原型下浏览器原生不支持的格式会提示需桌面版。</p>
      <p style="margin-top:14px"><a class="btn" href="使用说明.html" target="_blank" rel="noopener">查看完整使用说明 →</a></p>
    `;
  }
  function openAbout() {
    els.aboutBody.innerHTML = aboutContent();
    els.aboutMask.hidden = false;
  }

  // ============ 使用说明（应用内嵌） ============
  function manualContent() {
    return `
      <p>绿角犀看图是一款轻量、跨平台的图片查看与批量处理工具。本说明介绍如何打开图片、看图浏览、批量处理、浏览历史、账户登录与云端同步，以及桌面客户端专属能力。</p>

      <h3>一、如何开始</h3>
      <p><b>Web 原型版</b>：浏览器直接打开 <code>index.html</code>。若要用云端账户，先在本机启动后端 <code>node server/mock-server.js</code>，并在「设置 → 高级」确认服务器地址为 <code>http://localhost:8787</code>；建议用本地静态服务器（如 <code>node serve.js</code>）打开，避免 <code>file://</code> 下剪贴板 / Service Worker 限制。</p>
      <p><b>Windows 桌面客户端</b>：安装后从开始菜单或桌面快捷方式启动；支持双击图片直接打开、右键「用绿角犀看图打开」、命令行 <code>绿角犀看图.exe "图片路径"</code>。</p>

      <h3>二、打开图片</h3>
      <table>
        <tr><th>方式</th><th>说明</th></tr>
        <tr><td>按钮「图片」</td><td>选择一张或多张图片</td></tr>
        <tr><td>按钮「文件夹」</td><td>选择整个文件夹（可按设置递归子文件夹）</td></tr>
        <tr><td>拖放</td><td>将图片文件或文件夹拖入窗口</td></tr>
        <tr><td>双击关联文件（桌面版）</td><td>直接打开</td></tr>
        <tr><td>命令行（桌面版）</td><td><code>绿角犀看图.exe 路径</code></td></tr>
      </table>
      <p>打开后中央显示第一张图，底部为缩略图栏（工具栏「缩略图」或 <kbd>Tab</kbd> 显隐），右上角显示「当前序号 / 总数」。</p>

      <h3>三、看图基础</h3>
      <ul>
        <li><b>缩放</b>：工具栏 <code>+</code>/<code>−</code>、快捷键 <kbd>=</kbd>/<kbd>-</kbd> 或滚轮（默认滚轮缩放）。<b>适应窗口 ↔ 实际大小</b>：工具栏「适应」按钮或双击图片切换。</li>
        <li><b>旋转 / 翻转</b>：<kbd>L</kbd>/<kbd>R</kbd> 左/右旋转，<kbd>H</kbd>/<kbd>V</kbd> 水平/垂直翻转；「设置 → 看图 → 记住旋转状态」可保留。</li>
        <li><b>信息面板</b>：<kbd>I</kbd> 显示尺寸 / 类型 / 大小 / EXIF（JPEG 自动正向显示）；<kbd>Esc</kbd> 关闭。</li>
        <li><b>复制图片</b>：<kbd>Ctrl</kbd>+<kbd>C</kbd>（Mac <kbd>Cmd</kbd>+<kbd>C</kbd>）复制到剪贴板。</li>
        <li><b>图片工具</b>：<kbd>E</kbd> 打开滤镜（亮度 / 对比度 / 饱和度等），实时预览并重置。</li>
      </ul>

      <h3>四、浏览与导航</h3>
      <table>
        <tr><th>操作</th><th>快捷键</th></tr>
        <tr><td>上一张</td><td><kbd>←</kbd> / <kbd>PageUp</kbd></td></tr>
        <tr><td>下一张</td><td><kbd>→</kbd> / <kbd>PageDown</kbd></td></tr>
        <tr><td>第一张 / 最后一张</td><td><kbd>Home</kbd> / <kbd>End</kbd></td></tr>
        <tr><td>跳转序号</td><td><kbd>G</kbd></td></tr>
        <tr><td>显示 / 隐藏缩略图</td><td><kbd>Tab</kbd></td></tr>
        <tr><td>全屏</td><td><kbd>F</kbd></td></tr>
        <tr><td>幻灯片</td><td><kbd>S</kbd></td></tr>
      </table>
      <p>开启「翻页循环」后末张回到首张。幻灯片可在「设置 → 幻灯片」预设间隔、转场特效、播放顺序。</p>

      <h3>五、设为壁纸</h3>
      <p>工具栏「壁纸」提供 4 种模式：适应（留边）/ 拉伸（铺满）/ 居中 / 平铺。Web 版合成 1920×1080 图片下载，桌面版直接设置系统壁纸。</p>

      <h3>五·二、照片处理（图片工具内）</h3>
      <ul>
        <li><b>滤镜</b>：亮度 / 对比度 / 饱和度 / 灰度 / <b>色温（冷↔暖）</b> / 模糊，全部实时预览、非破坏性。</li>
        <li><b>锐化</b>：滑杆调节，导出时按 3×3 反锐化掩模烘焙。</li>
        <li><b>自动增强</b>：一键分析亮度直方图，自动调整亮度 / 对比度 / 饱和度，可继续手动微调。</li>
        <li><b>高级处理（OpenCV）</b>：去噪（中值）/ 保边去噪（双边）/ 智能锐化；首次使用需联网加载 opencv.js（约 8MB），处理在导出时应用。</li>
        <li><b>AI 放大（实验性）</b>：超分辨率放大 2×/4×；需在「设置 → 高级」配置 .onnx 模型地址，导出时推理。</li>
        <li>以上均与裁剪 / 旋转 / 翻转 / EXIF 一并烘焙进导出结果。</li>
      </ul>

      <h3>六、批量处理</h3>
      <ul>
        <li><b>改尺寸</b>：按宽度或百分比统一缩放。</li>
        <li><b>嵌入 DPI</b>：选 72 / 96 / 150 / 300 / 600，导出时写入 PNG（pHYs）/ JPEG（JFIF）/ WebP（EXIF）。</li>
        <li><b>导出</b>：打包 ZIP 下载；可取消并出报告。</li>
      </ul>

      <h3>七、浏览历史</h3>
      <ul>
        <li>每次显示图片自动记录浏览历史（最多 50 条），登录态同步云端。可在工具栏「🕘 最近打开」与云端面板查看。</li>
      </ul>

      <h3>八、账户与云端同步</h3>
      <p>工具栏「☁ 登录」弹窗可注册 / 登录。登录后同步：应用设置、收藏记录（含图本体）、浏览历史、账户资料。未登录仅存本地、不触网。接真实后端在「设置 → 高级 → 云端账户服务器地址」填写。</p>

      <h3>九、快捷键自定义</h3>
      <p>「设置 → 快捷键」点击动作右侧按钮重绑，冲突自动让出，「恢复默认快捷键」一键还原。默认快捷键见上方第四节速查表。</p>

      <h3>十、设置项</h3>
      <p>六组：通用、看图（缩放 / 滚轮 / 旋转 / 渲染 / 壁纸模式）、幻灯片（间隔 / 转场 / 顺序）、文件关联（递归 / 右键文字）、高级（预加载 / 更新 / 服务器地址）、快捷键。</p>

      <h3>十一、触摸手势</h3>
      <ul><li>单指拖动平移；双指捏合缩放；双指滑动翻页。</li></ul>

      <h3>十二、PWA</h3>
      <p>Web 版支持安装到桌面（地址栏「安装」），离线可用。</p>

      <h3>十三、桌面客户端专属</h3>
      <table>
        <tr><th>能力</th><th>说明</th></tr>
        <tr><td>文件类型关联</td><td>双击图片直接打开</td></tr>
        <tr><td>右键菜单</td><td>右键「用绿角犀看图打开」</td></tr>
        <tr><td>系统托盘 / 单实例</td><td>最小化到托盘、重复打开聚焦已运行窗口</td></tr>
        <tr><td>真实壁纸</td><td>直接写入系统桌面</td></tr>
        <tr><td>资源管理器定位</td><td>右键「定位到文件」打开所在文件夹</td></tr>
        <tr><td>系统剪贴板位图</td><td>跨应用粘贴</td></tr>
      </table>

      <h3>十四、常见问题</h3>
      <ul>
        <li>Web 版功能受限？用 <code>node serve.js</code> 本地服务器打开。</li>
        <li>云端连不上？确认后端已启动且服务器地址正确。</li>
        <li>某些格式打不开？HEIC / RAW / TIFF / PSD 需桌面版后端解码，Web 版会提示。</li>
        <li>想换回默认快捷键？设置 → 快捷键 → 恢复默认。</li>
      </ul>
      <p style="margin-top:14px"><a class="btn" href="使用说明.html" target="_blank" rel="noopener">打开完整图文版使用说明 →</a></p>
    `;
  }
  function openManual() {
    els.manualBody.innerHTML = manualContent();
    els.manualMask.hidden = false;
  }

  // ============ 画面区域截图：截取当前画面可见区域并导出 ============
  function snapVisible() {
    const it = currentItem();
    const img = it && it.img;
    if (!it || !img || !img.naturalWidth) { toast('请先打开图片'); return; }
    const W = img.naturalWidth, H = img.naturalHeight;
    const sw = els.stage.clientWidth, sh = els.stage.clientHeight;
    if (!sw || !sh) { toast('无法获取当前画面尺寸'); return; }
    // 复刻画面上 #image 的 transform（位移+旋转+缩放+EXIF定向），得到屏幕像素
    const oc = ORIENT_CSS[currentOrient()] || ORIENT_CSS[1];
    const sx = state.flipH ? -state.scale : state.scale;
    const sy = state.flipV ? -state.scale : state.scale;
    const t = `translate(${state.offsetX}px, ${state.offsetY}px) rotate(${state.rotation}deg) scale(${sx}, ${sy}) rotate(${oc.rot}deg) scale(${oc.fx}, ${oc.fy})`;
    let M;
    try { M = new DOMMatrix(t); } catch (e) { M = new DOMMatrix(); }
    const a = M.a, b = M.b, c = M.c, d = M.d, e = M.e, f = M.f;
    // transform-origin 50% 50%：屏上位置 = M·(p - 图中心) + 视口中心
    const Mvx = a * (W / 2) + c * (H / 2) + e;
    const Mvy = b * (W / 2) + d * (H / 2) + f;
    const cv = document.createElement('canvas');
    cv.width = sw; cv.height = sh;
    const ctx = cv.getContext('2d');
    if (!ctx || !ctx.setTransform) { toast('无法写入画面截图'); return; }
    ctx.setTransform(a, b, c, d, sw / 2 - Mvx, sh / 2 - Mvy);
    ctx.drawImage(img, 0, 0, W, H);
    cv.toBlob((blob) => {
      if (!blob) { toast('导出截图失败'); return; }
      download(blob, '截图_' + stripExt(it.name) + '.png');
      toast('已截图画面可见区域');
    }, 'image/png');
  }

  // ============ 事件绑定 ============
  function bindEvents() {
    els.btnOpenFiles.addEventListener('click', openFiles);
    els.btnOpenDir.addEventListener('click', openDir);
    els.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        addRecentFiles(e.target.files);
        buildItems(e.target.files, false);
      }
      e.target.value = '';
    });
    els.dirInput.addEventListener('change', (e) => {
      const files = e.target.files;
      if (files && files.length) {
        // 优先用桌面端（Tauri）真实路径推导顶层文件夹；Web 下回退 webkitRelativePath
        const first = files[0];
        let top = null;
        const p = first.path || first.webkitRelativePath || '';
        if (first.path) {
          const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
          top = idx > 0 ? p.slice(0, idx) : null;
        } else if (first.webkitRelativePath) {
          top = first.webkitRelativePath.split('/')[0];
        }
        if (top) addRecentFolder(top, files.length);
        buildItems(files, getSetting('view', 'recursive'));
      }
      e.target.value = '';
    });
    els.btnZoomIn.addEventListener('click', () => zoomByCenter(1.2));
    els.btnZoomOut.addEventListener('click', () => zoomByCenter(1 / 1.2));
    els.btnZoomFit.addEventListener('click', () => { if (state.mode === 'fit') applyActual(); else applyFit(); });
    els.btnRotL.addEventListener('click', () => rotate(-1));
    els.btnRotR.addEventListener('click', () => rotate(1));
    els.btnFlipH.addEventListener('click', () => flip(true));
    els.btnFlipV.addEventListener('click', () => flip(false));
    els.btnCopy.addEventListener('click', copyCurrentImage);
    els.btnEdit.addEventListener('click', openEdit);
    els.btnInfo.addEventListener('click', toggleInfo);
    els.btnSlide.addEventListener('click', startSlideshow);
    els.btnBatch.addEventListener('click', openBatch);
    els.btnSettings.addEventListener('click', openSettings);
    if (els.btnSnap) els.btnSnap.addEventListener('click', snapVisible);
    if (els.manualClose) els.manualClose.addEventListener('click', () => { els.manualMask.hidden = true; });
    if (els.manualMask) els.manualMask.addEventListener('click', (e) => { if (e.target === els.manualMask) els.manualMask.hidden = true; });
    els.btnFull.addEventListener('click', () => { if (document.fullscreenElement) exitFullscreen(); else enterFullscreen(); });
    els.infoClose.addEventListener('click', () => els.infoPanel.hidden = true);
    // 图片工具弹窗
    els.editClose.addEventListener('click', () => els.editMask.hidden = true);
    $$('.edit-tab').forEach((t) => t.addEventListener('click', () => switchEditTab(t.dataset.tab)));
    els.flReset.addEventListener('click', resetFilters);
    if (els.cropReset) els.cropReset.addEventListener('click', resetCrop);
    if (els.editPreview) {
      els.editPreview.addEventListener('pointerdown', onPreviewDown);
      els.editPreview.addEventListener('pointermove', onPreviewMove);
      els.editPreview.addEventListener('pointerup', onPreviewUp);
      els.editPreview.addEventListener('pointercancel', onPreviewUp);
    }
    els.exRun.addEventListener('click', exportCurrent);
    els.exFormat.addEventListener('change', onExFormatChange);
    // 一键抠图
    if (els.matFg) els.matFg.addEventListener('click', () => setMatBrush('fg'));
    if (els.matBg) els.matBg.addEventListener('click', () => setMatBrush('bg'));
    if (els.matSize) els.matSize.addEventListener('input', () => { if (els.matSizeVal) els.matSizeVal.textContent = els.matSize.value; updateMattingUI(); });
    if (els.matRun) els.matRun.addEventListener('click', () => { if (runMatting()) updateMattingUI(); });
    if (els.matClear) els.matClear.addEventListener('click', clearMatting);
    if (els.matExport) els.matExport.addEventListener('click', exportMatting);
    const flMap = [['flBrightness', 'brightness', 'flBrightnessVal'], ['flContrast', 'contrast', 'flContrastVal'], ['flSaturate', 'saturate', 'flSaturateVal'], ['flGray', 'gray', 'flGrayVal'], ['flTemp', 'temp', 'flTempVal'], ['flHslH', 'hslH', 'flHslHVal'], ['flHslS', 'hslS', 'flHslSVal'], ['flHslL', 'hslL', 'flHslLVal'], ['flBlur', 'blur', 'flBlurVal'], ['flSharp', 'sharp', 'flSharpVal'], ['flHighlight', 'highlight', 'flHighlightVal'], ['flShadow', 'shadow', 'flShadowVal'], ['flFade', 'fade', 'flFadeVal'], ['flGrain', 'grain', 'flGrainVal'], ['flVignette', 'vignette', 'flVignetteVal'], ['flTintAmt', 'tintAmt', 'flTintAmtVal']];
    flMap.forEach(([id, key, valId]) => {
      if (!els[id]) return;  // 兼容缺节点的环境
      els[id].addEventListener('input', () => {
        state.filters[key] = +els[id].value;
        els[valId].textContent = els[id].value;
        applyFilters();
      });
    });
    // 色调分离取色器：直接写入色调并刷新预览（强度 0 时不染色）
    if (els.flTintH) els.flTintH.addEventListener('input', () => { state.filters.tintH = els.flTintH.value; applyFilters(); });
    if (els.flTintS) els.flTintS.addEventListener('input', () => { state.filters.tintS = els.flTintS.value; applyFilters(); });
    // 照片处理：自动增强 / OpenCV / AI
    if (els.btnAutoEnhance) els.btnAutoEnhance.addEventListener('click', autoEnhance);
    if (els.cvDenoise) els.cvDenoise.addEventListener('click', () => onCvBtn('median'));
    if (els.cvBilateral) els.cvBilateral.addEventListener('click', () => onCvBtn('bilateral'));
    if (els.cvSharp) els.cvSharp.addEventListener('click', () => onCvBtn('unsharp'));
    if (els.opsReset) els.opsReset.addEventListener('click', resetOps);
    if (els.aiRun) els.aiRun.addEventListener('click', onAiRun);
    // 主界面「美图」条：核心滤镜滑块
    const miMap = [['miBrightness', 'brightness', 'miBrightnessVal'], ['miContrast', 'contrast', 'miContrastVal'], ['miSaturate', 'saturate', 'miSaturateVal'], ['miTemp', 'temp', 'miTempVal'], ['miSharp', 'sharp', 'miSharpVal']];
    miMap.forEach(([id, key, valId]) => {
      if (!els[id]) return;
      els[id].addEventListener('input', () => {
        state.filters[key] = +els[id].value;
        if (els[valId]) els[valId].textContent = els[id].value;
        applyFilters();
      });
    });
    if (els.miBeautySmooth) els.miBeautySmooth.addEventListener('click', () => onBeauty('smooth', els.miBeautyVal ? +els.miBeautyVal.value : null));
    if (els.miBeautyWhite) els.miBeautyWhite.addEventListener('click', () => onBeauty('white', els.miBeautyVal ? +els.miBeautyVal.value : null));
    if (els.miBeautyLight) els.miBeautyLight.addEventListener('click', () => oneClickBeauty('light'));
    if (els.miBeautyNatural) els.miBeautyNatural.addEventListener('click', () => oneClickBeauty('natural'));
    if (els.miBeautyFancy) els.miBeautyFancy.addEventListener('click', () => oneClickBeauty('fancy'));
    if (els.miEnhance) els.miEnhance.addEventListener('click', () => { if (!state.items[state.index]) { toast('请先打开图片'); return; } autoEnhance(); syncBeautyBar(); });
    if (els.miRecipe) els.miRecipe.addEventListener('click', () => openEdit('recipe'));
    if (els.miRecipeRandom) els.miRecipeRandom.addEventListener('click', applyRandomStyle);
    if (els.recipeRandom) els.recipeRandom.addEventListener('click', applyRandomStyle);
    if (els.saveMyStyle) els.saveMyStyle.addEventListener('click', saveCurrentStyle);
    if (els.clearMyStyles) els.clearMyStyles.addEventListener('click', clearAllMyStyles);
    if (els.editHistoryBtn) els.editHistoryBtn.addEventListener('click', toggleEditHistory);
    if (els.editHistoryClose) els.editHistoryClose.addEventListener('click', () => { if (els.editHistoryPanel) els.editHistoryPanel.hidden = true; });
    if (els.miMore) els.miMore.addEventListener('click', openEdit);
    syncBeautyBar();
    // 美工：美颜 / 边框 / 文字 / 马赛克
    if (els.beautyVal) {
      els.beautyVal.addEventListener('input', () => { els.beautyValVal.textContent = els.beautyVal.value; });
    }
    if (els.beautySmooth) els.beautySmooth.addEventListener('click', () => onBeauty('smooth'));
    if (els.beautyWhite) els.beautyWhite.addEventListener('click', () => onBeauty('white'));
    if (els.txtAdd) els.txtAdd.addEventListener('click', addText);
    if (els.txtInput) els.txtInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addText(); });
    if (els.txtSize) els.txtSize.addEventListener('input', () => {
      els.txtSizeVal.textContent = els.txtSize.value;
      const t = state.texts.find((x) => x.id === state.textSel);
      if (t) { t.size = +els.txtSize.value; renderEditPreview(); }
    });
    if (els.txtStroke) els.txtStroke.addEventListener('input', () => {
      els.txtStrokeVal.textContent = els.txtStroke.value;
      const t = state.texts.find((x) => x.id === state.textSel);
      if (t) { t.stroke = +els.txtStroke.value; renderEditPreview(); }
    });
    if (els.txtFont) els.txtFont.addEventListener('change', () => {
      const t = state.texts.find((x) => x.id === state.textSel);
      if (t) { t.font = els.txtFont.value; renderEditPreview(); }
    });
    if (els.txtColor) els.txtColor.addEventListener('input', () => {
      const t = state.texts.find((x) => x.id === state.textSel);
      if (t) { t.color = els.txtColor.value; renderEditPreview(); }
    });
    if (els.txtDel) els.txtDel.addEventListener('click', delSelText);
    if (els.mosaicBtn) els.mosaicBtn.addEventListener('click', toggleMosaicMode);
    if (els.mosaicSize) els.mosaicSize.addEventListener('input', () => { els.mosaicSizeVal.textContent = els.mosaicSize.value; });
    if (els.mosaicClear) els.mosaicClear.addEventListener('click', clearMosaic);
    // 瘦身 / 瘦脸（局部液化）：模式 / 锚点 / 强度 / 作用范围 / 重置
    if (els.slimFace) els.slimFace.addEventListener('click', () => { if (state.slim.mode === 'face') return; state.slim.mode = 'face'; state.slim.enabled = true; state.slimMode = false; pushUndo(); updateSlimUI(); renderEditPreview(); });
    if (els.slimBody) els.slimBody.addEventListener('click', () => { if (state.slim.mode === 'body') return; state.slim.mode = 'body'; state.slim.enabled = true; state.slimMode = false; pushUndo(); updateSlimUI(); renderEditPreview(); });
    if (els.slimMode) els.slimMode.addEventListener('click', () => { state.slimMode = !state.slimMode; state.slim.enabled = state.slim.enabled || state.slim.strength > 0; updateSlimUI(); renderEditPreview(); });
    if (els.slimStrength) els.slimStrength.addEventListener('input', () => { state.slim.strength = +els.slimStrength.value; state.slim.enabled = state.slim.strength > 0; if (els.slimStrengthVal) els.slimStrengthVal.textContent = state.slim.strength; renderEditPreview(); });
    if (els.slimRange) els.slimRange.addEventListener('input', () => { const r = +els.slimRange.value; state.slim.rx = r / 100; state.slim.ry = r / 100; if (els.slimRangeVal) els.slimRangeVal.textContent = r; renderEditPreview(); });
    if (els.slimReset) els.slimReset.addEventListener('click', () => { state.slim = { enabled: false, mode: state.slim.mode || 'face', strength: 0, cx: 0.5, cy: 0.5, rx: 0.22, ry: 0.22 }; state.slimMode = false; pushUndo(); updateSlimUI(); renderEditPreview(); });
    // ===== deform 事件绑定 =====
    const deformKinds = { deform_eye: 'eye', deform_teeth: 'teeth', deform_cheek: 'cheek', deform_lip: 'lip', deform_nose: 'nose' };
    Object.entries(deformKinds).forEach(([id, kind]) => {
      const b = document.getElementById(id);
      if (b) {
        b.addEventListener('click', () => {
          // 已存在则移除（toggle），不存在则添加
          const list = state.deform || [];
          const idx = list.findIndex((d) => d.kind === kind);
          if (idx >= 0) {
            list.splice(idx, 1); state.deform = list;
            state.deformMode = null;
          } else {
            addDeform(kind); return;
          }
          pushUndo(); updateDeformUI(); renderEditPreview();
        });
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); resetDeformKind(kind); });
      }
    });
    if (els.deformClearAll) els.deformClearAll.addEventListener('click', clearAllDeform);
    if (els.deformModeBtn) els.deformModeBtn.addEventListener('click', () => {
      // 进入锚点模式：如果有当前 kind，切换；否则提示
      const list = state.deform || [];
      if (!list.length) { toast('先点上面的按钮添加美型项目'); return; }
      if (state.deformMode) { state.deformMode = null; }
      else { state.deformMode = { kind: list[0].kind }; }
      updateDeformUI(); renderEditPreview();
    });
    if (els.deformKindSel) els.deformKindSel.addEventListener('change', () => {
      const kind = els.deformKindSel.value;
      state.deformMode = kind ? { kind } : null;
      updateDeformUI(); renderEditPreview();
    });
    if (els.deformStrength) els.deformStrength.addEventListener('input', () => {
      if (!state.deformMode) return;
      const list = state.deform || [];
      const d = list.find((dd) => dd.kind === state.deformMode.kind);
      if (!d) return;
      d.strength = +els.deformStrength.value;
      if (els.deformStrengthVal) els.deformStrengthVal.textContent = d.strength;
      renderEditPreview();
    });
    els.navPrev.addEventListener('click', prev);
    els.navNext.addEventListener('click', next);
    // 跳转指定序号 + 缩略图搜索
    els.counter.addEventListener('click', openJump);
    els.jumpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { goToIndex(+els.jumpInput.value); closeJump(); }
      else if (e.key === 'Escape') { closeJump(); }
    });
    els.jumpInput.addEventListener('blur', () => { if (!els.jumpInput.hidden) { goToIndex(+els.jumpInput.value); closeJump(); } });
    els.thumbSearch.addEventListener('input', applyThumbFilter);
    els.edgeLeft.addEventListener('click', prev);
    els.edgeRight.addEventListener('click', next);

    // 滚轮缩放/翻页
    els.stage.addEventListener('wheel', (e) => {
      if (!state.items.length) return;
      e.preventDefault();
      // ===== 长图优化（对标 HoneyView v5.53） =====
      // 长图默认滚轮 = 纵向 pan；Ctrl + 滚轮 = 缩放（不翻页）
      if (state.isLongImage && !e.ctrlKey) {
        const panStep = Math.max(40, Math.round(els.stage.clientHeight * 0.12));
        state.offsetY -= e.deltaY > 0 ? panStep : -panStep;
        state.mode = 'free';
        applyTransform(); clampOffset();
        // 滚到顶 → 翻上一张；滚到底 → 翻下一张（翻页时保留当前缩放和 offset 位置）
        const { w, h } = displayDims();
        const dh = h * state.scale;
        const sw = els.stage.clientHeight;
        if (dh > sw) {
          const maxY = -(dh - sw) / 2;  // clampOffset 保证 offsetY ∈ [maxY, -maxY]
          if (e.deltaY > 0 && state.offsetY <= maxY + 1) { next(); return; }
          if (e.deltaY < 0 && state.offsetY >= -maxY - 1) { prev(); return; }
        }
        return;
      }
      // ===== 普通图：既有逻辑 =====
      const zoomMode = getSetting('view', 'wheelMode') === 'zoom';
      if ((zoomMode && !e.ctrlKey) || (!zoomMode && e.ctrlKey)) {
        const rect = els.stage.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        zoomAt(mx, my, state.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
      } else {
        if (e.deltaY > 0) next(); else prev();
      }
    }, { passive: false });

    // 拖拽平移
    els.stage.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !state.items.length) return;
      if (e.target.closest('.edge-zone')) return;
      state.dragging = true;
      state.dragStart = { x: e.clientX, y: e.clientY, ox: state.offsetX, oy: state.offsetY };
      els.stage.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!state.dragging) return;
      state.offsetX = state.dragStart.ox + (e.clientX - state.dragStart.x);
      state.offsetY = state.dragStart.oy + (e.clientY - state.dragStart.y);
      state.mode = 'free';
      applyTransform(); clampOffset();
    });
    window.addEventListener('mouseup', () => { state.dragging = false; els.stage.classList.remove('dragging'); });

    // 双击切换（鼠标 + 触摸共用）
    function dblToggle() {
      if (state.mode === 'fit') { state.scale = Math.max(state.fitScale, 2.5); state.offsetX = 0; state.offsetY = 0; state.mode = 'free'; applyTransform(); clampOffset(); updateZoomLabel(); }
      else applyFit();
    }
    els.image.addEventListener('dblclick', dblToggle);

    // ============ 触摸手势（单指平移 / 双指捏合缩放 / 轻点双击放大）============
    const stage = els.stage;
    stage.addEventListener('touchstart', (e) => {
      if (!state.items.length) return;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        state.dragging = true;
        state.dragStart = { x: t.clientX, y: t.clientY, ox: state.offsetX, oy: state.offsetY };
        state.touch = { mode: 'pan', moved: false };
        stage.classList.add('dragging');
      } else if (e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        state.dragging = false; state.dragStart = null;
        state.touch = {
          mode: 'pinch',
          startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          startScale: state.scale,
        };
      }
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
      if (!state.items.length || !state.touch) return;
      e.preventDefault();
      if (state.touch.mode === 'pan' && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - state.dragStart.x, dy = t.clientY - state.dragStart.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) state.touch.moved = true;
        state.offsetX = state.dragStart.ox + dx;
        state.offsetY = state.dragStart.oy + dy;
        state.mode = 'free';
        applyTransform(); clampOffset();
      } else if (state.touch.mode === 'pinch' && e.touches.length === 2) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (state.touch.startDist > 0) {
          const rect = stage.getBoundingClientRect();
          const midX = (a.clientX + b.clientX) / 2 - rect.left;
          const midY = (a.clientY + b.clientY) / 2 - rect.top;
          zoomAt(midX, midY, state.touch.startScale * (dist / state.touch.startDist));
        }
      }
    }, { passive: false });

    function endTouch(e) {
      if (state.touch && state.touch.mode === 'pan' && e.touches.length === 0) {
        if (!state.touch.moved) {
          const now = Date.now();
          if (now - state.lastTapTime < 300) { dblToggle(); state.lastTapTime = 0; }
          else state.lastTapTime = now;
        }
      }
      state.dragging = false;
      state.touch = null;
      stage.classList.remove('dragging');
    }
    stage.addEventListener('touchend', endTouch);
    stage.addEventListener('touchcancel', endTouch);

    // ============ 信息面板拖拽（鼠标 + 触摸）============
    const infoHead = els.infoPanel.querySelector('.info-head');
    function panelClamp(nx, ny) {
      const w = els.infoPanel.offsetWidth || 300, h = els.infoPanel.offsetHeight || 200;
      nx = Math.max(4, Math.min(window.innerWidth - w - 4, nx));
      ny = Math.max(4, Math.min(window.innerHeight - 40, ny));
      return [nx, ny];
    }
    function startPanelDrag(px, py) {
      const p = els.infoPanel;
      const r = p.getBoundingClientRect();
      p.style.right = 'auto';
      p.style.left = r.left + 'px';
      p.style.top = r.top + 'px';
      state.panelDrag = { x: px, y: py, left: r.left, top: r.top };
    }
    infoHead.addEventListener('mousedown', (e) => {
      if (e.target.closest('#infoClose') || els.infoPanel.hidden) return;
      e.preventDefault();
      startPanelDrag(e.clientX, e.clientY);
      const move = (ev) => {
        if (!state.panelDrag) return;
        const [nx, ny] = panelClamp(state.panelDrag.left + (ev.clientX - state.panelDrag.x), state.panelDrag.top + (ev.clientY - state.panelDrag.y));
        els.infoPanel.style.left = nx + 'px';
        els.infoPanel.style.top = ny + 'px';
      };
      const up = () => { state.panelDrag = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    infoHead.addEventListener('touchstart', (e) => {
      if (e.target.closest('#infoClose') || els.infoPanel.hidden) return;
      const t = e.touches[0];
      startPanelDrag(t.clientX, t.clientY);
      state.panelTouchId = t.identifier;
    }, { passive: false });
    infoHead.addEventListener('touchmove', (e) => {
      if (!state.panelDrag) return;
      e.preventDefault();
      const t = Array.from(e.touches).find((x) => x.identifier === state.panelTouchId);
      if (!t) return;
      const [nx, ny] = panelClamp(state.panelDrag.left + (t.clientX - state.panelDrag.x), state.panelDrag.top + (t.clientY - state.panelDrag.y));
      els.infoPanel.style.left = nx + 'px';
      els.infoPanel.style.top = ny + 'px';
    }, { passive: false });
    infoHead.addEventListener('touchend', () => { if (state.panelDrag) { state.panelDrag = null; state.panelTouchId = null; } });

    // 右键菜单
    els.stage.addEventListener('contextmenu', (e) => {
      if (!state.items.length) return;
      e.preventDefault(); showCtxMenu(e.clientX, e.clientY);
    });

    // 键盘
    window.addEventListener('keydown', (e) => {
      if (!els.settingsMask.hidden || !els.batchMask.hidden || !els.aboutMask.hidden) {
        if (e.key === 'Escape') { els.settingsMask.hidden = els.batchMask.hidden = els.aboutMask.hidden = true; }
        return;
      }
      if (state.slide.active) {
        if (e.key === 'Escape') stopSlideshow();
        else if (e.key === ' ') { e.preventDefault(); toggleSlidePlay(); }
        else if (e.key === 'ArrowRight') slideNext();
        else if (e.key === 'ArrowLeft') slidePrev();
        return;
      }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      const action = comboLookup && comboLookup[keyCombo(e)];
      if (action) { e.preventDefault(); runAction(action); }
    });

    // 快捷键重新绑定：捕获阶段优先拦截，避免触发既有动作
    window.addEventListener('keydown', (e) => {
      if (!capturingAction) return;
      e.preventDefault(); e.stopPropagation();
      const combo = keyCombo(e);
      if (combo === 'escape') { capturingAction = null; renderKeymapForm(); return; }
      for (const a in keymap) if (Array.isArray(keymap[a]) && keymap[a].includes(combo)) keymap[a] = keymap[a].filter((c) => c !== combo);
      keymap[capturingAction] = [combo];
      saveKeymap(); buildComboLookup(); capturingAction = null; renderKeymapForm();
    }, true);

    // 窗口尺寸变化 → 重新 fit
    window.addEventListener('resize', () => { if (state.items.length && state.mode === 'fit') { computeFit(); applyFit(); } });

    // 全屏时缩略图栏 3 秒后自动隐藏，鼠标移动重新显示并重置计时
    document.addEventListener('fullscreenchange', () => { applyThumbVisibility(); });
    window.addEventListener('mousemove', () => {
      if (document.fullscreenElement && state.showThumbs && state.items.length) {
        els.thumbBar.hidden = false; scheduleFsHide();
      }
    });

    // 设置弹窗
    els.settingsClose.addEventListener('click', () => els.settingsMask.hidden = true);
    els.settingsReset.addEventListener('click', () => {
      settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); saveSettings();
      els.image.classList.toggle('pixelated', getSetting('view', 'renderMode') === 'pixelated');
      buildSettingsNav(); renderSettingsForm(); toast('已恢复默认设置');
    });
    els.settingsMask.addEventListener('click', (e) => { if (e.target === els.settingsMask) els.settingsMask.hidden = true; });

    // 批量弹窗
    els.batchClose.addEventListener('click', () => els.batchMask.hidden = true);
    els.batchMask.addEventListener('click', (e) => { if (e.target === els.batchMask) els.batchMask.hidden = true; });
    $$('.batch-tab').forEach((t) => t.addEventListener('click', () => switchBatchTab(t.dataset.tab)));
    els.cvQuality.addEventListener('input', () => { els.cvQualityVal.textContent = els.cvQuality.value; renderCvPreview(); });
    els.cvFormat.addEventListener('change', () => {
      const isLossy = els.cvFormat.value !== 'image/png';
      els.cvQualityField.style.display = isLossy ? '' : 'none';
      renderCvPreview();
    });
    els.rsPercent.addEventListener('input', () => { els.rsPercentVal.textContent = els.rsPercent.value; renderRsPreview(); });
    els.rsMode.addEventListener('change', () => {
      updateRsUI();
      renderRsPreview();
    });
    els.rsWidth.addEventListener('change', renderRsPreview);
    els.rsHeight.addEventListener('change', renderRsPreview);
    els.rsLockRatio.addEventListener('change', renderRsPreview);
    els.rsResample.addEventListener('change', renderRsPreview);
    els.rsFormat.addEventListener('change', renderRsPreview);
    els.rsDpi.addEventListener('change', renderRsPreview);
    els.rnTemplate.addEventListener('input', updateRenamePreview);
    els.batchRun.addEventListener('click', runBatch);
    els.batchCancel.addEventListener('click', () => { batchCancelled = true; });
    if (els.btPreset) els.btPreset.addEventListener('change', renderTonePreview);
    if (els.cpFormat) els.cpFormat.addEventListener('change', () => { updateCompressUI(); renderCompressPreview(); });
    if (els.cpQuality) els.cpQuality.addEventListener('input', () => { updateCompressUI(); renderCompressPreview(); });
    if (els.cpMaxEdge) els.cpMaxEdge.addEventListener('change', renderCompressPreview);

    // 批量加水印事件
    ['wmText', 'wmSize', 'wmOpacity', 'wmColor', 'wmPos', 'wmMargin', 'wmFormat'].forEach((id) => {
      const el = els[id];
      if (!el) return;
      el.addEventListener('input', () => { updateWmUI(); renderWmPreview(); });
      el.addEventListener('change', () => { updateWmUI(); renderWmPreview(); });
    });

    // 关于弹窗
    els.aboutClose.addEventListener('click', () => els.aboutMask.hidden = true);
    els.aboutMask.addEventListener('click', (e) => { if (e.target === els.aboutMask) els.aboutMask.hidden = true; });

    // 最近打开弹窗
    els.btnRecent.addEventListener('click', openRecent);
    els.recentClose.addEventListener('click', () => els.recentMask.hidden = true);
    els.recentMask.addEventListener('click', (e) => { if (e.target === els.recentMask) els.recentMask.hidden = true; });
    els.recentClear.addEventListener('click', clearRecent);
    els.recentList.addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { e.stopPropagation(); removeRecent(+del.getAttribute('data-del')); return; }
      const li = e.target.closest('.recent-item');
      if (li && li.dataset.ts) {
        const entry = getRecent().find((x) => String(x.ts) === li.dataset.ts);
        if (entry) reopen(entry);
      }
    });
    els.recentInline.addEventListener('click', (e) => {
      const chip = e.target.closest('.recent-thumb, .recent-chip');
      if (chip && chip.dataset.ts) {
        const entry = getRecent().find((x) => String(x.ts) === chip.dataset.ts);
        if (entry) reopen(entry);
      }
    });

    // 右键菜单（点击空白处关闭）
    document.addEventListener('click', () => { if (els.ctxMenu) els.ctxMenu.hidden = true; });
    els.ctxMenu.addEventListener('click', (e) => {
      const act = e.target.getAttribute('data-act');
      if (!act) return;
      els.ctxMenu.hidden = true;
      if (act === 'copy') copyCurrentImage();
      else if (act === 'info') toggleInfo();
      else if (act === 'wallpaper') setWallpaper();
      else if (act === 'reveal') revealInExplorer();
      else if (act === 'slideshow') startSlideshow();
    });

    // 桌面版：接收 Tauri 打开文件 / 窗口拖放 / 单实例参数，自动加载图片列表
    if (desktop.available()) {
      try {
        const ev = window.__TAURI__.event;
        ev.listen('tauri://file-drop', (e) => {
          const paths = (e.payload && e.payload.paths) || [];
          if (paths.length) desktop.loadPaths(paths, getSetting('files', 'recursive'));
        });
        ev.listen('open-file', (e) => {
          const pl = e.payload;
          const paths = Array.isArray(pl) ? pl : (pl && pl.path ? [pl.path] : []);
          if (paths.length) desktop.loadPaths(paths, getSetting('files', 'recursive'));
        });
        // 启动参数拉取：双击关联文件/右键菜单启动时，Rust 端 setup 阶段的 emit 会因
        // WebView 未加载完成而丢失。改为启动后多次重试 invoke 拉取（取后即清空），
        // 覆盖"路径稍后才被存入 pending"的冷启动竞态；按已加载路径去重避免重复加载。
        let pendingLoaded = '';
        const pullPending = () => {
          desktop.invoke('get_pending_paths').then((paths) => {
            if (Array.isArray(paths) && paths.length) {
              const key = paths.slice().sort().join('\u0000');
              if (key !== pendingLoaded) { pendingLoaded = key; desktop.loadPaths(paths, getSetting('files', 'recursive')); }
            }
          }).catch(() => { /* 非致命 */ });
        };
        pullPending();
        [300, 800, 1600, 2800].forEach((ms) => setTimeout(pullPending, ms));
      } catch (e) { /* 非致命：Web 或事件 API 不可用 */ }
    }

    // 幻灯片控制
    els.slidePrev.addEventListener('click', slidePrev);
    els.slideNext.addEventListener('click', slideNext);
    els.slidePlay.addEventListener('click', toggleSlidePlay);
    els.slideExit.addEventListener('click', stopSlideshow);

    // 渲染模式初始应用
    els.image.classList.toggle('pixelated', getSetting('view', 'renderMode') === 'pixelated');

    // 云端账户 / 收藏 / 历史 按钮与面板
    if (els.accountBtn) els.accountBtn.addEventListener('click', openCloud);
    if (els.btnFav) els.btnFav.addEventListener('click', toggleFavorite);
    if (els.authClose) els.authClose.addEventListener('click', closeAuth);
    if (els.authMask) els.authMask.addEventListener('click', (e) => { if (e.target === els.authMask) closeAuth(); });
    if (els.authTab) els.authTab.addEventListener('change', switchAuthTab);
    if (els.authSubmit) els.authSubmit.addEventListener('click', submitAuth);
    if (els.authUser) els.authUser.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
    if (els.authPass) els.authPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
    if (els.authNick) els.authNick.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
    if (els.cloudClose) els.cloudClose.addEventListener('click', closeCloudPanel);
    if (els.cloudMask) els.cloudMask.addEventListener('click', (e) => { if (e.target === els.cloudMask) closeCloudPanel(); const t = e.target.closest('.cloud-tab'); if (t) switchCloudTab(t.getAttribute('data-tab')); });
    if (els.cloudSyncNow) els.cloudSyncNow.addEventListener('click', () => { if (isLoggedIn()) { pullAll(); toast('已与云端同步'); } });
    if (els.cloudLogout) els.cloudLogout.addEventListener('click', doLogout);
    if (els.profSave) els.profSave.addEventListener('click', saveProfile);
    if (els.pwdSave) els.pwdSave.addEventListener('click', changePwd);
    if (els.favList) els.favList.addEventListener('click', (e) => {
      const del = e.target.closest('.f-del');
      if (del) { favorites = favorites.filter((f) => f.id !== del.getAttribute('data-id')); saveFavorites(); if (isLoggedIn()) pushFavorites(); renderFavList(); return; }
      const dl = e.target.closest('.f-dl');
      if (dl) { const rec = favorites.find((f) => f.id === dl.getAttribute('data-id')); if (rec) downloadFavoriteImage(rec); return; }
      const li = e.target.closest('li[data-name]'); if (li) openFromList(li);
    });
    if (els.histList) els.histList.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-name]'); if (li) openFromList(li);
    });
  }

  // ============ 云端账户 + 收藏 + 历史 + 同步 ============
  const CLOUD_KEY = 'qjviewer_auth_v1';
  const FAV_KEY = 'qjviewer_favorites_v1';
  const HIST_KEY = 'qjviewer_history_v1';
  const HIST_MAX = 50;

  function cloudApiBase() {
    const s = getSetting('advanced', 'cloudApiBase');
    return (s && String(s).trim()) || 'http://localhost:8787';
  }

  // ---- token 安全存储（Web Crypto AES-GCM，设备绑定；Tauri 端建议迁 OS keyring） ----
  const TOKEN_PEPPER = 'lvjiaoxi-viewer-token-pepper-v1';
  const DEVSALT_KEY = 'lvjiaoxi_viewer_devsalt_v1';
  function getSubtle() {
    try { if (typeof self !== 'undefined' && self.crypto && self.crypto.subtle) return self.crypto.subtle; } catch (e) {}
    try { if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto.subtle; } catch (e) {}
    return null;
  }
  function getRand(n) {
    const a = new Uint8Array(n);
    try { if (typeof self !== 'undefined' && self.crypto && self.crypto.getRandomValues) return self.crypto.getRandomValues(a); } catch (e) {}
    try { if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) return globalThis.crypto.getRandomValues(a); } catch (e) {}
    for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return a;
  }
  function b64u(arr) { return btoa(String.fromCharCode.apply(null, new Uint8Array(arr))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function ub64(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(s); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
  async function getDeviceSalt() {
    let s = null; try { s = localStorage.getItem(DEVSALT_KEY); } catch (e) {}
    if (!s) { s = b64u(getRand(16)); try { localStorage.setItem(DEVSALT_KEY, s); } catch (e) {} }
    return s;
  }
  async function deriveKey(saltB64) {
    const subtle = getSubtle(); if (!subtle) return null;
    const base = await subtle.importKey('raw', new TextEncoder().encode(TOKEN_PEPPER), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: ub64(saltB64), iterations: 100000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encryptToken(obj) {
    const subtle = getSubtle(); if (!subtle) return { v: 1, raw: obj }; // 环境无 Web Crypto：降级明文（仍可用）
    const salt = await getDeviceSalt(); const key = await deriveKey(salt); const iv = getRand(12);
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
    return { v: 2, salt, iv: b64u(iv), ct: b64u(ct) };
  }
  async function decryptToken(stored) {
    if (!stored) return null;
    if (stored.v === 1 && stored.raw) return stored.raw;
    const subtle = getSubtle(); if (!subtle || stored.v !== 2) return null;
    try { const key = await deriveKey(stored.salt); const pt = await subtle.decrypt({ name: 'AES-GCM', iv: ub64(stored.iv) }, key, ub64(stored.ct)); return JSON.parse(new TextDecoder().decode(pt)); } catch (e) { return null; }
  }
  let auth = null;
  async function initAuth() {
    let raw = null; try { raw = localStorage.getItem(CLOUD_KEY); } catch (e) {}
    if (!raw) { auth = null; return; }
    try { const stored = JSON.parse(raw); auth = await decryptToken(stored); if (!(auth && auth.token)) auth = null; }
    catch (e) { auth = null; }
  }
  async function saveAuth() { try { if (auth) localStorage.setItem(CLOUD_KEY, JSON.stringify(await encryptToken(auth))); else localStorage.removeItem(CLOUD_KEY); } catch (e) {} }
  function isLoggedIn() { return !!(auth && auth.token); }

  // 本地收藏
  let favorites = loadFavorites();
  function loadFavorites() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } }
  function saveFavorites() { try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); } catch (e) {} }
  function favKeyOf(item) { return item && (item.path || item.name); }
  function isFavorited(item) { const k = favKeyOf(item); return !!k && favorites.some((f) => (f.path || f.name) === k); }
  function addFavorite(item) {
    const k = favKeyOf(item); if (!k) return;
    if (!isFavorited(item)) {
      const rec = { id: 'f' + Date.now(), name: item.name, path: item.path || null, addedAt: Date.now() };
      favorites.unshift(rec); saveFavorites();
      if (isLoggedIn()) { pushFavorites(); uploadFavoriteImage(rec, item); }
    }
    renderFavList(); updateFavBtn();
  }
  function removeFavorite(item) {
    const k = favKeyOf(item); if (!k) return;
    favorites = favorites.filter((f) => (f.path || f.name) !== k); saveFavorites(); if (isLoggedIn()) pushFavorites();
    renderFavList(); updateFavBtn();
  }
  // 取图片原始字节（File 优先，回退 fetch url）
  async function itemBytes(item) {
    try {
      if (item && item.file && typeof item.file.arrayBuffer === 'function') return new Uint8Array(await item.file.arrayBuffer());
      if (item && item.url) { const r = await fetch(item.url); if (r.ok) return new Uint8Array(await r.arrayBuffer()); }
    } catch (e) {}
    return null;
  }
  function favItemExt(item) {
    if (item && item.type === 'image/png') return 'png';
    if (item && item.type === 'image/jpeg') return 'jpg';

    if (item && item.type === 'image/webp') return 'webp';
    if (item && item.type === 'image/gif') return 'gif';
    const m = /\.([a-z0-9]+)$/i.exec(item && (item.name || item.path || ''));
    return m ? m[1].toLowerCase() : 'jpg';
  }
  async function uploadFavoriteImage(rec, item) {
    if (!isLoggedIn()) return;
    const bytes = await itemBytes(item); if (!bytes || bytes.length > 20 * 1024 * 1024) { toast('图片过大，未同步图本体'); return; }
    const b64 = (typeof btoa === 'function') ? btoa(String.fromCharCode.apply(null, bytes)) : Buffer.from(bytes).toString('base64');
    const ext = favItemExt(item);
    const r = await apiFetch('/api/favorites/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: { id: rec.id, ext, data: b64 } });
    if (r.status === 200) { rec.hasImage = true; rec.imageExt = ext; saveFavorites(); renderFavList(); toast('已同步收藏图本体'); }
    else toast(r.data.error || '图本体同步失败');
  }
  async function downloadFavoriteImage(rec) {
    if (!isLoggedIn()) { toast('请先登录以下载云端图片'); return; }
    const r = await apiFetch('/api/favorites/image/' + encodeURIComponent(rec.id));
    if (r.status === 200 && r.data && r.data.data) {
      const bytes = Uint8Array.from(atob(r.data.data), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/' + (rec.imageExt || 'jpeg') });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = rec.name || ('favorite.' + (rec.imageExt || 'jpg')); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } else if (r.status !== 0) toast(r.data.error || '下载失败');
  }
  function toggleFavorite() {
    const it = currentItem(); if (!it) return;
    if (isFavorited(it)) { removeFavorite(it); toast('已取消收藏'); } else { addFavorite(it); toast('已收藏'); }
  }

  // 本地历史
  let history = loadHistory();
  function loadHistory() { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch (e) { return []; } }
  function saveHistory() { try { localStorage.setItem(HIST_KEY, JSON.stringify(history)); } catch (e) {} }
  function recordHistory(item) {
    if (!item) return; const k = item.path || item.name; if (!k) return;
    history = history.filter((h) => (h.path || h.name) !== k);
    history.unshift({ id: 'h' + Date.now(), name: item.name, path: item.path || null, openedAt: Date.now() });
    if (history.length > HIST_MAX) history = history.slice(0, HIST_MAX);
    saveHistory(); if (isLoggedIn()) pushHistory();
  }

  function currentItem() { return state.index >= 0 ? state.items[state.index] : null; }

  // ---- API ----
  async function apiFetch(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (auth && auth.token) headers['Authorization'] = 'Bearer ' + auth.token;
    let res, data = null;
    try { res = await fetch(cloudApiBase() + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined }); }
    catch (e) { toast('无法连接云端（' + cloudApiBase() + '）'); return { status: 0, data: {} }; }
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && auth) { auth = null; await saveAuth(); refreshAccountUI(); toast('登录已过期，请重新登录'); }
    return { status: res.status, data: data || {} };
  }
  // ---- 离线同步队列（持久化 + 指数退避重试） ----
  const SYNC_QUEUE_KEY = 'lvjiaoxi_viewer_syncq_v1';
  let flushing = false, flushTimer = null;
  function loadQueue() { try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY)) || []; } catch (e) { return []; } }
  function saveQueue(q) { try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(q)); } catch (e) {} }
  function backoffMs(n) { return Math.min(30000, 800 * Math.pow(2, Math.min(n, 5))); }
  function enqueueSync(kind, payload) {
    if (!isLoggedIn()) return;
    const q = loadQueue().filter((t) => t.kind !== kind); // 同类型仅留最新，避免堆积
    q.push({ kind, payload, attempts: 0, nextAt: 0 });
    saveQueue(q); scheduleFlush();
  }
  function scheduleFlush() { if (flushTimer) clearTimeout(flushTimer); flushTimer = setTimeout(flushQueue, 400); }
  async function flushQueue() {
    if (flushing) return;
    if (!isLoggedIn()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const q = loadQueue(); if (!q.length) { updateCloudStatus(); return; }
    flushing = true;
    try {
      for (let i = 0; i < q.length; i++) {
        const t = q[i];
        if (Date.now() < t.nextAt) continue;
        const body = (t.kind === 'settings') ? { settings: t.payload.settings, keymap: t.payload.keymap } : { items: t.payload.items };
        try {
          const r = await apiFetch('/api/' + t.kind, { method: 'PUT', body });
          if (r.status === 200 || r.status === 204) { q.splice(i, 1); i--; saveQueue(q); }
          else { t.attempts++; t.nextAt = Date.now() + backoffMs(t.attempts); }
        } catch (e) { t.attempts++; t.nextAt = Date.now() + backoffMs(t.attempts); }
      }
    } finally { flushing = false; }
    saveQueue(q); updateCloudStatus();
    const pending = loadQueue();
    if (pending.length) { const wait = pending.reduce((m, t) => Math.min(m, Math.max(0, t.nextAt - Date.now())), 30000); setTimeout(flushQueue, wait || 1000); }
  }

  async function doLogin(username, password) {
    const r = await apiFetch('/api/login', { method: 'POST', body: { username, password } });
    if (r.status !== 200 || !r.data.token) { toast(r.data.error || '登录失败'); return false; }
    auth = { token: r.data.token, user: r.data.user }; await saveAuth(); await pullAll(); refreshAccountUI(); toast('已登录：' + (auth.user.nickname || auth.user.username)); return true;
  }
  async function doRegister(username, password, nickname) {
    const r = await apiFetch('/api/register', { method: 'POST', body: { username, password, nickname } });
    if (r.status !== 200 || !r.data.token) { toast(r.data.error || '注册失败'); return false; }
    auth = { token: r.data.token, user: r.data.user }; await saveAuth(); await pullAll(); refreshAccountUI(); toast('注册成功并已登录'); return true;
  }
  async function doLogout() {
    if (isLoggedIn()) {
      apiFetch('/api/settings', { method: 'PUT', body: { settings, keymap } });
      apiFetch('/api/favorites', { method: 'PUT', body: { items: favorites } });
      apiFetch('/api/history', { method: 'PUT', body: { items: history } });
    }
    auth = null; await saveAuth(); refreshAccountUI(); toast('已退出登录（本地改动已上传）');
  }
  async function pullAll() {
    const [s, f, h] = await Promise.all([apiFetch('/api/settings'), apiFetch('/api/favorites'), apiFetch('/api/history')]);
    if (s.status === 200 && s.data.settings) { try { settings = Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s.data.settings); localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }
    if (s.status === 200 && s.data.keymap) { try { keymap = Object.assign(JSON.parse(JSON.stringify(DEFAULT_KEYMAP)), s.data.keymap); localStorage.setItem(KEYMAP_KEY, JSON.stringify(keymap)); buildComboLookup(); } catch (e) {} }
    if (f.status === 200 && Array.isArray(f.data.items)) { favorites = f.data.items; saveFavorites(); renderFavList(); updateFavBtn(); }
    if (h.status === 200 && Array.isArray(h.data.items)) { history = h.data.items; saveHistory(); renderHistList(); }
    refreshAccountUI();
  }
  function pushSettings() { enqueueSync('settings', { settings, keymap }); }
  function pushFavorites() { enqueueSync('favorites', { items: favorites }); }
  function pushHistory() { enqueueSync('history', { items: history }); }

  // ---- UI ----
  function updateCloudStatus() {
    if (els.cloudStatus) {
      const n = loadQueue().length;
      els.cloudStatus.textContent = isLoggedIn() ? ('已登录：' + (auth.user.nickname || auth.user.username) + (n ? (' · 待同步 ' + n) : '')) : '未登录';
    }
  }
  function refreshAccountUI() {
    if (!els.accountBtn) return;
    if (isLoggedIn()) { els.accountBtn.textContent = '☁ ' + (auth.user.nickname || auth.user.username); els.accountBtn.title = '打开云端面板'; }
    else { els.accountBtn.textContent = '☁ 登录'; els.accountBtn.title = '登录云端账户'; }
    updateCloudStatus();
    updateFavBtn();
  }
  function updateFavBtn() {
    if (!els.btnFav) return;
    const it = currentItem();
    const on = it && isFavorited(it);
    els.btnFav.textContent = on ? '★ 已收藏' : '☆ 收藏';
    els.btnFav.classList.toggle('active', !!on);
  }
  function renderFavList() {
    if (!els.favList) return;
    if (!favorites.length) { els.favList.innerHTML = '<li class="empty">还没有收藏</li>'; return; }
    els.favList.innerHTML = favorites.map((f) => {
      const sync = (f.hasImage) ? '<span class="f-sync" title="图本体已同步云端">☁已同步</span>' : '';
      const dl = (f.hasImage) ? '<button class="f-dl" data-id="' + escapeHtml(f.id) + '" title="下载云端图片">⤓</button>' : '';
      return '<li data-name="' + escapeHtml(f.name) + '" data-path="' + escapeHtml(f.path || '') + '"><span class="f-name">' + escapeHtml(f.name) + '</span>' + sync + dl + '<button class="f-del" data-id="' + escapeHtml(f.id) + '" title="取消收藏">✕</button></li>';
    }).join('');
  }
  function renderHistList() {
    if (!els.histList) return;
    if (!history.length) { els.histList.innerHTML = '<li class="empty">还没有浏览记录</li>'; return; }
    els.histList.innerHTML = history.map((h) => '<li data-name="' + escapeHtml(h.name) + '" data-path="' + escapeHtml(h.path || '') + '"><span class="h-name">' + escapeHtml(h.name) + '</span><span class="h-time">' + new Date(h.openedAt).toLocaleString() + '</span></li>').join('');
  }
  function openCloud() { if (isLoggedIn()) openCloudPanel(); else openAuth(); }
  function openAuth() {
    if (!els.authMask) return;
    els.authMask.hidden = false; if (els.authErr) els.authErr.textContent = '';
    if (els.authTab) { els.authTab.value = 'login'; switchAuthTab(); }
    if (els.authUser) els.authUser.focus();
  }
  function closeAuth() { if (els.authMask) els.authMask.hidden = true; }
  function switchAuthTab() {
    if (!els.authTab) return;
    const t = els.authTab.value;
    if (els.authNick) els.authNick.hidden = (t !== 'register');
    if (els.authTitle) els.authTitle.textContent = (t === 'register') ? '注册账户' : '登录账户';
    if (els.authSubmit) els.authSubmit.textContent = (t === 'register') ? '注册' : '登录';
  }
  async function submitAuth() {
    if (!els.authUser || !els.authPass) return;
    const t = els.authTab ? els.authTab.value : 'login';
    const username = els.authUser.value.trim();
    const password = els.authPass.value;
    if (!username || !password) { if (els.authErr) els.authErr.textContent = '请输入用户名和密码'; return; }
    if (t === 'register') {
      const nickname = els.authNick ? els.authNick.value.trim() : '';
      if (username.length < 3) { if (els.authErr) els.authErr.textContent = '用户名至少 3 个字符'; return; }
      if (password.length < 6) { if (els.authErr) els.authErr.textContent = '密码至少 6 个字符'; return; }
      const ok = await doRegister(username, password, nickname);
      if (ok) closeAuth();
    } else {
      const ok = await doLogin(username, password);
      if (ok) closeAuth();
    }
  }
  function openCloudPanel() { if (els.cloudMask) els.cloudMask.hidden = false; renderFavList(); renderHistList(); refreshAccountUI(); }
  function switchCloudTab(tab) {
    if (!els.cloudMask) return;
    els.cloudMask.querySelectorAll('.cloud-tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    els.cloudMask.querySelectorAll('.cloud-pane').forEach((p) => { p.hidden = (p.getAttribute('data-pane') !== tab); });
  }
  function closeCloudPanel() { if (els.cloudMask) els.cloudMask.hidden = true; }
  async function saveProfile() {
    const nickname = els.profNick ? els.profNick.value.trim() : '';
    const avatar = els.profAvatar ? els.profAvatar.value.trim() : '';
    const r = await apiFetch('/api/me', { method: 'PUT', body: { nickname, avatar } });
    if (r.status === 200 && r.data.user) { auth.user = r.data.user; saveAuth(); refreshAccountUI(); toast('资料已更新'); }
    else toast(r.data.error || '更新失败');
  }
  async function changePwd() {
    const oldP = els.pwdOld ? els.pwdOld.value : '';
    const newP = els.pwdNew ? els.pwdNew.value : '';
    if (newP.length < 6) { toast('新密码至少 6 个字符'); return; }
    const r = await apiFetch('/api/me/password', { method: 'PUT', body: { oldPassword: oldP, newPassword: newP } });
    if (r.status === 200) { toast('密码已修改'); if (els.pwdOld) els.pwdOld.value = ''; if (els.pwdNew) els.pwdNew.value = ''; }
    else toast(r.data.error || '修改失败');
  }
  function openFromList(li) {
    const name = li.getAttribute('data-name'); const path = li.getAttribute('data-path');
    if (path && typeof window.__TAURI__ !== 'undefined') { desktop.loadPaths([path], getSetting('files', 'recursive')); closeCloudPanel(); }
    else toast('本地记录：' + name + (path ? '（' + path + '）' : '') + ' — 桌面版可一键打开');
  }

  // ============ 初始化 ============
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // file:// 双击打开时无法注册 SW（需 http/https），静默跳过，不影响主功能
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    // Tauri 桌面版：资源已嵌入本地 exe，禁用 SW——避免 cache-first 旧缓存阻塞新版本生效
    if (window.__TAURI__) return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* 注册失败不影响主功能 */ });
  }

  function init() {
    cacheDom();
    bindEvents();
    renderRecentInline();
    if (!state.items.length) els.emptyHint.hidden = false;
    registerServiceWorker();
    initAuth().then(() => { refreshAccountUI(); renderFavList(); renderHistList(); flushQueue(); });
    if (typeof window !== 'undefined') window.addEventListener('online', () => { if (isLoggedIn()) flushQueue(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // 测试/调试钩子（仅暴露内部状态与关键函数，便于自动化回归；不影响生产行为）
  if (typeof window !== 'undefined') {
      window.__qj = {
      get state() { return state; },
      makeCanvasOfCurrent, bakeFullCanvas, exportCanvasOfCurrent, setPngDpi, setJpegDpi, setWebpDpi, buildExifTiff, embedDpi, crc32,
      renderEditPreview, resetCrop, normToPx, detectLongImage,
      // 照片处理 测试钩子
      sharpenCanvas, autoEnhance, resetOps, applyPixelOpsAsync, filterCss, syncFilterUI,
      upscaleInterp, aiUpscale,
      get ops() { return state.ops; },
      updateOpsUI, onAiRun,
      // 美工 测试钩子
      STYLE_PRESETS, applyStylePreset, applyBorder, drawTexts, drawMosaic, addText, delSelText,
      toggleMosaicMode, clearMosaic, selTextAt, onBeauty, renderStyleGrid,
      get texts() { return state.texts; }, get mosaic() { return state.mosaic; },
      get mosaicMode() { return state.mosaicMode; }, get textSel() { return state.textSel; },
      getCrop: () => state.crop, setCrop: (c) => { state.crop = c; renderEditPreview(); }, openEdit,
      // 云端账户 / 收藏 / 历史 测试钩子
      get auth() { return auth; },
      get favorites() { return favorites; },
      get history() { return history; },
      isLoggedIn, doRegister, doLogin, doLogout, addFavorite, removeFavorite, recordHistory, pullAll,
      uploadFavoriteImage, downloadFavoriteImage, itemBytes,
      pushSettings, pushFavorites, pushHistory,
      encryptToken, decryptToken, enqueueSync, flushQueue, loadQueue, saveAuth, initAuth, getDeviceSalt,
      // 最近打开 测试钩子
      getRecent, addRecentFolder, addRecentFiles, removeRecent, clearRecent, openRecent, renderRecent, renderRecentInline,
      get recentMask() { return els.recentMask; },
      get recentList() { return els.recentList; },
      get recentInline() { return els.recentInline; },
      // 批量 测试钩子
      openBatch, switchBatchTab, batchTone, renderTonePreview, batchCompress, renderCompressPreview,
      renderCvPreview, renderRsPreview, updateRsUI,
      // 画面区域截图 测试钩子
      snapVisible,
      // 一键抠图 测试钩子
      setMatBrush, runMatting, clearMatting, exportMatting,
      get matting() { return state.matting; },
      // 瘦身/瘦脸 测试钩子
      setSlimAnchor, updateSlimUI, slimWarp, slimDisp, slimCanvas,
      get slim() { return state.slim; }, get slimMode() { return state.slimMode; },
      // HEIC 测试钩子
      isHeicItem, toSourceBlob, decodeHeicToUrl, resolveItemSrc,
      loadLibheif, evaluateCjsBundle, pixelsToBlobUrl,
    };
  }
})();





