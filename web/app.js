// 前端逻辑 —— 原生 ES Module，无框架、无构建
// 分工：套图 / 记账 = 主人；视频翻译 = 马；接口层 = 卓
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = { products: [], current: null, tab: 'image', lastUpload: null, video: null };

/* ---------------- API ---------------- */

async function api(path, { method = 'GET', body, headers } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

/* ---------------- 商品 ---------------- */

async function loadProducts() {
  const { items } = await api('/api/products?limit=50');
  state.products = items;
  $('#count').textContent = items.length;
  renderList();
  if (!state.current && items.length) selectProduct(items[0].id);
}

function renderList() {
  const ul = $('#list');
  ul.innerHTML = '';
  for (const p of state.products) {
    const li = document.createElement('li');
    if (state.current && state.current.id === p.id) li.classList.add('on');
    li.innerHTML = '<div class="t"></div><div class="m"></div>';
    li.querySelector('.t').textContent = p.title;
    li.querySelector('.m').textContent = `${p.platform} · ${p.status}`;
    li.onclick = () => selectProduct(p.id);
    ul.appendChild(li);
  }
}

async function selectProduct(id) {
  state.current = await api(`/api/products/${id}`);
  $('#pTitle').textContent = state.current.title;
  $('#pMeta').textContent = [
    state.current.platform,
    (state.current.targetLangs || []).join(' / '),
    `${(state.current.assets || []).length} 个素材`,
  ].join(' · ');
  renderAssets();
  loadLedger();
}

function renderAssets() {
  const box = $('#assets');
  box.innerHTML = '';
  const assets = (state.current?.assets || []).filter((a) => a.kind !== 'upload');
  if (!assets.length) {
    $('#imgHint').textContent = '还没有产品图。上传一张原图，点「生成套图」。';
    return;
  }
  $('#imgHint').textContent = `共 ${assets.length} 张 · 点图可放大`;
  for (const a of assets) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = '<img src="" alt=""><div class="cap"></div>';
    const img = el.querySelector('img');
    img.src = a.url;
    img.onclick = () => window.open(a.url, '_blank');
    el.querySelector('.cap').textContent = `${a.kind} · ${a.width}×${a.height} · ${a.meta?.model || ''}`;
    box.appendChild(el);
  }
}

/* ---------------- 任务 ---------------- */

function setJob(text, pct) {
  const bar = $('#job');
  if (text === null) return bar.classList.add('hidden');
  bar.classList.remove('hidden');
  $('#jobText').textContent = text;
  $('#jobBar').style.width = `${pct || 0}%`;
}

async function runJob(type, params, onDone) {
  if (!state.current) return alert('先建一个商品');
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: { type, productId: state.current.id, params },
    });
    setJob('排队中…', 3);
    const timer = setInterval(async () => {
      try {
        const job = await api(`/api/jobs/${jobId}`);
        setJob(`${type} · ${job.status}`, job.progress);
        if (job.status === 'done') {
          clearInterval(timer);
          setJob(null);
          await onDone(job.result);
        } else if (job.status === 'failed') {
          clearInterval(timer);
          setJob(null);
          alert(`任务失败：${job.error?.message || ''}`);
        }
      } catch (e) {
        clearInterval(timer);
        setJob(null);
        alert(e.message);
      }
    }, 1200);
  } catch (e) {
    setJob(null);
    alert(e.message);
  }
}

/* ---------------- 上传 ---------------- */

