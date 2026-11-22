// 自测：商品短视频（clip）——API 走一遍 mock 任务 + 界面里点一下入口卡片
import fs from 'node:fs';

const BASE = 'http://localhost:8787';
const CDP = 'http://127.0.0.1:9334';
const out = process.argv[2] || 'docs/preview-clip.png';

const api = async (path, opts = {}) => {
  const res = await fetch(BASE + path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
  return data;
};

// 1) 找一个商品
const list = await api('/api/products');
const product = list.items?.[0] || list[0] || (await api('/api/products', { method: 'POST', body: { title: '自测商品' } }));
const pid = product.id;

// 2) 建 clip 任务并等
const { jobId } = await api('/api/jobs', { method: 'POST', body: { type: 'clip', productId: pid, params: { duration: 5, resolution: '720p' } } });
let job = null;
for (let i = 0; i < 40; i++) {
  job = await api(`/api/jobs/${jobId}`);
  if (job.status === 'done' || job.status === 'failed') break;
  await new Promise((r) => setTimeout(r, 250));
}
console.log('clip job', job.status, JSON.stringify(job.result || job.error).slice(0, 220));

// 3) 界面里点「出商品短视频」卡片 → 发送，看是否真出消息
const list2 = await (await fetch(`${CDP}/json/list`)).json();
const page = list2.find((t) => t.type === 'page' && /8787/.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/` });
await new Promise((r) => setTimeout(r, 2600));

const tiles = await ev(`Array.from(document.querySelectorAll('.tile .tile-t')).map(e => e.textContent)`);
console.log('tiles', JSON.stringify(tiles));

await ev(`(() => {
  const t = Array.from(document.querySelectorAll('.tile')).find(b => /短视频/.test(b.textContent));
  t.click();
  return document.querySelector('#ask').value;
})()`);
await ev(`document.querySelector('#btnSend').click(); true`);
await new Promise((r) => setTimeout(r, 15000));

const state = await ev(`({
  msgs: document.querySelectorAll('#chat .msg').length,
  clip: document.querySelectorAll('#chat video.clip').length,
  poster: document.querySelectorAll('#chat img.thumb-lg').length,
  last: document.querySelector('#chat .msg:last-child')?.innerText?.slice(0, 80)
})`);
console.log('ui', JSON.stringify(state));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
ws.close();
