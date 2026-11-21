// 前端逻辑 —— 原生 ES Module，无框架、无构建
// 分工：生图 / 记账 = 主人；视频翻译 = 马；接口层 = 卓
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = { products: [], current: null, tab: 'image', lastUpload: null, video: null, platform: 'shopee', whTab: 'image' };

/* 平台表：和 lib/ai.mjs 的 PLATFORMS 保持一致（id / 名字 / 规格 / 图标色） */
const PLATFORMS = [
  { id: 'taobao', name: '淘宝', region: 'domestic', w: 800, h: 800, color: '#ff5000', short: '淘' },
  { id: 'xianyu', name: '闲鱼', region: 'domestic', w: 800, h: 800, color: '#f5c518', short: '闲' },
  { id: 'jd', name: '京东', region: 'domestic', w: 800, h: 800, color: '#e1251b', short: '京' },
  { id: 'amazon', name: 'Amazon', region: 'overseas', w: 2000, h: 2000, color: '#ff9900', short: 'A' },
  { id: 'ebay', name: 'eBay', region: 'overseas', w: 1600, h: 1600, color: '#0064d2', short: 'e' },
  { id: 'shopee', name: 'Shopee', region: 'overseas', w: 1242, h: 1660, color: '#ee4d2d', short: 'S' },
  { id: 'lazada', name: 'Lazada', region: 'overseas', w: 1000, h: 1000, color: '#0f146d', short: 'L' },
  { id: 'tiktok', name: 'TikTok Shop', region: 'overseas', w: 1080, h: 1920, color: '#111111', short: 'T' },
];
const pf = (id) => PLATFORMS.find((p) => p.id === id) || PLATFORMS.find((p) => p.id === 'shopee');

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
    $('#hTitle').textContent = '还没有商品';
    $('#pMeta').textContent = '发张图或说句话就开始';
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
  if (p.platform) setPlatform(p.platform, false);
  $('#hTitle').textContent = p.title;
  $('#pMeta').textContent = [
    pf(p.platform).name,
    (p.targetLangs || []).join(' / '),
    `${(p.assets || []).filter((a) => a.kind !== 'upload' && a.kind !== 'copy').length} 张图`,
  ].join(' · ');
  chatReset();
  loadLedger();
  renderWarehouse();
}

/* ---------------- 平台选择 ---------------- */

function setPlatform(id, remember = true) {
  const p = pf(id);
  state.platform = p.id;
  $('#pfName').textContent = p.name;
  const chip = $('#pfChip');
  chip.textContent = p.short;
  chip.style.background = p.color;
  chip.style.color = ['#f5c518', '#ff9900', '#f2c14e'].includes(p.color) ? '#1a1a1a' : '#fff';
  $$('#pfMenu .pf-item').forEach((b) => b.classList.toggle('on', b.dataset.pf === p.id));
  if (remember && state.current && state.current.platform !== p.id) {
    api(`/api/products/${state.current.id}`, { method: 'PATCH', body: { platform: p.id } }).catch(() => {});
    state.current.platform = p.id;
    $('#pMeta').textContent = $('#pMeta').textContent.replace(/^.*? · /, `${p.name} · `);
  }
}

function buildPlatformMenu() {
  const item = (p) => `<button class="pf-item" data-pf="${p.id}" type="button">
      <span class="pf-chip" style="background:${p.color};color:${['#f5c518', '#ff9900', '#f2c14e'].includes(p.color) ? '#1a1a1a' : '#fff'}">${p.short}</span>
      <span class="pf-label">${p.name}</span>
      <span class="pf-size">${p.w}×${p.h}</span>
    </button>`;
  $('#pfDomestic').innerHTML = PLATFORMS.filter((p) => p.region === 'domestic').map(item).join('');
  $('#pfOverseas').innerHTML = PLATFORMS.filter((p) => p.region === 'overseas').map(item).join('');
  setPlatform(state.platform, false);
}

