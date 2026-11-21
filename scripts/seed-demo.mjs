// 开发用：往本地服务灌一份示例数据，方便联调时页面不空。
// 用法：node scripts/seed-demo.mjs  （服务需先起来；会写进 data/db.json）
// 提交演示前记得删掉 data/ 目录，别把假数据带上线。

const BASE = process.env.BASE || 'http://localhost:8787';

const DEMO = {
  title: '老榆木餐桌',
  platform: 'shopee',
  sellingPoints: ['实木手工', '老料新做', '一口价含运费'],
  rawText: '老爸给奶奶手做的桌子，桌面有岁月痕迹，桌角有磨圆。',
  targetLangs: ['en', 'th'],
};

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

async function waitJob(jobId) {
  for (let i = 0; i < 40; i++) {
    const job = await (await fetch(`${BASE}/api/jobs/${jobId}`)).json();
    if (job.status === 'done' || job.status === 'failed') return job;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('job timeout');
}

const product = await post('/api/products', DEMO);
console.log('product', product.id, product.title);

for (const [template, lang] of [['main', 'en'], ['detail', 'th']]) {
  const job = await post('/api/jobs', { type: 'image', productId: product.id, params: { platform: DEMO.platform, template, lang } });
  const done = await waitJob(job.jobId);
  console.log('image', template, lang, done.status, (done.result?.assets || []).length, 'assets');
}

const copy = await post('/api/jobs', { type: 'copy', productId: product.id, params: { lang: 'en' } });
const copyDone = await waitJob(copy.jobId);
console.log('copy', copyDone.status, copyDone.result?.title);

for (const entry of [
  { type: 'income', amount: 128.5, note: '首单' },
  { type: 'shipping', amount: 30, note: '海运' },
  { type: 'ads', amount: 18, note: '关键词广告' },
]) {
  await post('/api/ledger', { productId: product.id, currency: 'CNY', ...entry });
  const { summary } = await (await fetch(`${BASE}/api/ledger?productId=${product.id}`)).json();
  console.log('ledger', entry.type, entry.amount, '→ 利润', summary.profit);
}

console.log('\n打开 http://localhost:8787 看效果');
