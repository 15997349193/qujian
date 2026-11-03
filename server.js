/**
 * test.html 的本地同步服务（仅测试用，无第三方依赖）
 * 启动：node server.js  →  手机与电脑连同一 WiFi，手机扫码即可真机同步
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT || 8788);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UP_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'photos.json');
const MAX_BODY = 12 * 1024 * 1024;      // 单张上限 ~9MB base64
const MAX_PHOTOS = 300;

fs.mkdirSync(UP_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]');

let db = [];
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) || []; } catch { db = []; }
function saveDB() {
  // 只保留最近 MAX_PHOTOS 条，同时删除超出的文件
  if (db.length > MAX_PHOTOS) {
    const drop = db.splice(0, db.length - MAX_PHOTOS);
    for (const p of drop) { try { fs.unlinkSync(path.join(UP_DIR, p.file)); } catch {} }
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1));
}

/* ---------- SSE 订阅 ---------- */
const clients = new Set();
function broadcast(msg) {
  const line = 'data: ' + JSON.stringify(msg) + '\n\n';
  for (const res of clients) { try { res.write(line); } catch {} }
}
setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n'); } catch {} } }, 25000);

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const safeId = s => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = url.pathname;

  /* 页面 */
  if (p === '/test2.html') {
    const html = fs.readFileSync(path.join(ROOT, 'test2.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length, 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  if (p === '/' || p === '/test.html' || p === '/index.html') {
    const html = fs.readFileSync(path.join(ROOT, 'test.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': html.length, 'Cache-Control': 'no-store' });
    return res.end(html);
  }

  /* 探活：页面据此判断是否 server 模式 */
  if (p === '/api/ping') return json(res, 200, { ok: true, mode: 'lan', photos: db.length });

  /* 列表 */
  if (p === '/api/photos' && req.method === 'GET') {
    const room = url.searchParams.get('room') || 'test';
    const list = db.filter(x => x.room === room).map(({ id, file, from, userName, name, ts, w, h, room }) =>
      ({ id, file, from, userName, name, ts, w, h, room }));
    return json(res, 200, { photos: list });
  }

  /* 上传 */
  if (p === '/api/upload' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); }
    catch { return json(res, 413, { error: '图片太大，请压缩后重试' }); }

    let payload;
    try { payload = JSON.parse(body); } catch { return json(res, 400, { error: 'bad json' }); }

    const dataUrl = String(payload.dataUrl || '');
    const m = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return json(res, 400, { error: '仅支持 jpeg/png/webp 图片' });

    const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
    const id = safeId(payload.id) || ('p' + Date.now().toString(36));
    const file = id + '.' + (ext === 'jpeg' ? 'jpg' : ext);
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 8 * 1024 * 1024) return json(res, 413, { error: '图片超过 8MB' });

    fs.writeFileSync(path.join(UP_DIR, file), buf);
    const photo = {
      id, file,
      from: payload.from === 'mobile' ? 'mobile' : 'desktop',
      userName: String(payload.userName || '匿名').slice(0, 20),
      openid: String(payload.openid || '').slice(0, 40),
      name: String(payload.name || '').slice(0, 80),
      room: String(payload.room || 'test').slice(0, 24),
      ts: Number(payload.ts) || Date.now(),
      w: Number(payload.w) || 0, h: Number(payload.h) || 0
    };
    db.push(photo); saveDB();
    broadcast({ type: 'add', photo });
    return json(res, 200, { ok: true, photo });
  }

  /* 实时推送 */
  if (p === '/api/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(': connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  /* 图片 */
  if (p.startsWith('/uploads/')) {
    const name = path.basename(p);
    const fp = path.join(UP_DIR, name);
    if (!fp.startsWith(UP_DIR) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(fp).slice(1).toLowerCase();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const st = fs.statSync(fp);
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'public, max-age=86400' });
    return fs.createReadStream(fp).pipe(res);
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404');
});

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const it of list || []) {
      if (it.family === 'IPv4' && !it.internal) out.push(it.address);
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('\n  拍照同步测试服务已启动');
  console.log('  本机：http://localhost:' + PORT + '/test.html');
  if (ips.length) {
    console.log('  局域网（手机用这个）：');
    for (const ip of ips) console.log('    http://' + ip + ':' + PORT + '/test.html');
    console.log('\n  手机与电脑需连同一个 WiFi；首次可能需要在 Windows 防火墙放行 Node。');
  } else {
    console.log('  未检测到局域网 IP，请检查网络连接。');
  }
  console.log('');
});