/* ---------------- 仓库 ---------------- */

function whAssets() {
  const assets = state.current?.assets || [];
  return {
    images: assets.filter((a) => a.kind !== 'upload' && a.kind !== 'copy'),
    copies: assets.filter((a) => a.kind === 'copy'),
  };
}

function renderWarehouse() {
  const { images, copies } = whAssets();
  $('#whCount').textContent = images.length + copies.length;
  $('#whImgNum').textContent = images.length;
  $('#whCopyNum').textContent = copies.length;
  $$('.wh-tab').forEach((t) => t.classList.toggle('active', t.dataset.wh === state.whTab));

  const body = $('#whBody');
  if (!state.current) {
    body.innerHTML = '<p class="muted">还没有商品。新建一个，图和文案会攒在这里。</p>';
    return;
  }
  if (state.whTab === 'image') {
    if (!images.length) {
      body.innerHTML = '<p class="muted">还没有图。回「生图」发一句，出来的图会自动进这里。</p>';
      return;
    }
    body.innerHTML = `<div class="wh-grid">${images
      .slice()
      .reverse()
      .map(
        (a) => `<figure class="wh-item">
          <img src="${a.url}" alt="" data-open="${a.url}">
          <figcaption>${esc(a.meta?.template || a.kind)} · ${a.width}×${a.height}
            <span class="muted">${esc(pf(a.meta?.platform).name)}</span></figcaption>
        </figure>`
      )
      .join('')}</div>`;
    body.querySelectorAll('[data-open]').forEach((img) => {
      img.onclick = () => window.open(img.dataset.open, '_blank');
    });
  } else {
    if (!copies.length) {
      body.innerHTML = '<p class="muted">还没有文案。输入框下面点「只要文案」，生成后进这里。</p>';
      return;
    }
    body.innerHTML = copies
      .slice()
      .reverse()
      .map(
        (a) => `<article class="wh-copy">
          <div class="wh-copy-head">
            <span class="tag">${esc(a.meta?.lang || 'EN')} · ${esc(pf(a.meta?.platform).name)}</span>
            <button class="link" data-copy="${a.id}">复制全文</button>
          </div>
          <h4>${esc(a.meta?.title || '(无标题)')}</h4>
          <ul>${(a.meta?.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
          <p>${esc(a.meta?.detail || '')}</p>
        </article>`
      )
      .join('');
    body.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.onclick = async () => {
        const a = copies.find((x) => x.id === btn.dataset.copy);
        const text = [a.meta?.title, ...(a.meta?.bullets || []), a.meta?.detail].filter(Boolean).join('\n');
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = '已复制';
          setTimeout(() => (btn.textContent = '复制全文'), 1200);
        } catch {
          btn.textContent = '复制失败';
        }
      };
    });
  }
}

function whOpen(open) {
  $('#wh').classList.toggle('hidden', !open);
  $('#whMask').classList.toggle('hidden', !open);
  if (open) renderWarehouse();
}

/* ---------------- 对话 ---------------- */

function chatReset() {
  const box = $('#chat');
  box.innerHTML = '<div class="chat-inner"></div>';
  const inner = box.querySelector('.chat-inner');
  const p = state.current;
  say(
    inner,
    'ai',
    `<p>${p ? `「${esc(p.title)}」已经就位。` : '还没商品，直接发图或者说话就行，我会自动开一个。'}</p>
     <p>选好平台，发一张商品原图再说要求——我出套图。想换商品就说「新建商品：名字」。</p>
     <p class="muted-sm">出好的图和文案会落进右上角的「仓库」，随时翻。</p>`,
    { persist: false }
  );
  for (const m of loadHistory()) say(inner, m.who, m.html, { persist: false });
  if (!loadHistory().length && p) {
    say(
      inner,
      'ai',
      `<p class="muted-sm">没想好怎么开口，先点一句，改改再发：</p>
       <div class="starters">
         <button class="starter" data-fill="做一张白底主图，标题写 STAY A WHILE.">白底主图 + 一句英文标题</button>
         <button class="starter" data-fill="按这套家具出一组三张详情页，讲老木的来历">三张详情页，讲来历</button>
         <button class="starter" data-fill="把上面这套图的卖点写成英文 listing 文案">把这套图写成 listing 文案</button>
         <button class="starter" data-fill="换成泰语，标题短一点">换泰语，标题短一点</button>
       </div>`,
      { persist: false }
    );
  }
  box.scrollTop = box.scrollHeight;
}

