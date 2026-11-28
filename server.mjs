// 集成层——路由 / 存储 / 静态服务 / 上传
// 规矩：零依赖，只 import Node 内置模块 + 本地 lib。
//
// 阶段 0 / 1 改造：
//   · 存储改走 lib/store.mjs 的原子落盘（tmp → fsync → rename），不再半写毁库
//   · 启动时收口上次残留的 queued/running 任务，前端不再无限轮询
//   · 端口统一 process.env.PORT || 8790
//   · 上传改流式落临时文件 + 魔数校验，通过后才 rename 入库；保留原始文件名
//   · /files 与静态资源支持 ETag / 304 / Range（视频可拖进度条）
//   · POST /api/jobs、/api/uploads 等写接口加 IP 限流；真实模式加出图额度护栏
//   · 新增 GET /api/jobs 列表接口
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import * as jobs from './lib/jobs.mjs';
import * as ledger from './lib/ledger.mjs';
import * as providers from './lib/providers.mjs';
import * as visual from './lib/visual.mjs';
import * as store from './lib/store.mjs';
import * as rl from './lib/ratelimit.mjs';
import { mode as aiMode, providerStatus } from './lib/ai.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 数据目录可被环境变量覆盖：自测用独立临时目录，不碰开发机上的真实 data/
const DATA_DIR = process.env.DUKOU_DATA_DIR ? path.resolve(process.env.DUKOU_DATA_DIR) : path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const WEB_DIR = path.join(__dirname, 'web');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// 端口统一事实来源：环境变量优先，默认 8790（8787 常被本机网关占用）
export const PORT = Number(process.env.PORT || 8790);
const MAX_UPLOAD = 15 * 1024 * 1024;
const MAX_MEDIA = 80 * 1024 * 1024;
const VERSION = '1.2.0';
const JOB_TYPES = ['image', 'video', 'copy', 'clip', 'visual', 'analyze', 'geo', 'inquiry', 'detail'];

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
fs.mkdirSync(TMP_DIR, { recursive: true });

/* ---------------- 存储（原子落盘） ---------------- */

const loaded = store.load(DB_FILE);
let db = loaded.db;
const persister = store.createPersister(DB_FILE, () => db);
export const persist = persister.persist;
store.installExitFlush(persister);

