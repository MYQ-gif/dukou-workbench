// 自测「话里说清的参数不再追问」：三件全说到 → 不弹卡、直接出图；只说一件 → 只问剩下两件
import { writeFileSync } from 'node:fs';
const CDP = process.env.CDP || 'http://127.0.0.1:9334';
const OUT = process.argv[2] || '';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /localhost:8787/.test(t.url));
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

async function sendAsk(text) {
  await ev(`(() => { const a = document.querySelector('#ask'); a.value = ${JSON.stringify(text)}; document.querySelector('#btnSend').click(); })()`);
  await sleep(700);
  return ev(`(() => {
    const m = document.querySelector('#chat .msg:last-child');
    const q = m?.querySelector('.ask-q')?.textContent.trim();
    const rows = [...(m?.querySelectorAll('.opt-row') || [])].map((r) => r.dataset.k);
    return { q, rows, isCard: !!q && /还差/.test(q) };
  })()`);
}

// 1) 只说"几张" → 只该问 尺寸 + 清晰度
console.log('partial', JSON.stringify(await sendAsk('做 3 张主图')));
if (OUT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', OUT);
}
await ev(`document.querySelector('#chat .msg:last-child [data-act="cancel"]').click()`);
await sleep(200);

// 2) 三件全说 → 不该出卡片
console.log('full', JSON.stringify(await sendAsk('出 2 张竖屏 4K 主图')));
await sleep(3200);

const after = await ev(`(async () => {
  const { items } = await (await fetch('/api/products?limit=1')).json();
  const p = await (await fetch('/api/products/' + items[0].id)).json();
  const imgs = p.assets.filter((a) => a.kind !== 'upload' && a.kind !== 'copy');
  return { total: imgs.length, last: imgs.slice(-2).map((a) => a.width + 'x' + a.height + ' ' + a.meta.quality) };
})()`);
console.log('after', JSON.stringify(after));

ws.close();
