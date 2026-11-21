// 前端逻辑 —— 原生 ES Module，无框架、无构建
// 分工：生图 / 记账 = 主人；视频翻译 = 马；接口层 = 卓
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

async function loadProducts(preferId) {
  const { items } = await api('/api/products?limit=50');
  state.products = items;
  const sel = $('#prodSel');
  sel.innerHTML = items.length
    ? items.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')
    : '<option value="">还没有商品</option>';
  if (!items.length) {
    state.current = null;
    $('#pMeta').textContent = '点「新建商品」开始';
    chatReset();
    return;
  }
  const target = preferId || state.current?.id || items[0].id;
  sel.value = items.find((p) => p.id === target) ? target : items[0].id;
  await selectProduct(sel.value);
}

async function selectProduct(id) {
  state.current = await api(`/api/products/${id}`);
  const p = state.current;
  $('#pMeta').textContent = [
    p.platform,
    (p.targetLangs || []).join(' / '),
    `${(p.assets || []).filter((a) => a.kind !== 'upload').length} 张图`,
  ].join(' · ');
  chatReset();
  loadLedger();
}

/* ---------------- 对话 ---------------- */

function chatReset() {
  const box = $('#chat');
  box.innerHTML = '<div class="chat-inner"></div>';
  const inner = box.querySelector('.chat-inner');
  const p = state.current;
  const done = (p?.assets || []).filter((a) => a.kind !== 'upload');
  const el = say(
    inner,
    'ai',
    `<p>${p ? `「${esc(p.title)}」已经就位。` : '先点右上角「新建商品」，我再开始给你做图。'}</p>
     <p>发一张商品原图，选好模板和语言，点发送——我出套图。也可以直接在输入框里提要求。</p>
     ${done.length ? '<h3>已有素材</h3>' : ''}`
  );
  if (done.length) shots(el.querySelector('.bubble'), done);
  inner.scrollIntoView({ block: 'end' });
}

function say(container, who, html) {
  const el = document.createElement('div');
  el.className = `msg ${who}`;
  if (who === 'ai') {
    el.innerHTML = '<div class="avatar">渡</div><div class="bubble"></div>';
    el.querySelector('.bubble').innerHTML = html;
  } else {
    el.innerHTML = '<div class="bubble"></div>';
    el.querySelector('.bubble').innerHTML = html;
  }
  container.appendChild(el);
  const scroller = el.closest('.chat');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  return el;
}

function shots(bubble, assets) {
  const wrap = document.createElement('div');
  wrap.className = 'shots';
  for (const a of assets) {
    const fig = document.createElement('figure');
    fig.innerHTML = `<img src="${a.url}" alt=""><figcaption>${a.kind} · ${a.width}×${a.height}</figcaption>`;
    const img = fig.querySelector('img');
    img.onclick = () => window.open(a.url, '_blank');
    img.onload = () => {
      const scroller = bubble.closest('.chat');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    };
    wrap.appendChild(fig);
  }
  bubble.appendChild(wrap);
}

function progressBubble(text) {
  const inner = $('#chat .chat-inner');
  const el = say(inner, 'ai', `<p>${text}</p><div class="progress"><div class="bar"><i></i></div><span>0%</span></div>`);
  return {
    update(pct, label) {
      el.querySelector('.bar i').style.width = `${pct}%`;
      el.querySelector('.progress span').textContent = `${pct}%${label ? ' · ' + label : ''}`;
    },
    done() { el.remove(); },
  };
}

/* ---------------- 上传 ---------------- */

async function uploadFile(file) {
  const buf = await file.arrayBuffer();
  const res = await fetch(`/api/uploads${state.current ? `?productId=${state.current.id}` : ''}`, {
    method: 'POST',
    headers: { 'content-type': file.type || 'application/octet-stream', 'x-filename': file.name },
    body: buf,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || '上传失败');
  return data;
}

/* ---------------- 任务 ---------------- */

function jobPromise(jobId, onTick) {
  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      try {
        const job = await api(`/api/jobs/${jobId}`);
        onTick?.(job);
        if (job.status === 'done') { clearInterval(timer); resolve(job.result); }
        else if (job.status === 'failed') { clearInterval(timer); reject(new Error(job.error?.message || '任务失败')); }
      } catch (e) { clearInterval(timer); reject(e); }
    }, 1000);
  });
}

