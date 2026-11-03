/**
 * 照片同步测试页的本地同步服务
 * 零依赖：只用 node 内置模块。
 *   - 静态文件服务（test.html 等）
 *   - REST API：/api/health、/api/photos
 *   - SSE 实时推送：/api/events
 * 启动：node server.js   或双击 start-server.cmd
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, '_data');
const DATA_FILE = path.join(DATA_DIR, 'photos.json');
const PORT = Number(process.env.PORT || 8090);
const HOST = process.env.HOST || '0.0.0.0';

const MAX_ITEMS = 12;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/* ---------------- 存储 ---------------- */

let items = [];

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const obj = JSON.parse(raw);
    items = Array.isArray(obj.items) ? obj.items.slice(0, MAX_ITEMS) : [];
  } catch (e) {
    items = [];
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ items }), 'utf8');
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    log('error', 'save failed', { message: e.message });
  }
}

/* ---------------- 日志 ---------------- */

function log(level, msg, extra) {
  const rec = Object.assign({ ts: new Date().toISOString(), level, msg }, extra || {});
  console.log(JSON.stringify(rec));
}

/* ---------------- SSE ---------------- */

const clients = new Set();

function broadcast(payload) {
  const frame = 'data: ' + JSON.stringify(payload) + '\n\n';
  for (const res of clients) {
    try { res.write(frame); } catch (e) { clients.delete(res); }
  }
}

function peerCount() {
  return clients.size;
}

function broadcastPeers() {
  broadcast({ type: 'peers', count: peerCount() });
}

