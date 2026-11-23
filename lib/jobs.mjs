// 任务队列（卓负责）——建任务 / 推进度 / 落结果
// 约定：不引入任何依赖，纯 setTimeout 轮询推进。
import { run as runAI } from './ai.mjs';

const PROGRESS_STEP = 17; // 每 tick 推进的百分比（约 6 tick 完成 = 2.4s）
// 长任务（出视频、字幕识别）跑几十秒到几分钟：进度慢慢爬到 cap 就停住，别提前 100% 干等。
const LONG_TASK = { clip: { step: 4, cap: 90 }, video: { step: 8, cap: 92 }, visual: { step: 6, cap: 88 } };

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

let ticking = false;

/**
 * 推进所有未完成的任务
 * @param {object} db
 * @param {object} ctx { uploadsDir, persist }
 */
export async function tick(db, ctx) {
  if (ticking) return;
  ticking = true;
  try {
    for (const job of db.jobs) {
      if (job.status !== 'queued' && job.status !== 'running') continue;

      if (job.status === 'queued') {
        job.status = 'running';
        job.progress = 0;
        job.updatedAt = nowISO();
        continue; // 下一 tick 开始涨进度，用户能看到 queued → running
      }

      const pacing = LONG_TASK[job.type] || { step: PROGRESS_STEP, cap: 100 };
      if (job.progress < pacing.cap) {
        job.progress = Math.min(pacing.cap, job.progress + pacing.step);
        job.updatedAt = nowISO();
        continue;
      }

      // 进度满 → 真正干活
      try {
        job.result = await runAI(job, db, ctx);
        job.status = 'done';
      } catch (err) {
        job.status = 'failed';
        job.error = { code: 'INTERNAL', message: String(err && err.message ? err.message : err) };
      }
      job.updatedAt = nowISO();
    }
  } finally {
    ticking = false;
    ctx.persist && ctx.persist();
  }
}

export function startLoop(db, ctx, intervalMs = 400) {
  const timer = setInterval(() => {
    tick(db, ctx).catch((e) => console.error('[jobs] tick failed:', e));
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export function cancel(db, jobId) {
  const job = get(db, jobId);
  if (!job) return null;
  if (job.status === 'queued' || job.status === 'running') {
    job.status = 'canceled';
    job.updatedAt = nowISO();
  }
  return job;
}
