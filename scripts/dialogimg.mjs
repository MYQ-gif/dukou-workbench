// 自测：带图片附件时，询问框应显示缩略图；确认后按所选规格出图
import { writeFileSync } from 'node:fs';
const CDP = process.env.CDP || 'http://127.0.0.1:9334';
const OUT = process.argv[2] || '';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /localhost:8787/.test(t.url));
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

// 用库里已有的一张图当"用户上传的原图"，构造 File 塞进 input
const attached = await ev(`(async () => {
  const { items } = await (await fetch('/api/products?limit=1')).json();
  const p = await (await fetch('/api/products/' + items[0].id)).json();
  const a = p.assets.find((x) => x.kind !== 'copy');
  const blob = await (await fetch(a.url)).blob();
  const file = new File([blob], 'table.svg', { type: blob.type || 'image/svg+xml' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const input = document.querySelector('#file');
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return a.url;
})()`);
console.log('attached', attached);
await sleep(2000);
console.log('attachInfo', await ev(`document.querySelector('#attachInfo').textContent`));

await ev(`(() => { const a = document.querySelector('#ask'); a.value = '按这张桌子出一组图'; document.querySelector('#btnSend').click(); })()`);
await sleep(700);
const st = await ev(`(() => { const d = document.querySelector('#askDlg'); const t = document.querySelector('.dlg-thumb'); return { open: d.open, thumb: t ? t.naturalWidth : 0, sub: document.querySelector('#dlgSub').textContent.trim() }; })()`);
console.log('dialog', JSON.stringify(st));

if (OUT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'));
}

// 选 自定义尺寸 600×900 + 4K
await ev(`document.querySelector('#wCustom').value = '600'; document.querySelector('#wCustom').dispatchEvent(new Event('input', {bubbles:true}));`);
await ev(`document.querySelector('#hCustom').value = '900'; document.querySelector('#hCustom').dispatchEvent(new Event('input', {bubbles:true}));`);
await ev(`document.querySelector('#optQuality .chip[data-quality="4k"]').click()`);
await sleep(200);
console.log('hint', await ev(`document.querySelector('#sizeHint').textContent`), '|', await ev(`document.querySelector('#cntHint').textContent`));
await ev(`document.querySelector('#dlgGo').click()`);
await sleep(4000);

const after = await ev(`(async () => {
  const { items } = await (await fetch('/api/products?limit=1')).json();
  const p = await (await fetch('/api/products/' + items[0].id)).json();
  const imgs = p.assets.filter((a) => a.kind !== 'upload' && a.kind !== 'copy');
  return { total: imgs.length, last: imgs.slice(-2).map((a) => a.width + 'x' + a.height + ' ' + a.meta.quality) };
})()`);
console.log('after', JSON.stringify(after));
ws.close();
