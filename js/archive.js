// js/archive.js — 压缩包/文件路径处理 + 图片源懒加载
// 依赖：state, els, desktop, isArchiveFile, isImageFile, showImage, renderThumbWindow, updateChrome, naturalCompare, decodeHeicToUrl, toast, extOf
(function() {
  window.__API__ = window.__API__ || {};

  async function handleOpenPaths(paths, recursive) {
    if (!paths || !paths.length) return;
    if (paths.length === 1 && isArchiveFile(paths[0])) {
      return window.__API__.desktop.openArchive(paths[0]);
    }
    return window.__API__.desktop.loadPaths(paths, recursive);
  }

  function buildItems(fileList, recursive) {
    let files = Array.from(fileList).filter((f) => isImageFile(f.name));
    if (!files.length) { window.__API__.toast('未找到图片文件'); return; }
    files.sort((a, b) => {
      const pa = (a.webkitRelativePath || a.name), pb = (b.webkitRelativePath || b.name);
      return naturalCompare(pa, pb);
    });
    window.__API__.state.items.forEach((it) => { if (it.url) URL.revokeObjectURL(it.url); if (it.displayUrl && it.displayUrl.indexOf('blob:') >= 0) URL.revokeObjectURL(it.displayUrl); });
    window.__API__.state.items = files.map((f) => ({
      file: f, name: f.name, size: f.size, lastModified: f.lastModified,
      type: f.type || ('image/' + window.__API__.extOf(f.name)),
      url: URL.createObjectURL(f), img: null, thumbUrl: null, natW: 0, natH: 0, exif: null,
    }));
    window.__API__.state.cache.clear();
    window.__API__.state.index = -1;
    window.__API__.els.emptyHint.hidden = true;
    window.__API__.els.viewer.querySelector('.empty-hint') && (window.__API__.els.emptyHint.hidden = true);
    window.__API__.showImage(0);
    window.__API__.renderThumbWindow(0);
    window.__API__.updateChrome();
  }

  function resolveItemSrc(item) {
    if (item.archiveIndex !== undefined && item.url === null) {
      if (item.displayUrl) { item.url = item.displayUrl; return Promise.resolve(item.url); }
      return window.__API__.desktop.readArchiveEntry(item.path, item.archiveIndex).then((dataUrl) => {
        item.url = dataUrl;
        item.displayUrl = dataUrl;
        return dataUrl;
      }).catch((e) => { throw new Error('压缩包图片加载失败: ' + e); });
    }
    if (!isHeicItem(item)) return Promise.resolve(item.url);
    if (item.displayUrl) return Promise.resolve(item.displayUrl);
    return decodeHeicToUrl(item).then((u) => { item.displayUrl = u; return u; });
  }

  function loadImage(item) {
    return new Promise((resolve, reject) => {
      if (item.img && item.img.complete && item.img.naturalWidth) { resolve(item.img); return; }
      window.__API__.resolveItemSrc(item).then((src) => {
        const img = new Image();
        img.onload = () => { item.img = img; item.natW = img.naturalWidth; item.natH = img.naturalHeight; resolve(img); };
        img.onerror = () => reject(new Error('解码失败: ' + item.name));
        img.src = src;
      }).catch((err) => reject(err));
    });
  }

  window.__API__.handleOpenPaths = handleOpenPaths;
  window.__API__.buildItems = buildItems;
  window.__API__.resolveItemSrc = resolveItemSrc;
  window.__API__.loadImage = loadImage;
})();



