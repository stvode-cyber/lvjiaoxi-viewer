// 临时静态服务器（端到端 HEIC 验证用，用完即删）
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = __dirname + '/..';
const SAMPLE = process.env.LVJX_HEIC || (process.env.TEMP + '\\lvjx-sample.heic');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (p === '/sample.heic') file = SAMPLE;
  else {
    if (p === '/' || p === '') p = '/index.html';
    file = path.join(ROOT, p);
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8137, () => console.log('lvjx static up on 8137 sample=' + SAMPLE));