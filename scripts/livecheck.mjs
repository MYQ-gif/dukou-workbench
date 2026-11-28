// 真链路冒烟：建商品 → 文案（TEXT）→ 出图（IMAGE）→ 打印耗时与产物
const PORT = process.env.PORT || '8790';
const BASE = `http://localhost:${PORT}`;

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function waitJob(id, timeoutMs = 180000) {
  const t0 = Date.now();
  for (;;) {
    const j = await (await fetch(`${BASE}/api/jobs/${id}`)).json();
    if (j.status === 'done' || j.status === 'failed') return { job: j, ms: Date.now() - t0 };
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout ' + id);
    await new Promise((r) => setTimeout(r, 700));
  }
}

const p = await post('/api/products', {
  title: '老榆木餐桌 LIVE',
  platform: 'shopee',
  market: 'sg',
  sellingPoints: ['实木手工', '老料新做', '一口价含运费'],
  rawText: '老爸给奶奶手做的桌子，桌面有岁月痕迹，桌角磨圆。',
});
console.log('product', p.id);

const t0 = Date.now();
const copy = await post('/api/jobs', { type: 'copy', productId: p.id, params: { lang: 'en' } });
const c = await waitJob(copy.jobId);
console.log(`copy  ${c.job.status} ${c.ms}ms ->`, c.job.result?.title || c.job.error);

const img = await post('/api/jobs', {
  type: 'image',
  productId: p.id,
  params: { template: 'main', platform: 'shopee', lang: 'en', count: 2, quality: '2k' },
});
const i = await waitJob(img.jobId);
console.log(`image ${i.job.status} ${i.ms}ms -> ${(i.job.result?.assets || []).length} 张`, i.job.error || '');

const detail = await (await fetch(`${BASE}/api/products/${p.id}`)).json();
for (const a of detail.assets || []) {
  console.log(' ', a.kind, a.meta?.w + 'x' + a.meta?.h, a.meta?.model || '', a.url || a.meta?.text?.slice(0, 40) || '');
}
console.log('total', Date.now() - t0, 'ms');
