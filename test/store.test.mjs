// 存储与任务恢复测试——阶段 0 的两个核心承诺
// 跑法：node --test test/
//
// 验的是两件之前会真丢数据 / 真卡死的事：
//   1. db.json 写坏时不静默清空，而是转存 db.corrupt-*.json；原子写不留半截文件
//   2. 进程重启后残留的 queued/running 任务被收口为 failed，前端不再无限轮询
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as store from '../lib/store.mjs';
import * as jobs from '../lib/jobs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sandboxDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `dukou-${tag}-`));
}

/* ---------------- 原子落盘 ---------------- */

test('load(): db.json 损坏时转存坏档，不静默清空', () => {
  const dir = sandboxDir('corrupt');
  const dbFile = path.join(dir, 'db.json');
  fs.writeFileSync(dbFile, '{"products":[{"id":"p_x","title":"半截就断了', 'utf8');

  const { db, recovered } = store.load(dbFile);

  assert.ok(recovered, '应返回转存路径');
  assert.ok(fs.existsSync(recovered), '坏档应被实际写到磁盘上，供人工抢救');
  assert.match(path.basename(recovered), /^db\.corrupt-/);
  assert.deepEqual(db.products, [], '本次以空库启动');
  assert.ok(Array.isArray(db.jobs) && Array.isArray(db.ledger));

  fs.rmSync(dir, { recursive: true, force: true });
});

test('load(): 顶层集合被写成非数组时自动兜底', () => {
  const dir = sandboxDir('shape');
  const dbFile = path.join(dir, 'db.json');
  fs.writeFileSync(dbFile, JSON.stringify({ products: 'oops', assets: null }), 'utf8');

  const { db, recovered } = store.load(dbFile);
  assert.equal(recovered, null, 'JSON 合法，不算坏档');
  assert.deepEqual(db.products, []);
  assert.deepEqual(db.assets, []);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('flush(): 原子写不留半截文件，且内容可完整解析', () => {
  const dir = sandboxDir('atomic');
  const dbFile = path.join(dir, 'db.json');
  const data = { products: [], assets: [], jobs: [], ledger: [] };

  const persister = store.createPersister(dbFile, () => data);

  // 连写 30 次大一点的内容，每次都应留下一个完整可解析的库
  for (let i = 0; i < 30; i++) {
    data.products.push({ id: `p_${i}`, title: `商品 ${i}`, blob: 'x'.repeat(2000) });
    persister.flush();
    const parsed = JSON.parse(fs.readFileSync(dbFile, 'utf8')); // 坏了这里就抛
    assert.equal(parsed.products.length, i + 1);
  }

  // 不留临时文件残骸
  assert.ok(!fs.existsSync(`${dbFile}.tmp`), '不应残留 .tmp 文件');
  persister.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('flush(): 写入期间的新改动不会丢（close 前最后一次状态落盘）', () => {
  const dir = sandboxDir('lastwrite');
  const dbFile = path.join(dir, 'db.json');
  const data = { products: [], assets: [], jobs: [], ledger: [] };
  const persister = store.createPersister(dbFile, () => data);

  data.ledger.push({ id: 'l_1', amount: 128.5, currency: 'CNY' });
  persister.persist(); // 防抖的异步写，还没落
  persister.close(); // 退出路径：必须同步把最后状态刷下去

  const parsed = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  assert.equal(parsed.ledger.length, 1);
  assert.equal(parsed.ledger[0].amount, 128.5);

  fs.rmSync(dir, { recursive: true, force: true });
});

/* ---------------- 任务恢复 ---------------- */

test('recoverStale(): 残留的 queued/running 被标 failed，已完成的不动', () => {
  const db = {
    products: [],
    assets: [],
    ledger: [],
    jobs: [
      { id: 'j_run', status: 'running', progress: 90 },
      { id: 'j_que', status: 'queued', progress: 0 },
      { id: 'j_done', status: 'done', progress: 100, result: { ok: 1 } },
      { id: 'j_fail', status: 'failed', error: { code: 'INTERNAL', message: '旧的失败' } },
      { id: 'j_cancel', status: 'canceled' },
    ],
  };

  const n = jobs.recoverStale(db);
  assert.equal(n, 2, '只应收口 2 个未完成任务');

  const byId = Object.fromEntries(db.jobs.map((j) => [j.id, j]));
  assert.equal(byId.j_run.status, 'failed');
  assert.match(byId.j_run.error.message, /重启/);
  assert.equal(byId.j_que.status, 'failed');
  assert.equal(byId.j_done.status, 'done', '已完成的任务不能被动');
  assert.deepEqual(byId.j_done.result, { ok: 1 });
  assert.equal(byId.j_fail.error.message, '旧的失败', '原有错误信息不被覆盖');
  assert.equal(byId.j_cancel.status, 'canceled');
});

test('服务启动时自动收口上次留下的僵尸任务（端到端）', async () => {
  const dir = sandboxDir('stale');
  fs.mkdirSync(path.join(dir, 'uploads'), { recursive: true });
  const stamp = '2026-11-01T00:00:00.000Z';
  fs.writeFileSync(
    path.join(dir, 'db.json'),
    JSON.stringify({
      products: [{ id: 'p_s', title: '旧商品', platform: 'shopee', assets: [], createdAt: stamp, updatedAt: stamp }],
      assets: [],
      jobs: [
        { id: 'j_run', type: 'image', productId: 'p_s', status: 'running', progress: 90, result: null, error: null, params: {}, createdAt: stamp, updatedAt: stamp },
        { id: 'j_ok', type: 'copy', productId: 'p_s', status: 'done', progress: 100, result: { title: 'x' }, error: null, params: {}, createdAt: stamp, updatedAt: stamp },
      ],
      ledger: [],
    }),
    'utf8',
  );

  const port = 8860 + Math.floor(Math.random() * 40);
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), AI_MOCK: '1', DUKOU_DATA_DIR: dir },
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  try {
    let up = false;
    for (let i = 0; i < 80; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (r.ok) {
          up = true;
          break;
        }
      } catch {
        /* 还没起来 */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.ok(up, '服务应能启动');

    const zombie = await (await fetch(`http://127.0.0.1:${port}/api/jobs/j_run`)).json();
    assert.equal(zombie.status, 'failed', '僵尸任务必须被收口，否则前端永久轮询');
    assert.match(zombie.error.message, /重启/);

    const finished = await (await fetch(`http://127.0.0.1:${port}/api/jobs/j_ok`)).json();
    assert.equal(finished.status, 'done', '已完成的任务不受影响');
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* ---------------- 并发池不互相阻塞 ---------------- */

test('tick(): 慢任务不阻塞其他任务的调度', async () => {
  const db = { products: [{ id: 'p_1', title: 't', assets: [] }], assets: [], jobs: [], ledger: [] };
  const a = jobs.create(db, { type: 'copy', productId: 'p_1', params: {} });
  const b = jobs.create(db, { type: 'copy', productId: 'p_1', params: {} });
  const c = jobs.create(db, { type: 'copy', productId: 'p_1', params: {} });

  // 一次 tick 应该把三个都放进执行池（并发上限 3），而不是排队等第一个跑完
  jobs.tick(db, { uploadsDir: os.tmpdir(), persist() {}, concurrency: 3, fastHeartbeat: true });
  assert.equal(jobs.inFlight(), 3, '三个任务应同时在执行池里');

  // 等它们自然结束，避免影响后续用例
  for (let i = 0; i < 100 && jobs.inFlight() > 0; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  assert.ok([a, b, c].every((j) => ['done', 'failed'].includes(j.status)), '最终都应到终态');
});
