// Seedance（火山方舟 Ark）视频生成：异步任务，提交 → 轮询 → 拿 mp4。
// 文档要点：POST /contents/generations/tasks 建任务，GET 同名 /{id} 查状态，
// 参数（分辨率/时长/是否固定机位）写在 text 末尾当命令行参数。
import * as providers from './providers.mjs';

const POLL_INTERVAL = 5000;
const MAX_WAIT = 240_000;

const STATUS = { queued: '排队', running: '生成中', succeeded: '完成', failed: '失败', cancelled: '已取消' };

function buildPrompt(prompt, { resolution = '720p', duration = 5, cameraFixed = false, watermark = false }) {
  return [
    prompt,
    `--resolution ${resolution}`,
    `--duration ${duration}`,
    `--camerafixed ${cameraFixed ? 'true' : 'false'}`,
    `--watermark ${watermark ? 'true' : 'false'}`,
  ].join(' ');
}

/**
 * @param {object} opts
 * @param {string} opts.prompt        画面描述（中文即可）
 * @param {string} [opts.firstFrame]  首帧图，data URI 或公网 url（图生视频）
 * @param {string} [opts.model]
 * @param {string} [opts.resolution]  480p | 720p | 1080p
 * @param {number} [opts.duration]    5 | 10
 * @param {boolean}[opts.cameraFixed]
 * @returns {Promise<{buffer:Buffer, model:string, taskId:string, ms:number}>}
 */
export async function generateClip(opts) {
  const started = Date.now();
  const cap = providers.capability('VIDEO');
  if (!cap.baseUrl || !cap.key) {
    const missing = [cap.baseUrl ? '' : 'VIDEO_BASE_URL', cap.key ? '' : 'VIDEO_API_KEY'].filter(Boolean);
    throw new Error(`没配 ${missing.join(' / ')}（Seedance 走火山方舟 Ark）`);
  }
  const model = opts.model || cap.model;
  if (!model) throw new Error('没配 VIDEO_MODEL（例如 doubao-seedance-1-0-lite-i2v-250428）');

  const content = [{ type: 'text', text: buildPrompt(opts.prompt, opts) }];
  if (opts.firstFrame) content.push({ type: 'image_url', image_url: { url: opts.firstFrame } });

  const { data: created } = await providers.postJSON(
    'VIDEO',
    '/contents/generations/tasks',
    { model, content },
    { timeout: 60_000 },
  );
  const taskId = created?.id;
  if (!taskId) throw new Error(`建任务没返回 id：${JSON.stringify(created).slice(0, 200)}`);

  const deadline = Date.now() + MAX_WAIT;
  let last = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const { data } = await providers.getJSON('VIDEO', `/contents/generations/tasks/${taskId}`, { timeout: 30_000 });
    last = data;
    if (data.status === 'succeeded') {
      const url = data?.content?.video_url;
      if (!url) throw new Error('任务成功但没有 video_url');
      const buffer = await providers.download(url, { timeout: 180_000 });
      return { buffer, model, taskId, ms: Date.now() - started };
    }
    if (data.status === 'failed' || data.status === 'cancelled') {
      throw new Error(`Seedance ${STATUS[data.status] || data.status}：${data?.error?.message || '无详细原因'}`);
    }
  }
  throw new Error(`Seedance 超时（等了 ${Math.round(MAX_WAIT / 1000)}s，最后状态 ${STATUS[last?.status] || last?.status || '未知'}）`);
}

export function statusLabel(s) {
  return STATUS[s] || s;
}