// 启动恢复：上次进程留下的未完成任务一律收口，否则前端会对着它永久轮询
const staleCount = jobs.recoverStale(db);
if (staleCount) {
  console.warn(`[jobs] 已收口 ${staleCount} 个上次未完成的任务（标记为 failed）`);
  persist();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(3).toString('hex')}`;
}

function nowISO() {
  return new Date().toISOString();
}

/* ---------------- HTTP 工具 ---------------- */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'retry-after,content-range,etag',
};

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...CORS,
    ...headers,
  });
  res.end(payload);
}

function fail(res, status, code, message, headers = {}) {
  send(res, status, { error: { code, message } }, headers);
}

/** 限流拒绝：统一 429 + RATE_LIMITED + Retry-After */
function tooMany(res, info) {
  return fail(
    res,
    429,
    'RATE_LIMITED',
    `请求过于频繁（每分钟上限 ${info.limit} 次），请 ${info.retryAfter} 秒后再试`,
    { 'retry-after': String(info.retryAfter) },
  );
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
        err.limit = limit;
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

const mb = (n) => `${Math.round(n / (1024 * 1024))}MB`;

/* ---------------- 图片识别：魔数 + 真实宽高 ---------------- */

/**
 * 只认真实字节，不信客户端声明的 content-type。
 * 返回 { ok, width, height, ext, mime }；ok=false 表示不是支持的图片格式。
 */
function sniffImage(buf) {
  // PNG
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), ext: 'png', mime: 'image/png' };
  }
  // JPEG
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        off += 2;
        continue;
      }
      const len = buf.readUInt16BE(off + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { ok: true, width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5), ext: 'jpg', mime: 'image/jpeg' };
      }
      off += 2 + len;
    }
    return { ok: true, width: 0, height: 0, ext: 'jpg', mime: 'image/jpeg' };
  }
  // WebP：之前一律返回 0×0，现在按 VP8/VP8L/VP8X 三种子格式真实解析
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    try {
      if (chunk === 'VP8 ') {
        return { ok: true, width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff, ext: 'webp', mime: 'image/webp' };
      }
      if (chunk === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { ok: true, width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, ext: 'webp', mime: 'image/webp' };
      }
      if (chunk === 'VP8X') {
        const w = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { ok: true, width: w, height: h, ext: 'webp', mime: 'image/webp' };
      }
    } catch {
      /* 落到下面的兜底 */
    }
    return { ok: true, width: 0, height: 0, ext: 'webp', mime: 'image/webp' };
  }
  // GIF（只识别，不鼓励上传）
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return { ok: true, width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), ext: 'gif', mime: 'image/gif' };
  }
  return { ok: false, width: 0, height: 0, ext: 'bin', mime: 'application/octet-stream' };
}

/** 视频/音频只做容器级粗校验，够挡住"把 .exe 改名成 .mp4" */
function sniffMedia(buf, declared) {
  const head = buf.subarray(0, 16);
  const isMp4 = head.length > 12 && head.toString('ascii', 4, 8) === 'ftyp';
  const isWebm = head.length > 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  const isMp3 = (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
  const isWav = head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WAVE';
  const ok = isMp4 || isWebm || isMp3 || isWav;
  const ext = isMp4 ? (declared.startsWith('audio/') ? 'm4a' : 'mp4') : isWebm ? 'webm' : isMp3 ? 'mp3' : isWav ? 'wav' : MEDIA_EXT[declared] || 'bin';
  return { ok, ext };
}

/**
 * 流式接收上传：先写 data/tmp/，校验通过再 rename 进 uploads/。
 * 好处：80MB 视频不再一次性塞内存；校验不过的脏文件不会污染 uploads。
 */
function receiveUpload(req, limit) {
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(TMP_DIR, `up_${crypto.randomBytes(6).toString('hex')}`);
    const out = fs.createWriteStream(tmpFile);
    const headChunks = [];
    let headLen = 0;
    let size = 0;
    let settled = false;

    const cleanup = () => {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* 已经不在了就算了 */
      }
    };

    const bail = (code, message) => {
      if (settled) return;
      settled = true;
      const err = new Error(message);
      err.code = code;
      err.limit = limit;
      out.destroy();
      req.destroy();
      cleanup();
      reject(err);
    };

    req.on('data', (c) => {
      size += c.length;
      if (size > limit) return bail('PAYLOAD_TOO_LARGE', 'payload too large');
      if (headLen < 64) {
        headChunks.push(c.subarray(0, 64 - headLen));
        headLen += Math.min(c.length, 64 - headLen);
      }
      if (!out.write(c)) req.pause();
    });
    out.on('drain', () => req.resume());
    req.on('error', (e) => bail('BAD_REQUEST', e.message));
    out.on('error', (e) => bail('INTERNAL', e.message));
    req.on('end', () => {
      if (settled) return;
      out.end(() => {
        settled = true;
        resolve({ tmpFile, size, head: Buffer.concat(headChunks), cleanup });
      });
    });
  });
}

/* ---------------- 路由 ---------------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const m = req.method;
  const ip = rl.clientIP(req);

  if (m === 'OPTIONS') {
    res.writeHead(204, {
      ...CORS,
      'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,x-filename,x-asset-kind,authorization,range,if-none-match',
    });
    return res.end();
  }

  try {
    /* ---- 1. health ---- */
    if (m === 'GET' && p === '/api/health') {
      return send(res, 200, { ok: true, version: VERSION, aiMode: aiMode() });
    }

    /* ---- 1b. 模型供应商状态 + 用量 ---- */
    if (m === 'GET' && p === '/api/meta') {
      return send(res, 200, {
        version: VERSION,
        counts: { products: db.products.length, assets: db.assets.length, jobs: db.jobs.length },
        providers: providerStatus(),
        mockCaps: String(process.env.MOCK_CAPS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        markets: visual.MARKETS.map((x) => ({ id: x.id, label: x.label, lang: x.lang })),
        usage: rl.usageSnapshot(),
        inFlight: jobs.inFlight(),
      });
    }

    if (m === 'POST' && p === '/api/meta/check') {
      const gate = rl.hit(ip, 'check', rl.LIMITS.writesPerMin);
      if (!gate.ok) return tooMany(res, gate);
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
      const gate = rl.hit(ip, 'write', rl.LIMITS.writesPerMin);
      if (!gate.ok) return tooMany(res, gate);
      const body = await readJSON(req);
      if (!body.title || typeof body.title !== 'string') {
        return fail(res, 400, 'BAD_REQUEST', 'title is required');
      }
      const product = {
        id: id('p'),
        title: body.title,
        category: body.category || 'general',
        platform: body.platform || 'shopee',
        market: body.market || visual.defaultMarket(body.platform || 'shopee'),
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
        const gate = rl.hit(ip, 'write', rl.LIMITS.writesPerMin);
        if (!gate.ok) return tooMany(res, gate);
        const body = await readJSON(req);
        const allowed = ['title', 'category', 'platform', 'market', 'targetLangs', 'sellingPoints', 'rawText', 'status', 'brief', 'visualSpec', 'analysis', 'detailOrder'];
        for (const key of allowed) {
          if (key in body) product[key] = body[key];
        }
        product.updatedAt = nowISO();
        persist();
        return send(res, 200, product);
      }

      return fail(res, 405, 'METHOD_NOT_ALLOWED', 'use GET or PATCH', { allow: 'GET, PATCH' });
    }

    /* ---- 6. POST /api/uploads（流式 + 魔数校验） ---- */
    if (m === 'POST' && p === '/api/uploads') {
      const gate = rl.hit(ip, 'upload', rl.LIMITS.uploadsPerMin);
      if (!gate.ok) return tooMany(res, gate);

      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
      const isImage = /^image\//.test(contentType);
      const isMedia = /^(video|audio)\//.test(contentType);
      if (!isImage && !isMedia) {
        return fail(res, 400, 'BAD_REQUEST', 'content-type must be image/*, video/* or audio/*');
      }

      const limit = isMedia ? MAX_MEDIA : MAX_UPLOAD;
      const received = await receiveUpload(req, limit);
      if (!received.size) {
        received.cleanup();
        return fail(res, 400, 'BAD_REQUEST', 'empty body');
      }

      // 只信真实字节：声明 image/png 但内容是别的东西，一律拒绝
      let width = 0;
      let height = 0;
      let ext;
      if (isImage) {
        const sniffed = sniffImage(received.head.length >= 32 ? received.head : fs.readFileSync(received.tmpFile).subarray(0, 64));
        if (!sniffed.ok) {
          received.cleanup();
          return fail(res, 400, 'BAD_REQUEST', '文件内容不是有效的 png/jpeg/webp/gif 图片');
        }
        // 宽高要读更长的头部，JPEG 的 SOF 可能在 64 字节之后
        const full = fs.readFileSync(received.tmpFile);
        const real = sniffImage(full);
        width = real.width;
        height = real.height;
        ext = real.ext;
      } else {
        const sniffed = sniffMedia(received.head, contentType);
        if (!sniffed.ok) {
          received.cleanup();
          return fail(res, 400, 'BAD_REQUEST', '文件内容不是有效的 mp4/webm/mp3/wav 媒体');
        }
        ext = sniffed.ext;
      }

      const assetId = id('a');
      const filename = `${assetId}.${ext}`;
      fs.renameSync(received.tmpFile, path.join(UPLOAD_DIR, filename)); // 校验通过才入库

      const productId = url.searchParams.get('productId') || null;
      const reqKind = url.searchParams.get('kind') || req.headers['x-asset-kind'] || 'upload';
      const kind = ['upload', 'angle_real'].includes(reqKind) ? reqKind : 'upload';
      const angle = url.searchParams.get('angle') || null;
      // 原始文件名：前端一直在发 x-filename，之前服务端从没读过，白白丢了
      let originalName = null;
      try {
        originalName = req.headers['x-filename'] ? decodeURIComponent(String(req.headers['x-filename'])).slice(0, 180) : null;
      } catch {
        originalName = String(req.headers['x-filename'] || '').slice(0, 180) || null;
      }

      const asset = {
        id: assetId,
        productId,
        kind,
        url: `/files/${filename}`,
        width,
        height,
        meta: {
          bytes: received.size,
          contentType,
          ...(originalName ? { originalName } : {}),
          ...(angle ? { angle } : {}),
        },
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
      return send(res, 201, { assetId: asset.id, url: asset.url, kind: asset.kind, width, height });
    }

    /* ---- 6b. DELETE /api/assets/:id（软删，可撤销） ---- */
    const assetMatch = p.match(/^\/api\/assets\/([A-Za-z0-9_]+)$/);
    if (assetMatch) {
      if (m !== 'DELETE') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'use DELETE', { allow: 'DELETE' });
      const gate = rl.hit(ip, 'write', rl.LIMITS.writesPerMin);
      if (!gate.ok) return tooMany(res, gate);
      const assetId = assetMatch[1];
      const asset = db.assets.find((a) => a.id === assetId);
      if (!asset) return fail(res, 404, 'NOT_FOUND', 'asset not found');
      asset.deletedAt = nowISO();
      for (const product of db.products) {
        if (!Array.isArray(product.assets)) continue;
        const before = product.assets.length;
        product.assets = product.assets.filter((x) => x !== assetId);
        if (product.assets.length !== before) product.updatedAt = nowISO();
      }
      persist();
      return send(res, 200, { deleted: assetId, undo: true });
    }

    /* ---- 6c. POST /api/assets/:id/restore（撤销删除） ---- */
    const restoreMatch = p.match(/^\/api\/assets\/([A-Za-z0-9_]+)\/restore$/);
    if (restoreMatch) {
      if (m !== 'POST') return fail(res, 405, 'METHOD_NOT_ALLOWED', 'use POST', { allow: 'POST' });
      const gate = rl.hit(ip, 'write', rl.LIMITS.writesPerMin);
      if (!gate.ok) return tooMany(res, gate);
      const asset = db.assets.find((a) => a.id === restoreMatch[1]);
      if (!asset) return fail(res, 404, 'NOT_FOUND', 'asset not found');
      delete asset.deletedAt;
      const product = db.products.find((x) => x.id === asset.productId);
      if (product) {
        product.assets = product.assets || [];
        if (!product.assets.includes(asset.id)) product.assets.push(asset.id);
        product.updatedAt = nowISO();
      }
      persist();
      return send(res, 200, { restored: asset.id });
    }

    /* ---- 7. POST /api/jobs ---- */
    if (m === 'POST' && p === '/api/jobs') {
      const gate = rl.hit(ip, 'jobs', rl.LIMITS.jobsPerMin);
      if (!gate.ok) return tooMany(res, gate);

      const body = await readJSON(req);
      const type = body.type;
      if (!JOB_TYPES.includes(type)) {
        return fail(res, 400, 'BAD_REQUEST', `type must be ${JOB_TYPES.join('|')}`);
      }
      if (!body.productId || !db.products.find((x) => x.id === body.productId)) {
        return fail(res, 400, 'BAD_REQUEST', 'productId is required and must exist');
      }

      // 额度护栏：真实模式才计费，mock 一律放行
      const mock = aiMode() === 'mock';
      const quota = rl.checkQuota({ type, params: body.params || {}, mock });
      if (!quota.ok) {
        return fail(res, 429, 'RATE_LIMITED', quota.message, { 'retry-after': '3600' });
      }

      const job = jobs.create(db, { type, productId: body.productId, params: body.params || {} });
      rl.recordUsage({ type, estimate: quota.estimate, count: quota.count, mock });
      persist();
      return send(res, 202, { jobId: job.id, status: job.status });
    }

    /* ---- 7b. GET /api/jobs（列表，阶段 1 新增） ---- */
    if (m === 'GET' && p === '/api/jobs') {
      const productId = url.searchParams.get('productId') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
      return send(res, 200, { items: jobs.list(db, { productId, status, limit }) });
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
      const { params, ...rest } = job;
      return send(res, 200, rest);
    }

    /* ---- 9/10. /api/ledger ---- */
    if (p === '/api/ledger') {
      if (m === 'POST') {
        const gate = rl.hit(ip, 'write', rl.LIMITS.writesPerMin);
        if (!gate.ok) return tooMany(res, gate);
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
      return fail(res, 405, 'METHOD_NOT_ALLOWED', 'use GET or POST', { allow: 'GET, POST' });
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
        // 文件名自带 assetId，内容不可变 → 可长缓存
        return serveFile(req, res, file, 'public, max-age=31536000, immutable');
      }

      const rel = p === '/' ? 'index.html' : decodeURIComponent(p.slice(1));
      const file = path.join(WEB_DIR, rel);
      if (!file.startsWith(WEB_DIR)) return fail(res, 403, 'BAD_REQUEST', 'forbidden');
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return fail(res, 404, 'NOT_FOUND', 'not found');
      }
      // 前端源码会改，用协商缓存：有 ETag 就 304，没变不重传
      return serveFile(req, res, file, 'no-cache');
    }

    return fail(res, 404, 'NOT_FOUND', 'not found');
  } catch (err) {
    if (err.code === 'PAYLOAD_TOO_LARGE') {
      // 消息按实际上限动态生成，不再写死 15MB（视频其实允许 80MB）
      const limitText = mb(err.limit || MAX_UPLOAD);
      return res.destroyed ? undefined : fail(res, 413, 'PAYLOAD_TOO_LARGE', `file larger than ${limitText}`);
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
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.srt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

/**
 * 静态文件服务：ETag / 304 / Range 三件套。
 * Range 是视频能拖进度条的前提，之前完全没有。
 */
function serveFile(req, res, file, cacheControl) {
  const stat = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;

  const baseHeaders = {
    'content-type': type,
    'cache-control': cacheControl,
    etag,
    'last-modified': stat.mtime.toUTCString(),
    'accept-ranges': 'bytes',
    ...CORS,
  };

  // 协商缓存命中：不重传正文
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, baseHeaders);
    return res.end();
  }

  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (match) {
      let start = match[1] ? Number(match[1]) : 0;
      let end = match[2] ? Number(match[2]) : stat.size - 1;
      if (!match[1] && match[2]) {
        // bytes=-500 表示最后 500 字节
        start = Math.max(0, stat.size - Number(match[2]));
        end = stat.size - 1;
      }
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        res.writeHead(416, { ...baseHeaders, 'content-range': `bytes */${stat.size}` });
        return res.end();
      }
      end = Math.min(end, stat.size - 1);
      res.writeHead(206, {
        ...baseHeaders,
        'content-range': `bytes ${start}-${end}/${stat.size}`,
        'content-length': String(end - start + 1),
      });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
  }

  res.writeHead(200, { ...baseHeaders, 'content-length': String(stat.size) });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file).pipe(res);
}

jobs.startLoop(db, {
  uploadsDir: UPLOAD_DIR,
  persist,
  fastHeartbeat: aiMode() === 'mock', // mock 毫秒级完成，进度条跑快点
});

// 作为模块被测试引入时不自动监听；直接 node server.mjs 才起服务
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  server.listen(PORT, () => {
    console.log(`[dukou] http://localhost:${PORT}  ·  ai=${aiMode()}  ·  db=${DB_FILE}`);
    if (loaded.recovered) console.warn(`[dukou] 注意：上次的 db.json 已损坏并转存为 ${path.basename(loaded.recovered)}`);
  });
}

export { server, db };