/* 每个商品各自记一份对话，刷新后还在 */
const histKey = () => (state.current ? `dukou:chat:${state.current.id}` : null);
function loadHistory() {
  const k = histKey();
  if (!k) return [];
  try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; }
}
function pushHistory(who, html) {
  const k = histKey();
  if (!k) return;
  const arr = loadHistory();
  arr.push({ who, html });
  try { localStorage.setItem(k, JSON.stringify(arr.slice(-24))); } catch {}
}
/* 气泡里后加的图要补记一次，否则刷新后只剩文字 */
function patchHistory(html) {
  const k = histKey();
  if (!k) return;
  const arr = loadHistory();
  if (!arr.length) return;
  arr[arr.length - 1].html = html;
  try { localStorage.setItem(k, JSON.stringify(arr)); } catch {}
}

/* 不用表单建商品：说话或发图就自动建 */
const NEW_WORDS = /^(?:新建商品|新商品|新建|新加|换个商品|换一个商品|换商品)/;
function newProductTitle(text) {
  const m = String(text || '').match(/^(?:新建商品|新商品|新建|新加|换个商品|换一个商品|换商品)\s*[:：,，]?\s*/);
  return m ? text.slice(m[0].length).trim() : '';
}

async function ensureProduct(text, fileName) {
  const explicit = newProductTitle(text || '');
  const wantsNew = NEW_WORDS.test(String(text || ''));
  if (state.current && !wantsNew) return state.current;

  const fallback = String(fileName || '').replace(/\.[^.]+$/, '');
  const title = (explicit || (wantsNew ? '' : String(text || '').slice(0, 16)) || fallback || '新商品').trim();
  const product = await api('/api/products', {
    method: 'POST',
    body: {
      title: title.slice(0, 40),
      platform: state.platform,
      sellingPoints: [],
      rawText: wantsNew ? '' : String(text || ''),
      targetLangs: ['en'],
    },
  });
  await loadProducts(product.id);
  return state.current;
}

function say(container, who, html, opts = {}) {
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
  if (opts.persist !== false) pushHistory(who, html);
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
  patchHistory(bubble.innerHTML);
}

