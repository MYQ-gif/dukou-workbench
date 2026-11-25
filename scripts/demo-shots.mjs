import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9334';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /8787/.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (f) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
  console.log('saved', f);
};

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'http://localhost:8787/?v=' + Date.now() });
await wait(2500);
await ev("localStorage.setItem('dukou:theme','light'); location.reload(); true");
await wait(2600);
const picked = await ev("(() => { const s = document.querySelector('#prodSel'); const o = [...s.options].find(x => x.value); s.value = o.value; s.dispatchEvent(new Event('change')); return o.textContent; })()");
console.log('picked', picked);
await wait(1400);
await ev("document.querySelector('.tab[data-tab=\"image\"]').click(); true");
await wait(700);
await shot('docs/preview-demo-chat.png');
await ev("document.querySelector('#btnWarehouse').click(); true");
await wait(900);
await shot('docs/preview-demo-warehouse.png');
console.log('counts', await ev("document.querySelectorAll('#wh .wh-item').length"));
await ev("document.querySelector('#whClose')?.click() || document.querySelector('.wh .close')?.click() || null");
await wait(500);
await ev("document.querySelector('.tab[data-tab=\"ledger\"]').click(); true");
await wait(900);
await shot('docs/preview-demo-ledger.png');
ws.close();
