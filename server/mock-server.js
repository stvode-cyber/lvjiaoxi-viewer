'use strict';
/**
 * 绿角犀看图 — 云端账户 Mock 后端（零依赖，仅用 Node 内置模块）
 *
 * 用途：本地开发 / 演示用的云端账户 + 同步服务。
 * 注意：这是 DEV 用途的 mock，不是生产后端——JWT 密钥、明文文件存储、CORS *
 * 均仅适合本地。接入真实后端时，前端只需把 cloudApiBase 指向真实服务（契约见下）。
 *
 * 启动：  node server/mock-server.js   （端口可用 PORT 环境变量覆盖，默认 8787）
 *
 * REST + JWT 契约（前端据此对接，换真后端时保持一致即可）：
 *   POST /api/register        {username,password,nickname?}            -> {token,user}
 *   POST /api/login           {username,password}                      -> {token,user}
 *   GET  /api/me              (auth)                                   -> {user}
 *   PUT  /api/me              (auth) {nickname?,avatar?}               -> {user}
 *   PUT  /api/me/password     (auth) {oldPassword,newPassword}         -> {ok:true}
 *   GET  /api/settings        (auth)                                   -> {settings,keymap,updatedAt}
 *   PUT  /api/settings        (auth) {settings,keymap}                 -> {updatedAt}
 *   GET  /api/favorites       (auth)                                   -> {items,updatedAt}
 *   PUT  /api/favorites       (auth) {items}                           -> {updatedAt}
 *   POST /api/favorites/image (auth) {id,ext,data(base64)}            -> {ok:true,size}  (上传收藏图本体)
 *   GET  /api/favorites/image/:id (auth)                             -> {data(base64),ext}  (下载收藏图本体)
 *   GET  /api/history         (auth)                                   -> {items,updatedAt}
 *   PUT  /api/history         (auth) {items}                           -> {updatedAt}
 * user: {id,username,nickname,avatar,createdAt}
 * favorite 项扩展: {id,name,path?,addedAt,hasImage?,imageExt?}
 * 同步冲突策略：全量覆盖 + last-write-wins（按 updatedAt）。
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8787', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'lvjiaoxi-dev-secret';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// ---------- 工具 ----------
function readJson(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return def; }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf8');
}
function uid() { return crypto.randomUUID(); }
function nowSec() { return Math.floor(Date.now() / 1000); }

// 密码：scrypt 哈希
function newSalt() { return crypto.randomBytes(16).toString('hex'); }
function hashPassword(pw, salt) { return crypto.scryptSync(String(pw), salt, 64).toString('hex'); }

// JWT（HS256，零依赖自签）
function b64url(o) { return Buffer.from(o).toString('base64url'); }
function signToken(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = header + '.' + body;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = parts[0] + '.' + parts[1];
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  // 恒定时间比较，避免时序攻击
  const a = Buffer.from(expected), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch (e) { return null; }
}

// ---------- 用户存储 ----------
// users.json: { [uid]: {id,username(小写),passwordHash,salt,nickname,avatar,createdAt} }
function loadUsers() { return readJson(USERS_FILE, {}); }
function saveUsers(u) { writeJson(USERS_FILE, u); }
function findUserByUsername(name) {
  const users = loadUsers();
  const key = String(name).toLowerCase();
  for (const id in users) if (users[id].username === key) return users[id];
  return null;
}
function publicUser(u) {
  return { id: u.id, username: u.username, nickname: u.nickname || u.username, avatar: u.avatar || '', createdAt: u.createdAt };
}
function userDir(id) { return path.join(DATA_DIR, 'users', id); }
function dataFile(id, name) { return path.join(userDir(id), name + '.json'); }
function getUserData(id, name, def) { return readJson(dataFile(id, name), def); }
function setUserData(id, name, obj) { writeJson(dataFile(id, name), obj); }
// 收藏图本体存储（data/users/{uid}/images/{favId}.{ext}）
const IMG_EXTS = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };
function imageDir(uid) { return path.join(userDir(uid), 'images'); }
function imageFileFor(uid, id) {
  // 仅按 fav id 找文件（ext 未知），扫描该用户的 images 目录
  try { const dir = imageDir(uid); const files = fs.readdirSync(dir); const f = files.find((x) => x.startsWith(id + '.')); return f ? path.join(dir, f) : null; }
  catch (e) { return null; }
}
function deleteImageFile(uid, id) {
  const f = imageFileFor(uid, id);
  if (f) { try { fs.unlinkSync(f); } catch (e) {} }
}
function safeExt(ext) { return /^[a-z0-9]{1,5}$/.test(String(ext || '')) ? String(ext).toLowerCase() : 'bin'; }

// ---------- HTTP 辅助 ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Max-Age': '86400',
};
function sendJson(res, status, obj, extraHeaders) {
  const headers = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS, extraHeaders || {});
  res.writeHead(status, headers);
  res.end(JSON.stringify(obj));
}
function sendError(res, status, msg) { sendJson(res, status, { error: msg }); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) { tooBig = true; req.destroy(); } // 5MB 上限
    });
    req.on('end', () => {
      if (tooBig) return reject(new Error('body too large'));
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}
// 读取原始字节（用于图片上传，支持更大体积）
function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let tooBig = false;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { tooBig = true; req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => { if (tooBig) return reject(new Error('body too large')); resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}
function getToken(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}
function authUser(req) {
  const t = getToken(req);
  const p = verifyToken(t);
  if (!p) return null;
  const users = loadUsers();
  return users[p.uid] || null;
}

// ---------- 路由 ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  const method = req.method;

  if (method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  try {
    // 注册
    if (p === '/api/register' && method === 'POST') {
      const b = await readBody(req);
      const username = String(b.username || '').trim().toLowerCase();
      const password = String(b.password || '');
      const nickname = String(b.nickname || '').trim() || username;
      if (username.length < 3) return sendError(res, 400, '用户名至少 3 个字符');
      if (password.length < 6) return sendError(res, 400, '密码至少 6 个字符');
      if (findUserByUsername(username)) return sendError(res, 409, '用户名已被注册');
      const salt = newSalt();
      const user = {
        id: uid(), username, salt,
        passwordHash: hashPassword(password, salt),
        nickname, avatar: '', createdAt: nowSec(),
      };
      const users = loadUsers();
      users[user.id] = user;
      saveUsers(users);
      // 初始化空同步数据
      setUserData(user.id, 'settings', { settings: null, keymap: null, updatedAt: nowSec() });
      setUserData(user.id, 'favorites', { items: [], updatedAt: nowSec() });
      setUserData(user.id, 'history', { items: [], updatedAt: nowSec() });
      const token = signToken({ uid: user.id, username: user.username, exp: nowSec() + 60 * 60 * 24 * 30 });
      return sendJson(res, 200, { token, user: publicUser(user) });
    }

    // 登录
    if (p === '/api/login' && method === 'POST') {
      const b = await readBody(req);
      const username = String(b.username || '').trim().toLowerCase();
      const password = String(b.password || '');
      const user = findUserByUsername(username);
      if (!user || hashPassword(password, user.salt) !== user.passwordHash) return sendError(res, 401, '用户名或密码错误');
      const token = signToken({ uid: user.id, username: user.username, exp: nowSec() + 60 * 60 * 24 * 30 });
      return sendJson(res, 200, { token, user: publicUser(user) });
    }

    // 以下均需鉴权
    const u = authUser(req);
    if (!u) return sendError(res, 401, '未登录或登录已过期');

    if (p === '/api/me' && method === 'GET') {
      return sendJson(res, 200, { user: publicUser(u) });
    }
    if (p === '/api/me' && method === 'PUT') {
      const b = await readBody(req);
      if (typeof b.nickname === 'string' && b.nickname.trim()) u.nickname = b.nickname.trim();
      if (typeof b.avatar === 'string') u.avatar = b.avatar.slice(0, 200000); // 限制头像 dataURL 长度
      const users = loadUsers(); users[u.id] = u; saveUsers(users);
      return sendJson(res, 200, { user: publicUser(u) });
    }
    if (p === '/api/me/password' && method === 'PUT') {
      const b = await readBody(req);
      if (hashPassword(b.oldPassword, u.salt) !== u.passwordHash) return sendError(res, 400, '原密码错误');
      if (String(b.newPassword || '').length < 6) return sendError(res, 400, '新密码至少 6 个字符');
      u.salt = newSalt();
      u.passwordHash = hashPassword(b.newPassword, u.salt);
      const users = loadUsers(); users[u.id] = u; saveUsers(users);
      return sendJson(res, 200, { ok: true });
    }

    // 设置同步
    if (p === '/api/settings' && method === 'GET') {
      return sendJson(res, 200, getUserData(u.id, 'settings', { settings: null, keymap: null, updatedAt: nowSec() }));
    }
    if (p === '/api/settings' && method === 'PUT') {
      const b = await readBody(req);
      const cur = getUserData(u.id, 'settings', { settings: null, keymap: null, updatedAt: nowSec() });
      const next = {
        settings: (b.settings !== undefined ? b.settings : cur.settings),
        keymap: (b.keymap !== undefined ? b.keymap : cur.keymap),
        updatedAt: nowSec(),
      };
      setUserData(u.id, 'settings', next);
      return sendJson(res, 200, { updatedAt: next.updatedAt });
    }

    // 收藏同步
    if (p === '/api/favorites' && method === 'GET') {
      return sendJson(res, 200, getUserData(u.id, 'favorites', { items: [], updatedAt: nowSec() }));
    }
    if (p === '/api/favorites' && method === 'PUT') {
      const b = await readBody(req);
      const items = Array.isArray(b.items) ? b.items.slice(0, 1000) : [];
      // 清理被删除收藏对应的图本体文件
      const prev = getUserData(u.id, 'favorites', { items: [] });
      const prevIds = new Set(prev.items.map((x) => x.id));
      const curIds = new Set(items.map((x) => x.id));
      prevIds.forEach((id) => { if (!curIds.has(id)) deleteImageFile(u.id, id); });
      setUserData(u.id, 'favorites', { items, updatedAt: nowSec() });
      return sendJson(res, 200, { updatedAt: nowSec() });
    }
    // 上传收藏图本体
    if (p === '/api/favorites/image' && method === 'POST') {
      const MAX = 20 * 1024 * 1024; // 20MB 上限
      let raw;
      try { raw = await readRawBody(req, MAX); } catch (e) { return sendError(res, 413, '图片过大（上限 20MB）'); }
      let b; try { b = JSON.parse(raw.toString('utf8')); } catch (e) { return sendError(res, 400, '请求体不是合法 JSON'); }
      const id = String(b.id || '');
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return sendError(res, 400, '非法收藏 id');
      const ext = safeExt(b.ext);
      if (typeof b.data !== 'string') return sendError(res, 400, '缺少图片数据');
      let buf;
      try { buf = Buffer.from(b.data, 'base64'); } catch (e) { return sendError(res, 400, '图片数据不是合法 base64'); }
      if (!buf.length) return sendError(res, 400, '空图片');
      deleteImageFile(u.id, id); // 同 id 旧图先清
      fs.mkdirSync(imageDir(u.id), { recursive: true });
      fs.writeFileSync(path.join(imageDir(u.id), id + '.' + ext), buf);
      return sendJson(res, 200, { ok: true, size: buf.length });
    }
    // 下载收藏图本体
    if (p.startsWith('/api/favorites/image/') && method === 'GET') {
      const id = p.slice('/api/favorites/image/'.length).split('/')[0];
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return sendError(res, 400, '非法收藏 id');
      const f = imageFileFor(u.id, id);
      if (!f) return sendError(res, 404, '未找到该收藏图片');
      const ext = f.split('.').pop();
      return sendJson(res, 200, { data: fs.readFileSync(f).toString('base64'), ext });
    }

    // 历史同步
    if (p === '/api/history' && method === 'GET') {
      return sendJson(res, 200, getUserData(u.id, 'history', { items: [], updatedAt: nowSec() }));
    }
    if (p === '/api/history' && method === 'PUT') {
      const b = await readBody(req);
      const items = Array.isArray(b.items) ? b.items.slice(0, 2000) : [];
      setUserData(u.id, 'history', { items, updatedAt: nowSec() });
      return sendJson(res, 200, { updatedAt: nowSec() });
    }

    return sendError(res, 404, 'not found');
  } catch (e) {
    if (e.message === 'body too large') return sendError(res, 413, '请求体过大');
    if (e.message === 'invalid json') return sendError(res, 400, '请求体不是合法 JSON');
    return sendError(res, 500, '服务器错误: ' + e.message);
  }
}

const server = http.createServer((req, res) => { handle(req, res).catch(() => sendError(res, 500, '服务器错误')); });
server.listen(PORT, () => {
  console.log('[绿角犀看图 mock 后端] 已启动: http://localhost:' + PORT);
  console.log('  数据目录: ' + DATA_DIR);
  console.log('  (DEV 用途，请勿暴露到公网)');
});
