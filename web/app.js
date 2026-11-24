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
    ? `<option value="">选择商品…</option>` +
      items.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join('')
    : '<option value="">还没有商品</option>';
  if (!items.length) {
    state.current = null;
    $('#hTitle').textContent = '还没有商品';
    $('#pMeta').textContent = '发张图或说句话就开始';
    chatReset();
    return;
  }
  const target = preferId || (state.current?.id && items.some((p) => p.id === state.current.id) ? state.current.id : null);
  if (!target) {
    // 进来不替用户选商品：有商品也先停在入口页，等他挑一个或直接说一句话
    state.current = null;
    sel.value = '';
    $('#hTitle').textContent = '还没有选择商品';
    $('#pMeta').textContent = items.length ? `已有 ${items.length} 个商品，下拉选一个，或直接说一句新建` : '发张图或说句话就开始';
    chatReset();
    loadLedger();
    renderWarehouse();
    return;
  }
  sel.value = items.find((p) => p.id === target) ? target : items[0].id;
  await selectProduct(sel.value);
}

function assetTally(p) {
  const list = p.assets || [];
  const imgs = list.filter((a) => ['main', 'marketing', 'detail', 'sub'].includes(a.kind)).length;
  const clips = list.filter((a) => a.kind === 'clip').length;
  return [imgs ? `${imgs} 张图` : '', clips ? `${clips} 段视频` : ''].filter(Boolean).join(' · ') || '还没有产物';
}

function refreshMeta() {
  const p = state.current;
  if (!p) return;
  $('#pMeta').textContent = [pf(p.platform).name, (p.targetLangs || []).join(' / '), assetTally(p)].filter(Boolean).join(' · ');
}

async function selectProduct(id, opts = {}) {
  state.current = await api(`/api/products/${id}`);
  const p = state.current;
  if (p.platform) setPlatform(p.platform, false);
  $('#hTitle').textContent = p.title;
  refreshMeta();
  if (!opts.keepChat) chatReset();
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
    base: assets.filter((a) => a.kind === 'refined' || a.kind === 'angle' || a.kind === 'angle_real'),
    images: assets.filter((a) => ['main', 'marketing', 'detail', 'sub'].includes(a.kind)),
    copies: assets.filter((a) => a.kind === 'copy'),
  };
}

