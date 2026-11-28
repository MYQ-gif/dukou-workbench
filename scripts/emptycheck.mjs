// 验证：初始不选商品；说话后自动建；下拉可切回已有商品
const PORT = process.env.PORT || '8790';
const CDP = 'http://127.0.0.1:9334';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && new RegExp(String(PORT)).test(t.url));
if (!page) throw new Error('no page target');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
});
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `http://localhost:${PORT}/` });
await new Promise((r) => setTimeout(r, 2500));

const first = await evalJs(`(() => ({
  title: document.querySelector('#hTitle').textContent,
  meta: document.querySelector('#pMeta').textContent,
  sel: document.querySelector('#prodSel').value,
  tiles: document.querySelectorAll('.tile').length,
  empty: /还没/.test(document.querySelector('#chat').innerText),
}))()`);
console.log('initial', JSON.stringify(first));

// 说一句话 → 自动建商品
await evalJs(`(() => {
  const i = document.querySelector('#ask');
  i.value = '测试商品 一句话开张';
  document.querySelector('#btnSend').click();
  return true;
})()`);
await new Promise((r) => setTimeout(r, 1200));
const afterAsk = await evalJs(`(() => {
  const card = document.querySelector('.ask-q');
  if (card) card.querySelector('[data-act="cancel"]')?.click();
  return { card: !!card, title: document.querySelector('#hTitle').textContent };
})()`);
await new Promise((r) => setTimeout(r, 1500));
const afterCreate = await evalJs(`(() => ({
  title: document.querySelector('#hTitle').textContent,
  sel: document.querySelector('#prodSel').value,
  options: [...document.querySelectorAll('#prodSel option')].map((o) => o.textContent),
}))()`);
console.log('afterAsk', JSON.stringify(afterAsk));
console.log('afterCreate', JSON.stringify(afterCreate));

// 刷新后应停在入口页，不自动选
await send('Page.navigate', { url: `http://localhost:${PORT}/` });
await new Promise((r) => setTimeout(r, 2500));
const reload = await evalJs(`(() => ({
  title: document.querySelector('#hTitle').textContent,
  sel: document.querySelector('#prodSel').value,
  meta: document.querySelector('#pMeta').textContent,
}))()`);
console.log('reload', JSON.stringify(reload));
ws.close();
