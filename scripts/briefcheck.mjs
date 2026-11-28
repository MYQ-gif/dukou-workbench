// 自测：上传第一张图 → 弹补素材卡 → 存 brief → 跑备料（visual）→ 仓库出现基底素材
import { writeFileSync } from 'node:fs';
const PORT = process.env.PORT || '8790';
const CDP = process.env.CDP || 'http://127.0.0.1:9334';
const OUT = process.argv[2] || '';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && new RegExp('localhost:'+PORT).test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await ev('location.hash=""; location.reload()');
await sleep(2200);

// 造一个 800×800 的 PNG 当用户拍的原图
const attached = await ev(`(async () => {
  const c = document.createElement('canvas'); c.width = 800; c.height = 800;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 800, 800);
  grad.addColorStop(0, '#d9c3a5'); grad.addColorStop(1, '#8a6a4b');
  g.fillStyle = grad; g.fillRect(0, 0, 800, 800);
  g.fillStyle = '#5b3a24'; g.fillRect(120, 520, 560, 26); g.fillRect(180, 546, 26, 200); g.fillRect(594, 546, 26, 200);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], 'table.png', { type: 'image/png' });
  const dt = new DataTransfer(); dt.items.add(file);
  const input = document.querySelector('#file'); input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return 'ok';
})()`);
console.log('attached', attached);
await sleep(2500);

const card = await ev(`(() => { const m = document.querySelector('#chat .msg:last-child');
  return { isBrief: !!m?.querySelector('#briefSelling'), opts: [...m.querySelectorAll('.opt-label')].map(x=>x.textContent.trim().split('手上有')[0].split('一句话')[0].slice(0,6)) }; })()`);
console.log('brief card', JSON.stringify(card));

if (OUT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
}

// 勾 45° + 侧面，卖点写一句，然后存
await ev(`document.querySelector('#chat .msg:last-child .opt-row[data-k="angles"] .chip[data-v="deg45"]').click()`);
await ev(`document.querySelector('#chat .msg:last-child .opt-row[data-k="angles"] .chip[data-v="side_right"]').click()`);
await ev(`document.querySelector('#chat .msg:last-child #briefSelling').value = '实木手工，老料新做';`);
await ev(`document.querySelector('#chat .msg:last-child [data-act="go"]').click()`);
await sleep(1500);
console.log('briefed', await ev(`(async () => { const { items } = await (await fetch('/api/products?limit=1')).json();
  const p = await (await fetch('/api/products/' + items[0].id)).json();
  return JSON.stringify(p.brief); })()`));

await sleep(6000);
const after = await ev(`(async () => { const { items } = await (await fetch('/api/products?limit=1')).json();
  const p = await (await fetch('/api/products/' + items[0].id)).json();
  const kinds = {}; for (const a of p.assets) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
  return { kinds, spec: p.visualSpec && { v: p.visualSpec.version, cat: p.visualSpec.category, base: p.visualSpec.palette?.base } }; })()`);
console.log('after', JSON.stringify(after));

const wh = await ev(`(() => { document.querySelector('#btnWarehouse').click();
  return { groups: [...document.querySelectorAll('#whBody .wh-group')].map(x=>x.textContent.trim().split(' ')[0]), items: document.querySelectorAll('#whBody .wh-item').length }; })()`);
console.log('warehouse', JSON.stringify(wh));
await sleep(600);
if (OUT) {
  const shot2 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT.replace(/\.png$/, '-wh.png'), Buffer.from(shot2.result.data, 'base64'));
}
ws.close();
