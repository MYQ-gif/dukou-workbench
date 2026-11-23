// 视觉备料自测：建商品 → 建 visual 任务 → 等完成 → 检查资产与 spec
const BASE = 'http://localhost:8787';

async function post(path, body) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
  return data;
}

const product = await post('/api/products', {
  title: '老榆木餐桌',
  platform: 'shopee',
  sellingPoints: ['实木手工', '老料新做'],
});

const job = await post('/api/jobs', {
  type: 'visual',
  productId: product.id,
  params: { platform: 'shopee', brief: { usage: '电商主图', market: '东南亚', selling: '整木无拼接' }, realAngles: [] },
});
console.log('job', job.jobId);

let done = null;
for (let i = 0; i < 40; i++) {
  const j = await (await fetch(`${BASE}/api/jobs/${job.jobId}`)).json();
  if (j.status === 'done' || j.status === 'failed') {
    done = j;
    break;
  }
  await new Promise((r) => setTimeout(r, 400));
}
if (!done) throw new Error('timeout');
console.log('status', done.status, done.error || '');
if (done.status !== 'done') process.exit(1);

const res = done.result || {};
console.log('assets', res.assets?.length, 'plan', JSON.stringify(res.plan));
console.log('spec', JSON.stringify({ version: res.spec?.version, category: res.spec?.category, base: res.spec?.palette?.base }));
console.log('analysis', JSON.stringify({ category: res.analysis?.category, sp: res.analysis?.selling_points, assumptions: res.analysis?.assumptions }));

const detail = await (await fetch(`${BASE}/api/products/${product.id}`)).json();
const kinds = {};
for (const a of detail.assets || []) kinds[a.kind] = (kinds[a.kind] || 0) + 1;
console.log('kinds', JSON.stringify(kinds));
console.log('visualSpec', detail.visualSpec ? `v${detail.visualSpec.version}` : 'none');
