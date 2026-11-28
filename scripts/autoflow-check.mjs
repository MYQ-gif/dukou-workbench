// 验证「丢一张图 → 自动出一套」：用 CDP 给 file input 塞文件，等流程跑完截图
import fs from 'node:fs';
const PORT = process.env.PORT || '8790';

const CDP = 'http://127.0.0.1:9334';
const photo = process.argv[2] || 'demo/01-headphones.jpg';
const out = process.argv[3] || 'docs/preview-auto.png';

const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && new RegExp(String(PORT)).test(t.url)) || list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('DOM.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://localhost:${PORT}/?v=${Date.now()}` });
await new Promise((r) => setTimeout(r, 2500));

const { result: { root } } = await send('DOM.getDocument', { depth: -1 });
const { result: { nodeId } } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '#file' });
await send('DOM.setFileInputFiles', { nodeId, files: [photo] });

for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 700));
  const n = await ev("document.querySelectorAll('#chat .shots img').length");
  const busy = await ev("!!document.querySelector('#chat .progress')");
  if (i % 4 === 0) console.log('tick', i, 'shots', n, 'busy', busy);
  if (!busy && n > 0 && i > 6) break;
}
const summary = await ev(`(() => ({
  shots: document.querySelectorAll('#chat .shots img').length,
  products: document.querySelectorAll('#pdList .pd-item').length,
  title: document.querySelector('#hTitle')?.textContent?.trim(),
  meta: document.querySelector('#pMeta')?.textContent?.trim(),
}))()`);
console.log('summary', JSON.stringify(summary));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
ws.close();
