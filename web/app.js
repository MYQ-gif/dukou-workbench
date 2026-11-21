// 前端逻辑（主人 + 马配合）——原生 ES Module，无框架、无构建
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = { products: [], current: null, tab: 'image' };

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
    li.innerHTML = `<div class="t"></div><div class="m"></div>`;
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
    (state.current.targetLangs || []).join('/'),
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
    el.innerHTML = `<img src="${a.url}" alt=""><div class="cap"></div>`;
    el.querySelector('.cap').textContent = `${a.kind} · ${a.width}×${a.height} · ${a.meta?.model || ''}`;
    el.querySelector('img').onclick = () => window.open(a.url, '_blank');
    box.appendChild(el);
  }
}

/* ---------------- 任务 ---------------- */

function setJob(text, pct) {
  const bar = $('#job');
  if (text === null) {
    bar.classList.add('hidden');
    return;
  }
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

/* ---------------- 账本 ---------------- */

async function loadLedger() {
  if (!state.current) return;
  const data = await api(`/api/ledger?productId=${state.current.id}`);
  const s = data.summary;
  $('#summary').innerHTML = `
    <div class="stat"><div class="k">收入</div><div class="v">${s.income}</div></div>
    <div class="stat"><div class="k">成本</div><div class="v">${s.cost}</div></div>
    <div class="stat"><div class="k">利润</div><div class="v">${s.profit}</div></div>`;
  const ul = $('#ledgerList');
  ul.innerHTML = '';
  for (const e of data.items) {
    const li = document.createElement('li');
    li.innerHTML = `<span></span><span></span><span class="amt"></span>`;
    li.children[0].textContent = e.type;
    li.children[1].textContent = e.note || '';
    li.children[2].textContent = `${e.type === 'income' ? '+' : '-'}${e.amount} ${e.currency}`;
    ul.appendChild(li);
  }
}

/* ---------------- 事件 ---------------- */

$('#tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (!btn) return;
  state.tab = btn.dataset.tab;
  $$('.tab').forEach((t) => t.classList.toggle('active', t === btn));
  $$('.panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== state.tab));
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
    $('#imgHint').textContent = `已上传（${assetId}）。点「生成套图」开始做图。`;
    state.lastUpload = assetId;
  } catch (e) {
    setJob(null);
    alert(e.message);
  }
  ev.target.value = '';
};

$('#btnImage').onclick = () =>
  runJob(
    'image',
    { assetId: state.lastUpload || null, platform: state.current.platform, template: $('#template').value, lang: $('#imgLang').value },
    async () => {
      state.current = await api(`/api/products/${state.current.id}`);
      renderAssets();
      state.lastUpload = null;
    }
  );

$('#btnCopy').onclick = () =>
  runJob('copy', { lang: $('#copyLang').value }, (result) => {
    $('#copyOut').innerHTML = `
      <h3>标题</h3><div>${esc(result.title || '')}</div>
      <h3>卖点</h3><ul>${(result.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      <h3>详情</h3><div>${esc(result.detail || '')}</div>`;
  });

$('#btnVideo').onclick = () => {
  runJob('video', { targetLang: $('#vLang').value }, (result) => {
    $('#videoOut').innerHTML = `
      <h3>结果</h3>
      <div>${result.videoUrl ? `<video src="${result.videoUrl}" controls width="320"></video>` : '暂无成片（demo 模式）'}</div>
      <h3>字幕</h3>
      <table>${(result.subtitles || []).map((s) => `<tr><td>${s.start}s</td><td>${esc(s.text)}</td></tr>`).join('')}</table>`;
  });
};

$('#vfile').onchange = async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) alert('视频超过 15MB，demo 阶段先裁短一点');
  ev.target.value = '';
};

$('#btnLedger').onclick = async () => {
  const amount = Number($('#lAmount').value);
  if (!amount) return alert('填个金额');
  await api('/api/ledger', {
    method: 'POST',
    body: {
      productId: state.current.id,
      type: $('#lType').value,
      amount,
      note: $('#lNote').value.trim(),
    },
  });
  $('#lAmount').value = $('#lNote').value = '';
  loadLedger();
};

function esc(s) {
  return String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
}

/* ---------------- 启动 ---------------- */

(async function boot() {
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
