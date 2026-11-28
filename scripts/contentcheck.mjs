// 自测：geo（内容资产）与 inquiry（询盘）两条链路。
// 用法：node scripts/contentcheck.mjs [截图路径]
import fs from 'node:fs';
const PORT = process.env.PORT || '8790';

const BASE = process.env.BASE || `http://localhost:${PORT}`;
const SHOT = process.argv[2] || 'docs/preview-inquiry.png';

const api = async (path, init) => {
  const res = await fetch(BASE + path, init);
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
  return data;
};

const waitJob = async (jobId, timeoutMs = 120000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const job = await api(`/api/jobs/${jobId}`);
    if (job.status === 'done' || job.status === 'failed' || job.status === 'canceled') return job;
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
console.log('product', product.id, product.title);

/* ---------- geo ---------- */
const geoJob = await api('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    type: 'geo',
    productId: product.id,
    params: { platform: 'shopee', lang: 'en', brief: product.brief || {} },
  }),
});
const geo = await waitJob(geoJob.jobId);
console.log('geo', geo.status, 'questions', geo.result.questions.length, 'anchors', geo.result.anchors.length, 'keywords', geo.result.keywords.length);
console.log('  sample q:', geo.result.questions[0]?.q);
console.log('  sample anchor:', geo.result.anchors[0]?.after);
console.log('  kinds:', geo.result.assets.map((a) => a.kind).join(','));

/* ---------- inquiry ---------- */
const sample = `Hi, we are a furniture retailer in Ho Chi Minh City.
We saw your elm dining table on your site. Need 200 pcs,
1.2m, natural finish. What is your FOB price and lead time?
Do you have fumigation certificate? We prefer T/T 30% deposit.
Please send catalog.`;

const inqJob = await api('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'inquiry', productId: product.id, params: { text: sample, langs: ['en', 'zh'] } }),
});
const inq = await waitJob(inqJob.jobId);
console.log('inquiry', inq.status);
for (const f of inq.result.fields) console.log(`  ${f.label}: ${f.value}`);
console.log('  risks:', inq.result.risks.length, inq.result.risks.map((r) => r.text.slice(0, 18)).join(' | '));
console.log('  reply langs:', Object.keys(inq.result.reply || {}).join(','));
console.log('  kinds:', inq.result.assets.map((a) => a.kind).join(','));

if (!geo.result.questions.length) throw new Error('geo 没出问题库');
if (!inq.result.fields.length) throw new Error('inquiry 没抽到要素');
if (!inq.result.risks.length) throw new Error('inquiry 没标风险');
if (!Object.values(inq.result.reply || {}).some(Boolean)) throw new Error('inquiry 没出回信');

/* ---------- 截图（可选） ---------- */
try {
  const list = await (await fetch('http://127.0.0.1:9334/json/list')).json();
  const page = list.find((t) => t.type === 'page' && new RegExp(String(PORT)).test(t.url));
  if (!page) throw new Error('没找到页面');
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
  await evalJs(`document.querySelector('#btnWarehouse') && (document.querySelector('#wh').classList.add('hidden'), true)`);
  await evalJs(`(() => { const s = document.querySelector('#prodSel'); const o = [...s.options].find(x => x.text.includes('老榆木')); if (o) { s.value = o.value; s.dispatchEvent(new Event('change')); } return s.value; })()`);
  const sendText = process.env.ASK_TEXT || sample;
  await new Promise((r) => setTimeout(r, 1200));
  await evalJs(`(() => { const a = document.querySelector('#ask'); a.value = ${JSON.stringify(sendText)}; document.querySelector('#btnSend').click(); return true; })()`);
  await new Promise((r) => setTimeout(r, 6000));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(SHOT, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', SHOT);
  ws.close();
} catch (e) {
  console.log('截图跳过：', e.message);
}
