// 多图上传 + 详情页不展示精修：UI 级自测（CDP）
// 用法：node scripts/uploadcheck.mjs [截图前缀]
import fs from 'node:fs';
const PORT = process.env.PORT || '8790';

const CDP = 'http://127.0.0.1:9334';
const out = process.argv[2] || 'docs/preview-upload.png';
const list = await (await fetch(`${CDP}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && new RegExp(String(PORT)).test(t.url));
if (!page) throw new Error('没有找到 localhost:${PORT} 的页面');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result?.result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.navigate', { url: `http://localhost:${PORT}/` });
await wait(2600);

// 用工程里两张现成的 jpg 造 File，塞进 input
const files = ['_probe/headphones.jpg', '_probe/headphones-small.jpg'].map((p) => {
  const abs = `C:/Users/20708/Documents/deepseek-harness/default-workspace/dukou-workbench/${p}`;
  return { name: p.split('/').pop(), b64: fs.readFileSync(abs).toString('base64') };
});
const injected = await ev(`(async () => {
  const mk = (name, b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: 'image/jpeg' });
  };
  const dt = new DataTransfer();
  for (const f of ${JSON.stringify(files)}) dt.items.add(mk(f.name, f.b64));
  const input = document.querySelector('#file');
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  return dt.files.length;
})()`);
await wait(1800);

const afterUpload = await ev(`(() => ({
  attach: document.querySelector('#attachInfo')?.textContent,
  uploads: (window.state?.uploads || []).length,
  products: [...document.querySelectorAll('#prodSel option')].filter(o => o.value).length,
  asks: document.querySelectorAll('#chat .ask-q').length,
  refinedShots: [...document.querySelectorAll('#chat .shots img')].filter(img => /refined|angle/i.test(img.alt || '')).length,
}))()`);
console.log('注入文件数', injected);
console.log('上传后', JSON.stringify(afterUpload));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
ws.close();
