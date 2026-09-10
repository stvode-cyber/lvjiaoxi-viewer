// 构建前把 Web 前端资源同步到 dist/（Tauri frontendDist 要求独立目录，不得包含 src-tauri/node_modules）
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const FILES = ['index.html', 'app.js', 'styles.css', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'libheif-bundle.js', '使用说明.html'];
fs.mkdirSync(dist, { recursive: true });
for (const f of FILES) {
  const src = path.join(root, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dist, f));
}
// 同步 assets/（离线运行资源：内嵌 AI 超分模型 .onnx + onnxruntime-web 及 wasm）
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}
const srcAssets = path.join(root, 'assets');
const distAssets = path.join(dist, 'assets');
if (fs.existsSync(srcAssets)) copyTree(srcAssets, distAssets);
console.log('[sync-dist] 已同步 ' + FILES.length + ' 个文件 + assets/ 到 dist/');
