// 任务队列——建任务 / 推进度 / 落结果
// 约定：零依赖。
//
// 改造要点（阶段 0）：
//   1. 解阻塞：原来 tick() 持全局锁、循环内 await runAI()，一张图跑 60 秒期间
//      所有其他任务的进度全部冻结。现在 tick 只做调度，真正执行放进并发池，
//      每个 job 一条独立 Promise，互不阻塞。
//   2. 真实进度：原来是先把百分比爬到 cap 再开始干活（用户盯着 90% 干等）。
//      现在 runAI 收到 onProgress，按真实阶段上报；没有上报的链路用缓慢心跳兜底，
//      且心跳永远不会越过 cap，避免"假 100%"。
//   3. 启动恢复：进程重启后残留的 queued/running 任务会让前端永久轮询，
//      recoverStale() 在 boot 时把它们统一标 failed。
import { run as runAI } from './ai.mjs';

// 心跳兜底：没有真实进度上报的链路，按这个节奏爬，爬到 cap 就停住等真结果
const HEARTBEAT = { step: 6, cap: 92, intervalMs: 900 };
const FAST_HEARTBEAT = { step: 17, cap: 95, intervalMs: 400 }; // mock 链路毫秒级完成，跑快点
const DEFAULT_CONCURRENCY = Number(process.env.JOB_CONCURRENCY || 3);

export function newId(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2, 8)}`;
}

export function nowISO() {
  return new Date().toISOString();
}

/**
 * 建任务（同步返回 job，不改状态机）
 * @param {object} db 全局数据
 * @param {{type:string, productId:string, params:object}} input
 */
export function create(db, input) {
  const job = {
    id: newId('j'),
    type: input.type,
    productId: input.productId || null,
    status: 'queued',
    progress: 0,
    stage: null, // 新增：人读的阶段文案，前端可选展示，不展示也不影响
    result: null,
    error: null,
    params: input.params || {},
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  db.jobs.push(job);
  return job;
}

export function get(db, jobId) {
  return db.jobs.find((j) => j.id === jobId) || null;
}

export function list(db, { productId, status, limit = 50 } = {}) {
  let items = db.jobs.slice();
  if (productId) items = items.filter((j) => j.productId === productId);
  if (status) items = items.filter((j) => j.status === status);
  return items
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, Math.max(1, limit))
    .map(({ params, ...rest }) => rest); // params 可能含用户原文，列表里不外泄
}

/**
 * 启动恢复：把上次进程留下的未完成任务标成失败。
 * 不这么做的话，前端 jobPromise 会对着一个永不推进的任务无限轮询。
 * @returns {number} 被收口的任务数
 */
export function recoverStale(db) {
  let n = 0;
  for (const job of db.jobs) {
    if (job.status === 'queued' || job.status === 'running') {
      job.status = 'failed';
      job.error = { code: 'INTERNAL', message: '服务已重启，该任务未完成，请重新发起' };
      job.updatedAt = nowISO();
      n += 1;
    }
  }
  return n;
}

/* ---------------- 执行池 ---------------- */

const running = new Set(); // 正在执行的 jobId，防止同一任务被调度两次

function heartbeatFor(ctx) {
  // mock 模式下真实耗时是毫秒级，用快心跳；真模型按慢心跳
  return ctx.fastHeartbeat ? FAST_HEARTBEAT : HEARTBEAT;
}

/** 单个任务的完整生命周期：真实进度上报 + 心跳兜底 + 落结果 */
async function execute(job, db, ctx) {
  job.status = 'running';
  job.progress = Math.max(job.progress || 0, 1);
  job.stage = '已排到，开始处理';
  job.updatedAt = nowISO();
  ctx.persist?.();

  const beat = heartbeatFor(ctx);
  const timer = setInterval(() => {
    if (job.status !== 'running') return;
    if (job.progress < beat.cap) {
      job.progress = Math.min(beat.cap, job.progress + beat.step);
      job.updatedAt = nowISO();
    }
  }, beat.intervalMs);
  timer.unref?.();

  // 真实进度回调：链路知道自己干到哪一步时调它，优先级高于心跳
  const onProgress = (pct, stage) => {
    if (job.status !== 'running') return;
    const n = Number(pct);
    if (Number.isFinite(n)) job.progress = Math.max(job.progress || 0, Math.min(99, Math.round(n)));
    if (stage) job.stage = String(stage);
    job.updatedAt = nowISO();
  };

  try {
    const result = await runAI(job, db, { ...ctx, onProgress });
    if (job.status === 'canceled') return; // 执行途中被取消，结果丢弃
    job.result = result;
    job.status = 'done';
    job.progress = 100;
    job.stage = '完成';
  } catch (err) {
    if (job.status === 'canceled') return;
    job.status = 'failed';
    job.stage = '失败';
    job.error = { code: 'INTERNAL', message: String(err && err.message ? err.message : err) };
  } finally {
    clearInterval(timer);
    job.updatedAt = nowISO();
    running.delete(job.id);
    ctx.persist?.();
  }
}

/**
 * 调度器：只挑任务、不等任务。被 setInterval 反复调用，永不阻塞。
 */
export function tick(db, ctx) {
  const limit = ctx.concurrency || DEFAULT_CONCURRENCY;
  for (const job of db.jobs) {
    if (running.size >= limit) break;
    if (job.status !== 'queued') continue;
    if (running.has(job.id)) continue;
    running.add(job.id);
    // 故意不 await：让它自己跑，调度器立刻去看下一个
    execute(job, db, ctx).catch((e) => {
      running.delete(job.id);
      console.error('[jobs] execute failed:', e);
    });
  }
}

export function startLoop(db, ctx, intervalMs = 200) {
  const timer = setInterval(() => {
    try {
      tick(db, ctx);
    } catch (e) {
      console.error('[jobs] tick failed:', e);
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export function cancel(db, jobId) {
  const job = get(db, jobId);
  if (!job) return null;
  if (job.status === 'queued' || job.status === 'running') {
    job.status = 'canceled';
    job.stage = '已取消';
    job.updatedAt = nowISO();
    running.delete(jobId);
  }
  return job;
}

/** 测试用：当前并发执行中的任务数 */
export function inFlight() {
  return running.size;
}
