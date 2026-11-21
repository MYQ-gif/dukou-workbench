// 仓库 + 平台选择 自测：连 CDP 真点按钮，截图存盘
import fs from 'node:fs';

const PORT = 9334;
const OUT = process.argv[2] || '.';

async function targets() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl && /localhost:8787/.test(t.url));
      if (page) return page;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('no CDP target');
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const waiters = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id); }
};
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res) => waiters.set(id, res));
}
async function evalJS(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}
async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await sleep(2500);

console.log('title:', await evalJS('document.title'));
console.log('warehouse btn:', await evalJS('!!document.querySelector("#btnWarehouse")'));
console.log('greeting has 已有素材:', await evalJS('document.querySelector("#chat").textContent.includes("已有素材")'));

// 平台菜单
await evalJS('document.querySelector("#btnPlatform").click()');
await sleep(300);
console.log('platform items:', await evalJS('document.querySelectorAll("#pfMenu .pf-item").length'));
console.log('domestic:', await evalJS('Array.from(document.querySelectorAll("#pfDomestic .pf-label")).map(e=>e.textContent).join("/")'));
console.log('overseas:', await evalJS('Array.from(document.querySelectorAll("#pfOverseas .pf-label")).map(e=>e.textContent).join("/")'));
await shot(`${OUT}/preview-platform.png`);

// 选淘宝，发一句
await evalJS('document.querySelector("#pfMenu .pf-item[data-pf=taobao]").click()');
await sleep(200);
console.log('pfName:', await evalJS('document.querySelector("#pfName").textContent'));
console.log('chip:', await evalJS('document.querySelector("#pfChip").textContent'));
await evalJS('document.querySelector("#ask").value = "白底主图，标题写 HANDMADE TABLE"');
await evalJS('document.querySelector("#btnSend").click()');

for (let i = 0; i < 30; i++) {
  await sleep(700);
  const done = await evalJS('!document.querySelector("#chat .progress")');
  if (done) break;
}
await sleep(800);

const info = await evalJS(`(async () => {
  const r = await fetch('/api/products/' + document.querySelector('#prodSel').value);
  const d = await r.json();
  const imgs = d.assets.filter(a => a.kind !== 'upload' && a.kind !== 'copy');
  const last = imgs[imgs.length - 1] || {};
  return JSON.stringify({ imgs: imgs.length, w: last.width, h: last.height, plat: last.meta && last.meta.platform });
})()`);
console.log('after send:', info);

// 仓库
await evalJS('document.querySelector("#btnWarehouse").click()');
await sleep(600);
console.log('wh open:', await evalJS('!document.querySelector("#wh").classList.contains("hidden")'));
console.log('wh counts:', await evalJS('document.querySelector("#whImgNum").textContent + "/" + document.querySelector("#whCopyNum").textContent'));
await shot(`${OUT}/preview-warehouse.png`);

await evalJS('document.querySelector(".wh-tab[data-wh=copy]").click()');
await sleep(400);
console.log('copy cards:', await evalJS('document.querySelectorAll(".wh-copy").length'));
await shot(`${OUT}/preview-warehouse-copy.png`);

ws.close();
