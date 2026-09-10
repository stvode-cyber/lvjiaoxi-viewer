// 从 icon.svg 生成 Tauri 所需的全部图标（PNG 多尺寸 + 多尺寸 ICO）
// 依赖：@resvg/resvg-js（npm i @resvg/resvg-js）
// 运行：node scripts/gen-icons.cjs
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'src-tauri', 'icons');
fs.mkdirSync(ICON_DIR, { recursive: true });

const svg = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8');

function renderPng(size) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
  return Buffer.from(resvg.render().asPng());
}

// tauri.conf.json bundle.icon 要求的 5 个文件
const files = {
  '32x32.png': 32,
  '128x128.png': 128,
  '128x128@2x.png': 256,
  'icon.png': 512,
};
for (const [name, size] of Object.entries(files)) {
  fs.writeFileSync(path.join(ICON_DIR, name), renderPng(size));
}

// 多尺寸 ICO（以 PNG 作为图像数据，Windows Vista+ 原生支持）
const icoSizes = [256, 128, 96, 64, 48, 32, 16];
const entries = icoSizes.map((s) => ({ size: s, data: renderPng(s) }));

const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // image type = icon
dir.writeUInt16LE(entries.length, 4);

let offset = 6 + 16 * entries.length;
const entryBufs = entries.map((e) => {
  const b = Buffer.alloc(16);
  b.writeUInt8(e.size >= 256 ? 0 : e.size, 0); // width (0 表示 256)
  b.writeUInt8(e.size >= 256 ? 0 : e.size, 1); // height
  b.writeUInt8(0, 2); // color count
  b.writeUInt8(0, 3); // reserved
  b.writeUInt16LE(1, 4); // color planes
  b.writeUInt16LE(32, 6); // bits per pixel
  b.writeUInt32LE(e.data.length, 8); // bytes in this image
  b.writeUInt32LE(offset, 12); // offset to image data
  offset += e.data.length;
  return b;
});

fs.writeFileSync(path.join(ICON_DIR, 'icon.ico'), Buffer.concat([dir, ...entryBufs, ...entries.map((e) => e.data)]));

console.log('icons generated:', Object.keys(files).join(', '), 'icon.ico');
