// js/exif.js — EXIF 面板渲染 + JPEG/PNG 元数据解析
// 依赖（通过 window.__API__ 注入）：state, els, escapeHtml, extOf, formatBytes, formatDate,
//   copyText, toast, computeFit, applyActual, applyFit
(function() {
  window.__API__ = window.__API__ || {};

  function renderInfo() {
    const item = window.__API__.state.items[window.__API__.state.index];
    if (!item) return;
    let html = '';
    html += row('文件名', window.__API__.escapeHtml(item.name));
    html += row('格式', (window.__API__.extOf(item.name) || '—').toUpperCase());
    html += row('尺寸', item.natW && item.natH ? `${item.natW} × ${item.natH} px` : '—');
    html += row('文件大小', window.__API__.formatBytes(item.size));
    html += row('修改时间', window.__API__.formatDate(item.lastModified));
    html += row('当前缩放', Math.round(window.__API__.state.scale * 100) + '%');
    if (item.exif) {
      const e = item.exif;
      if (e.camera) { html += '<div class="info-group-title">相机信息 (EXIF)</div>'; html += row('设备', window.__API__.escapeHtml(e.camera)); }
      if (e.datetime) html += row('拍摄时间', window.__API__.escapeHtml(e.datetime));
      if (e.params) { html += row('光圈', window.__API__.escapeHtml(e.params.fnumber || '—')); html += row('快门', window.__API__.escapeHtml(e.params.exposure || '—')); html += row('ISO', window.__API__.escapeHtml(e.params.iso || '—')); html += row('焦距', window.__API__.escapeHtml(e.params.focal || '—')); }
      if (e.gps) {
        const lat = e.lat, lon = e.lon;
        if (lat != null && lon != null) {
          const mapUrl = `https://uri.amap.com/marker?position=${lon.toFixed(6)},${lat.toFixed(6)}&name=${encodeURIComponent(item.name || '图片位置')}`;
          html += row('📌 GPS', `<a href="${mapUrl}" target="_blank" style="color:var(--accent);text-decoration:underline">${window.__API__.escapeHtml(e.gps)} → 点击高德地图</a>`);
        } else {
          html += row('📌 GPS', window.__API__.escapeHtml(e.gps));
        }
      }
      if (e.sd) {
        html += '<div class="info-group-title">🎨 SD 参数</div>';
        if (e.sd.model) html += row('模型', window.__API__.escapeHtml(e.sd.model));
        if (e.sd.sampler) html += row('采样器', window.__API__.escapeHtml(e.sd.sampler));
        if (e.sd.steps) html += row('步数', window.__API__.escapeHtml(e.sd.steps));
        if (e.sd.cfg) html += row('CFG scale', window.__API__.escapeHtml(e.sd.cfg));
        if (e.sd.seed) html += row('Seed', window.__API__.escapeHtml(e.sd.seed));
        if (e.sd.prompt) html += row('正向提示词', window.__API__.escapeHtml(e.sd.prompt));
        if (e.sd.negative) html += row('负向提示词', window.__API__.escapeHtml(e.sd.negative));
      }
    } else if (item.type === 'image/jpeg' || item.type === 'image/png') {
      html += '<div class="info-group-title">相机信息 (EXIF)</div>';
      html += row('', '读取中…');
    } else {
      html += '<div class="info-group-title">相机信息 (EXIF)</div>';
      html += row('', '该格式无 EXIF');
    }
    html += '<div class="info-actions"><button class="btn sm" id="infoCopy">复制信息</button></div>';
    window.__API__.els.infoBody.innerHTML = html;
    const cp = document.getElementById('infoCopy');
    if (cp) cp.addEventListener('click', () => copyInfoText(item));
  }
  function row(k, v) { return `<div class="info-row"><span class="k">${k}</span><span class="v">${v}</span></div>`; }
  function copyInfoText(item) {
    const lines = [
      '文件名: ' + item.name,
      '格式: ' + (window.__API__.extOf(item.name) || '—').toUpperCase(),
      '尺寸: ' + (item.natW && item.natH ? `${item.natW} × ${item.natH} px` : '—'),
      '大小: ' + window.__API__.formatBytes(item.size),
      '修改: ' + window.__API__.formatDate(item.lastModified),
      '缩放: ' + Math.round(window.__API__.state.scale * 100) + '%',
    ];
    if (item.exif) {
      const e = item.exif;
      if (e.camera) lines.push('设备: ' + e.camera);
      if (e.datetime) lines.push('拍摄: ' + e.datetime);
      if (e.params) { lines.push('光圈: ' + (e.params.fnumber || '—')); lines.push('快门: ' + (e.params.exposure || '—')); lines.push('ISO: ' + (e.params.iso || '—')); lines.push('焦距: ' + (e.params.focal || '—')); }
      if (e.gps) lines.push('GPS: ' + e.gps);
      if (e.sd) {
        if (e.sd.model) lines.push('SD模型: ' + e.sd.model);
        if (e.sd.prompt) lines.push('SD正向: ' + e.sd.prompt);
        if (e.sd.negative) lines.push('SD负向: ' + e.sd.negative);
        if (e.sd.steps) lines.push('SD步数: ' + e.sd.steps);
        if (e.sd.cfg) lines.push('SD CFG: ' + e.sd.cfg);
        if (e.sd.sampler) lines.push('SD采样器: ' + e.sd.sampler);
        if (e.sd.seed) lines.push('SD Seed: ' + e.sd.seed);
      }
    }
    window.__API__.copyText(lines.join('\n'));
    toast('信息已复制');
  }

  function readExif(item) {
    try {
      const slice = item.file.slice(0, 512 * 1024);
      slice.arrayBuffer().then((buf) => {
        let exif = parseExif(buf);
        if (item.type === 'image/png') {
          const sd = parsePngTextChunks(buf);
          if (sd) { if (!exif) exif = {}; exif.sd = sd; }
        }
        item.exif = exif;
        if (window.__API__.els.infoPanel.hidden === false && window.__API__.state.index >= 0 && window.__API__.state.items[window.__API__.state.index] === item) renderInfo();
        if (window.__API__.state.index >= 0 && window.__API__.state.items[window.__API__.state.index] === item) {
          computeFit();
          if (window.__API__.state.mode === 'actual') applyActual(); else applyFit();
        }
      }).catch(() => {});
    } catch (e) {}
  }

  function parsePngTextChunks(buffer) {
    try {
      const dv = new DataView(buffer);
      const sig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
      for (let i = 0; i < 8; i++) if (dv.getUint8(i) !== sig[i]) return null;
      let off = 8;
      const allText = {};
      while (off + 12 <= dv.byteLength) {
        const len = dv.getUint32(off);
        const type = String.fromCharCode(dv.getUint8(off + 4), dv.getUint8(off + 5), dv.getUint8(off + 6), dv.getUint8(off + 7));
        if (len === 0 || off + 12 + len > dv.byteLength) break;
        const dataStart = off + 8;
        if (type === 'tEXt') {
          let kwEnd = dataStart;
          while (kwEnd < dataStart + len && dv.getUint8(kwEnd) !== 0) kwEnd++;
          const kw = readAsciiData(dv, dataStart, true, kwEnd - dataStart);
          const txt = readAsciiData(dv, kwEnd + 1, true, dataStart + len - kwEnd - 1);
          if (kw && txt) allText[kw] = txt;
        } else if (type === 'iTXt') {
          let kwEnd = dataStart;
          while (kwEnd < dataStart + len && dv.getUint8(kwEnd) !== 0) kwEnd++;
          const kw = readAsciiData(dv, dataStart, true, kwEnd - dataStart);
          let p = kwEnd + 1 + 1 + 1;
          while (p < dataStart + len && dv.getUint8(p) !== 0) p++;
          p++;
          while (p < dataStart + len && dv.getUint8(p) !== 0) p++;
          p++;
          const txt = readAsciiData(dv, p, true, dataStart + len - p);
          if (kw && txt) allText[kw] = txt;
        }
        if (type === 'IEND') break;
        off += 12 + len;
      }
      if (!allText['parameters'] && !allText['prompt']) return null;
      const sd = { raw: allText['parameters'] || '', prompt: '', negative: '', steps: '', cfg: '', sampler: '', seed: '', model: '' };
      sd.prompt = allText['prompt'] || '';
      sd.negative = allText['negative_prompt'] || allText['Negative prompt'] || '';
      sd.steps = allText['Steps'] || '';
      sd.cfg = allText['CFG scale'] || allText['cfg'] || '';
      sd.sampler = allText['Sampler'] || '';
      sd.seed = allText['Seed'] || '';
      sd.model = allText['Model'] || '';
      if (sd.raw) {
        if (!sd.negative) { const m = sd.raw.match(/Negative prompt:\s*(.+?)(?:\s*Steps:|$)/s); if (m) sd.negative = m[1].trim(); }
        if (!sd.prompt) { const m = sd.raw.match(/^(.+?)(?:\s*Negative prompt:|$)/s); if (m) sd.prompt = m[1].trim(); }
        if (!sd.steps) { const m = sd.raw.match(/Steps:\s*(\d+)/); if (m) sd.steps = m[1]; }
        if (!sd.cfg) { const m = sd.raw.match(/CFG scale:\s*([\d.]+)/); if (m) sd.cfg = m[1]; }
        if (!sd.sampler) { const m = sd.raw.match(/Sampler:\s*(.+?)(?:,\s*|$)/); if (m) sd.sampler = m[1].trim(); }
        if (!sd.seed) { const m = sd.raw.match(/Seed:\s*(\d+)/); if (m) sd.seed = m[1]; }
        if (!sd.model) { const m = sd.raw.match(/Model:\s*(.+?)(?:,\s*|$)/); if (m) sd.model = m[1].trim(); }
      }
      return sd;
    } catch (e) { return null; }
  }

  function parseExif(buffer) {
    try {
      const dv = new DataView(buffer);
      if (dv.getUint16(0) !== 0xFFD8) return null;
      let off = 2;
      while (off < dv.byteLength - 4) {
        const marker = dv.getUint16(off);
        if ((marker & 0xFF00) !== 0xFF00) break;
        if (marker === 0xFFE1) {
          const segLen = dv.getUint16(off + 2);
          const start = off + 4;
          if (dv.getUint32(start) === 0x45786966) {
            return parseTiff(new DataView(buffer, start + 6, segLen - 6), buffer);
          }
          return null;
        }
        if (marker === 0xFFDA) break;
        off += 2 + dv.getUint16(off + 2);
      }
    } catch (e) {}
    return null;
  }
  function parseTiff(tiff, fullBuf) {
    const result = { params: {}, camera: '', datetime: '', gps: '' };
    try {
      const le = tiff.getUint16(0) === 0x4949;
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
      if (g(0x8769)) {
        const exifIfd = readIfd(tiff, get32(g(0x8769)), le, get16, get32);
        if (exifIfd[0x9003]) result.datetime = readAscii(tiff, exifIfd[0x9003], le, get32);
      }
      if (g(0x8825)) {
        const gpsIfd = readIfd(tiff, get32(g(0x8825)), le, get16, get32);
        const latDeg = gpsCoord(tiff, gpsIfd[0x0002], le, get32);
        const lonDeg = gpsCoord(tiff, gpsIfd[0x0004], le, get32);
        const latRef = readAscii(tiff, gpsIfd[0x0001], le, get32).trim() || 'N';
        const lonRef = readAscii(tiff, gpsIfd[0x0003], le, get32).trim() || 'E';
        if (latDeg != null && lonDeg != null) {
          const lat = latRef === 'S' ? -latDeg : latDeg;
          const lon = lonRef === 'W' ? -lonDeg : lonDeg;
          result.lat = lat; result.lon = lon;
          result.gps = latDeg.toFixed(4) + '°' + latRef + ', ' + lonDeg.toFixed(4) + '°' + lonRef;
        }
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
  function readAscii(tiff, valOff) { return readAsciiData(tiff, valOff, true); }
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

  // 注册到全局 API
  window.__API__.renderInfo = renderInfo;
  window.__API__.row = row;
  window.__API__.copyInfoText = copyInfoText;
  window.__API__.readExif = readExif;
  window.__API__.parsePngTextChunks = parsePngTextChunks;
  window.__API__.parseExif = parseExif;
  window.__API__.parseTiff = parseTiff;
  window.__API__.readIfd = readIfd;
  window.__API__.readAscii = readAscii;
  window.__API__.ratStr = ratStr;
  window.__API__.gpsCoord = gpsCoord;
  window.__API__.readAsciiData = readAsciiData;
})();