function renderWarehouse() {
  const { base, images, copies } = whAssets();
  $('#whCount').textContent = base.length + images.length + copies.length;
  $('#whImgNum').textContent = base.length + images.length;
  $('#whCopyNum').textContent = copies.length;
  $$('.wh-tab').forEach((t) => t.classList.toggle('active', t.dataset.wh === state.whTab));

  const body = $('#whBody');
  if (!state.current) {
    body.innerHTML = '<p class="muted">还没有商品。新建一个，图和文案会攒在这里。</p>';
    return;
  }
  if (state.whTab === 'image') {
    if (!base.length && !images.length) {
      body.innerHTML = '<p class="muted">还没有图。回「生图」发一句，出来的图会自动进这里。</p>';
      return;
    }
    const card = (a) => {
      const isReal = a.kind === 'angle_real';
      const label =
        a.kind === 'refined' ? `精修 · ${a.meta?.crop || '1:1'}` : a.kind === 'angle' ? `视角 · ${a.meta?.angle || ''}` : a.meta?.template || a.kind;
      return `<figure class="wh-item">
        <img src="${a.url}" alt="" data-open="${a.url}">
        <figcaption>${esc(label)} · ${a.width}×${a.height}
          ${isReal ? '<span class="chip-real">实拍</span>' : a.meta?.usedRefined ? '<span class="chip-ref">引精修</span>' : ''}
        </figcaption>
      </figure>`;
    };
    body.innerHTML = [
      base.length ? `<h4 class="wh-group">基底素材 <span class="muted">备料产物，后续出图会引用</span></h4><div class="wh-grid">${base.map(card).join('')}</div>` : '',
      images.length ? `<h4 class="wh-group">成品图</h4><div class="wh-grid">${images.slice().reverse().map(card).join('')}</div>` : '',
    ].join('');
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
  const hist = loadHistory();
  for (const m of hist) say(inner, m.who, m.html, { persist: false });
  if (!hist.length) {
    say(
      inner,
      'ai',
      `<p>${p ? `「${esc(p.title)}」已经就位。` : '还没选商品。发张图或说一句话，我就建一个新商品；想接着做已有的，用上面那个下拉选它。'}</p>
     <p>选好平台，发一张商品原图再说要求——我出套图。</p>
     <p class="muted-sm">常用的几件事，点一下就开工；前几个会把话填进输入框，改两个字再发：</p>
       <div class="tiles">
         <button class="tile" type="button" data-fill="做一张白底主图，标题写 STAY A WHILE.">
           <span class="tile-t">出主图</span>
           <span class="tile-d">按平台尺寸出 1–6 张，带英文标题</span>
         </button>
         <button class="tile" type="button" data-fill="用这张商品图出一段 5 秒短视频，缓慢推近，暖光">
           <span class="tile-t">出商品短视频</span>
           <span class="tile-d">一张图生成 5 秒运镜，Seedance</span>
         </button>
         <button class="tile" type="button" data-fill="把这张图的卖点写成英文 listing 文案">
           <span class="tile-t">写 listing 文案</span>
           <span class="tile-d">标题 + 三条卖点 + 一段描述，可直接复制</span>
         </button>
         <button class="tile" type="button" data-fill="把这段口播视频翻成泰语字幕">
           <span class="tile-t">翻视频字幕</span>
           <span class="tile-d">保留原声，出目标语言字幕轨</span>
         </button>
         <button class="tile" type="button" data-tab="ledger">
           <span class="tile-t">记一笔账</span>
           <span class="tile-d">收入、运费、广告，随手记，随时看利润</span>
         </button>
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
  const guess = String(text || '').slice(0, 16);
  // 「用这张图…」「做一段…」这类是动作，不是商品名，别把整句话当标题
  const looksLikeAction = /^(用|把|做|出|生成|来|给我|帮|按|这|那)/.test(guess.trim());
  const title = (explicit || (wantsNew || looksLikeAction ? '' : guess) || fallback || '新商品').trim();
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

/* ---------------- 出图参数：在对话区里问 ---------------- */

const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/** 从用户这句话里读出已经说定的参数，读到的就不再问 */
function readIntent(text) {
  const s = String(text || '');
  const known = {};
  const cnt = s.match(/([1-6一二两三四五六])\s*张/);
  if (cnt) known.count = CN_NUM[cnt[1]] || Number(cnt[1]);
  const wh = s.match(/(\d{3,4})\s*[x×*]\s*(\d{3,4})/i);
  if (wh) known.size = `${Number(wh[1])}x${Number(wh[2])}`;
  else if (/竖屏|9\s*[:：]\s*16/.test(s)) known.size = '1080x1920';
  else if (/方图|正方|1\s*[:：]\s*1/.test(s)) known.size = '800x800';
  if (/4k|超清/i.test(s)) known.quality = '4k';
  else if (/2k|高清/i.test(s)) known.quality = '2k';
  else if (/1k|标准清晰|标清/.test(s)) known.quality = '1k';
  return known;
}

/** 只问还没说定的；三件都说清了就直接 resolve，不发卡片 */
function askParams({ title, thumb, ask, known = {} }) {
  const base = pf(state.platform);
  const st = {
    count: known.count || ($('#template').value === 'detail' ? 3 : 2),
    size: known.size || 'platform',
    quality: known.quality || '1k',
  };
  const need = {
    count: !known.count,
    size: !known.size,
    quality: !known.quality,
  };
  const resolveOpts = (s) => {
    const [w, h] = s.size === 'platform' ? [null, null] : String(s.size).split('x').map(Number);
    return { count: s.count, width: w, height: h, quality: s.quality };
  };
  if (!need.count && !need.size && !need.quality) return Promise.resolve(resolveOpts(st));

  const inner = $('#chat .chat-inner');
  const left = [need.count && '几张', need.size && '多大', need.quality && '多清晰'].filter(Boolean).join('、');

  const el = say(inner, 'ai', `
    <p class="ask-q">还差${left}，定完我就开工。</p>
    ${ask ? `<div class="ask-quote">${esc(ask)}</div>` : ''}
    <div class="ask-sub">${esc(title || '新商品')}${thumb ? `<img class="thumb" src="${thumb}" alt="">` : ''}</div>
    ${need.count ? `
    <div class="opt">
      <div class="opt-label">要几张</div>
      <div class="opt-row" data-k="count">
        <button type="button" class="chip${st.count === 1 ? ' on' : ''}" data-v="1">1 张</button>
        <button type="button" class="chip${st.count === 2 ? ' on' : ''}" data-v="2">2 张<span class="tag">常用</span></button>
        <button type="button" class="chip${st.count === 3 ? ' on' : ''}" data-v="3">3 张</button>
        <button type="button" class="chip${st.count === 5 ? ' on' : ''}" data-v="5">5 张</button>
        <span class="custom">自定义 <input class="in cnt" type="number" min="1" max="6" placeholder="4"></span>
      </div>
    </div>` : ''}
    ${need.size ? `
    <div class="opt">
      <div class="opt-label">尺寸<span class="opt-hint">当前：${base.name} ${base.w}×${base.h}</span></div>
      <div class="opt-row" data-k="size">
        <button type="button" class="chip${st.size === 'platform' ? ' on' : ''}" data-v="platform">平台默认 <span class="dim">${base.w}×${base.h}</span></button>
        <button type="button" class="chip${st.size === '800x800' ? ' on' : ''}" data-v="800x800">方图 1:1 <span class="dim">800×800</span></button>
        <button type="button" class="chip${st.size === '1080x1920' ? ' on' : ''}" data-v="1080x1920">竖屏 9:16 <span class="dim">1080×1920</span></button>
        <span class="custom">自定义 <input class="in w" type="number" min="200" max="4000" placeholder="${base.w}">×<input class="in h" type="number" min="200" max="4000" placeholder="${base.h}"></span>
      </div>
    </div>` : ''}
    ${need.quality ? `
    <div class="opt">
      <div class="opt-label">清晰度<span class="opt-hint">主流平台 1K 就够</span></div>
      <div class="opt-row" data-k="quality">
        <button type="button" class="chip${st.quality === '1k' ? ' on' : ''}" data-v="1k">标准 1K<span class="tag">够用</span></button>
        <button type="button" class="chip${st.quality === '2k' ? ' on' : ''}" data-v="2k">高清 2K</button>
        <button type="button" class="chip${st.quality === '4k' ? ' on' : ''}" data-v="4k">超清 4K</button>
      </div>
    </div>` : ''}
    <div class="ask-foot">
      <button type="button" class="link" data-act="cancel">先不出</button>
      <button type="button" class="btn-primary" data-act="go">开始生成</button>
    </div>
  `, { persist: false });

  const cntEl = el.querySelector('.cnt');
  const wEl = el.querySelector('.custom .w');
  const hEl = el.querySelector('.custom .h');
  const bubble = el.querySelector('.bubble');

  const sync = () => {
    if (cntEl) el.querySelectorAll('.opt-row[data-k="count"] .chip').forEach((c) => c.classList.toggle('on', Number(c.dataset.v) === st.count && !cntEl.value));
    el.querySelectorAll('.opt-row[data-k="size"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === st.size));
    el.querySelectorAll('.opt-row[data-k="quality"] .chip').forEach((c) => c.classList.toggle('on', c.dataset.v === st.quality));
  };

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (!ok) { el.remove(); resolve(null); return; }
      if (wEl && (wEl.value || hEl.value)) st.size = `${Number(wEl.value) || base.w}x${Number(hEl.value) || base.h}`;
      if (cntEl && cntEl.value) st.count = Number(cntEl.value);
      const opts = resolveOpts(st);
      const sizeText = opts.width ? `${opts.width}×${opts.height}` : `${base.name} ${base.w}×${base.h}`;
      bubble.innerHTML = `<p class="ask-done">好，${opts.count} 张 · ${sizeText} · ${opts.quality.toUpperCase()}，开始出图。</p>`;
      patchHistory(bubble.innerHTML);
      const scroller = el.closest('.chat');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
      resolve(opts);
    };

    el.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.chip');
      if (chip) {
        const k = chip.closest('.opt-row').dataset.k;
        st[k] = k === 'count' ? Number(chip.dataset.v) : chip.dataset.v;
        if (k === 'count' && cntEl) cntEl.value = '';
        if (k === 'size' && wEl) { wEl.value = ''; hEl.value = ''; }
        sync();
        return;
      }
      const act = ev.target.closest('[data-act]');
      if (act) finish(act.dataset.act === 'go');
    });
    if (cntEl) cntEl.oninput = () => { if (cntEl.value) st.count = Number(cntEl.value); sync(); };
    if (wEl) wEl.oninput = hEl.oninput = () => { if (wEl.value || hEl.value) st.size = 'custom'; sync(); };
  });
}

const IMAGE_WORDS = /图|主图|详情|海报|套图|出图|生图/;
// 提到短片/运镜就是出视频；但同时说「主图/详情」时仍按出图走
const CLIP_WORDS = /视频|短片|短视频|运镜|动起来|片头/;
const IMAGE_ONLY = /主图|详情图|白底图|海报|套图/;

/* ---------------- 补素材：先问再动手 ---------------- */

const ANGLES = [
  ['front', '正面'],
  ['deg45', '45°'],
  ['side_right', '侧面'],
  ['back', '背面'],
];
const USAGE = [
  ['main', '电商主图'],
  ['social', '社交种草'],
  ['detail', '详情页'],
  ['all', '都做'],
];

function askBrief({ title, thumb }) {
  const inner = $('#chat .chat-inner');
  const el = say(inner, 'ai', `
    <p class="ask-q">先问几句，出图能准很多——都能跳过。</p>
    <div class="ask-sub">${esc(title || '新商品')}${thumb ? `<img class="thumb" src="${thumb}" alt="">` : ''}</div>
    <div class="opt">
      <div class="opt-label">手上有哪些实拍角度<span class="opt-hint">有的直接说，省一次生成</span></div>
      <div class="opt-row" data-k="angles">
        ${ANGLES.map(([v, t]) => `<button type="button" class="chip" data-v="${v}">${t}</button>`).join('')}
      </div>
    </div>
    <div class="opt">
      <div class="opt-label">用在哪儿</div>
      <div class="opt-row" data-k="usage">
        ${USAGE.map(([v, t]) => `<button type="button" class="chip${v === 'main' ? ' on' : ''}" data-v="${v}">${t}</button>`).join('')}
      </div>
    </div>
    <div class="opt">
      <div class="opt-label">要不要模特<span class="opt-hint">服饰美妆才需要</span></div>
      <div class="opt-row" data-k="model">
        <button type="button" class="chip on" data-v="no">不用</button>
        <button type="button" class="chip" data-v="yes">要</button>
      </div>
    </div>
    <div class="opt">
      <div class="opt-label">一句话卖点<span class="opt-hint">写你自己的说法最好</span></div>
      <div class="opt-row"><input class="in wide" id="briefSelling" placeholder="实木手工、老料新做…"></div>
    </div>
    <div class="opt">
      <div class="opt-label">市场客单价</div>
      <div class="opt-row" data-k="price">
        <button type="button" class="chip" data-v="low">低</button>
        <button type="button" class="chip on" data-v="mid">中</button>
        <button type="button" class="chip" data-v="high">高</button>
      </div>
    </div>
    <div class="ask-foot">
      <button type="button" class="link" data-act="skip">先出图，回头再说</button>
      <button type="button" class="btn-primary" data-act="go">存下来并备料</button>
    </div>
  `, { persist: false });

  const st = { angles: [], usage: 'main', model: 'no', price: 'mid' };
  const bubble = el.querySelector('.bubble');
  const selling = el.querySelector('#briefSelling');

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const brief = ok ? { ...st, selling: selling.value.trim(), askedAt: new Date().toISOString() } : { askedAt: new Date().toISOString() };
      bubble.innerHTML = `<p class="ask-done">${ok ? '记下了。正在精修和出三视图…' : '好，先出图。素材回头再补也行。'}</p>`;
      patchHistory(bubble.innerHTML);
      resolve(brief);
    };
    el.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.chip');
      if (chip) {
        const k = chip.closest('.opt-row').dataset.k;
        if (k === 'angles') {
          chip.classList.toggle('on');
          st.angles = [...el.querySelectorAll('.opt-row[data-k="angles"] .chip.on')].map((c) => c.dataset.v);
        } else {
          el.querySelectorAll(`.opt-row[data-k="${k}"] .chip`).forEach((c) => c.classList.toggle('on', c === chip));
          st[k] = chip.dataset.v;
        }
        return;
      }
      const act = ev.target.closest('[data-act]');
      if (act) finish(act.dataset.act === 'go');
    });
  });
}

/** 存 brief → 跑备料任务（精修 2 + 三视图 3 + 视觉规范） */
async function runPrepare(brief) {
  if (!state.current) return null;
  const inner = $('#chat .chat-inner');
  const pid = state.current.id;
  try {
    if (brief) await api(`/api/products/${pid}`, { method: 'PATCH', body: { brief } });
    const prog = progressBubble('正在备料：精修 → 三视图 → 视觉规范');
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: { type: 'visual', productId: pid, params: { platform: state.platform, brief: brief || {}, realAngles: brief?.angles || [] } },
    });
    const res = await jobPromise(jobId, (job) => prog.update(job.progress || 0, job.type));
    prog.done();
    await selectProduct(pid, { keepChat: true });
    const spec = res.spec || {};
    const all = state.current?.assets || [];
    const mine = (res.assets || []).map((id) => all.find((a) => a.id === id)).filter(Boolean);
    const pal = spec.palette || {};
    say(inner, 'ai', `
      <p>素材备好了 ${mine.length} 张，放在仓库的「基底素材」里。</p>
      <p class="muted-sm">${esc(spec.category || '')}${spec.category ? ' · ' : ''}${esc(spec.lighting || '')}</p>
      ${pal.base ? `<div class="spec">${['base', 'accent', 'support'].map((k) => (pal[k] ? `<span class="sw" style="background:${pal[k]}" title="${k} ${pal[k]}"></span>` : '')).join('')}<span class="spec-t">视觉规范 v${spec.version || 1}</span></div>` : ''}
    `);
    if (mine.length) shots(inner.lastElementChild, mine);
    return res;
  } catch (e) {
    say(inner, 'ai', `<p>备料没跑通：${esc(e.message)}</p><p class="muted-sm">不影响出图，可以直接说要求。</p>`);
    return null;
  }
}

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
    refreshMeta();
    if (state.whTab === 'image') renderWarehouse(); else renderWarehouse();
    state.lastUpload = null;
    state.lastUploadPreview = null;
    $('#attachInfo').textContent = '未附图片';
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p style="color:#f27e4c">出图失败：${esc(e.message)}</p>`);
  }
}

async function doClip(askText) {
  const text = String(askText || '').trim();
  await ensureProduct(text, state.lastUploadName);
  const inner = $('#chat .chat-inner');
  const seconds = /10\s*秒|十\s*秒/.test(text) ? 10 : 5;
  const thumb = state.lastUploadPreview ? `<img class="thumb" src="${state.lastUploadPreview}" alt="">` : '';
  say(
    inner,
    'user',
    `${text ? `<p>${esc(text)}</p>` : ''}${thumb}<p class="meta-line">商品短视频 · ${seconds}s · 720p · Seedance</p>`,
  );
  const box = progressBubble('排队等 Seedance 出片…');
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: {
        type: 'clip',
        productId: state.current.id,
        params: { prompt: text || undefined, duration: seconds, resolution: '720p', platform: state.platform, imageUrl: state.lastUploadUrl || null },
      },
    });
    const result = await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    const bubble = say(inner, 'ai', '<p>视频好了。</p>');
    const body = bubble.querySelector('.bubble');
    if (result.clipUrl) {
      body.insertAdjacentHTML('beforeend', `<video class="clip" src="${result.clipUrl}" controls playsinline preload="metadata"></video>`);
    } else if (result.posterUrl) {
      body.insertAdjacentHTML('beforeend', `<img class="thumb-lg" src="${result.posterUrl}" alt="首帧预览">`);
    }
    if (result.note) body.insertAdjacentHTML('beforeend', `<p class="muted-sm">${esc(result.note)}</p>`);
    state.current = await api(`/api/products/${state.current.id}`);
    refreshMeta();
    renderWarehouse();
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p style="color:#f27e4c">出视频失败：${esc(e.message)}</p>`);
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
    // 第一次拿到图：先问素材，同时不挡着出图
    const p = state.current;
    if (p && !p.brief?.askedAt) {
      const brief = await askBrief({ title: p.title, thumb: state.lastUploadPreview });
      runPrepare(brief);
    }
  } catch (e) {
    alert(e.message);
  }
  ev.target.value = '';
};

$('#chat').addEventListener('click', (ev) => {
  const chip = ev.target.closest('.starter, .tile');
  if (!chip) return;
  $('#ask').value = chip.dataset.fill || chip.textContent;
  $('#ask').focus();
  $('#ask').setSelectionRange($('#ask').value.length, $('#ask').value.length);
});

$('#btnSend').onclick = async () => {
  const ask = $('#ask').value.trim();
  $('#ask').value = '';
  // 先认「视频」：一句话里提到短片/运镜，就走 Seedance 出片
  if (CLIP_WORDS.test(ask) && !IMAGE_ONLY.test(ask)) {
    doClip(ask);
    return;
  }
  // 有图，或者话里明显是在要图 → 话里已经说清的参数不再问，只补没说的
  if (state.lastUpload || IMAGE_WORDS.test(ask) || !ask) {
    const known = readIntent(ask);
    const opts = await askParams({
      title: state.current ? state.current.title : '新商品',
      thumb: state.lastUploadPreview,
      ask,
      known,
    });
    if (!opts) { $('#ask').value = ask; return; }
    doImage(ask, opts);
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
  state.videoUrl = null;
  $('#vMeta').textContent = `${file.name} · ${(file.size / 1048576).toFixed(1)}MB`;
  if (file.size > 80 * 1024 * 1024) $('#vMeta').textContent += ' · 超过 80MB，先裁短';
  ev.target.value = '';

  // 顺手读一下时长，ASR 不给时间戳时用它兜底
  const el = document.createElement('video');
  el.preload = 'metadata';
  el.src = URL.createObjectURL(file);
  el.onloadedmetadata = () => {
    state.videoDuration = Math.round(el.duration || 0);
    URL.revokeObjectURL(el.src);
  };
};

$('#btnVideo').onclick = async () => {
  await ensureProduct(state.video ? state.video.name.replace(/\.[^.]+$/, '') : '');
  const out = $('#videoOut');
  out.innerHTML = '<p class="muted">上传视频…</p>';
  try {
    // 先把文件传到服务端，识别时后端要拿到原始字节
    if (state.video && !state.videoUrl) {
      const res = await fetch(`/api/uploads?productId=${encodeURIComponent(state.current.id)}`, {
        method: 'POST',
        headers: { 'content-type': state.video.type || 'video/mp4' },
        body: state.video,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '上传失败');
      state.videoUrl = data.url;
    }
    out.innerHTML = '<p class="muted">转写 + 翻译中…（1 分钟视频约 40–90 秒）</p>';
    const { jobId } = await api('/api/jobs', { method: 'POST', body: { type: 'video', productId: state.current.id, params: { targetLang: $('#vLang').value, fileUrl: state.videoUrl || null, duration: state.videoDuration || null, filename: state.video?.name || null } } });
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

/* ---------------- 模型接入状态 ---------------- */

const CAP_LABEL = { text: '文案', image: '出图', asr: '语音识别', video: '商品短视频' };
const CAP_HINT = {
  text: 'TEXT_BASE_URL / TEXT_API_KEY / TEXT_MODEL',
  image: 'IMAGE_BASE_URL / IMAGE_API_KEY / IMAGE_MODEL',
  asr: 'ASR_BASE_URL / ASR_API_KEY / ASR_MODEL',
};

async function loadMeta() {
  const box = $('#providers');
  if (!box) return;
  try {
    const { providers } = await api('/api/meta');
    box.innerHTML = providers.caps
      .map((c) => {
        const state = providers.mock
          ? '<span class="chip-state off">mock</span>'
          : c.configured
            ? '<span class="chip-state on">已接</span>'
            : '<span class="chip-state off">未配置</span>';
        const detail = c.configured
          ? `${esc(c.model || '（没写模型名）')} · ${esc(c.baseUrl)}`
          : `缺 ${esc((c.missing || []).join(' / '))}`;
        return `<li class="pv" data-cap="${c.name}">
          <div class="pv-main">
            <strong>${CAP_LABEL[c.name] || c.name}</strong>${state}
            <div class="pv-detail">${detail}</div>
          </div>
          <button class="ctl pv-check" type="button" data-cap="${c.name}">自检</button>
          <span class="pv-out note"></span>
        </li>`;
      })
      .join('');
    box.querySelectorAll('.pv-check').forEach((btn) => {
      btn.onclick = async () => {
        const out = btn.parentElement.querySelector('.pv-out');
        out.textContent = '测试中…';
        const cap = btn.dataset.cap.toUpperCase();
        const r = await api('/api/meta/check', { method: 'POST', body: { cap } });
        out.textContent = r.ok ? `通 · ${r.ms}ms · ${r.model || ''}` : `失败：${r.error}`;
      };
    });
  } catch (e) {
    box.innerHTML = `<li class="pv"><div class="pv-main">读不到状态：${esc(e.message)}</div></li>`;
  }
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
  loadMeta();
})();
