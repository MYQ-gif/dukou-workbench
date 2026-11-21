// 自测「出图参数询问框」：发图/要图 → 弹框 → 选参数 → 出图规格正确
import { writeFileSync } from 'node:fs';
const CDP = process.env.CDP || 'http://127.0.0.1:9334';
const OUT = process.argv[2] || '';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /localhost:8787/.test(t.url));
if (!page) throw new Error('no page at localhost:8787');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await ev('location.hash=""; location.reload()');
await sleep(2500);

const before = await ev(`(async () => (await (await fetch('/api/products?limit=1')).json()).items[0]?.assets?.length || 0)()`);
console.log('assets before', before);

// 说一句要图的话，发出去
await ev(`(() => { const a = document.querySelector('#ask'); a.value = '做一张白底主图，标题写 STAY A WHILE.'; document.querySelector('#btnSend').click(); })()`);
await sleep(600);
const opened = await ev(`(() => { const d = document.querySelector('#askDlg'); return { open: d.open, sub: document.querySelector('#dlgSub').textContent.trim(), hint: document.querySelector('#sizeHint').textContent.trim() }; })()`);
console.log('dialog', JSON.stringify(opened));
if (!opened.open) throw new Error('询问框没有弹出');

if (OUT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', OUT);
}

// 选 3 张 + 2K，然后确认
await ev(`document.querySelector('#optCount .chip[data-count="3"]').click()`);
await ev(`document.querySelector('#optQuality .chip[data-quality="2k"]').click()`);
await sleep(200);
console.log('after pick', await ev(`document.querySelector('#cntHint').textContent.trim()`));
await ev(`document.querySelector('#dlgGo').click()`);
await sleep(3500);

const after = await ev(`(async () => {
  const { items } = await (await fetch('/api/products?limit=1')).json();
  const p = await (await fetch('/api/products/' + items[0].id)).json();
  const imgs = p.assets.filter((a) => a.kind !== 'upload' && a.kind !== 'copy');
  const last = imgs.slice(-3).map((a) => a.width + 'x' + a.height + ' ' + a.meta.quality);
  return { total: imgs.length, last, dlgOpen: document.querySelector('#askDlg').open, msgs: document.querySelectorAll('#chat .msg').length };
})()`);
console.log('after', JSON.stringify(after));
ws.close();
