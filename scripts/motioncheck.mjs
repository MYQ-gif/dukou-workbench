// 动效自测：仓库多选 / 删除 / 波形 / 张数滑块 / 新消息揭示类
import fs from 'node:fs';
const PORT = process.env.PORT || '8790';
const CDP = 'http://127.0.0.1:9334';
const out = process.argv[2] || 'docs/preview-motion.png';
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
await send('Page.navigate', { url: `http://localhost:${PORT}/` });
await wait(2500);

// 选一个已有商品
const pid = await evalJs(`(async () => { const r = await fetch('/api/products').then(x => x.json()); return (r.items || r.products || [])[0]?.id || null; })()`);
console.log('product', pid);
await evalJs(`(async () => { await window.__pick ? window.__pick('${pid}') : null; return true; })()`);
await evalJs(`document.querySelectorAll('#prodSel option').length`);
await evalJs(`(() => { const s = document.querySelector('#prodSel'); s.value = '${pid}'; s.dispatchEvent(new Event('change')); return true; })()`);
await wait(1200);

// 打开仓库 → 进入选择模式 → 选两张
await evalJs(`document.querySelector('#btnWarehouse').click(); true`);
await wait(500);
await evalJs(`document.querySelector('#whSel').click(); true`);
await wait(400);
const counts = await evalJs(`({ items: document.querySelectorAll('.wh-item').length, picks: document.querySelectorAll('.pick').length })`);
console.log('仓库', JSON.stringify(counts));

await evalJs(`(() => { const a = document.querySelectorAll('.wh-item'); a[0]?.click(); a[1]?.click(); return true; })()`);
await wait(300);
const bar = await evalJs(`({ text: document.querySelector('#whBarText').textContent, del: !document.querySelector('#whDel').disabled, picked: document.querySelectorAll('.wh-item.picked').length })`);
console.log('选中', JSON.stringify(bar));
await shot(out);

// 删除前两张
await evalJs(`document.querySelector('#whDel').click(); true`);
await wait(1200);
const after = await evalJs(`({ items: document.querySelectorAll('.wh-item').length, picked: document.querySelectorAll('.wh-item.picked').length })`);
console.log('删除后', JSON.stringify(after));
const toastState = await evalJs(`({ shown: document.querySelector('#toast').classList.contains('show'), text: document.querySelector('#toastText').textContent, undo: !document.querySelector('#toastUndo').classList.contains('hidden') })`);
console.log('撤销条', JSON.stringify(toastState));
await shot(out.replace('.png', '-toast.png'));
await evalJs(`document.querySelector('#toastUndo').click(); true`);
await wait(1400);
console.log('恢复后', await evalJs(`document.querySelectorAll('.wh-item').length`));

// 参数卡滑块 + 波纹 + fresh 类
await evalJs(`document.querySelector('#whClose')?.click(); true`);
await wait(300);
const rippleOk = await evalJs(`(() => { const t = document.querySelector('.tab'); const r = t.getBoundingClientRect(); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 8, clientY: r.top + 8 })); return !!t.querySelector('.ripple'); })()`);
console.log('波纹', rippleOk);
await evalJs(`(() => { const i = document.querySelector('#ask'); i.value = '白底主图，标题写 STAY A WHILE'; document.querySelector('#btnSend').click(); return true; })()`);
await wait(900);
const ask = await evalJs(`({ slider: !!document.querySelector('#cntRange'), ticks: document.querySelectorAll('.snap-ticks span').length, fresh: !!document.querySelector('.msg.ai.fresh') })`);
console.log('参数卡', JSON.stringify(ask));
await shot(out.replace('.png', '-ask.png'));
console.log('saved', out);
ws.close();
