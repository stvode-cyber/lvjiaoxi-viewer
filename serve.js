// 绿角犀看图 · 轻量本地静态服务（免依赖，纯 Node）
// 用途：以 http:// 提供应用，从而启用 PWA（可安装到桌面 / app shell 离线）。
//   node serve.js        -> http://localhost:8080
//   PORT=9000 node serve.js
// 双击 index.html (file://) 仍可直接浏览，只是无法注册 Service Worker。
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = process.env.PORT || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(root, p);
  if (!fp.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => {
  console.log('绿角犀看图已启动: http://localhost:' + port);
  console.log('在浏览器中打开后，地址栏可「安装到桌面」；断网刷新仍可进入应用（仅 app shell 离线）。');
});
