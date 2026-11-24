// 集成层（主人负责）——路由 / 存储 / 静态服务 / 上传
// 规矩：零依赖，只 import Node 内置模块 + 本地 lib。
// 契约见 CONTRACT.md，任何字段改动先改契约再改代码。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import * as jobs from './lib/jobs.mjs';
import * as ledger from './lib/ledger.mjs';
import * as providers from './lib/providers.mjs';
import { mode as aiMode, providerStatus } from './lib/ai.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const WEB_DIR = path.join(__dirname, 'web');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const PORT = Number(process.env.PORT || 8787);
const MAX_UPLOAD = 15 * 1024 * 1024;
const MAX_MEDIA = 80 * 1024 * 1024;
const VERSION = '1.0.0';

// 视频/音频上传的扩展名映射（前端 upload 用 File.type 作为 content-type）
const MEDIA_EXT = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ---------------- 存储 ---------------- */

const DEFAULT_DB = { products: [], assets: [], jobs: [], ledger: [] };
let db = load();

function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { ...DEFAULT_DB, ...parsed };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

let saveTimer = null;
export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), (err) => {
      if (err) console.error('[db] save failed:', err.message);
    });
  }, 150);
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(3).toString('hex')}`;
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------------- HTTP 工具 ---------------- */

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function fail(res, status, code, message) {
  send(res, status, { error: { code, message } });
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        const err = new Error('payload too large');
        err.code = 'PAYLOAD_TOO_LARGE';
        req.destroy();
        return reject(err);
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJSON(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    const err = new Error('invalid JSON body');
    err.code = 'BAD_REQUEST';
    throw err;
  }
}

/* ---------------- 图片尺寸（PNG / JPEG） ---------------- */

function imageSize(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), ext: 'png' };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5), ext: 'jpg' };
      }
      off += 2 + len;
    }
    return { width: 0, height: 0, ext: 'jpg' };
  }
  if (buf.length > 16 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return { width: 0, height: 0, ext: 'webp' };
  }
  return { width: 0, height: 0, ext: 'bin' };
}

/* ---------------- 路由 ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const m = req.method;

  if (m === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,x-filename,authorization',
    });
    return res.end();
  }

  try {
    /* ---- 1. health ---- */
    if (m === 'GET' && p === '/api/health') {
      return send(res, 200, { ok: true, version: VERSION, aiMode: aiMode() });
    }

    /* ---- 1b. 模型供应商状态 ---- */
    if (m === 'GET' && p === '/api/meta') {
      return send(res, 200, {
        version: VERSION,
        counts: { products: db.products.length, assets: db.assets.length, jobs: db.jobs.length },
        providers: providerStatus(),
      });
    }

    if (m === 'POST' && p === '/api/meta/check') {
      const body = await readJSON(req).catch(() => ({}));
      const cap = String(body.cap || 'TEXT').toUpperCase();
      try {
        const result = await providers.check(cap);
        return send(res, 200, { ok: true, cap, ...result });
      } catch (err) {
        return send(res, 200, { ok: false, cap, error: err.message });
      }
    }

    /* ---- 2. POST /api/products ---- */
    if (m === 'POST' && p === '/api/products') {
      const body = await readJSON(req);
      if (!body.title || typeof body.title !== 'string') {
        return fail(res, 400, 'BAD_REQUEST', 'title is required');
      }
      const product = {
        id: id('p'),
        title: body.title,
        category: body.category || 'general',
        platform: body.platform || 'shopee',
        targetLangs: Array.isArray(body.targetLangs) ? body.targetLangs : ['en'],
        sellingPoints: Array.isArray(body.sellingPoints) ? body.sellingPoints : [],
        rawText: body.rawText || '',
        status: 'draft',
        assets: [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      db.products.push(product);
      persist();
      return send(res, 201, product);
    }

    /* ---- 3. GET /api/products ---- */
    if (m === 'GET' && p === '/api/products') {
      const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100);
      const cursor = url.searchParams.get('cursor');
      let list = db.products.slice().reverse();
      if (cursor) {
        const idx = list.findIndex((x) => x.id === cursor);
        list = idx >= 0 ? list.slice(idx + 1) : list;
      }
      const items = list.slice(0, limit);
      const nextCursor = list.length > limit ? items[items.length - 1].id : null;
      return send(res, 200, { items, nextCursor });
    }

    /* ---- 4/5. /api/products/:id ---- */
    const productMatch = p.match(/^\/api\/products\/([A-Za-z0-9_]+)$/);
    if (productMatch) {
      const product = db.products.find((x) => x.id === productMatch[1]);
      if (!product) return fail(res, 404, 'NOT_FOUND', 'product not found');

      if (m === 'GET') {
        const assets = (product.assets || [])
          .map((aid) => db.assets.find((a) => a.id === aid))
          .filter(Boolean);
        return send(res, 200, { ...product, assets });
      }

      if (m === 'PATCH') {
        const body = await readJSON(req);
        const allowed = ['title', 'category', 'platform', 'targetLangs', 'sellingPoints', 'rawText', 'status', 'brief'];
        for (const key of allowed) {
          if (key in body) product[key] = body[key];
        }
        product.updatedAt = nowISO();
        persist();
        return send(res, 200, product);
      }

      return fail(res, 405, 'BAD_REQUEST', 'method not allowed');
    }

    /* ---- 6. POST /api/uploads ---- */
    if (m === 'POST' && p === '/api/uploads') {
      const contentType = String(req.headers['content-type'] || '');
      const isImage = /^image\//.test(contentType);
      const isMedia = /^(video|audio)\//.test(contentType);
      if (!isImage && !isMedia) {
        return fail(res, 400, 'BAD_REQUEST', 'content-type must be image/*, video/* or audio/*');
      }
      const buf = await readBody(req, isMedia ? MAX_MEDIA : MAX_UPLOAD);
      if (!buf.length) return fail(res, 400, 'BAD_REQUEST', 'empty body');
      const { width, height, ext } = isImage
        ? imageSize(buf)
        : { width: 0, height: 0, ext: MEDIA_EXT[contentType.split(';')[0].trim()] || 'bin' };
      const assetId = id('a');
      const filename = `${assetId}.${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);

      const productId = url.searchParams.get('productId') || null;
      const asset = {
        id: assetId,
        productId,
        kind: 'upload',
        url: `/files/${filename}`,
        width,
        height,
        meta: { bytes: buf.length, contentType },
        createdAt: nowISO(),
      };
      db.assets.push(asset);
      if (productId) {
        const product = db.products.find((x) => x.id === productId);
        if (product) {
          product.assets = product.assets || [];
          product.assets.push(asset.id);
          product.updatedAt = nowISO();
        }
      }
      persist();
      return send(res, 201, { assetId: asset.id, url: asset.url, width, height });
    }

    /* ---- 7. POST /api/jobs ---- */
    if (m === 'POST' && p === '/api/jobs') {
      const body = await readJSON(req);
      const type = body.type;
      if (!['image', 'video', 'copy', 'clip', 'visual'].includes(type)) {
        return fail(res, 400, 'BAD_REQUEST', 'type must be image|video|copy|clip|visual');
      }
      if (!body.productId || !db.products.find((x) => x.id === body.productId)) {
        return fail(res, 400, 'BAD_REQUEST', 'productId is required and must exist');
      }
      const job = jobs.create(db, { type, productId: body.productId, params: body.params || {} });
      persist();
      return send(res, 202, { jobId: job.id, status: job.status });
    }

    /* ---- 8. GET /api/jobs/:id ---- */
    const jobMatch = p.match(/^\/api\/jobs\/([A-Za-z0-9_]+)$/);
    if (m === 'GET' && jobMatch) {
      const job = jobs.get(db, jobMatch[1]);
      if (!job) return fail(res, 404, 'NOT_FOUND', 'job not found');
      const { params, ...rest } = job;
      return send(res, 200, rest);
    }
    if (m === 'DELETE' && jobMatch) {
      const job = jobs.cancel(db, jobMatch[1]);
      if (!job) return fail(res, 404, 'NOT_FOUND', 'job not found');
      persist();
      return send(res, 200, job);
    }

    /* ---- 9/10. /api/ledger ---- */
    if (p === '/api/ledger') {
      if (m === 'POST') {
        const body = await readJSON(req);
        const entry = ledger.add(db, body);
        persist();
        return send(res, 201, entry);
      }
      if (m === 'GET') {
        const productId = url.searchParams.get('productId') || undefined;
        const limit = Math.min(Number(url.searchParams.get('limit') || 50), 500);
        return send(res, 200, {
          items: ledger.list(db, { productId, limit }),
          summary: ledger.summary(db, { productId }),
        });
      }
    }

    /* ---- 静态资源 ---- */
    if (m === 'GET' || m === 'HEAD') {
      if (p.startsWith('/api/')) return fail(res, 404, 'NOT_FOUND', 'no such api');

      if (p.startsWith('/files/')) {
        const name = path.basename(decodeURIComponent(p.slice(7)));
        const file = path.join(UPLOAD_DIR, name);
        if (!file.startsWith(UPLOAD_DIR) || !fs.existsSync(file)) {
          return fail(res, 404, 'NOT_FOUND', 'file not found');
        }
        return serveFile(res, file);
      }

      const rel = p === '/' ? 'index.html' : decodeURIComponent(p.slice(1));
      const file = path.join(WEB_DIR, rel);
      if (!file.startsWith(WEB_DIR)) return fail(res, 403, 'BAD_REQUEST', 'forbidden');
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return fail(res, 404, 'NOT_FOUND', 'not found');
      }
      return serveFile(res, file);
    }

    return fail(res, 404, 'NOT_FOUND', 'not found');
  } catch (err) {
    if (err.code === 'PAYLOAD_TOO_LARGE') {
      return res.destroyed ? undefined : fail(res, 413, 'PAYLOAD_TOO_LARGE', 'file larger than 15MB');
    }
    if (err.code === 'BAD_REQUEST') {
      return fail(res, 400, 'BAD_REQUEST', err.message);
    }
    console.error('[server] unexpected:', err);
    if (!res.headersSent) return fail(res, 500, 'INTERNAL', err.message || 'internal error');
  }
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon',
};

function serveFile(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'access-control-allow-origin': '*',
  });
  fs.createReadStream(file).pipe(res);
}

jobs.startLoop(db, { uploadsDir: UPLOAD_DIR, persist });

server.listen(PORT, () => {
  console.log(`[dukou] http://localhost:${PORT}  ·  ai=${aiMode()}  ·  db=${DB_FILE}`);
});