async function uploadFile(file, query = '') {
  const buf = await file.arrayBuffer();
  const res = await fetch(`/api/uploads${query}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream', 'x-filename': file.name },
    body: buf,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || '上传失败');
  return data;
}

/* ---------------- 记账 ---------------- */

async function loadLedger() {
  if (!state.current) return;
  const data = await api(`/api/ledger?productId=${state.current.id}`);
  const s = data.summary;
  $('#summary').innerHTML = `
    <div class="stat income"><div class="k">收入</div><div class="v">${s.income}</div></div>
    <div class="stat cost"><div class="k">成本</div><div class="v">${s.cost}</div></div>
    <div class="stat profit"><div class="k">利润</div><div class="v">${s.profit}</div></div>`;
  const ul = $('#ledgerList');
  ul.innerHTML = '';
  if (!data.items.length) {
    ul.innerHTML = '<li style="grid-template-columns:1fr;color:#8b9bad">还没有账目。卖出一单就记一笔收入，运费广告也记上，利润才是真的。</li>';
    return;
  }
  for (const e of data.items) {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><span></span><span class="amt"></span>';
    li.children[0].textContent = label(e.type);
    li.children[1].textContent = e.note || '';
    const sign = e.type === 'income' ? '+' : '-';
    li.children[2].textContent = `${sign}${e.amount} ${e.currency}`;
    li.children[2].classList.add(e.type === 'income' ? 'plus' : 'minus');
    ul.appendChild(li);
  }
}

const TYPES = { income: '收入', cost: '成本', fee: '平台费', shipping: '运费', ads: '广告', refund: '退款' };
const label = (t) => TYPES[t] || t;

/* ---------------- 接口面板（卓的范围） ---------------- */

const ENDPOINTS = [
  ['GET', '/api/health', '健康检查', '卓'],
  ['POST', '/api/products', '建商品', '卓'],
  ['GET', '/api/products', '商品列表（分页）', '卓'],
  ['GET', '/api/products/:id', '商品详情（assets 展开）', '卓'],
  ['PATCH', '/api/products/:id', '更新商品', '卓'],
  ['POST', '/api/uploads', '上传素材（raw body）', '卓'],
  ['POST', '/api/jobs', '建任务 image/copy/video', '卓'],
  ['GET', '/api/jobs/:id', '查任务进度', '卓'],
  ['POST', '/api/ledger', '记一笔', '卓'],
  ['GET', '/api/ledger', '账目 + 汇总', '卓'],
];

function renderEndpoints() {
  $('#endpoints').innerHTML = ENDPOINTS.map(([m, p, d, who]) => `
    <div class="row-e">
      <span class="m ${m}">${m}</span>
      <code>${p}</code>
      <span>${d}</span>
      <span class="who">${who}</span>
    </div>`).join('');
}

async function pingAll() {
  const out = $('#pingResult');
  out.textContent = '检测中…';
  const checks = [
    ['GET', '/api/health'],
    ['GET', '/api/products?limit=5'],
    ['GET', '/api/ledger'],
  ];
  const results = [];
  for (const [method, path] of checks) {
    const t0 = performance.now();
    try {
      const res = await fetch(path, { method });
      results.push(`${path} → ${res.status} (${Math.round(performance.now() - t0)}ms)`);
    } catch (e) {
      results.push(`${path} → 失败`);
    }
  }
  out.textContent = results.join('　|　');
}

/* ---------------- 事件 ---------------- */

function switchTab(name) {
  const btn = $$('.tab').find((t) => t.dataset.tab === name);
  if (!btn) return;
  state.tab = name;
  $$('.tab').forEach((t) => t.classList.toggle('active', t === btn));
  $$('.panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== name));
  history.replaceState(null, '', `#${name}`);
}

$('#tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

$('#btnNew').onclick = () => $('#dlg').showModal();

$('#dlg').addEventListener('close', async () => {
  if ($('#dlg').returnValue !== 'ok') return;
  const title = $('#newTitle').value.trim();
  if (!title) return;
  const product = await api('/api/products', {
    method: 'POST',
    body: {
      title,
      platform: $('#newPlatform').value,
      sellingPoints: $('#newPoints').value.split(/[,，]/).map((x) => x.trim()).filter(Boolean),
      rawText: $('#newRaw').value.trim(),
      targetLangs: ['en'],
    },
  });
  $('#newTitle').value = $('#newPoints').value = $('#newRaw').value = '';
  await loadProducts();
  selectProduct(product.id);
});

$('#file').onchange = async (ev) => {
  const file = ev.target.files[0];
  if (!file || !state.current) return;
  try {
    setJob('上传中…', 20);
    const { assetId } = await uploadFile(file, `?productId=${state.current.id}`);
    setJob(null);
    state.lastUpload = assetId;
    $('#imgHint').textContent = '已上传。点「生成套图」开始做图。';
  } catch (e) {
    setJob(null);
    alert(e.message);
  }
  ev.target.value = '';
};

$('#btnImage').onclick = () =>
  runJob(
    'image',
    { assetId: state.lastUpload, platform: state.current.platform, template: $('#template').value, lang: $('#imgLang').value },
    async () => {
      state.current = await api(`/api/products/${state.current.id}`);
      renderAssets();
      state.lastUpload = null;
    }
  );

$('#btnCopy').onclick = () =>
  runJob('copy', { lang: $('#imgLang').value }, (result) => {
    $('#copyOut').innerHTML = `
      <h3>标题</h3><div>${esc(result.title || '')}</div>
      <h3>卖点</h3><ul>${(result.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      <h3>详情</h3><div>${esc(result.detail || '')}</div>`;
  });

$('#vfile').onchange = (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  state.video = file;
  $('#vMeta').textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)}MB`;
  if (file.size > 15 * 1024 * 1024) $('#vMeta').textContent += ' · 超过 15MB，先裁短';
  ev.target.value = '';
};

$('#btnVideo').onclick = () =>
  runJob('video', { targetLang: $('#vLang').value, filename: state.video?.name || null }, (result) => {
    const rows = (result.subtitles || [])
      .map((s) => `<tr><td style="width:88px;color:#8b9bad">${s.start}–${s.end}s</td><td>${esc(s.text)}</td></tr>`)
      .join('');
    $('#videoOut').innerHTML = `
      <h3>结果</h3>
      <div class="muted">${result.videoUrl ? '成片已生成' : '当前是 mock：只出字幕，不出成片（48 小时内不做 lip sync）'}</div>
      <h3>字幕</h3>
      <table>${rows}</table>`;
  });

$('#btnLedger').onclick = async () => {
  const amount = Number($('#lAmount').value);
  if (!amount) return alert('填个金额');
  await api('/api/ledger', {
    method: 'POST',
    body: { productId: state.current.id, type: $('#lType').value, amount, note: $('#lNote').value.trim() },
  });
  $('#lAmount').value = $('#lNote').value = '';
  loadLedger();
};

$('#btnPing').onclick = pingAll;

function esc(s) {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

/* ---------------- 启动 ---------------- */

(async function boot() {
  renderEndpoints();
  const hash = location.hash.replace('#', '');
  if (['image', 'video', 'ledger', 'api'].includes(hash)) switchTab(hash);
  try {
    const h = await api('/api/health');
    const el = $('#health');
    el.textContent = `服务正常 · ${h.aiMode}`;
    el.classList.add('ok');
  } catch {
    const el = $('#health');
    el.textContent = '服务未连接';
    el.classList.add('bad');
  }
  await loadProducts();
})();
