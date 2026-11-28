// 排队兜底自测：把 __slowAfter 调到 1.2s，触发 clip，看文案是否切换、进度回来后是否还原
import fs from 'node:fs';
const PORT = process.env.PORT || '8790';
const CDP = 'http://127.0.0.1:9334';
const out = process.argv[2] || 'docs/preview-slow.png';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && new RegExp(String(PORT)).test(t.url));
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (file) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const products = await (await fetch(`http://localhost:${PORT}/api/products`)).json();
const pid = (products.items || [])[0]?.id;
await send('Page.navigate', { url: `http://localhost:${PORT}/?p=${pid}` });
await wait(2400);
await evalJs(`(() => { const s = document.querySelector('#prodSel'); if (s) { s.value='${pid}'; s.dispatchEvent(new Event('change')); } return true; })()`);
await wait(900);
await evalJs(`window.__slowAfter = 1200; true`);
await evalJs(`(() => { const i = document.querySelector('#ask'); i.value = '用这张商品图出一段 5 秒短视频'; document.querySelector('#btnSend').click(); return true; })()`);
await wait(1800);
const slow = await evalJs(`({ slowClass: !!document.querySelector('.msg.ai.slow'), text: document.querySelector('.msg.ai.slow p')?.textContent || '', prog: document.querySelector('.progress span')?.textContent || '' })`);
console.log('兜底', JSON.stringify(slow));
await shot(out);
await wait(6000);
const after = await evalJs(`({ slowClass: !!document.querySelector('.msg.ai.slow'), text: [...document.querySelectorAll('.msg.ai p')].map(p => p.textContent.slice(0, 20)).slice(-3) })`);
console.log('几秒后', JSON.stringify(after));
console.log('saved', out);
ws.close();