async function doImage(askText) {
  if (!state.current) return $('#dlg').showModal();
  const inner = $('#chat .chat-inner');
  const before = new Set((state.current.assets || []).map((a) => a.id));
  const tpl = $('#template').value;
  const lang = $('#imgLang').value;

  const thumb = state.lastUploadPreview ? `<img class="thumb" src="${state.lastUploadPreview}" alt="">` : '';
  const userEl = say(inner, 'user', `${askText ? `<p>${esc(askText)}</p>` : ''}${thumb}<p style="opacity:.85;font-size:12px">${tplLabel(tpl)} · ${langLabel(lang)}</p>`);
  void userEl;

  const box = progressBubble('正在出图…');
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: { type: 'image', productId: state.current.id, params: { assetId: state.lastUpload, platform: state.current.platform, template: tpl, lang, prompt: askText || undefined } },
    });
    const result = await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    state.current = await api(`/api/products/${state.current.id}`);
    const fresh = (state.current.assets || []).filter((a) => a.kind !== 'upload' && !before.has(a.id));
    const bubble = say(inner, 'ai', `<p>${fresh.length ? `出好了 ${fresh.length} 张。` : '任务完成。'}</p>`);
    if (fresh.length) shots(bubble.querySelector('.bubble'), fresh);
    $('#pMeta').textContent = $('#pMeta').textContent.replace(/\d+ 张图/, `${(state.current.assets || []).filter((a) => a.kind !== 'upload').length} 张图`);
    state.lastUpload = null;
    state.lastUploadPreview = null;
    $('#attachInfo').textContent = '未附图片';
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p style="color:#f27e4c">出图失败：${esc(e.message)}</p>`);
  }
}

async function doCopy() {
  if (!state.current) return $('#dlg').showModal();
  const inner = $('#chat .chat-inner');
  say(inner, 'user', '<p>只要文案</p>');
  const box = progressBubble('正在写文案…');
  try {
    const { jobId } = await api('/api/jobs', { method: 'POST', body: { type: 'copy', productId: state.current.id, params: { lang: $('#imgLang').value } } });
    const result = await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    say(inner, 'ai', `
      <h3>标题</h3><p>${esc(result.title || '')}</p>
      <h3>卖点</h3><ul>${(result.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      <h3>详情</h3><p>${esc(result.detail || '')}</p>`);
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p style="color:#f27e4c">失败：${esc(e.message)}</p>`);
  }
}

const tplLabel = (t) => ({ main: '主图', marketing: '营销图', detail: '详情页' }[t] || t);
const langLabel = (l) => ({ en: '英语', th: '泰语', vi: '越南语' }[l] || l);

/* ---------------- 记账 ---------------- */

async function loadLedger() {
  if (!state.current) {
    $('#summary').innerHTML = '';
    $('#ledgerList').innerHTML = '';
    return;
  }
  const data = await api(`/api/ledger?productId=${state.current.id}`);
  const s = data.summary;
  $('#summary').innerHTML = `
    <div class="stat income"><div class="k">收入</div><div class="v">${s.income}</div></div>
    <div class="stat cost"><div class="k">成本</div><div class="v">${s.cost}</div></div>
    <div class="stat profit"><div class="k">利润</div><div class="v">${s.profit}</div></div>`;
  const ul = $('#ledgerList');
  ul.innerHTML = '';
  if (!data.items.length) {
    ul.innerHTML = '<li style="grid-template-columns:1fr;color:#8b9bad">还没有账目。卖出一单记一笔收入，运费广告也记上，利润才是真的。</li>';
    return;
  }
  for (const e of data.items) {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><span></span><span class="amt"></span>';
    li.children[0].textContent = label(e.type);
    li.children[1].textContent = e.note || '';
    li.children[2].textContent = `${e.type === 'income' ? '+' : '-'}${e.amount} ${e.currency}`;
    li.children[2].classList.add(e.type === 'income' ? 'plus' : 'minus');
    ul.appendChild(li);
  }
}

const TYPES = { income: '收入', cost: '成本', fee: '平台费', shipping: '运费', ads: '广告', refund: '退款' };
const label = (t) => TYPES[t] || t;

