// loader 自测：起一个 clip 任务，抓「跑动 loader」那一帧，再等进度把 loader 收走
import fs from 'node:fs';
const CDP = 'http://127.0.0.1:9334';
const out = process.argv[2] || 'docs/preview-loader.png';
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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (file) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const products = await (await fetch('http://localhost:8787/api/products')).json();
const pid = (products.items || [])[0]?.id;
await send('Page.navigate', { url: `http://localhost:8787/?p=${pid}` });
await wait(2400);
await evalJs(`(() => { const s = document.querySelector('#prodSel'); if (s && '${pid}') { s.value='${pid}'; s.dispatchEvent(new Event('change')); } return true; })()`);
await wait(900);

// 走真实输入：说一句要短视频，触发 doClip（长任务，会挂 loader）
await evalJs(`(() => { const i = document.querySelector('#ask'); i.value = '用这张商品图出一段 5 秒短视频'; document.querySelector('#btnSend').click(); return true; })()`);
await wait(450);
const state = await evalJs(`({
  loader: !!document.querySelector('.duk-loader'),
  wrap: !!document.querySelector('.duk-loader-wrap'),
  scale: getComputedStyle(document.querySelector('.duk-loader') || document.body).transform
})`);
console.log('loader', JSON.stringify(state));
await shot(out);
await wait(6000);
const still = await evalJs(`({ loader: !!document.querySelector('.duk-loader'), prog: document.querySelector('.progress span')?.textContent || '' })`);
console.log('6 秒后', JSON.stringify(still));
await shot(out.replace('.png', '-later.png'));
console.log('saved', out);
ws.close();
