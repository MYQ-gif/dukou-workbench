// 模型供应商配置层（马负责）——把「文案 / 出图 / 语音识别」三条链路分开配。
// 规矩：key 只在本机 .env 里，不进代码、不进前端、不进日志；缺哪个就在状态里说清楚。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Node 20.12+ 自带 .env 读取；没有文件就跳过。
try {
  if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
} catch (err) {
  console.warn('[providers] .env 读取失败：', err.message);
}

const DEFAULT_TIMEOUT = 90_000;

const env = (k, fallback = '') => (process.env[k] || fallback).trim();

/** 三个能力各自一份配置；没单独配就退回旧的 AI_* 变量。 */
function read(cap) {
  const legacyUrl = env('AI_BASE_URL');
  const legacyKey = env('AI_API_KEY');
  return {
    cap,
    baseUrl: env(`${cap}_BASE_URL`, legacyUrl).replace(/\/$/, ''),
    key: env(`${cap}_API_KEY`, legacyKey),
    model: env(`${cap}_MODEL`, ''),
    extra: {
      response: env('IMAGE_RESPONSE', 'url'),
    },
  };
}

export const CAPS = ['TEXT', 'IMAGE', 'ASR', 'VIDEO'];

export function capability(name) {
  const cap = String(name).toUpperCase();
  if (!CAPS.includes(cap)) throw new Error(`unknown capability: ${name}`);
  return read(cap);
}

/** 全局是否走假数据：AI_MOCK=0 才是真调，其它值（含未设置）都是 mock。 */
export function isMock() {
  return env('AI_MOCK', '1') !== '0';
}

export function has(name) {
  const c = capability(name);
  return Boolean(c.baseUrl && c.key);
}

/** 给前端/答辩用的一份状态：谁配好了、用的哪个模型、缺什么。 */
export function status() {
  const m = isMock();
  const list = CAPS.map((name) => {
    const c = read(name);
    const configured = Boolean(c.baseUrl && c.key);
    return {
      name: name.toLowerCase(),
      configured,
      model: c.model || null,
      baseUrl: c.baseUrl || null,
      missing: [
        !c.baseUrl ? `${name}_BASE_URL` : '',
        !c.key ? `${name}_API_KEY` : '',
        !c.model ? `${name}_MODEL` : '',
      ].filter(Boolean),
      active: !m && configured,
    };
  });
  return {
    mock: m,
    mode: m ? 'mock' : list.every((x) => x.configured) ? 'live' : 'partial',
    caps: list,
  };
}

/* ---------------- HTTP ---------------- */

async function withTimeout(timeout, fn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fn(ctrl.signal);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`upstream timeout after ${Math.round(timeout / 1000)}s`);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function ensure(name) {
  const c = capability(name);
  if (!c.baseUrl || !c.key) {
    const missing = [c.baseUrl ? '' : `${name}_BASE_URL`, c.key ? '' : `${name}_API_KEY`].filter(Boolean);
    throw new Error(`未配置 ${missing.join(' / ')}（在 .env 里填，重启服务生效）`);
  }
  return c;
}

/** JSON 请求。返回 { data, ms }，失败抛可读错误。 */
export async function postJSON(name, pathname, body, { timeout = DEFAULT_TIMEOUT } = {}) {
  const c = ensure(name);
  const started = Date.now();
  return withTimeout(timeout, async (signal) => {
    const res = await fetch(`${c.baseUrl}${pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.key}` },
      body: JSON.stringify(body),
      signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${name} upstream ${res.status}: ${text.slice(0, 200)}`);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`${name} returned non-JSON`);
    }
    return { data, ms: Date.now() - started };
  });
}

/** multipart 请求，用于语音识别这类要传文件的接口。 */
export async function postForm(name, pathname, form, { timeout = DEFAULT_TIMEOUT } = {}) {
  const c = ensure(name);
  const started = Date.now();
  return withTimeout(timeout, async (signal) => {
    const res = await fetch(`${c.baseUrl}${pathname}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.key}` },
      body: form,
      signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${name} upstream ${res.status}: ${text.slice(0, 200)}`);
    const data = text ? JSON.parse(text) : {};
    return { data, ms: Date.now() - started };
  });
}

/** 把远端图片/音频拉回来存盘（有些供应商只给 url，不给 base64）。 */
export async function download(url, { timeout = DEFAULT_TIMEOUT } = {}) {
  return withTimeout(timeout, async (signal) => {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`download ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  });
}

/** GET 请求，用于 /models 这类探活。 */
export async function getJSON(name, pathname, { timeout = 20_000 } = {}) {
  const c = ensure(name);
  const started = Date.now();
  return withTimeout(timeout, async (signal) => {
    const res = await fetch(`${c.baseUrl}${pathname}`, {
      headers: { authorization: `Bearer ${c.key}` },
      signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${name} upstream ${res.status}: ${text.slice(0, 200)}`);
    return { data: text ? JSON.parse(text) : {}, ms: Date.now() - started };
  });
}

/** 一条极小的连通性自检：文案模型回一个 token，其余能力探 /models。 */
export async function check(name = 'TEXT') {
  const cap = String(name).toUpperCase();
  const c = ensure(cap);
  if (cap === 'TEXT') {
    const { data, ms } = await postJSON(
      cap,
      '/chat/completions',
      { model: c.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 },
      { timeout: 20_000 },
    );
    return { ok: true, ms, model: c.model, sample: data?.choices?.[0]?.message?.content };
  }
  const { data, ms } = await getJSON(cap, '/models');
  const models = Array.isArray(data?.data) ? data.data.map((m) => m.id) : [];
  const found = !models.length || models.includes(c.model);
  return { ok: true, ms, model: c.model, note: found ? undefined : `服务端没列出 ${c.model}，可能模型名不对` };
}
