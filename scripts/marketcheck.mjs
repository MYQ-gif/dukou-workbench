// 目标市场 + 四入口自检：市场下拉、四张卡片、点卡片直接开工、卡片不叠
import fs from 'node:fs';

const BASE = 'http://localhost:8787';
const CDP = 'http://127.0.0.1:9334';
const out = process.argv[2] || 'docs/preview-market.png';

const meta = await (await fetch(`${BASE}/api/meta`)).json();
console.log('markets:', meta.markets.length);

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /8787/.test(t.url));
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

// 先用 API 造一个日本市场的商品，再打开页面（列表才有它）
const p = await (await fetch(`${BASE}/api/products`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: '老榆木餐桌', platform: 'shopee', market: 'jp', sellingPoints: ['实木手工', '老料新做'], rawText: '老爸给奶奶手做的桌子。' }),
})).json();
console.log('商品:', p.id, 'market:', p.market);

await send('Page.navigate', { url: `${BASE}/` });
await new Promise((r) => setTimeout(r, 2500));

await evalJs(`document.querySelector('#btnProducts').click(); true`);
await new Promise((r) => setTimeout(r, 500));
await evalJs(`document.querySelector('[data-pick="${p.id}"]').click(); true`);
await new Promise((r) => setTimeout(r, 1200));

const shown = await evalJs(`({ title: document.querySelector('#hTitle').textContent, market: document.querySelector('#marketSel').value, sel: document.querySelector('#marketSel').selectedOptions[0].textContent })`);
console.log('选中后:', JSON.stringify(shown));

const tiles = await evalJs(`[...document.querySelectorAll('.tile')].map(t => t.querySelector('.tile-t').textContent)`);
console.log('入口:', JSON.stringify(tiles));

// 点「营销海报」→ 应弹参数卡；再点一次 → 只应有一张卡
await evalJs(`document.querySelectorAll('.tile')[2].click(); true`);
await new Promise((r) => setTimeout(r, 1200));
await evalJs(`document.querySelectorAll('.tile')[2].click(); true`);
await new Promise((r) => setTimeout(r, 1200));
const cards = await evalJs(`document.querySelectorAll('#chat .msg.ai .ask-q').length`);
console.log('参数卡数量（应为 1）:', cards);

// 选 2 张 + 2K → 开始生成
await evalJs(`(() => { const c = document.querySelector('#chat .msg:last-child'); if (!c) return false; const two = [...c.querySelectorAll('[data-k="count"] .chip')].find(b => b.dataset.v === '2'); if (two) two.click(); const q = [...c.querySelectorAll('[data-k="quality"] .chip')].find(b => b.dataset.v === '2k'); if (q) q.click(); const go = [...c.querySelectorAll('button')].find(b => b.dataset.act === 'go'); if (go) go.click(); return true; })()`);
await new Promise((r) => setTimeout(r, 9000));

const res = await evalJs(`(() => { const p = document.querySelector('#chat .msg:last-child'); return { text: (p?.textContent || '').slice(0, 30), imgs: document.querySelectorAll('#chat .msg.ai .shots img').length }; })()`);
console.log('生成结果:', JSON.stringify(res));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
ws.close();
