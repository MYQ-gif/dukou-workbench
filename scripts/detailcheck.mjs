// 自测：type=detail 六段详情页。
// 用法：node scripts/detailcheck.mjs [截图路径]
const BASE = process.env.BASE || 'http://localhost:8787';
const SHOT = process.argv[2] || 'docs/preview-detail.png';

const api = async (path, init) => {
  const res = await fetch(BASE + path, init);
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
  return data;
};
const waitJob = async (jobId, timeoutMs = 180000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const job = await api(`/api/jobs/${jobId}`);
    if (['done', 'failed', 'canceled'].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('job timeout');
};

const product = await api('/api/products', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    title: '老榆木餐桌',
    platform: 'shopee',
    sellingPoints: ['实木手工', '老料新做', '一口价含运费'],
    rawText: '老爸给奶奶手做的桌子，桌面有岁月痕迹，桌角磨圆了。',
    brief: { usage: 'main', selling: '老料新做，一口价含运费', market: 'mid' },
  }),
});
console.log('product', product.id);

const job = await api('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'detail', productId: product.id, params: { platform: 'shopee', lang: 'en' } }),
});
const done = await waitJob(job.jobId);
console.log('detail', done.status, 'assets', done.result.assets?.length);
const p = await api(`/api/products/${product.id}`);
const list = p.assets.filter((a) => a.kind === 'detail').sort((a, b) => (a.meta.index || 0) - (b.meta.index || 0));
for (const a of list) console.log(` ${a.meta.index}. ${a.meta.segTitle} ${a.width}x${a.height} copy=${JSON.stringify(a.meta.copy.split('\n')[0])}`);
if (list.length !== 6) throw new Error(`期望 6 段，实际 ${list.length}`);
if (!list.every((a) => a.meta.copy)) throw new Error('有段落缺文案');

/* 截图 */
try {
  const tl = await (await fetch('http://127.0.0.1:9334/json/list')).json();
  const page = tl.find((t) => t.type === 'page' && /8787/.test(t.url));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `${BASE}/` });
  await new Promise((r) => setTimeout(r, 2600));
  await evalJs(`(() => { const s = document.querySelector('#prodSel'); const o = [...s.options].find(x => x.text.includes('老榆木')); if (o) { s.value = o.value; s.dispatchEvent(new Event('change')); } return s.value; })()`);
  await new Promise((r) => setTimeout(r, 1200));
  await evalJs(`(() => { const a = document.querySelector('#ask'); a.value = '出一版详情页，六段齐全'; document.querySelector('#btnSend').click(); return true; })()`);
  await new Promise((r) => setTimeout(r, 15000));
  await evalJs(`(() => { const s = document.querySelector('.shots'); if (s) s.scrollIntoView({ block: 'center' }); return !!s; })()`);
  await new Promise((r) => setTimeout(r, 500));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(SHOT, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', SHOT);
  ws.close();
} catch (e) {
  console.log('截图跳过：', e.message);
}
