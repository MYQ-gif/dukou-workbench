const PORT = process.env.PORT || '8790';
﻿// 自测：商品抽屉 + 搜索。
// 用法：node scripts/pickcheck.mjs [截图路径]
const BASE = process.env.BASE || `http://localhost:${PORT}`;
const SHOT = process.argv[2] || 'docs/preview-picker.png';

const api = async (path, init) => {
  const res = await fetch(BASE + path, init);
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
  return data;
};

// 造 12 个商品，名字里留可搜的关键词
const NAMES = [
  '老榆木餐桌', '老榆木书桌', '实木餐椅', '藤编收纳篮', '亚麻窗帘',
  '陶瓷马克杯', '黄铜台灯', '棉麻抱枕', '手工皂礼盒', '竹编托盘',
  '橡木床头柜', '铸铁花盆',
];
const made = [];
for (const title of NAMES) {
  const p = await api('/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, platform: 'shopee', sellingPoints: ['实木', '手工'] }),
  });
  made.push(p.id);
}
console.log('made', made.length, 'products');

const tl = await (await fetch('http://127.0.0.1:9334/json/list')).json();
const page = tl.find((t) => t.type === 'page' && new RegExp(String(PORT)).test(t.url));
if (!page) throw new Error('没找到页面');
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/` });
await new Promise((r) => setTimeout(r, 2600));

// 1) 抽屉关着的状态
console.log('drawer hidden:', await evalJs(`document.querySelector('#pd').classList.contains('hidden')`));

// 2) 打开抽屉，数条目
await evalJs(`document.querySelector('#btnProducts').click(); true`);
await new Promise((r) => setTimeout(r, 400));
const all = await evalJs(`document.querySelectorAll('#pdList .pd-item').length`);
console.log('items:', all);

// 3) 搜索过滤
await evalJs(`(() => { const s = document.querySelector('#pdSearch'); s.value = '榆木'; s.dispatchEvent(new Event('input')); return true; })()`);
await new Promise((r) => setTimeout(r, 300));
const filtered = await evalJs(`[...document.querySelectorAll('#pdList .pd-item-t')].map(x => x.textContent)`);
console.log('filtered:', filtered.join(' / '));
const shot = await send('Page.captureScreenshot', { format: 'png' });
(await import('node:fs')).writeFileSync(SHOT, Buffer.from(shot.result.data, 'base64'));
console.log('saved', SHOT);

// 4) 搜不到时的空态
await evalJs(`(() => { const s = document.querySelector('#pdSearch'); s.value = 'zzz'; s.dispatchEvent(new Event('input')); return true; })()`);
await new Promise((r) => setTimeout(r, 300));
console.log('empty:', await evalJs(`document.querySelector('#pdList .pd-empty')?.textContent`));

// 5) 回到榆木、点第一条，断言选中
await evalJs(`(() => { const s = document.querySelector('#pdSearch'); s.value = '榆木'; s.dispatchEvent(new Event('input')); return true; })()`);
await new Promise((r) => setTimeout(r, 300));
const picked = await evalJs(`(() => { const b = document.querySelector('#pdList .pd-item'); b.click(); return b.querySelector('.pd-item-t').textContent; })()`);
await new Promise((r) => setTimeout(r, 1200));
const after = await evalJs(`({ title: document.querySelector('#hTitle').textContent, picker: document.querySelector('#pdName').textContent, drawer: document.querySelector('#pd').classList.contains('hidden') })`);
console.log('picked:', picked, '→', JSON.stringify(after));

if (all < 12) throw new Error(`抽屉条目应该 ≥12，实际 ${all}`);
if (filtered.length !== 2) throw new Error(`搜「榆木」应该 2 条，实际 ${filtered.length}`);
if (!after.drawer) throw new Error('选完抽屉应该关闭');
if (after.title !== picked) throw new Error('标题没跟着切换');
ws.close();
