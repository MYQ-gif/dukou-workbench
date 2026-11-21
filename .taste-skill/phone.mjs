// 手机宽度截图 + 溢出检查（CDP 强制视口 390）
import { writeFileSync } from 'node:fs';
const CDP = process.env.CDP || 'http://127.0.0.1:9335';
const OUT = process.argv[2] || 'docs/preview-phone.png';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /localhost:8787/.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await ev('location.hash=""'); await ev('location.reload()');
await new Promise((r) => setTimeout(r, 2500));
console.log('viewport', await ev('innerWidth'), 'scrollWidth', await ev('document.documentElement.scrollWidth'));
const bad = await ev(`(() => { const vw = innerWidth, out = [];
  for (const el of document.querySelectorAll('*')) { const r = el.getBoundingClientRect();
    if (r.width && (r.right > vw + 1 || r.left < -1)) out.push(el.tagName.toLowerCase() + '.' + (el.className || '') + ' right=' + Math.round(r.right)); }
  return out.slice(0, 10).join('\\n'); })()`);
console.log(bad || '无溢出');
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
console.log('saved', OUT);
ws.close();
