'use strict';
// 绿角犀看图 mock 后端 — 端到端 API 测试（Node 22 全局 fetch）
const BASE = process.env.BASE || 'http://localhost:8787';
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '  (got ' + JSON.stringify(a) + ')'); }

async function j(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

async function main() {
  const uname = 'test_' + Date.now();
  const pw = 'secret123';
  console.log('# 1. 注册');
  let r = await j('POST', '/api/register', { username: uname, password: pw, nickname: '爱丽丝' });
  ok(r.status === 200 && r.data.token && r.data.user, '注册返回 token + user');
  ok(r.data.user.username === uname, '注册用户名正确');
  const token = r.data.token;

  console.log('# 2. 重复注册应 409');
  r = await j('POST', '/api/register', { username: uname, password: pw });
  ok(r.status === 409, '重复用户名 409');

  console.log('# 3. 错误密码登录应 401');
  r = await j('POST', '/api/login', { username: uname, password: 'wrong' });
  ok(r.status === 401, '错误密码 401');

  console.log('# 4. 登录');
  r = await j('POST', '/api/login', { username: uname, password: pw });
  ok(r.status === 200 && r.data.token, '登录成功返回 token');
  eq(r.data.user.nickname, '爱丽丝', '登录返回昵称');

  console.log('# 5. 未带 token 访问受保护接口应 401');
  r = await j('GET', '/api/me');
  ok(r.status === 401, '无 token 401');

  console.log('# 6. /api/me');
  r = await j('GET', '/api/me', null, token);
  ok(r.status === 200 && r.data.user.id, 'me 返回 user');

  console.log('# 7. 设置同步 上传->拉取');
  const settings = { view: { wallpaperMode: 'tile' }, advanced: { preloadSize: 30 } };
  const keymap = { next: ['arrowright'] };
  r = await j('PUT', '/api/settings', { settings, keymap }, token);
  ok(r.status === 200 && r.data.updatedAt, '设置上传返回 updatedAt');
  r = await j('GET', '/api/settings', null, token);
  eq(r.data.settings, settings, '拉取设置一致');
  eq(r.data.keymap, keymap, '拉取快捷键一致');

  console.log('# 8. 收藏同步');
  const favItems = [{ id: 'f1', name: 'a.png', path: '/x/a.png', addedAt: 100 }];
  r = await j('PUT', '/api/favorites', { items: favItems }, token);
  ok(r.status === 200, '收藏上传');
  r = await j('GET', '/api/favorites', null, token);
  eq(r.data.items, favItems, '收藏拉取一致');

  console.log('# 9. 历史同步');
  const histItems = [{ id: 'h1', name: 'b.jpg', path: '/x/b.jpg', openedAt: 200 }];
  r = await j('PUT', '/api/history', { items: histItems }, token);
  ok(r.status === 200, '历史上传');
  r = await j('GET', '/api/history', null, token);
  eq(r.data.items, histItems, '历史拉取一致');

  console.log('# 10. 改昵称');
  r = await j('PUT', '/api/me', { nickname: '爱丽丝2' }, token);
  eq(r.data.user.nickname, '爱丽丝2', '昵称已更新');

  console.log('# 11. 改密码（旧错应 400）');
  r = await j('PUT', '/api/me/password', { oldPassword: 'bad', newPassword: 'new1234' }, token);
  ok(r.status === 400, '旧密码错误 400');
  r = await j('PUT', '/api/me/password', { oldPassword: pw, newPassword: 'new1234' }, token);
  ok(r.status === 200 && r.data.ok, '改密码成功');
  r = await j('POST', '/api/login', { username: uname, password: 'new1234' });
  ok(r.status === 200, '用新密码可登录');

  console.log('# 12. 收藏图本体上传/下载/清理');
  const imgBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  r = await j('POST', '/api/favorites/image', { id: 'f1', ext: 'png', data: imgBytes.toString('base64') }, token);
  ok(r.status === 200 && r.data.ok && r.data.size === imgBytes.length, '图本体上传成功并返回 size');
  r = await j('GET', '/api/favorites/image/f1', null, token);
  ok(r.status === 200 && r.data.ext === 'png', '图本体下载返回 ext=png');
  const back = r.data.data ? Buffer.from(r.data.data, 'base64') : null;
  ok(back && back.equals(imgBytes), '下载字节与上传一致');
  r = await j('GET', '/api/favorites/image/nope', null, token);
  ok(r.status === 404, '未知 id 下载 404');
  r = await j('POST', '/api/favorites/image', { id: '../evil', ext: 'png', data: imgBytes.toString('base64') }, token);
  ok(r.status === 400, '非法收藏 id 被拒 (400)');
  // 取消收藏 f1 -> 云端图本体清理
  r = await j('PUT', '/api/favorites', { items: [] }, token);
  ok(r.status === 200, '清空收藏');
  r = await j('GET', '/api/favorites/image/f1', null, token);
  ok(r.status === 404, '取消收藏后图本体已清理 (404)');

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('测试异常:', e); process.exit(2); });
