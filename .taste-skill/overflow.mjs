// 排查窄屏溢出：列出比视口宽的元素
const CDP = process.env.CDP || 'http://127.0.0.1:9335';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && /localhost:8787/.test(t.url));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

console.log('viewport', await ev('innerWidth'));
console.log('scrollWidth', await ev('document.documentElement.scrollWidth'));
const out = await ev(`(() => {
  const vw = innerWidth; const bad = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.right > vw + 1 || r.left < -1) bad.push(\`\${el.tagName.toLowerCase()}.\${el.className||''} left=\${Math.round(r.left)} right=\${Math.round(r.right)} w=\${Math.round(r.width)}\`);
  }
  return bad.slice(0, 12).join('\\n');
})()`);
console.log(out);
ws.close();
