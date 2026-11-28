// 空库自测：没有「新建商品」按钮，全靠对话框自动建
import fs from 'node:fs';
const APP_PORT = process.env.PORT || '8790';

const PORT = 9334;
const OUT = process.argv[2] || '.';
const BASE = `http://localhost:${APP_PORT}`;

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && t.url.includes(`localhost:${APP_PORT}`));
      if (p) return p;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no cdp page');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const waiters = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
};
const send = (method, params = {}) => {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((r) => waiters.set(id, r));
};
async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description));
  return r.result?.result?.value;
}
async function shot(f) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
  console.log('saved', f);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await sleep(2500);

console.log('有新建按钮:', await js('!!document.querySelector("#btnNew")'));
console.log('有弹窗对话框:', await js('!!document.querySelector("#dlg")'));
console.log('空库提示:', await js('document.querySelector("#pMeta").textContent'));

await js('document.querySelector("#ask").value = "新建商品：老榆木餐桌 实木手工"');
await js('document.querySelector("#btnSend").click()');
for (let i = 0; i < 30; i++) {
  await sleep(700);
  if (await js('!document.querySelector("#chat .progress")')) break;
}
await sleep(1200);

const info = await js(`(async () => {
  const list = await (await fetch('/api/products?limit=5')).json();
  const p = list.items[0];
  const d = await (await fetch('/api/products/' + p.id)).json();
  return JSON.stringify({ n: list.items.length, title: p.title, platform: p.platform, assets: d.assets.length });
})()`);
console.log('库内商品:', info);
console.log('顶栏标题:', await js('document.querySelector("#prodSel").value + " | " + document.querySelector("#pMeta").textContent'));
await shot(`${OUT}/preview-noform.png`);

// 再说一句普通要求，不应新建第二个商品
await js('document.querySelector("#ask").value = "再来一张白底的"');
await js('document.querySelector("#btnSend").click()');
for (let i = 0; i < 30; i++) {
  await sleep(700);
  if (await js('!document.querySelector("#chat .progress")')) break;
}
await sleep(1000);
const info2 = await js(`(async () => {
  const list = await (await fetch('/api/products?limit=5')).json();
  return JSON.stringify({ n: list.items.length, titles: list.items.map(p => p.title) });
})()`);
console.log('第二次发送后:', info2);
await shot(`${OUT}/preview-noform-2.png`);
ws.close();
