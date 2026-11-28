// 限流与额度护栏——零依赖，纯内存滑动窗口
//
// 为什么要有：
//   真实模式下 POST /api/jobs 会直接烧钱（方舟出图 ¥0.30–0.60/张）。
//   服务一旦放到局域网或公网，任何人都能循环调用。
//   CONTRACT 早就定义了 RATE_LIMITED 错误码，但之前一处实现都没有。
//
// 两道闸：
//   闸一（永远生效）：按 IP 的滑动窗口，挡住脚本式刷接口；
//   闸二（仅真实模式）：当次 + 当日出图张数与预估花费上限，挡住把额度烧穿。
//
// 本机回环地址（127.0.0.1 / ::1）默认放行闸一，避免自测和本地演示被自己卡住。

const num = (k, d) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v >= 0 ? v : d;
};

export const LIMITS = {
  // 闸一：滑动窗口
  jobsPerMin: num('RL_JOBS_PER_MIN', 20),
  uploadsPerMin: num('RL_UPLOADS_PER_MIN', 30),
  writesPerMin: num('RL_WRITES_PER_MIN', 120), // 其余写接口（建商品/改商品/记账/删资产）
  // 闸二：真实模式额度
  imagesPerJob: num('QUOTA_IMAGES_PER_JOB', 6),
  imagesPerDay: num('QUOTA_IMAGES_PER_DAY', 120),
  spendPerDayCNY: num('QUOTA_SPEND_PER_DAY_CNY', 80),
  // 预估单价（仅用于护栏估算，不是账单）
  priceImageCNY: num('PRICE_IMAGE_CNY', 0.6),
  priceClipCNY: num('PRICE_CLIP_CNY', 3),
  priceTextCNY: num('PRICE_TEXT_CNY', 0.01),
};

const WINDOW_MS = 60_000;
const buckets = new Map(); // key -> number[]（时间戳）

function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function clientIP(req) {
  // 注意：只有部署在可信反代之后才应信任 XFF。TRUST_PROXY=1 时才读。
  if (process.env.TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * 闸一：滑动窗口计数。
 * @returns {{ok:true}|{ok:false, retryAfter:number, limit:number}}
 */
export function hit(ip, action, limit) {
  if (limit <= 0) return { ok: true };
  if (isLoopback(ip) && process.env.RL_LOCALHOST !== 'strict') return { ok: true };

  const key = `${action}:${ip}`;
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((WINDOW_MS - (now - arr[0])) / 1000));
    buckets.set(key, arr);
    return { ok: false, retryAfter, limit };
  }
  arr.push(now);
  buckets.set(key, arr);
  return { ok: true };
}

/* ---------------- 闸二：真实模式额度 ---------------- */

let usage = { day: today(), images: 0, clips: 0, texts: 0, spendCNY: 0 };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function rollDay() {
  const d = today();
  if (usage.day !== d) usage = { day: d, images: 0, clips: 0, texts: 0, spendCNY: 0 };
}

/**
 * 建任务前的额度检查。mock 模式下不花钱，直接放行。
 * @returns {{ok:true, estimate:number}|{ok:false, message:string}}
 */
export function checkQuota({ type, params = {}, mock }) {
  rollDay();
  if (mock) return { ok: true, estimate: 0 };

  if (type === 'image' || type === 'detail' || type === 'visual') {
    const asked = Number(params.count);
    const count = type === 'detail' ? 6 : Number.isFinite(asked) && asked > 0 ? Math.round(asked) : 2;
    if (count > LIMITS.imagesPerJob) {
      return { ok: false, message: `单次最多出 ${LIMITS.imagesPerJob} 张，当前请求 ${count} 张` };
    }
    if (usage.images + count > LIMITS.imagesPerDay) {
      return { ok: false, message: `今日出图额度已用 ${usage.images}/${LIMITS.imagesPerDay} 张，再出 ${count} 张会超限` };
    }
    const estimate = count * LIMITS.priceImageCNY;
    if (usage.spendCNY + estimate > LIMITS.spendPerDayCNY) {
      return { ok: false, message: `今日预估花费已达 ¥${usage.spendCNY.toFixed(2)}/${LIMITS.spendPerDayCNY}，本次约需 ¥${estimate.toFixed(2)}` };
    }
    return { ok: true, estimate, count };
  }

  if (type === 'clip' || type === 'video') {
    const estimate = LIMITS.priceClipCNY;
    if (usage.spendCNY + estimate > LIMITS.spendPerDayCNY) {
      return { ok: false, message: `今日预估花费已达上限 ¥${LIMITS.spendPerDayCNY}` };
    }
    return { ok: true, estimate };
  }

  return { ok: true, estimate: LIMITS.priceTextCNY };
}

/** 任务被接受后登记用量（估算值，供护栏与 /api/meta 展示） */
export function recordUsage({ type, estimate = 0, count = 0, mock }) {
  rollDay();
  if (mock) return;
  if (type === 'image' || type === 'detail' || type === 'visual') usage.images += count || 0;
  else if (type === 'clip' || type === 'video') usage.clips += 1;
  else usage.texts += 1;
  usage.spendCNY = Math.round((usage.spendCNY + estimate) * 100) / 100;
}

export function usageSnapshot() {
  rollDay();
  return {
    day: usage.day,
    images: usage.images,
    clips: usage.clips,
    texts: usage.texts,
    estimatedSpendCNY: usage.spendCNY,
    limits: {
      imagesPerJob: LIMITS.imagesPerJob,
      imagesPerDay: LIMITS.imagesPerDay,
      spendPerDayCNY: LIMITS.spendPerDayCNY,
      jobsPerMin: LIMITS.jobsPerMin,
      uploadsPerMin: LIMITS.uploadsPerMin,
    },
  };
}

/** 测试用：清空所有计数 */
export function resetAll() {
  buckets.clear();
  usage = { day: today(), images: 0, clips: 0, texts: 0, spendCNY: 0 };
}
