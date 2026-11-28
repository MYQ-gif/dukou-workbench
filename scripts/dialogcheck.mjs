// 自测「对话区里的出图提问卡」：说一句要图的话 → 卡片出现在聊天流里 → 选参数 → 规格正确
// 用法：node scripts/dialogcheck.mjs docs/preview-ask.png
import { writeFileSync } from 'node:fs';
const PORT = process.env.PORT || '8790';
const CDP = process.env.CDP || 'http://127.0.0.1:9334';
const OUT = process.argv[2] || '';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && new RegExp('localhost:'+PORT).test(t.url));
if (!page) throw new Error('no page at localhost:${PORT}');
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

const before = await ev(`(async () => { const p = await (await fetch('/api/products?limit=1')).json(); return p.items[0]?.assets?.length || 0; })()`);
console.log('assets before', before);

// 说一句要图的话，发出去
await ev(`(() => { const a = document.querySelector('#ask'); a.value = '做一张白底主图，标题写 STAY A WHILE.'; document.querySelector('#btnSend').click(); })()`);
await sleep(700);

const asked = await ev(`(() => {
  const card = document.querySelector('#chat .msg:last-child .ask-q');
  return {
    inChat: !!card,
    dialogGone: !document.querySelector('#askDlg'),
    chips: document.querySelectorAll('#chat .msg:last-child .chip').length,
    sub: document.querySelector('#chat .msg:last-child .ask-sub')?.textContent.trim(),
  };
})()`);
console.log('ask card', JSON.stringify(asked));
if (!asked.inChat) throw new Error('提问卡没有出现在对话区');
if (!asked.dialogGone) throw new Error('旧弹窗还在');

// 选 3 张 + 2K
await ev(`document.querySelector('#chat .msg:last-child .opt-row[data-k="count"] .chip[data-v="3"]').click()`);
await ev(`document.querySelector('#chat .msg:last-child .opt-row[data-k="quality"] .chip[data-v="2k"]').click()`);
await sleep(250);
const picked = await ev(`[...document.querySelectorAll('#chat .msg:last-child .chip.on')].map((c) => c.textContent.trim()).join(' | ')`);
console.log('picked', picked);

if (OUT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
  console.log('saved', OUT);
}

await ev(`document.querySelector('#chat .msg:last-child [data-act="go"]').click()`);
await sleep(3500);

const after = await ev(`(async () => {
  const { items } = await (await fetch('/api/products?limit=1')).json();
  const p = await (await fetch('/api/products/' + items[0].id)).json();
  const imgs = p.assets.filter((a) => a.kind !== 'upload' && a.kind !== 'copy');
  const last = imgs.slice(-3).map((a) => a.width + 'x' + a.height + ' ' + a.meta.quality);
  const done = document.querySelector('#chat .msg:last-child .ask-done');
  return { total: imgs.length, last, cardDone: done ? done.textContent.trim() : null };
})()`);
console.log('after', JSON.stringify(after));
ws.close();
