'use strict';
// 绿角犀看图 — 前端账户模块 jsdom 集成测试（需先启动 server/mock-server.js）
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname.replace(/\\/g, '/').replace(/\/test$/, '');
const BASE = process.env.BASE || 'http://localhost:8787';
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/', pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (...a) => fetch(...a); // 注入 Node 22 全局 fetch
  // 注入 Web Crypto，使 token 加密路径（AES-GCM）在 jsdom 中真实运行
  try { Object.defineProperty(window, 'crypto', { value: require('node:crypto').webcrypto, configurable: true }); } catch (e) {}
  try { window.localStorage.clear(); } catch (e) {}
  window.eval(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'));

  const qj = window.__qj;
  ok(!!qj, 'app.js 已加载并暴露 __qj');
  ok(qj.isLoggedIn() === false, '初始未登录');
  const btn = window.document.getElementById('accountBtn');
  ok(btn && btn.textContent.includes('登录'), '未登录时账户按钮显示「登录」');

  // 注册
  const u = 'fe_' + Date.now();
  const okReg = await qj.doRegister(u, 'pw123456', 'FE用户');
  ok(okReg === true, '注册成功');
  ok(qj.isLoggedIn() === true && qj.auth && !!qj.auth.token, '注册后已登录且含 token');
  ok(btn.textContent.includes('FE用户'), '账户按钮显示昵称');

  // 收藏 -> 上传云端
  qj.addFavorite({ name: 'a.png', path: '/tmp/a.png' });
  await sleep(900);
  let r = await fetch(BASE + '/api/favorites', { headers: { Authorization: 'Bearer ' + qj.auth.token } });
  let d = await r.json();
  ok(d.items && d.items.length === 1 && d.items[0].name === 'a.png', '收藏已同步到云端 (items=1)');

  // 收藏图本体上传 -> 下载 闭环
  const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const imgItem = { name: 'cloud.png', path: '/x/cloud.png', type: 'image/png', file: { arrayBuffer: async () => pngBytes.buffer.slice(0) } };
  qj.addFavorite(imgItem);
  await sleep(1000);
  const favRec = qj.favorites.find((f) => f.path === '/x/cloud.png');
  ok(favRec && favRec.hasImage === true, '收藏图本体上传后标记 hasImage');
  r = await fetch(BASE + '/api/favorites/image/' + encodeURIComponent(favRec.id), { headers: { Authorization: 'Bearer ' + qj.auth.token } });
  d = await r.json();
  const got = (d.data && d.ext === 'png') ? Uint8Array.from(Buffer.from(d.data, 'base64')) : null;
  ok(got && got.length === pngBytes.length && got[0] === 137 && got[1] === 80, '下载图本体与上传字节一致 (PNG)');
  ok(d.ext === 'png', '图本体扩展名识别为 png');

  // 取消收藏 -> 云端图本体清理（孤儿文件删除）
  qj.removeFavorite(imgItem);
  await sleep(900);
  r = await fetch(BASE + '/api/favorites/image/' + encodeURIComponent(favRec.id), { headers: { Authorization: 'Bearer ' + qj.auth.token } });
  ok(r.status === 404, '取消收藏后云端图本体已清理 (404)');

  // 历史 -> 上传云端
  qj.recordHistory({ name: 'b.jpg', path: '/tmp/b.jpg' });
  await sleep(900);
  r = await fetch(BASE + '/api/history', { headers: { Authorization: 'Bearer ' + qj.auth.token } });
  d = await r.json();
  ok(d.items && d.items.some((x) => x.name === 'b.jpg'), '历史已同步到云端');

  // 设置：后端写入后 pullAll 拉回
  await fetch(BASE + '/api/settings', { method: 'PUT', headers: { Authorization: 'Bearer ' + qj.auth.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { view: { wallpaperMode: 'tile' } }, keymap: null }) });
  await qj.pullAll();
  ok(true, 'pullAll 执行不报错');

  // 登出
  await qj.doLogout();
  ok(qj.isLoggedIn() === false, '登出后未登录');

  // ===== 新增：token 安全存储（Web Crypto AES-GCM 设备绑定） =====
  await qj.doLogin(u, 'pw123456');
  ok(qj.isLoggedIn(), '重新登录成功（用于加密校验）');
  let stored = null; try { stored = JSON.parse(window.localStorage.getItem('qjviewer_auth_v1')); } catch (e) {}
  ok(stored && stored.v === 2 && !!stored.ct, 'token 以加密形式(v:2)落盘，非明文');
  ok(!(stored && stored.raw && stored.raw.token), '加密存储中不含明文 token 字段');
  const dec = await qj.decryptToken(stored);
  ok(dec && dec.token === qj.auth.token && dec.user && dec.user.username === u, 'decryptToken 能还原 token 与 user');

  // ===== 新增：离线同步队列（断网入队 → 重连补传） =====
  const realFetch = window.fetch;
  window.fetch = () => { throw new Error('offline'); }; // 模拟断网
  qj.recordHistory({ name: 'offline.jpg', path: '/tmp/offline.jpg' });
  qj.pushSettings();
  await sleep(60);
  let qlen = qj.loadQueue().length;
  ok(qlen >= 2, '断网时同步任务进入离线队列 (len=' + qlen + ')');
  window.fetch = realFetch; // 恢复网络
  await qj.flushQueue();
  await sleep(200);
  ok(qj.loadQueue().length === 0, '重连后 flushQueue 清空队列');
  r = await fetch(BASE + '/api/history', { headers: { Authorization: 'Bearer ' + qj.auth.token } });
  d = await r.json();
  ok(d.items && d.items.some((x) => x.name === 'offline.jpg'), '离线期间的历史已补传至云端');
  r = await fetch(BASE + '/api/settings', { headers: { Authorization: 'Bearer ' + qj.auth.token } });
  d = await r.json();
  ok(d.settings != null, '离线期间的设置已补传至云端');

  console.log('\n前端集成结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('异常:', e); process.exit(2); });