/* ---------------- HTTP 工具 ---------------- */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/test.html';
  const filePath = path.join(ROOT, rel);

  // 防目录穿越
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return;
  }
  // 不对外暴露数据目录
  if (filePath.startsWith(path.join(ROOT, '_data'))) {
    json(res, 403, { ok: false, error: 'forbidden' });
    return;
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------- 参数校验 ---------------- */

function sanitizePhoto(p) {
  if (!p || typeof p !== 'object') return null;
  const dataUrl = p.dataUrl;
  if (typeof dataUrl !== 'string') return null;
  if (dataUrl.indexOf('data:image/') !== 0) return null;
  if (dataUrl.length > MAX_PHOTO_BYTES) return null;

  const clampStr = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

  return {
    id: clampStr(p.id, 64) || 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    dataUrl,
    w: Number.isFinite(p.w) ? Math.max(1, Math.min(8000, Math.round(p.w))) : 0,
    h: Number.isFinite(p.h) ? Math.max(1, Math.min(8000, Math.round(p.h))) : 0,
    ts: Number.isFinite(p.ts) ? p.ts : Date.now(),
    from: clampStr(p.from, 64),
    fromRole: p.fromRole === 'pc' ? 'pc' : 'phone',
    owner: clampStr(p.owner, 40) || '微信用户',
    source: clampStr(p.source, 120) || 'photo.jpg'
  };
}

function upsert(photo) {
  const i = items.findIndex((x) => x.id === photo.id);
  if (i >= 0) items[i] = photo; else items.unshift(photo);
  items.sort((a, b) => b.ts - a.ts);
  if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
}

/* ---------------- 路由 ---------------- */

const server = http.createServer((req, res) => {
  const started = Date.now();
  let url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch (e) {
    json(res, 400, { ok: false, error: 'bad request' });
    return;
  }
  const pathname = url.pathname;

  res.on('finish', () => {
    if (pathname.startsWith('/api/')) {
      log('info', 'api', { method: req.method, path: pathname, status: res.statusCode, ms: Date.now() - started });
    }
  });

  // ---- SSE ----
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 2000\n\n');
    res.write('data: ' + JSON.stringify({ type: 'hello', count: peerCount() + 1 }) + '\n\n');
    clients.add(res);
    broadcastPeers();

    const ping = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (e) { /* ignore */ }
    }, 15000);

    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
      broadcastPeers();
    });
    return;
  }

  // ---- AI 视觉复核代理 ----
  // 免费视觉大模型（默认智谱 GLM-4V-Flash）需要 API Key；key 只保存在服务端环境变量里，
  // 网页不接触 key。未配置时返回 503，页面优雅降级为纯本地识别。
  // 配置方法（启动前）：
  //   set VISION_API_KEY=你的key        （智谱开放平台 https://open.bigmodel.cn 免费领取）
  //   set VISION_MODEL=glm-4v-flash     （可选，默认 glm-4v-flash）
  //   set VISION_BASE_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions （可选）
  if (pathname === '/api/vision' && req.method === 'POST') {
    const API_KEY = process.env.VISION_API_KEY || '';
    if (!API_KEY) {
      json(res, 503, { ok: false, error: 'not-configured',
        hint: '未配置视觉模型 Key。请设置环境变量 VISION_API_KEY 后重启服务。' });
      return;
    }
    readBody(req).then(async (raw) => {
      let body;
      try { body = JSON.parse(raw || '{}'); } catch (e) {
        json(res, 400, { ok: false, error: 'invalid json' });
        return;
      }
      const images = (Array.isArray(body.images) ? body.images : [])
        .filter((s) => typeof s === 'string' && /^data:image\/(png|jpeg);base64,/.test(s))
        .slice(0, 2);
      if (!images.length) {
        json(res, 400, { ok: false, error: 'no images' });
        return;
      }
      const BASE = process.env.VISION_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
      const MODEL = process.env.VISION_MODEL || 'glm-4v-flash';
      const content = [
        { type: 'text', text:
          '这是同一颗三阶魔方的照片（最多2张，每张可见3个面）。请仔细读出每个可见面的9个贴纸颜色。' +
          '颜色只能是：白、黄、红、橙、绿、蓝 之一。每个面的中心块颜色决定该面的名称。' +
          '严格只输出 JSON，不要输出任何其他文字，格式：' +
          '{"faces":[{"center":"中心块颜色","colors":["9个贴纸颜色，按从左到右、从上到下的顺序，不含中心块以外的标点"]}]}' }
      ];
      for (const dataUrl of images) {
        content.push({ type: 'image_url', image_url: { url: dataUrl } });
      }
      const payload = JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content }],
        temperature: 0.1
      });
      const up = new URL(BASE);
      const reqOpt = {
        hostname: up.hostname, port: up.port || 443, path: up.pathname + up.search, method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}`,
          'Content-Length': Buffer.byteLength(payload) }
      };
      const result = await new Promise((resolve) => {
        const mod = up.protocol === 'http:' ? require('http') : require('https');
        const r = mod.request(reqOpt, (resp) => {
          let data = '';
          resp.on('data', (c) => { data += c; });
          resp.on('end', () => {
            try {
              const j = JSON.parse(data);
              const text = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
              const m = text.match(/\{[\s\S]*\}/);
              resolve(resp.statusCode === 200 && m ? { ok: true, faces: JSON.parse(m[0]).faces } :
                { ok: false, error: 'bad response', status: resp.statusCode, text: String(text).slice(0, 200) });
            } catch (e) { resolve({ ok: false, error: 'parse fail', text: String(data).slice(0, 200) }); }
          });
        });
        r.on('error', (e) => resolve({ ok: false, error: 'request fail: ' + e.message }));
        r.setTimeout(30000, () => { r.destroy(); resolve({ ok: false, error: 'timeout' }); });
        r.write(payload); r.end();
      });
      json(res, result.ok ? 200 : 502, result);
    }).catch((e) => json(res, 500, { ok: false, error: e.message }));
    return;
  }

  // ---- API ----
  if (pathname === '/api/health') {
    json(res, 200, { ok: true, mode: 'server', items: items.length, peers: peerCount(),
      vision: !!(process.env.VISION_API_KEY), ts: Date.now() });
    return;
  }

  if (pathname === '/api/photos' && req.method === 'GET') {
    json(res, 200, { ok: true, items });
    return;
  }

  if (pathname === '/api/photos' && req.method === 'POST') {
    readBody(req).then((raw) => {
      let body;
      try { body = JSON.parse(raw || '{}'); } catch (e) {
        json(res, 400, { ok: false, error: 'invalid json' });
        return;
      }
      const photo = sanitizePhoto(body.photo || body);
      if (!photo) {
        json(res, 400, { ok: false, error: 'invalid photo' });
        return;
      }
      if (items.length >= MAX_ITEMS && !items.some((x) => x.id === photo.id)) {
        json(res, 409, { ok: false, error: 'storage full', max: MAX_ITEMS });
        return;
      }
      upsert(photo);
      save();
      broadcast({ type: 'photo', photo });
      json(res, 200, { ok: true, item: photo, total: items.length });
    }).catch((e) => {
      json(res, 413, { ok: false, error: e.message });
    });
    return;
  }

  if (pathname === '/api/photos/clear' && req.method === 'POST') {
    items = [];
    save();
    broadcast({ type: 'clear' });
    json(res, 200, { ok: true });
    return;
  }

  if (pathname.startsWith('/api/photos/') && req.method === 'DELETE') {
    const id = decodeURIComponent(pathname.slice('/api/photos/'.length));
    const before = items.length;
    items = items.filter((x) => x.id !== id);
    if (items.length === before) {
      json(res, 404, { ok: false, error: 'not found' });
      return;
    }
    save();
    broadcast({ type: 'delete', id });
    json(res, 200, { ok: true });
    return;
  }

  if (pathname.startsWith('/api/')) {
    json(res, 404, { ok: false, error: 'no such api' });
    return;
  }

  // ---- 静态 ----
  serveStatic(req, res, pathname);
});

load();
server.listen(PORT, HOST, () => {
  const nets = require('os').networkInterfaces();
  const addrs = [];
  Object.keys(nets).forEach((k) => {
    (nets[k] || []).forEach((n) => {
      if (n.family === 'IPv4' && !n.internal) addrs.push(n.address);
    });
  });
  log('info', 'server started', { port: PORT, addrs });
  console.log('');
  console.log('  电脑端: http://localhost:' + PORT + '/test.html');
  addrs.forEach((a) => console.log('  手机端: http://' + a + ':' + PORT + '/test.html'));
  console.log('');
});

process.on('SIGINT', () => {
  log('info', 'shutting down');
  server.close(() => process.exit(0));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('  端口 ' + PORT + ' 已被占用：同步服务可能已经在运行了。');
    console.error('  请直接使用已经打开的那个窗口，或关闭旧窗口后重新启动。');
    console.error('');
    process.exit(1);
  }
  console.error('  服务启动失败：' + err.message);
  process.exit(1);
});
