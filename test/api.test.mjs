// API 级冒烟测试——零依赖，只用 node:test + node:assert
// 跑法：node --test test/
//
// 这些用例全部在 AI_MOCK=1 下跑，不消耗任何真实模型额度。
// 每次跑都用独立的临时 DATA_DIR，不碰开发机上的 data/db.json。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8911 + Math.floor(Math.random() * 60);
const BASE = `http://127.0.0.1:${PORT}`;

let child;
let sandbox;

function api(p, init = {}) {
  return fetch(`${BASE}${p}`, init);
}

async function json(p, init) {
  const res = await api(p, init);
  return { status: res.status, body: await res.json().catch(() => ({})), res };
}

function postJSON(p, body) {
  return json(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** 轮询一个任务直到终态 */
async function waitJob(jobId, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { body } = await json(`/api/jobs/${jobId}`);
    if (['done', 'failed', 'canceled'].includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error(`job ${jobId} 超时未完成`);
}

/** 造一张最小的合法 PNG（1x1），用于上传用例 */
function tinyPNG() {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
}

before(async () => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dukou-test-'));
  child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      AI_MOCK: '1',
      DUKOU_DATA_DIR: sandbox,
      RL_LOCALHOST: 'strict', // 本机也走限流，否则限流用例测不到
      RL_JOBS_PER_MIN: '5',
      RL_UPLOADS_PER_MIN: '5',
      RL_WRITES_PER_MIN: '100',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('服务未能在预期时间内启动');
});

after(() => {
  child?.kill();
  try {
    fs.rmSync(sandbox, { recursive: true, force: true });
  } catch {
    /* 临时目录清不掉不影响结论 */
  }
});

/* ---------------- 基础 ---------------- */

test('GET /api/health 返回 ok 与 mock 模式', async () => {
  const { status, body } = await json('/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.aiMode, 'mock');
});

test('GET /api/meta 暴露用量与限流配置', async () => {
  const { status, body } = await json('/api/meta');
  assert.equal(status, 200);
  assert.ok(body.usage, 'meta 应含 usage');
  assert.ok(body.usage.limits.imagesPerDay > 0);
  assert.equal(typeof body.inFlight, 'number');
});

/* ---------------- 商品 ---------------- */

let productId;

test('POST /api/products 建商品，缺 title 返回 BAD_REQUEST', async () => {
  const bad = await postJSON('/api/products', { category: 'furniture' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'BAD_REQUEST');

  const ok = await postJSON('/api/products', { title: '测试餐桌', platform: 'shopee', sellingPoints: ['实木'] });
  assert.equal(ok.status, 201);
  assert.match(ok.body.id, /^p_/);
  assert.equal(ok.body.status, 'draft');
  productId = ok.body.id;
});

test('GET /api/products/:id 展开 assets；不存在返回 404', async () => {
  const hit = await json(`/api/products/${productId}`);
  assert.equal(hit.status, 200);
  assert.ok(Array.isArray(hit.body.assets));

  const miss = await json('/api/products/p_nope');
  assert.equal(miss.status, 404);
  assert.equal(miss.body.error.code, 'NOT_FOUND');
});

test('PATCH /api/products/:id 只改白名单字段', async () => {
  const { status, body } = await json(`/api/products/${productId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'taobao', detailOrder: ['a_1'], id: 'p_hacked', createdAt: 'x' }),
  });
  assert.equal(status, 200);
  assert.equal(body.platform, 'taobao');
  assert.deepEqual(body.detailOrder, ['a_1']);
  assert.equal(body.id, productId, 'id 不可被请求体覆盖');
});

test('products 不支持的 method 返回 405 METHOD_NOT_ALLOWED', async () => {
  const { status, body } = await json(`/api/products/${productId}`, { method: 'DELETE' });
  assert.equal(status, 405);
  assert.equal(body.error.code, 'METHOD_NOT_ALLOWED');
});

/* ---------------- 上传硬化 ---------------- */

let uploadedUrl;

test('POST /api/uploads 接受真实 PNG，解析宽高并记录原始文件名', async () => {
  const res = await api(`/api/uploads?productId=${productId}`, {
    method: 'POST',
    headers: { 'content-type': 'image/png', 'x-filename': encodeURIComponent('我的照片.png') },
    body: tinyPNG(),
  });
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(body.width, 1);
  assert.equal(body.height, 1);
  assert.equal(body.kind, 'upload');
  uploadedUrl = body.url;

  const detail = await json(`/api/products/${productId}`);
  const asset = detail.body.assets.find((a) => a.id === body.assetId);
  assert.equal(asset.meta.originalName, '我的照片.png', '原始文件名应被保留');
});

test('POST /api/uploads 拒绝「声明是图片、内容不是图片」的文件', async () => {
  const { status, body } = await json(`/api/uploads?productId=${productId}`, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: Buffer.from('MZ\x90\x00 this is not a png at all'),
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'BAD_REQUEST');
});

test('POST /api/uploads 拒绝非图片/媒体的 content-type', async () => {
  const { status, body } = await json('/api/uploads', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, 'BAD_REQUEST');
});

/* ---------------- 文件服务：ETag / 304 / Range ---------------- */

test('GET /files/* 支持 ETag 协商缓存（304）', async () => {
  const first = await api(uploadedUrl);
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag, '应返回 ETag');
  await first.arrayBuffer();

  const second = await api(uploadedUrl, { headers: { 'if-none-match': etag } });
  assert.equal(second.status, 304, '相同 ETag 应返回 304 不重传');
});

test('GET /files/* 支持 Range 字节范围（206）', async () => {
  const res = await api(uploadedUrl, { headers: { range: 'bytes=0-9' } });
  assert.equal(res.status, 206);
  assert.match(res.headers.get('content-range'), /^bytes 0-9\//);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf.length, 10);
});

test('GET /files/* 非法 Range 返回 416', async () => {
  const res = await api(uploadedUrl, { headers: { range: 'bytes=999999-1000000' } });
  assert.equal(res.status, 416);
  await res.arrayBuffer();
});

test('路径穿越被拒绝', async () => {
  const a = await api('/files/..%2f..%2fdata%2fdb.json');
  assert.equal(a.status, 404);
  await a.arrayBuffer();
  const b = await api('/../.env');
  assert.ok([403, 404].includes(b.status));
  await b.arrayBuffer();
});

/* ---------------- 任务链路 ---------------- */

test('POST /api/jobs 校验 type 与 productId', async () => {
  const badType = await postJSON('/api/jobs', { type: 'nope', productId });
  assert.equal(badType.status, 400);
  assert.equal(badType.body.error.code, 'BAD_REQUEST');

  const noProduct = await postJSON('/api/jobs', { type: 'image' });
  assert.equal(noProduct.status, 400);
});

test('analyze → visual → image 全链路在 mock 下跑通，进度收敛到 100', async () => {
  const a = await postJSON('/api/jobs', { type: 'analyze', productId, params: { platform: 'shopee', lang: 'en' } });
  assert.equal(a.status, 202);
  const aDone = await waitJob(a.body.jobId);
  assert.equal(aDone.status, 'done', `analyze 失败: ${JSON.stringify(aDone.error)}`);
  assert.equal(aDone.progress, 100);
  assert.ok(aDone.result.analysis, 'analyze 应产出 analysis');

  const v = await postJSON('/api/jobs', { type: 'visual', productId, params: { platform: 'shopee', brief: {} } });
  const vDone = await waitJob(v.body.jobId);
  assert.equal(vDone.status, 'done', `visual 失败: ${JSON.stringify(vDone.error)}`);
  assert.ok(Array.isArray(vDone.result.assets));

  const i = await postJSON('/api/jobs', { type: 'image', productId, params: { template: 'main', lang: 'en', count: 2 } });
  const iDone = await waitJob(i.body.jobId);
  assert.equal(iDone.status, 'done', `image 失败: ${JSON.stringify(iDone.error)}`);
  assert.equal(iDone.result.assets.length, 2);
});

test('GET /api/jobs 列表可按 productId 过滤，且不外泄 params', async () => {
  const { status, body } = await json(`/api/jobs?productId=${productId}&limit=10`);
  assert.equal(status, 200);
  assert.ok(body.items.length >= 3);
  assert.ok(body.items.every((j) => j.params === undefined), '列表不应返回 params');
});

test('GET /api/jobs/:id 不存在返回 404', async () => {
  const { status, body } = await json('/api/jobs/j_nope');
  assert.equal(status, 404);
  assert.equal(body.error.code, 'NOT_FOUND');
});

/* ---------------- 账本：混币 ---------------- */

test('POST /api/ledger 拒绝非法金额与类型', async () => {
  const neg = await postJSON('/api/ledger', { productId, type: 'income', amount: -5 });
  assert.equal(neg.status, 400);
  const badType = await postJSON('/api/ledger', { productId, type: 'bribe', amount: 5 });
  assert.equal(badType.status, 400);
});

test('GET /api/ledger 按币种分组，且保留前端依赖的顶层字段', async () => {
  await postJSON('/api/ledger', { productId, type: 'income', amount: 100, currency: 'CNY' });
  await postJSON('/api/ledger', { productId, type: 'cost', amount: 30, currency: 'CNY' });
  await postJSON('/api/ledger', { productId, type: 'income', amount: 50, currency: 'USD' });

  const { status, body } = await json(`/api/ledger?productId=${productId}`);
  assert.equal(status, 200);

  // 新字段：分组正确，跨币种不混算
  const cny = body.summary.byCurrency.find((x) => x.currency === 'CNY');
  const usd = body.summary.byCurrency.find((x) => x.currency === 'USD');
  assert.equal(cny.income, 100);
  assert.equal(cny.cost, 30);
  assert.equal(cny.profit, 70);
  assert.equal(usd.income, 50);
  assert.equal(usd.profit, 50);
  assert.equal(body.summary.mixed, true);

  // 旧字段：形状不变，前端三张卡零改动
  assert.equal(typeof body.summary.income, 'number');
  assert.equal(typeof body.summary.cost, 'number');
  assert.equal(typeof body.summary.profit, 'number');
  assert.equal(body.summary.currency, 'CNY', '顶层应取条目最多的币种');
  assert.equal(body.summary.profit, 70, '顶层数字不应混入 USD');
});

/* ---------------- 限流 ---------------- */

test('POST /api/jobs 超过每分钟上限返回 429 RATE_LIMITED 并带 Retry-After', async () => {
  let limited = null;
  // 上限设为 5；前面用例已经用掉一些，这里连打直到触发
  for (let i = 0; i < 12; i++) {
    const r = await postJSON('/api/jobs', { type: 'copy', productId, params: { lang: 'en' } });
    if (r.status === 429) {
      limited = r;
      break;
    }
  }
  assert.ok(limited, '连续请求应触发限流');
  assert.equal(limited.body.error.code, 'RATE_LIMITED');
  assert.ok(Number(limited.res.headers.get('retry-after')) > 0, '应返回 Retry-After 秒数');
});

test('POST /api/uploads 同样受限流保护', async () => {
  let limited = null;
  for (let i = 0; i < 12; i++) {
    const res = await api(`/api/uploads?productId=${productId}`, {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: tinyPNG(),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) {
      limited = body;
      break;
    }
  }
  assert.ok(limited, '上传连打应触发限流');
  assert.equal(limited.error.code, 'RATE_LIMITED');
});