function progressBubble(text) {
  const inner = $('#chat .chat-inner');
  const el = say(inner, 'ai', `<p>${text}</p><div class="progress"><div class="bar"><i></i></div><span>0%</span></div>`, { persist: false });
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

/* ---------------- 出图参数询问框 ---------------- */

const dlgState = { count: 2, size: 'platform', quality: '1k' };

function sizeLabel() {
  if (dlgState.size === 'platform') {
    const p = pf(state.platform);
    return `${p.name} ${p.w}×${p.h}`;
  }
  if (dlgState.size === 'custom') {
    const w = Number($('#wCustom').value) || pf(state.platform).w;
    const h = Number($('#hCustom').value) || pf(state.platform).h;
    return `自定义 ${w}×${h}`;
  }
  return dlgState.size.replace('x', '×');
}

function syncDlg() {
  $$('#optCount .chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.count) === dlgState.count && !$('#cntCustom').value));
  $$('#optSize .chip').forEach((c) => c.classList.toggle('on', c.dataset.size === dlgState.size));
  $$('#optQuality .chip').forEach((c) => c.classList.toggle('on', c.dataset.quality === dlgState.quality));
  const p = pf(state.platform);
  $('#chipPlatform').innerHTML = `平台默认 <span class="dim">${p.w}×${p.h}</span>`;
  $('#wCustom').placeholder = String(p.w);
  $('#hCustom').placeholder = String(p.h);
  $('#sizeHint').textContent = `当前：${sizeLabel()}`;
  $('#cntHint').textContent = `将出 ${dlgState.count} 张 · ${dlgState.quality.toUpperCase()}`;
}

/** 打开询问框；确认后把 opts 交给回调 */
function askParams({ title, thumb, onSubmit }) {
  const dlg = $('#askDlg');
  dlgState.count = $('#template').value === 'detail' ? 3 : 2;
  dlgState.size = 'platform';
  dlgState.quality = '1k';
  $('#cntCustom').value = '';
  $('#wCustom').value = '';
  $('#hCustom').value = '';
  $('#dlgSub').innerHTML = `${esc(title || '')}${thumb ? `<img class="dlg-thumb" src="${thumb}" alt="">` : ''}`;
  syncDlg();

  const done = (ok) => {
    dlg.removeEventListener('close', onClose);
    $('#dlgGo').onclick = null;
    $('#dlgCancel').onclick = null;
    if (!ok) return;
    const base = pf(state.platform);
    const [w, h] = dlgState.size === 'platform' ? [null, null] : dlgState.size === 'custom' ? [Number($('#wCustom').value) || base.w, Number($('#hCustom').value) || base.h] : dlgState.size.split('x').map(Number);
    onSubmit({
      count: Number($('#cntCustom').value) || dlgState.count,
      width: w,
      height: h,
      quality: dlgState.quality,
    });
  };
  const onClose = () => done(dlg.returnValue === 'go');
  dlg.addEventListener('close', onClose);
  $('#dlgCancel').onclick = () => dlg.close('cancel');
  $('#dlgGo').onclick = (ev) => { ev.preventDefault(); dlg.close('go'); };

  $$('#optCount .chip').forEach((c) => (c.onclick = () => { dlgState.count = Number(c.dataset.count); $('#cntCustom').value = ''; syncDlg(); }));
  $$('#optSize .chip').forEach((c) => (c.onclick = () => { dlgState.size = c.dataset.size; $('#wCustom').value = ''; $('#hCustom').value = ''; syncDlg(); }));
  $$('#optQuality .chip').forEach((c) => (c.onclick = () => { dlgState.quality = c.dataset.quality; syncDlg(); }));
  $('#cntCustom').oninput = () => syncDlg();
  for (const id of ['#wCustom', '#hCustom']) {
    $(id).oninput = () => {
      if ($('#wCustom').value || $('#hCustom').value) dlgState.size = 'custom';
      syncDlg();
    };
  }

  if (typeof dlg.showModal === 'function') dlg.showModal();
  else dlg.setAttribute('open', '');
}

const IMAGE_WORDS = /图|主图|详情|海报|套图|出图|生图/;

async function doImage(askText, opts) {
  const text = String(askText || '').trim();
  if (!state.current && !text && !state.lastUpload) {
    say($('#chat .chat-inner'), 'ai', '<p>先发张图，或者直接说要做什么，比如「新建商品：老榆木餐桌」。</p>');
    return;
  }
  await ensureProduct(text, state.lastUploadName);
  const inner = $('#chat .chat-inner');
  const before = new Set((state.current.assets || []).map((a) => a.id));
  const tpl = $('#template').value;
  const lang = $('#imgLang').value;
  const platformId = state.platform;
  const count = opts?.count || (tpl === 'detail' ? 3 : 2);
  const width = opts?.width || null;
  const height = opts?.height || null;
  const quality = opts?.quality || '1k';
  const scale = { '1k': 1, '2k': 1.5, '4k': 2 }[quality] || 1;
  const base = pf(platformId);
  const outW = Math.round((width || base.w) * scale);
  const outH = Math.round((height || base.h) * scale);

  const thumb = state.lastUploadPreview ? `<img class="thumb" src="${state.lastUploadPreview}" alt="">` : '';
  say(
    inner,
    'user',
    `${askText ? `<p>${esc(askText)}</p>` : ''}${thumb}<p class="meta-line">${esc(base.name)} · ${tplLabel(tpl)} · ${langLabel(lang)} · ${count} 张 · ${outW}×${outH} · ${quality.toUpperCase()}</p>`
  );

  const box = progressBubble('正在出图…');
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: { type: 'image', productId: state.current.id, params: { assetId: state.lastUpload, platform: platformId, template: tpl, lang, count, width, height, quality, prompt: askText || undefined } },
    });
    const result = await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    state.current = await api(`/api/products/${state.current.id}`);
    const fresh = (state.current.assets || []).filter((a) => a.kind !== 'upload' && a.kind !== 'copy' && !before.has(a.id));
    const bubble = say(inner, 'ai', `<p>${fresh.length ? `出好了 ${fresh.length} 张，已放进仓库。` : '任务完成。'}</p>`);
    if (fresh.length) shots(bubble.querySelector('.bubble'), fresh);
    $('#pMeta').textContent = $('#pMeta').textContent.replace(/\d+ 张图/, `${(state.current.assets || []).filter((a) => a.kind !== 'upload' && a.kind !== 'copy').length} 张图`);
    if (state.whTab === 'image') renderWarehouse(); else renderWarehouse();
    state.lastUpload = null;
    state.lastUploadPreview = null;
    $('#attachInfo').textContent = '未附图片';
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p style="color:#f27e4c">出图失败：${esc(e.message)}</p>`);
  }
}

async function doCopy() {
  await ensureProduct($('#ask').value.trim(), state.lastUploadName);
  const inner = $('#chat .chat-inner');
  say(inner, 'user', `<p>只要文案 · ${esc(pf(state.platform).name)}</p>`);
  const box = progressBubble('正在写文案…');
  try {
    const { jobId } = await api('/api/jobs', { method: 'POST', body: { type: 'copy', productId: state.current.id, params: { lang: $('#imgLang').value, platform: state.platform } } });
    const result = await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    say(inner, 'ai', `
      <h3>标题</h3><p>${esc(result.title || '')}</p>
      <h3>卖点</h3><ul>${(result.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
      <h3>详情</h3><p>${esc(result.detail || '')}</p>
      <p class="muted-sm">已存进仓库 →</p>`);
    state.current = await api(`/api/products/${state.current.id}`);
    renderWarehouse();
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p style="color:#f27e4c">失败：${esc(e.message)}</p>`);
  }
}

