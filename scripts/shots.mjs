// 用 CDP 拍一组真实操作截图：docshot 用（不参与运行）
// 用法：node scripts/shots.mjs [outDir]
import { readFileSync } from 'node:fs';
const OUT = process.argv[2] || 'docs';
const CDP = process.env.CDP || 'http://127.0.0.1:9334';

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /localhost:8787|127\.0\.0\.1:8787/.test(t.url)) || list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const shot = async (file) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${OUT}/${file}`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', file);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await evalJs(`location.hash = ''; location.reload();`);
await sleep(2500);

// 生图：选淘宝、发一句
await evalJs(`document.querySelector('#btnPlatform').click()`);
await sleep(300);
await evalJs(`document.querySelector('.pf-item[data-pf="taobao"]').click()`);
await sleep(400);
await evalJs(`(() => { const i = document.querySelector('#ask'); i.value = '做一张白底主图，标题写 SIT DOWN. STAY A WHILE.'; document.querySelector('#btnSend').click(); return 1; })()`);
await sleep(1500);
await shot('preview-chat.png');
await sleep(2500);
await evalJs(`document.querySelector('#chat').scrollTop = 1e6`);
await sleep(300);
await shot('preview-chat-flow.png');

// 仓库
await evalJs(`document.querySelector('#btnWarehouse').click()`);
await sleep(600);
await shot('preview-warehouse.png');
await evalJs(`document.querySelector('.wh-tab[data-wh="copy"]').click()`);
await sleep(500);
await shot('preview-warehouse-copy.png');
await evalJs(`document.querySelector('#whClose').click()`);

// 其它 tab
for (const [tab, file] of [['video', 'preview-video.png'], ['ledger', 'preview-ledger.png'], ['api', 'preview-api.png']]) {
  await evalJs(`document.querySelector('.tab[data-tab="${tab}"]').click()`);
  await sleep(700);
  await shot(file);
}
ws.close();