/* ---------------- 接口面板 ---------------- */

const ENDPOINTS = [
  ['GET', '/api/health', '健康检查'],
  ['POST', '/api/products', '建商品'],
  ['GET', '/api/products', '商品列表（分页）'],
  ['GET', '/api/products/:id', '商品详情（assets 展开）'],
  ['PATCH', '/api/products/:id', '更新商品'],
  ['POST', '/api/uploads', '上传素材（raw body）'],
  ['POST', '/api/jobs', '建任务 image/copy/video'],
  ['GET', '/api/jobs/:id', '查任务进度'],
  ['POST', '/api/ledger', '记一笔'],
  ['GET', '/api/ledger', '账目 + 汇总'],
];

function renderEndpoints() {
  $('#endpoints').innerHTML = ENDPOINTS.map(([m, p, d]) => `
    <div class="row-e">
      <span class="m ${m}">${m}</span>
      <code>${p}</code>
      <span>${d}</span>
      <span class="who">卓</span>
    </div>`).join('');
}

async function pingAll() {
  const out = $('#pingResult');
  out.textContent = '检测中…';
  const results = [];
  for (const path of ['/api/health', '/api/products?limit=5', '/api/ledger']) {
    const t0 = performance.now();
    try {
      const res = await fetch(path);
      results.push(`${path} → ${res.status}（${Math.round(performance.now() - t0)}ms）`);
    } catch {
      results.push(`${path} → 失败`);
    }
  }
  out.textContent = results.join('　');
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
  if (btn) switchTab(btn.dataset.tab);
});

$('#prodSel').addEventListener('change', (ev) => { if (ev.target.value) selectProduct(ev.target.value); });

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
  await loadProducts(product.id);
});

$('#file').onchange = async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  if (!state.current) { $('#dlg').showModal(); return; }
  try {
    const { assetId } = await uploadFile(file);
    state.lastUpload = assetId;
    state.lastUploadPreview = URL.createObjectURL(file);
    $('#attachInfo').textContent = `已附：${file.name}（${(file.size / 1024).toFixed(0)}KB）`;
  } catch (e) {
    alert(e.message);
  }
  ev.target.value = '';
};

$('#btnSend').onclick = () => {
  const ask = $('#ask').value.trim();
  $('#ask').value = '';
  doImage(ask);
};

$('#ask').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); $('#btnSend').click(); }
});

$('#btnCopy').onclick = doCopy;

$('#vfile').onchange = (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  state.video = file;
  $('#vMeta').textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)}MB`;
  if (file.size > 15 * 1024 * 1024) $('#vMeta').textContent += ' · 超过 15MB，先裁短';
  ev.target.value = '';
};

$('#btnVideo').onclick = async () => {
  if (!state.current) return $('#dlg').showModal();
  const out = $('#videoOut');
  out.innerHTML = '<p class="muted">处理中…</p>';
  try {
    const { jobId } = await api('/api/jobs', { method: 'POST', body: { type: 'video', productId: state.current.id, params: { targetLang: $('#vLang').value, filename: state.video?.name || null } } });
    const result = await jobPromise(jobId);
    const rows = (result.subtitles || []).map((s) => `<tr><td style="width:88px;color:#8b9bad">${s.start}–${s.end}s</td><td>${esc(s.text)}</td></tr>`).join('');
    out.innerHTML = `<h3>结果</h3><div class="muted">${result.videoUrl ? '成片已生成' : 'mock：只出字幕，不出成片（不做 lip sync）'}</div><h3>字幕</h3><table>${rows}</table>`;
  } catch (e) {
    out.innerHTML = `<p style="color:#f27e4c">失败：${esc(e.message)}</p>`;
  }
};

$('#btnLedger').onclick = async () => {
  if (!state.current) return $('#dlg').showModal();
  const amount = Number($('#lAmount').value);
  if (!amount) return alert('填个金额');
  await api('/api/ledger', { method: 'POST', body: { productId: state.current.id, type: $('#lType').value, amount, note: $('#lNote').value.trim() } });
  $('#lAmount').value = $('#lNote').value = '';
  loadLedger();
};

$('#btnPing').onclick = pingAll;

function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
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