const tplLabel = (t) => ({ main: '主图', marketing: '营销图', detail: '详情页' }[t] || t);
const langLabel = (l) => ({ en: '英语', th: '泰语', vi: '越南语' }[l] || l);

/* ---------------- 记账 ---------------- */

async function loadLedger() {
  const money = (v) => Number(v || 0).toFixed(2);
  if (!state.current) {
    $('#summary').innerHTML = `
      <div class="stat"><div class="stat-label">收入</div><div class="stat-value">0.00<span class="stat-unit">CNY</span></div></div>
      <div class="stat"><div class="stat-label">成本</div><div class="stat-value cost">0.00<span class="stat-unit">CNY</span></div></div>
      <div class="stat"><div class="stat-label">利润</div><div class="stat-value">0.00<span class="stat-unit">CNY</span></div></div>`;
    $('#ledgerList').innerHTML = '<li style="grid-template-columns:1fr;color:#6b7280">还没有商品。先去「生图」发一张图或说一句话，账目会记在那个商品下面。</li>';
    return;
  }
  const data = await api(`/api/ledger?productId=${state.current.id}`);
  const s = data.summary;
  $('#summary').innerHTML = `
    <div class="stat"><div class="stat-label">收入</div><div class="stat-value">${money(s.income)}<span class="stat-unit">CNY</span></div></div>
    <div class="stat"><div class="stat-label">成本</div><div class="stat-value cost">${money(s.cost)}<span class="stat-unit">CNY</span></div></div>
    <div class="stat"><div class="stat-label">利润</div><div class="stat-value">${money(s.profit)}<span class="stat-unit">CNY</span></div></div>`;
  const ul = $('#ledgerList');
  ul.innerHTML = '';
  if (!data.items.length) {
    ul.innerHTML = '<li style="grid-template-columns:1fr;color:#6b7280">还没有账目。卖出一单记一笔收入，运费广告也记上，利润才是真的。</li>';
    return;
  }
  for (const e of data.items) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="kind"></span><span></span><span class="amt"></span>';
    li.children[0].textContent = label(e.type);
    li.children[1].textContent = e.note || '';
    li.children[2].textContent = `${e.type === 'income' ? '+' : '-'}${money(e.amount)} ${e.currency}`;
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
    <div class="ep">
      <span class="m ${m}">${m}</span>
      <span class="p">${p}</span>
      <span class="d">${d}</span>
      <span class="r">卓</span>
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

$('#file').onchange = async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    await ensureProduct('', file.name);
    const { assetId } = await uploadFile(file);
    state.lastUpload = assetId;
    state.lastUploadName = file.name;
    state.lastUploadPreview = URL.createObjectURL(file);
    $('#attachInfo').textContent = `已附：${file.name}（${(file.size / 1024).toFixed(0)}KB）`;
  } catch (e) {
    alert(e.message);
  }
  ev.target.value = '';
};

$('#chat').addEventListener('click', (ev) => {
  const chip = ev.target.closest('.starter');
  if (!chip) return;
  $('#ask').value = chip.dataset.fill || chip.textContent;
  $('#ask').focus();
  $('#ask').setSelectionRange($('#ask').value.length, $('#ask').value.length);
});

$('#btnSend').onclick = () => {
  const ask = $('#ask').value.trim();
  $('#ask').value = '';
  // 有图，或者话里明显是在要图 → 先问清几张/多大/多清晰
  if (state.lastUpload || IMAGE_WORDS.test(ask) || !ask) {
    askParams({
      title: state.current ? state.current.title : '新商品',
      thumb: state.lastUploadPreview,
      onSubmit: (opts) => doImage(ask, opts),
    });
    return;
  }
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
  await ensureProduct(state.video ? state.video.name.replace(/\.[^.]+$/, '') : '');
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
  await ensureProduct('');
  const amount = Number($('#lAmount').value);
  if (!amount) return alert('填个金额');
  await api('/api/ledger', { method: 'POST', body: { productId: state.current.id, type: $('#lType').value, amount, note: $('#lNote').value.trim() } });
  $('#lAmount').value = $('#lNote').value = '';
  loadLedger();
};

$('#btnPing').onclick = pingAll;

/* 平台下拉 */
$('#btnPlatform').onclick = (ev) => {
  ev.stopPropagation();
  $('#pfMenu').classList.toggle('hidden');
};
$('#pfMenu').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.pf-item');
  if (!btn) return;
  setPlatform(btn.dataset.pf);
  $('#pfMenu').classList.add('hidden');
});
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('.pf-wrap')) $('#pfMenu').classList.add('hidden');
});

/* 仓库 */
$('#btnWarehouse').onclick = () => whOpen($('#wh').classList.contains('hidden'));
$('#whClose').onclick = () => whOpen(false);
$('#whMask').onclick = () => whOpen(false);
$('.wh-tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.wh-tab');
  if (!btn) return;
  state.whTab = btn.dataset.wh;
  renderWarehouse();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    whOpen(false);
    $('#pfMenu').classList.add('hidden');
  }
});

function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/* ---------------- 启动 ---------------- */

(async function boot() {
  renderEndpoints();
  buildPlatformMenu();
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
