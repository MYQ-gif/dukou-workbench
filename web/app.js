window.addEventListener('error', (e) => { const box=document.querySelector('#chat .chat-inner')||document.body; const p=document.createElement('pre'); p.id='__errbox'; p.textContent='JS ERROR: '+e.message+' @ '+e.filename+':'+e.lineno; box.appendChild(p); });
// 前端逻辑 —— 原生 ES Module，无框架、无构建
// 分工：生图 / 记账 = 主人；视频翻译 = 马；接口层 = 卓
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  products: [],
  current: null,
  tab: 'image',
  lastUpload: null,
  lastUploadName: null,
  lastUploadUrl: null,
  lastUploadPreview: null,
  uploads: [],
  video: null,
  platform: 'shopee',
  market: 'sg',
  lang: 'en',
  whTab: 'image',
};

/* 平台表：和 lib/ai.mjs 的 PLATFORMS 保持一致 */
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
    $('#pMeta').textContent = '选好平台语言，发张图或说句话就开始';
    syncProductPicker();
    chatReset();
    return;
  }
  const target = preferId || (state.current?.id && items.some((p) => p.id === state.current.id) ? state.current.id : null);
  if (!target) {
    state.current = null;
    sel.value = '';
    $('#hTitle').textContent = '还没有选择商品';
    $('#pMeta').textContent = items.length ? `已有 ${items.length} 个商品，点顶栏挑一个，或发图新建` : '发张图或说句话就开始';
    syncProductPicker();
    chatReset();
    loadLedger();
    renderWarehouse();
    return;
  }
  sel.value = items.find((p) => p.id === target) ? target : items[0].id;
  await selectProduct(sel.value);
}

function assetTally(p) {
  const list = (p.assets || []).filter((a) => !a.deletedAt);
  const imgs = list.filter((a) => ['main', 'display', 'marketing', 'mockup', 'detail', 'sub'].includes(a.kind)).length;
  const clips = list.filter((a) => a.kind === 'clip').length;
  return [imgs ? `${imgs} 张成图` : '', clips ? `${clips} 段视频` : ''].filter(Boolean).join(' · ') || '待生成';
}

function refreshMeta() {
  const p = state.current;
  if (!p) return;
  const mkHit = (state.markets || []).find((m) => m.id === (state.market || 'us'));
  const mk = mkHit ? mkHit.label : '';
  $('#pMeta').textContent = [pf(p.platform).name, mk, langName(state.lang || 'en'), assetTally(p)].filter(Boolean).join(' · ');
}

async function selectProduct(id, opts = {}) {
  state.current = await api(`/api/products/${id}`);
  const p = state.current;
  if (p.platform) setPlatform(p.platform, false);
  setMarket(p.market || 'us', false);
  $('#hTitle').textContent = p.title;
  refreshMeta();
  syncProductPicker();
  if (!opts.keepChat) chatReset();
  loadLedger();
  renderWarehouse();
}

/* ---------------- 商品选择：按钮 + 抽屉（带搜索） ---------------- */

function syncProductPicker() {
  const name = $('#pdName');
  if (name) name.textContent = state.current ? state.current.title : '选择商品…';
  const count = state.products?.length || 0;
  $('#pdFoot').textContent = count
    ? `共 ${count} 个商品。切换新产品请点「新建商品」或说「新建商品：名字」。`
    : '还没有商品。选好平台语言，发张图并说一句需求即可开始。';
  renderProductList();
}

function renderProductList() {
  const box = $('#pdList');
  const q = ($('#pdSearch').value || '').trim().toLowerCase();
  const items = (state.products || []).filter((p) => !q || String(p.title).toLowerCase().includes(q));
  if (!items.length) {
    box.innerHTML = q
      ? `<p class="pd-empty">没有匹配「${esc(q)}」的商品</p>`
      : '<p class="pd-empty">还没有商品</p>';
    return;
  }
  box.innerHTML = items
    .map(
      (p) => `<button class="pd-item ${state.current?.id === p.id ? 'active' : ''}" type="button" data-pick="${p.id}">
        <span class="pd-item-t">${esc(p.title)}</span>
        <span class="pd-item-d">${esc(pf(p.platform).name)} · ${esc(assetTally(p))}</span>
      </button>`
    )
    .join('');
}

function pdOpen(open) {
  const panel = $('#pd');
  if (open) {
    const btn = $('#btnProducts').getBoundingClientRect();
    const ox = btn.left + btn.width / 2;
    const oy = btn.top + btn.height / 2;
    panel.style.setProperty('--ox', `${ox}px`);
    panel.style.setProperty('--oy', `${oy}px`);
    panel.classList.remove('closing');
  }
  panel.classList.toggle('hidden', !open);
  $('#pdMask').classList.toggle('hidden', !open);
  $('#btnProducts').setAttribute('aria-expanded', String(open));
  if (open) {
    whOpen(false);
    $('#pdSearch').value = '';
    renderProductList();
    setTimeout(() => $('#pdSearch').focus(), 30);
  }
}

/* ---------------- 平台与语言选择 ---------------- */

function setPlatform(id, remember = true) {
  const p = pf(id);
  state.platform = p.id;
  if (remember && (!state.current || !state.current.market)) setMarket(DEFAULT_MARKET[p.id] || 'us', false);
  $('#pfName').textContent = p.name;
  const chip = $('#pfChip');
  chip.textContent = p.short;
  chip.style.background = p.color;
  chip.style.color = ['#f5c518', '#ff9900', '#f2c14e'].includes(p.color) ? '#1a1a1a' : '#fff';
  $$('#pfMenu .pf-item').forEach((b) => b.classList.toggle('on', b.dataset.pf === p.id));
  if (remember && state.current && state.current.platform !== p.id) {
    api(`/api/products/${state.current.id}`, { method: 'PATCH', body: { platform: p.id } }).catch(() => {});
    state.current.platform = p.id;
    refreshMeta();
  }
}

function closeMenus() {
  ['#lgMenu', '#mkMenu', '#pfMenu'].forEach((sel) => {
    const m = $(sel);
    if (m) m.classList.add('hidden');
  });
  $$('.pf-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

function toggleMenu(menuSel, btnSel) {
  const m = $(menuSel);
  const b = $(btnSel);
  if (!m || !b) return;
  const willOpen = m.classList.contains('hidden');
  closeMenus();
  if (willOpen) {
    m.classList.remove('hidden');
    b.setAttribute('aria-expanded', 'true');
    const box = m.querySelector('.pf-search');
    if (box) {
      box.value = '';
      if (menuSel === '#mkMenu') fillMarkets(state.markets || []);
      else buildLangMenu();
    }
  }
}

const LANGS = [
  ['en', '英语'], ['es', '西班牙语'], ['pt', '葡萄牙语'], ['fr', '法语'], ['de', '德语'], ['it', '意大利语'],
  ['nl', '荷兰语'], ['pl', '波兰语'], ['sv', '瑞典语'], ['tr', '土耳其语'], ['ru', '俄语'], ['ar', '阿拉伯语'],
  ['he', '希伯来语'], ['ja', '日语'], ['ko', '韩语'], ['th', '泰语'], ['vi', '越南语'], ['id', '印尼语'],
  ['ms', '马来语'], ['zh', '中文'],
];
function langName(id) {
  const hit = LANGS.find((l) => l[0] === id);
  return hit ? hit[1] : LANGS[0][1];
}
function setLang(id) {
  const next = LANGS.some((l) => l[0] === id) ? id : 'en';
  state.lang = next;
  const name = $('#lgName');
  if (name) name.textContent = langName(next);
  $$('#lgItems .pf-item').forEach((b) => b.classList.toggle('on', b.dataset.lg === next));
}
function wireMenuSearch() {
  const pairs = [['#lgSearch', buildLangMenu], ['#mkSearch', () => fillMarkets(state.markets || [])]];
  for (const [sel, rerender] of pairs) {
    const el = $(sel);
    if (!el || el.dataset.wired) continue;
    el.dataset.wired = '1';
    el.addEventListener('input', () => rerender());
  }
}

function buildLangMenu() {
  const box = $('#lgItems');
  if (!box) return;
  const q = ($('#lgSearch')?.value || '').trim().toLowerCase();
  const hit = LANGS.filter((l) => !q || l[1].includes(q) || l[0].includes(q));
  box.innerHTML = hit.length
    ? hit.map((l) => '<button class="pf-item" type="button" role="option" data-lg="' + l[0] + '"><span>' + l[1] + '</span><span class="pf-dim">' + l[0].toUpperCase() + '</span></button>').join('')
    : '<p class="pf-empty">没有匹配的语言</p>';
  $$('#lgItems .pf-item').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lg); closeMenus(); }));
  const cur = state.lang || 'en';
  $$('#lgItems .pf-item').forEach((b) => b.classList.toggle('on', b.dataset.lg === cur));
}

const DEFAULT_MARKET = { taobao: 'cn', xianyu: 'cn', jd: 'cn', shopee: 'sg', lazada: 'sg', tiktok: 'sg', amazon: 'us', ebay: 'us' };

function setMarket(id, remember = true) {
  const known = Array.isArray(state.markets) && state.markets.some((m) => m.id === id);
  const next = known ? id : state.market || 'us';
  state.market = next;
  const hit = (state.markets || []).find((m) => m.id === next);
  const mkName = $('#mkName');
  if (mkName) mkName.textContent = hit ? hit.label : '目标市场';
  $$('#mkItems .pf-item').forEach((b) => b.classList.toggle('on', b.dataset.mk === next));
  if (remember && state.current && (state.current.market || 'us') !== next) {
    api(`/api/products/${state.current.id}`, { method: 'PATCH', body: { market: next } }).catch(() => {});
    state.current.market = next;
  }
}

const MARKET_GROUPS = [
  ['常见', ['cn', 'hk', 'mo', 'tw', 'sg', 'my', 'th', 'vn', 'id', 'ph', 'jp', 'kr', 'in']],
  ['北美 / 拉美', ['us', 'ca', 'mx', 'br', 'cl', 'arg', 'co']],
  ['欧洲', ['uk', 'de', 'fr', 'it', 'es', 'nl', 'pl', 'se', 'ru']],
  ['中东 / 非洲', ['ae', 'sa', 'il', 'tr', 'eg', 'za', 'ng', 'ke']],
  ['大洋洲', ['au', 'nz']],
];
function marketGroupOf(id) {
  const hit = MARKET_GROUPS.find(([, ids]) => ids.includes(id));
  return hit ? hit[0] : '其他';
}

function fillMarkets(list) {
  if (!Array.isArray(list) || !list.length) return;
  state.markets = list;
  const box = $('#mkItems');
  if (box) {
    const q = ($('#mkSearch')?.value || '').trim().toLowerCase();
    const hit = list.filter((m) => !q || m.label.includes(q) || m.id.includes(q) || (m.lang || '').includes(q));
    const order = MARKET_GROUPS.map((g) => g[0]).concat(['其他']);
    const groups = new Map(order.map((g) => [g, []]));
    for (const m of hit) groups.get(marketGroupOf(m.id)).push(m);
    box.innerHTML = hit.length
      ? [...groups.entries()].filter(([, arr]) => arr.length)
        .map(([g, arr]) => '<div class="pf-group">' + g + '</div>' + arr.map((m) =>
          '<button class="pf-item" type="button" role="option" data-mk="' + m.id + '"><span>' + m.label + '</span><span class="pf-dim">' + (m.lang || '').toUpperCase() + '</span></button>').join('')).join('')
      : '<p class="pf-empty">没有匹配的市场</p>';
    $$('#mkItems .pf-item').forEach((b) => b.addEventListener('click', () => { setMarket(b.dataset.mk); closeMenus(); }));
  }
  const cur = state.market || 'us';
  setMarket(cur, false);
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

/* ---------------- 仓库（持久化基底素材 + 成品图） ---------------- */

function whAssets() {
  const assets = (state.current?.assets || []).filter((a) => !a.deletedAt);
  return {
    base: assets.filter((a) => a.kind === 'refined' || a.kind === 'angle' || a.kind === 'angle_real'),
    uploads: assets.filter((a) => a.kind === 'upload' || a.kind === 'angle_real'),
    images: assets.filter((a) => ['main', 'display', 'marketing', 'mockup', 'detail', 'sub'].includes(a.kind)),
    copies: assets.filter((a) => a.kind === 'copy'),
    content: assets.filter((a) => ['faq', 'anchor', 'keyword_layer'].includes(a.kind)),
    inquiry: assets.filter((a) => ['inquiry', 'reply'].includes(a.kind)),
  };
}

const CONTENT_LABEL = { faq: 'FAQ 与答案卡', anchor: '事实锚点', keyword_layer: '六层关键词', inquiry: '原始询盘', reply: '回信草稿' };

const whSel = { on: false, picked: new Set() };
let dragId = null;

function renderWhBar() {
  const n = whSel.picked.size;
  const bar = $('#whBar');
  if (!bar) return;
  $('#whBarText').textContent = n ? `已选 ${n} 张` : '点图选中，可批量删除';
  $('#whDel').disabled = !n;
}

function whSetSel(on) {
  whSel.on = on;
  whSel.picked.clear();
  const btn = $('#whSel');
  btn.textContent = on ? '完成' : '选择';
  btn.setAttribute('aria-pressed', String(on));
  $('#whBar').classList.toggle('hidden', !on);
  renderWhBar();
  renderWarehouse();
}

function togglePick(id, fig) {
  if (whSel.picked.has(id)) whSel.picked.delete(id);
  else whSel.picked.add(id);
  const picked = whSel.picked.has(id);
  fig.classList.toggle('picked', picked);
  if (picked) {
    fig.classList.remove('tick');
    void fig.offsetWidth;
    fig.classList.add('tick');
  }
  renderWhBar();
}

async function whDeletePicked() {
  const ids = [...whSel.picked];
  if (!ids.length || !state.current) return;
  ids.forEach((id) => document.querySelector(`.wh-item[data-asset="${id}"]`)?.classList.add('removing'));
  await new Promise((r) => setTimeout(r, 420));
  for (const id of ids) {
    await api(`/api/assets/${id}`, { method: 'DELETE' }).catch(() => {});
  }
  whSel.picked.clear();
  state.current = await api(`/api/products/${state.current.id}`);
  refreshMeta();
  renderWhBar();
  renderWarehouse();
  toast(`已删除 ${ids.length} 张`, async () => {
    for (const id of ids) await api(`/api/assets/${id}/restore`, { method: 'POST' }).catch(() => {});
    state.current = await api(`/api/products/${state.current.id}`);
    refreshMeta();
    renderWarehouse();
    toast('已恢复');
  });
}

let toastTimer = null;
function toast(text, onUndo) {
  const el = $('#toast');
  if (!el) return;
  $('#toastText').textContent = text;
  const btn = $('#toastUndo');
  btn.classList.toggle('hidden', !onUndo);
  btn.onclick = async () => {
    el.classList.remove('show');
    if (onUndo) await onUndo();
  };
  el.classList.remove('hidden');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), onUndo ? 6000 : 2400);
  el.addEventListener(
    'transitionend',
    () => {
      if (!el.classList.contains('show')) el.classList.add('hidden');
    },
    { once: true },
  );
}

function renderWarehouse() {
  const { base, images, copies, content, inquiry } = whAssets();
  const texts = copies.length + content.length + inquiry.length;
  const total = base.length + images.length + texts;
  $('#whCount').textContent = total;
  if (state.lastWhCount != null && total > state.lastWhCount) {
    const btn = $('#btnWarehouse');
    btn.classList.remove('bump');
    void btn.offsetWidth;
    btn.classList.add('bump');
  }
  state.lastWhCount = total;
  $('#whImgNum').textContent = base.length + images.length;
  $('#whCopyNum').textContent = texts;
  $$('.wh-tab').forEach((t) => t.classList.toggle('active', t.dataset.wh === state.whTab));

  const body = $('#whBody');
  if (!state.current) {
    body.innerHTML = '<p class="muted">还没有商品。新建一个，基底素材和成品图会攒在这里。</p>';
    return;
  }
  if (state.whTab === 'image') {
    if (!base.length && !images.length) {
      body.innerHTML = '<p class="muted">还没有图。回「生图」发张产品图并说一句需求，精修基底与成图会自动进这里。</p>';
      return;
    }
    const order = state.current.detailOrder || [];
    const imagesSorted = images.slice().sort((a, b) => {
      const ra = a.kind === 'detail' ? 1 : 0;
      const rb = b.kind === 'detail' ? 1 : 0;
      if (ra !== rb) return ra - rb;
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia < 0 && ib < 0) return 0;
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
    let seq = 0;
    const KIND_TEXT = {
      refined: '精修底图',
      angle: '视角基准',
      angle_real: '实拍视角',
      display: '产品展示',
      main: '电商主图',
      marketing: '营销海报',
      mockup: '品牌样机',
      detail: '详情页',
    };
    const card = (a) => {
      const isReal = a.kind === 'angle_real';
      const label =
        a.kind === 'refined'
          ? `精修底图 · ${a.meta?.crop || '1:1'}`
          : a.kind === 'angle' || a.kind === 'angle_real'
            ? `${KIND_TEXT[a.kind]} · ${a.meta?.angle || ''}`
            : `${KIND_TEXT[a.meta?.template || a.kind] || a.kind}${a.meta?.index ? ` #${a.meta.index}` : ''}`;
      const picked = whSel.picked.has(a.id);
      const canDrag = a.kind === 'detail';
      seq += 1;
      return `<figure class="wh-item${picked ? ' picked' : ''}" data-asset="${a.id}" data-drag="${canDrag ? '1' : '0'}" draggable="${canDrag}" style="--i:${seq}">
        <img src="${a.url}" alt="">
        ${whSel.on ? '<span class="pick" aria-hidden="true"></span>' : ''}
        <figcaption>${esc(label)} · ${a.width}×${a.height}
          ${isReal ? '<span class="chip-real">实拍</span>' : a.meta?.usedRefined ? '<span class="chip-ref">引精修</span>' : ''}
        </figcaption>
      </figure>`;
    };
    body.classList.toggle('picking', whSel.on);
    body.innerHTML = [
      base.length ? `<h4 class="wh-group">锁定基底素材库 <span class="muted">同产品周期内持续复用</span></h4><div class="wh-grid">${base.map(card).join('')}</div>` : '',
      images.length
        ? `<h4 class="wh-group">交付成品图 ${order.length ? '<span class="muted">详情屏可拖拽调序</span>' : ''}</h4><div class="wh-grid">${imagesSorted.map(card).join('')}</div>`
        : '',
    ].join('');

    body.querySelectorAll('.wh-item').forEach((fig) => {
      const id = fig.dataset.asset;
      fig.addEventListener('click', (ev) => {
        if (whSel.on) {
          ev.preventDefault();
          togglePick(id, fig);
          return;
        }
        const img = fig.querySelector('img');
        if (img) window.open(img.src, '_blank');
      });
      if (fig.dataset.drag === '1' && !whSel.on) {
        fig.addEventListener('dragstart', (ev) => {
          dragId = id;
          fig.classList.add('dragging');
          ev.dataTransfer?.setData('text/plain', id);
          if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
        });
        fig.addEventListener('dragend', () => {
          fig.classList.remove('dragging');
          fig.classList.remove('drop-target');
        });
        fig.addEventListener('dragover', (ev) => {
          if (!dragId || dragId === id) return;
          ev.preventDefault();
          fig.classList.add('drop-target');
        });
        fig.addEventListener('dragleave', () => fig.classList.remove('drop-target'));
        fig.addEventListener('drop', async (ev) => {
          ev.preventDefault();
          fig.classList.remove('drop-target');
          const from = dragId;
          dragId = null;
          if (!from || from === id) return;
          const list = imagesSorted.filter((x) => x.kind === 'detail').map((x) => x.id);
          const a = list.indexOf(from);
          const b = list.indexOf(id);
          if (a < 0 || b < 0) return;
          list.splice(b, 0, list.splice(a, 1)[0]);
          state.current.detailOrder = list;
          const figEl = fig.closest('.wh-grid');
          figEl?.classList.add('settling');
          await api(`/api/products/${state.current.id}`, { method: 'PATCH', body: { detailOrder: list } });
          renderWarehouse();
        });
      }
    });
  } else {
    if (!texts) {
      body.innerHTML = '<p class="muted">还没有文字产物。点「只要文案」写 listing，或说一句「这批买家会问什么」做内容资产，贴一段询盘也行。</p>';
      return;
    }
    const textCard = (a) => `<article class="wh-copy">
      <div class="wh-copy-head">
        <span class="tag">${esc(CONTENT_LABEL[a.kind] || a.kind)}</span>
        <button class="link" data-copy="${a.id}">复制全文</button>
      </div>
      <pre class="wh-text">${esc(a.meta?.text || '')}</pre>
    </article>`;
    body.innerHTML = [
      content.length ? `<h4 class="wh-group">内容资产 <span class="muted">买家问题 / 锚点 / 词表</span></h4>${content.slice().reverse().map(textCard).join('')}` : '',
      inquiry.length ? `<h4 class="wh-group">询盘与回信</h4>${inquiry.slice().reverse().map(textCard).join('')}` : '',
      copies.length
        ? `<h4 class="wh-group">listing 文案</h4>` +
          copies
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
            .join('')
        : '',
    ].join('');
    body.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.onclick = async () => {
        const all = [...copies, ...content, ...inquiry];
        const a = all.find((x) => x.id === btn.dataset.copy);
        const text =
          a.meta?.text || [a.meta?.title, ...(a.meta?.bullets || []), a.meta?.detail].filter(Boolean).join('\n');
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
  for (const m of hist) say(inner, m.who, m.html, { persist: false, replay: true });
  if (!hist.length) {
    const own = (p?.assets || [])
      .map((x) => (typeof x === 'string' ? (state.current.assets || []).find((a) => a.id === x) : x))
      .filter((a) => a && !a.deletedAt);
    const made = own.filter((a) => ['main', 'display', 'marketing', 'mockup', 'detail'].includes(a.kind));
    const opening = made.length
      ? `<p>「${esc(p.title)}」已就位，基底素材库已锁定复用。</p>
     <p>最近生成的 ${Math.min(made.length, 3)} 张成图在下面，全部 ${made.length} 张在右上角「仓库」里。</p>
     <p class="muted-sm">同产品下可直接继续点单：出精修图、产品展示图、电商主图、营销海报或 6 屏详情页。</p>`
      : `<p>${p ? `「${esc(p.title)}」已就位。` : '请先在顶栏选定目标平台与语言，再上传 1 张产品实拍图并输入一句话需求。'}</p>
     <p>收到图片与需求后，我会先做<strong>商业分析与纯文本主视觉定调</strong>，并一次性向你确认补充视角与交付方式，锁定素材库后再精准出图。</p>
     <p class="muted-sm">也可以直接点下面任意快捷指令开始：</p>`;
    say(
      inner,
      'ai',
      `${opening}
       <div class="tiles">
         <button class="tile" type="button" data-fill="帮我做一套完整的6屏详情页图片">
           <span class="tile-t">1. 详情页套图（6屏）</span>
           <span class="tile-d">品牌认知 → 核心卖点 → 产品细节 → 功能展示 → 使用场景 → 购买理由</span>
         </button>
         <button class="tile" type="button" data-fill="出一张电商主图，突出核心卖点">
           <span class="tile-t">2. 电商主图</span>
           <span class="tile-d">锁定原图主体，围绕单一核心卖点打造高点击主图</span>
         </button>
         <button class="tile" type="button" data-fill="出一张产品展示图，突出材质与高级氛围感">
           <span class="tile-t">3. 产品展示图</span>
           <span class="tile-d">商业布景与自然光影融合，突出高级质感与克制留白</span>
         </button>
         <button class="tile" type="button" data-fill="出一张营销海报，适配当前平台语言">
           <span class="tile-t">4. 营销海报 & 样机</span>
           <span class="tile-d">支持竖版/横版/方形海报，可延展手机版与包装/展架/广告牌样机</span>
         </button>
       </div>`,
      { persist: false }
    );
    if (made.length) {
      const bubble = $('#chat .chat-inner').lastElementChild;
      shots(bubble.querySelector('.bubble'), made.slice(-3));
    }
  }
  box.scrollTop = box.scrollHeight;
}

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
function patchHistory(html) {
  const k = histKey();
  if (!k) return;
  const arr = loadHistory();
  if (!arr.length) return;
  arr[arr.length - 1].html = html;
  try { localStorage.setItem(k, JSON.stringify(arr)); } catch {}
}

const NEW_WORDS = /^(?:新建商品|新商品|新建|新加|换个商品|换一个商品|换商品)/;
function newProductTitle(text) {
  const m = String(text || '').match(/^(?:新建商品|新商品|新建|新加|换个商品|换一个商品|换商品)\s*[:：,，]?\s*/);
  return m ? text.slice(m[0].length).trim() : '';
}

async function ensureProduct(text, fileName, forceNew = false) {
  const explicit = newProductTitle(text || '');
  const wantsNew = forceNew || NEW_WORDS.test(String(text || ''));
  if (state.current && !wantsNew) return state.current;

  const fallback = String(fileName || '').replace(/\.[^.]+$/, '');
  const guess = String(text || '').slice(0, 18);
  const looksLikeAction = /^(用|把|做|出|生成|来|给我|帮|按|这|那|我要)/.test(guess.trim());
  const title = (explicit || (wantsNew || looksLikeAction ? '' : guess) || fallback || '新商品').trim();
  const product = await api('/api/products', {
    method: 'POST',
    body: {
      title: title.slice(0, 40),
      platform: state.platform,
      sellingPoints: [],
      market: state.market || 'us',
      rawText: wantsNew ? '' : String(text || ''),
      targetLangs: [state.lang || 'en'],
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
  if (who === 'ai' && opts.reveal !== false && !opts.replay && !/static/.test(location.search)) el.classList.add('fresh');
  container.appendChild(el);
  if (opts.persist !== false) pushHistory(who, html);
  const scroller = el.closest('.chat');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  return el;
}

function shots(bubble, assets) {
  const wrap = document.createElement('div');
  wrap.className = 'shots';
  assets.forEach((a, i) => {
    const fig = document.createElement('figure');
    fig.className = 'drop';
    fig.style.animationDelay = `${i * 45}ms`;
    fig.innerHTML = `<img src="${a.url}" alt=""><figcaption>${esc(tplLabel(a.meta?.template || a.kind))} · ${a.width}×${a.height}</figcaption>`;
    const img = fig.querySelector('img');
    img.onclick = () => window.open(a.url, '_blank');
    img.onload = () => {
      const scroller = bubble.closest('.chat');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    };
    wrap.appendChild(fig);
  });
  if (assets.length > 3) wrap.classList.add('many');
  bubble.appendChild(wrap);
  patchHistory(bubble.innerHTML);
}

function progressBubble(text, opts = {}) {
  const inner = $('#chat .chat-inner');
  const boot = opts.loader ? '<div class="duk-loader-wrap" aria-hidden="true"><span class="duk-loader"></span></div>' : '';
  const el = say(inner, 'ai', `${boot}<div class="typing"><i></i><i></i><i></i></div><p>${text}</p><div class="progress"><div class="bar"><i></i></div><span>0%</span></div>`, { persist: false });
  const bar = el.querySelector('.bar i');
  const label = el.querySelector('.progress span');
  const bootEl = el.querySelector('.duk-loader-wrap');
  const textEl = el.querySelector('p');
  const originalText = text;
  let slowTimer = null;
  if (opts.loader) {
    const after = Number(opts.slowAfter) || Number(window.__slowAfter) || 90000;
    slowTimer = setTimeout(() => {
      if (!el.isConnected || target >= 35) return;
      textEl.textContent = opts.slowText || '还在排队，没死机。这一步正常要 1–2 分钟，你可以先去别的 tab，出好了会留在这条消息里。';
      el.classList.add('slow');
    }, after);
  }
  let target = 0;
  let cur = 0;
  let raf = null;
  let tag = '';
  const frame = () => {
    cur = target > cur ? Math.min(target, cur + 3) : target;
    if (bar) bar.style.width = cur + '%';
    if (label) label.textContent = Math.round(cur) + '%' + (tag ? ' · ' + tag : '');
    if (cur < target) raf = requestAnimationFrame(frame);
    else raf = null;
  };

  return {
    update(pct, note) {
      target = Math.max(0, Math.min(100, Number(pct) || 0));
      if (note) tag = note;
      if (bootEl && target > 8) {
        bootEl.classList.add('done');
        setTimeout(() => bootEl.remove(), 260);
      }
      if (target >= 35 && el.classList.contains('slow')) {
        el.classList.remove('slow');
        textEl.textContent = originalText;
      }
      if (slowTimer && target >= 35) {
        clearTimeout(slowTimer);
        slowTimer = null;
      }
      if (!raf) raf = requestAnimationFrame(frame);
    },
    done() {
      if (slowTimer) clearTimeout(slowTimer);
      el.remove();
    },
  };
}

/* ---------------- 上传 ---------------- */

async function uploadFile(file, opts = {}) {
  const buf = await file.arrayBuffer();
  const qs = new URLSearchParams();
  if (state.current) qs.set('productId', state.current.id);
  if (opts.kind) qs.set('kind', opts.kind);
  if (opts.angle) qs.set('angle', opts.angle);
  const res = await fetch(`/api/uploads?${qs.toString()}`, {
    method: 'POST',
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'x-filename': encodeURIComponent(file.name),
      ...(opts.kind ? { 'x-asset-kind': opts.kind } : {}),
    },
    body: buf,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || '上传失败');
  return data;
}

/* ---------------- 任务轮询 ---------------- */

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

/* ---------------- 5 种交付模式识别 ---------------- */

const DELIVERABLE_OPTIONS = [
  ['refine', '产品精修图'],
  ['display', '产品展示图'],
  ['main', '电商主图'],
  ['marketing', '营销海报'],
  ['detail', '详情页套图（6屏）'],
];

function detectDeliverableMode(text) {
  const s = String(text || '');
  if (/精修|修图|白底图|去背景|去杂物/.test(s)) return 'refine';
  if (/展示图|产品展示|场景图|氛围图/.test(s)) return 'display';
  if (/详情页|详情长图|详情图|六段|六屏|整页详情|套图/.test(s)) return 'detail';
  if (/海报|poster|宣传图|活动图|样机/.test(s)) return 'marketing';
  if (/主图|首图|listing/.test(s)) return 'main';
  const sel = $('#template')?.value;
  if (['refine', 'display', 'main', 'marketing', 'detail'].includes(sel)) return sel;
  return 'main';
}


/* ---------------- 阶段一：8 维商业分析 + 纯文本主视觉 + 前置收口提问（不生图） ---------------- */

const ANGLES = [
  ['front', '正面'],
  ['deg45', '45°侧角'],
  ['side_right', '侧面'],
  ['back', '背面'],
  ['detail_macro', '细节特写'],
];

function askDirectorBrief({ title, thumb, analysis, spec, initialMode }) {
  const inner = $('#chat .chat-inner');
  // 收起旧的未完成确认卡，避免重复叠卡片
  document.querySelectorAll('#chat .msg.ai .director-card').forEach((card) => {
    card.closest('.msg')?.remove();
  });

  const pal = spec?.palette || {};
  const needModelDefault = ['apparel', 'beauty', 'home', 'sport', 'jewel'].includes(analysis?.category);
  const st = {
    mode: initialMode || 'main',
    angles: [],
    model: needModelDefault ? 'yes' : 'no',
    quality: '1k',
    extraUploads: 0,
  };

  const el = say(inner, 'ai', `
    <div class="director-card">
      <p class="ask-q">已完成商业分析与纯文本主视觉定调（暂未生图），确认以下细节后立刻锁定素材库开工：</p>
      <div class="ask-sub">${esc(title || '当前商品')}${thumb ? `<img class="thumb" src="${thumb}" alt="">` : ''}</div>

      <div class="opt" style="background:rgba(0,0,0,0.03);padding:8px 10px;margin-bottom:8px;">
        <div class="opt-label">一、商业分析与主视觉规范（纯文本定调）<span class="opt-hint">${esc(analysis?.categoryName || '')}</span></div>
        <ul style="margin:4px 0 6px 16px;padding:0;font-size:13px;line-height:1.5;">
          <li><b>产品定位：</b>${esc(analysis?.positioning || '')}</li>
          <li><b>目标客群：</b>${esc(analysis?.target_user || '')}</li>
          <li><b>视觉风格：</b>${esc(analysis?.visual_style || '')}</li>
          <li><b>光影与构图：</b>${esc(spec?.lighting || '')}；${esc(spec?.composition || '')}</li>
        </ul>
        ${pal.base ? `<div class="spec">${['base', 'accent', 'support'].map((k) => (pal[k] ? `<span class="sw" style="background:${pal[k]}" title="${k} ${pal[k]}"></span>` : '')).join('')}<span class="spec-t">主视觉色板 · 规范 v${spec?.version || 1}</span></div>` : ''}
      </div>

      <div class="opt">
        <div class="opt-label">1. 确认本次交付物<span class="opt-hint">精修与视角将作为基底素材锁死复用</span></div>
        <div class="opt-row" data-k="mode">
          ${DELIVERABLE_OPTIONS.map(([v, t]) => `<button type="button" class="chip${st.mode === v ? ' on' : ''}" data-v="${v}">${t}</button>`).join('')}
        </div>
      </div>

      <div class="opt">
        <div class="opt-label">2. 补充其他角度实拍图（推荐，直接入库省去生成）<span class="opt-hint" id="extraAngleHint">有背面/侧面/细节图可直接传</span></div>
        <div class="opt-row" data-k="angles">
          ${ANGLES.map(([v, t]) => `<button type="button" class="chip" data-v="${v}">${t}</button>`).join('')}
          <label class="chip" style="cursor:pointer;border-style:dashed;">
            + 上传多视角图
            <input type="file" id="extraAngleFiles" accept="image/*" multiple style="display:none;">
          </label>
        </div>
      </div>

      <div class="opt">
        <div class="opt-label">3. 是否需要真人模特出镜<span class="opt-hint">服饰/美妆/穿戴类推荐开启</span></div>
        <div class="opt-row" data-k="model">
          <button type="button" class="chip${st.model === 'no' ? ' on' : ''}" data-v="no">不用模特（纯产品）</button>
          <button type="button" class="chip${st.model === 'yes' ? ' on' : ''}" data-v="yes">需要匹配客群的模特</button>
        </div>
      </div>

      <div class="opt">
        <div class="opt-label">4. 确认/补充核心卖点（最多 3 条）<span class="opt-hint">留空则沿用分析提炼</span></div>
        <div class="opt-row">
          <input class="in wide" id="briefSelling" value="${esc((analysis?.selling_points || []).join('、'))}" placeholder="例如：主动降噪、40小时续航、航空级铝合金">
        </div>
      </div>

      <div class="ask-foot">
        <button type="button" class="link" data-act="cancel">暂不生成</button>
        <button type="button" class="btn-primary" data-act="go">锁定素材库并开始制作</button>
      </div>
    </div>
  `, { persist: false });

  const bubble = el.querySelector('.bubble');
  const sellingInput = el.querySelector('#briefSelling');
  const extraInput = el.querySelector('#extraAngleFiles');
  const extraHint = el.querySelector('#extraAngleHint');

  extraInput?.addEventListener('change', async (ev) => {
    const files = [...(ev.target.files || [])].slice(0, 6);
    if (!files.length) return;
    extraHint.textContent = '正在上传多视角实拍图…';
    try {
      for (const f of files) {
        await uploadFile(f, { kind: 'angle_real' });
        st.extraUploads += 1;
      }
      if (state.current) state.current = await api(`/api/products/${state.current.id}`);
      renderWarehouse();
      extraHint.textContent = `已入库 ${st.extraUploads} 张实拍视角图（100% 还原复用）`;
    } catch (err) {
      extraHint.textContent = `上传失败：${err.message}`;
    }
    ev.target.value = '';
  });

  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (!ok) {
        el.remove();
        resolve(null);
        return;
      }
      const sellingList = sellingInput.value
        .split(/[、,，;；\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 3);
      const brief = {
        angles: st.angles,
        usage: st.mode,
        model: st.model,
        selling: sellingList.join('、'),
        sellingPoints: sellingList,
        extraUploads: st.extraUploads,
        askedAt: new Date().toISOString(),
      };
      const modeName = DELIVERABLE_OPTIONS.find((x) => x[0] === st.mode)?.[1] || st.mode;
      bubble.innerHTML = `<p class="ask-done">已确认：交付【${esc(modeName)}】 · 模特【${st.model === 'yes' ? '需要' : '不用'}】${st.extraUploads ? ` · 已补充 ${st.extraUploads} 张实拍视角` : ''}。正在锁定基底素材并制作…</p>`;
      patchHistory(bubble.innerHTML);
      resolve({ mode: st.mode, brief, sellingPoints: sellingList, needModel: st.model === 'yes' });
    };

    el.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.chip');
      if (chip && chip.dataset.v) {
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

/** 阶段一纯文本分析任务（不生图） */
async function runStageOneAnalyze(askText) {
  const pid = state.current.id;
  const prog = progressBubble('正在进行产品商业分析与纯文本主视觉定调…');
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: {
        type: 'analyze',
        productId: pid,
        params: {
          platform: state.platform,
          lang: state.lang || 'en',
          brief: { selling: askText || '' },
        },
      },
    });
    const res = await jobPromise(jobId, (job) => prog.update(job.progress || 0, '分析中'));
    prog.done();
    state.current = await api(`/api/products/${pid}`);
    return res;
  } catch (e) {
    prog.done();
    throw e;
  }
}

/** 阶段二第一步：建立并持久化锁定「精修底图 + 一致性视角」双素材库 */
async function runPrepare(brief, opts = {}) {
  if (!state.current) return null;
  const inner = $('#chat .chat-inner');
  const pid = state.current.id;
  const silent = !!opts.silent;
  try {
    if (brief) {
      await api(`/api/products/${pid}`, {
        method: 'PATCH',
        body: {
          brief,
          ...(brief.sellingPoints?.length ? { sellingPoints: brief.sellingPoints } : {}),
        },
      });
    }
    const prog = silent
      ? progressBubble('正在锁定产品精修底图与一致性视角素材（后台）…')
      : progressBubble('正在生成产品精修图与一致性多视角基准…', { loader: true });
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: {
        type: 'visual',
        productId: pid,
        params: {
          platform: state.platform,
          brief: brief || {},
          realAngles: brief?.angles || [],
        },
      },
    });
    const res = await jobPromise(jobId, (job) => prog.update(job.progress || 0, '精修锁形'));
    prog.done();
    await selectProduct(pid, { keepChat: true });

    const all = state.current?.assets || [];
    const mine = (res.assets || []).map((id) => all.find((a) => a.id === id)).filter(Boolean);
    if (silent) {
      say(inner, 'ai', `<p class="muted-sm">已锁定 ${mine.length} 张精修与视角基底素材（存入仓库「锁定基底素材库」，后续全程复用）。</p>`, { persist: false });
      return res;
    }
    // 用户明确要的就是「产品精修图」时，直接展示精修成图
    const refinedOnly = mine.filter((a) => a.kind === 'refined');
    const displayList = refinedOnly.length ? refinedOnly : mine;
    const bubble = say(inner, 'ai', `<p>产品精修图已生成（共 ${displayList.length} 张），并已锁定至当前商品基底素材库供后续复用。</p>`);
    if (displayList.length) shots(bubble.querySelector('.bubble'), displayList);
    return res;
  } catch (e) {
    say(inner, 'ai', `<p class="err">基底素材生成失败：${esc(e.message)}</p>`);
    return null;
  }
}

/* ---------------- 阶段二第二步：按指定模式精准出图 ---------------- */

async function doImage(askText, opts = {}) {
  const text = String(askText || '').trim();
  const tpl = opts.template || detectDeliverableMode(text);

  // 详情页模式严格走 6 屏详情页专用管线，绝不走单图通道
  if (tpl === 'detail') {
    return doDetail(text, opts);
  }
  // 精修图模式严格走精修锁定管线
  if (tpl === 'refine') {
    return runPrepare(opts.brief || state.current?.brief || {}, { silent: false });
  }

  await ensureProduct(text, state.lastUploadName);
  const inner = $('#chat .chat-inner');
  const before = new Set((state.current.assets || []).map((a) => a.id));
  const lang = state.lang || 'en';
  const platformId = state.platform;
  const count = opts.count || Number(($('#imgCount') || {}).value) || 2;
  const width = opts.width || null;
  const height = opts.height || null;
  const quality = opts.quality || '1k';
  const needModel = Boolean(opts.needModel ?? (state.current?.brief?.model === 'yes'));

  const box = progressBubble(`正在生成【${tplLabel(tpl)}】（严格锁定精修底图与主视觉规范）…`);
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: {
        type: 'image',
        productId: state.current.id,
        params: {
          assetId: state.lastUpload,
          platform: platformId,
          template: tpl,
          lang,
          count,
          width,
          height,
          quality,
          needModel,
          prompt: text || undefined,
        },
      },
    });
    await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    state.current = await api(`/api/products/${state.current.id}`);
    const fresh = (state.current.assets || []).filter(
      (a) => !a.deletedAt && !['upload', 'copy', 'refined', 'angle', 'angle_real'].includes(a.kind) && !before.has(a.id)
    );
    const bubble = say(inner, 'ai', `<p>${fresh.length ? `【${tplLabel(tpl)}】已生成 ${fresh.length} 张，已同步存入仓库。` : '任务完成。'}</p>`);
    if (fresh.length) shots(bubble.querySelector('.bubble'), fresh);

    // 营销海报交付后，主动提供「手机版样式」与「品牌线下/包装样机」延伸入口
    if (tpl === 'marketing' && fresh.length) {
      say(
        inner,
        'ai',
        `<p class="muted-sm">需要基于同一套主视觉继续延伸线下或移动端物料吗？点一下直接生成：</p>
         <div class="tiles">
           <button class="tile" type="button" data-quick-mode="marketing_mobile">
             <span class="tile-t">生成手机版海报（9:16）</span>
             <span class="tile-d">保持内容与主视觉一致，适配移动端竖屏安全区</span>
           </button>
           <button class="tile" type="button" data-quick-mode="mockup">
             <span class="tile-t">生成品牌商业样机</span>
             <span class="tile-d">手机界面、产品包装、户外广告牌、线下展架与橱窗展示</span>
           </button>
         </div>`,
        { persist: false }
      );
    }

    refreshMeta();
    renderWarehouse();
    state.lastUpload = null;
    state.lastUploadPreview = null;
    state.uploads = [];
    $('#attachInfo').textContent = '未附图片';
    renderTray();
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p class="err">出图失败：${esc(e.message)}</p>`);
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
  const box = progressBubble('排队等 Seedance 出片…', { loader: true });
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
    say(inner, 'ai', `<p class="err">出视频失败：${esc(e.message)}</p>`);
  }
}

async function doCopy() {
  await ensureProduct($('#ask').value.trim(), state.lastUploadName);
  const inner = $('#chat .chat-inner');
  say(inner, 'user', `<p>只要文案 · ${esc(pf(state.platform).name)}</p>`);
  const box = progressBubble('正在写文案…');
  try {
    const { jobId } = await api('/api/jobs', { method: 'POST', body: { type: 'copy', productId: state.current.id, params: { lang: state.lang || 'en', platform: state.platform } } });
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
    say(inner, 'ai', `<p class="err">失败：${esc(e.message)}</p>`);
  }
}

const tplLabel = (t) =>
  ({
    refine: '产品精修图',
    refined: '产品精修图',
    display: '产品展示图',
    main: '电商主图',
    marketing: '营销海报',
    mockup: '品牌样机',
    detail: '详情页套图',
  }[t] || t);

const langLabel = (l) => langName(l);


/* ---------------- GEO 内容资产 ---------------- */

async function ensureTarget(askText) {
  if (state.current) return true;
  try {
    const list = await api('/api/products');
    const items = list.items || [];
    if (items.length === 1) {
      await selectProduct(items[0].id);
      return !!state.current;
    }
    if (!items.length) {
      await ensureProduct(askText, state.lastUploadName);
      return !!state.current;
    }
  } catch {
    /* ignore */
  }
  return false;
}

async function doGeo(askText) {
  const inner0 = $('#chat .chat-inner');
  if (!(await ensureTarget(askText))) {
    say(inner0, 'ai', '<p>先选一个商品：顶栏下拉里挑一个，再说这句。</p>');
    return;
  }
  const inner = $('#chat .chat-inner');
  say(inner, 'user', `<p>${esc(askText || '这批买家会问什么')}</p><p class="meta-line">内容资产 · ${esc(pf(state.platform).name)}</p>`);
  const box = progressBubble('正在拆买家问题、找事实锚点…');
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: {
        type: 'geo',
        productId: state.current.id,
        params: { platform: state.platform, lang: state.lang || 'en', brief: state.current.brief || {} },
      },
    });
    const r = await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    const qRows = (r.questions || []).slice(0, 10).map((q) => `<li><b>${esc(q.catName)}</b> · ${esc(q.q)}<span class="muted-sm">（${esc(q.where)}）</span></li>`).join('');
    const aRows = (r.anchors || []).map((a) => `<li>${esc(a.before)} → <b>${esc(a.after)}</b><span class="muted-sm">（${esc(a.why)}）</span></li>`).join('');
    const kRows = (r.keywords || []).map((k) => `<li>${esc(k.layer)} · ${esc(k.term)}<span class="muted-sm"> → ${esc(k.where)}</span></li>`).join('');
    say(inner, 'ai', `
      <h3>买家会问什么</h3><ul>${qRows}</ul>
      <h3>事实锚点（把形容词换成数字）</h3><ul>${aRows}</ul>
      <h3>六层关键词</h3><ul>${kRows}</ul>
      <p class="muted-sm">${esc(r.note || '')} · 三张卡已存进仓库「内容资产」</p>`);
    state.current = await api(`/api/products/${state.current.id}`);
    refreshMeta();
    renderWarehouse();
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p class="err">做内容资产失败：${esc(e.message)}</p>`);
  }
}

/* ---------------- 详情页套图（完整 6 屏：品牌认知→核心卖点→产品细节→功能展示→使用场景→购买理由） ---------------- */

async function doDetail(askText, opts = {}) {
  const inner0 = $('#chat .chat-inner');
  if (!(await ensureTarget(askText))) {
    say(inner0, 'ai', '<p>请先上传产品图或从顶栏选择一个商品，再生成详情页套图。</p>');
    return;
  }
  const inner = $('#chat .chat-inner');
  if (!whAssets().base.length) {
    await runPrepare(null, { silent: true });
  }
  if (!opts.silent) {
    say(inner, 'user', `<p>${esc(askText || '生成详情页套图（6屏）')}</p><p class="meta-line">详情页套图 · 6 屏完整结构 · ${esc(pf(state.platform).name)}</p>`);
  }
  const needModel = Boolean(opts.needModel ?? (state.current?.brief?.model === 'yes'));
  const box = progressBubble('正在按 6 屏结构生成详情页套图（品牌→卖点→细节→功能→场景→购买理由）…');
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: {
        type: 'detail',
        productId: state.current.id,
        params: {
          platform: state.platform,
          lang: state.lang || 'en',
          needModel,
        },
      },
    });
    const r = await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    state.current = await api(`/api/products/${state.current.id}`);
    const bySeg = new Map((r.segments || []).map((s) => [s.index, s]));
    const shotsHtml = (r.assets || [])
      .map((id) => (state.current.assets || []).find((a) => a.id === id))
      .filter(Boolean)
      .map((a) => {
        const seg = bySeg.get(a.meta?.index) || {};
        return `<figure><img src="${a.url}" alt="" data-open="${a.url}"><figcaption>${a.meta?.index || ''}. ${esc(seg.title || a.meta?.segTitle || '')}</figcaption></figure>`;
      })
      .join('');
    const copies = (r.segments || [])
      .map((s) => `<li><b>${s.index}. ${esc(s.title)}</b><br><span style="white-space:pre-wrap">${esc(s.copy)}</span></li>`)
      .join('');
    const bubble = say(inner, 'ai', `
      <p>6 屏详情页套图已生成${r.errors?.length ? `（${r.errors.length} 屏失败）` : ''}，已全部存入仓库（支持拖拽调整屏序）。</p>
      <div class="shots many">${shotsHtml}</div>
      <h3>各屏排版文案参考</h3><ul>${copies}</ul>
      <p class="muted-sm">${esc(r.note || '')}</p>`);
    bubble.querySelectorAll('img[data-open]').forEach((img) => {
      img.onclick = () => window.open(img.dataset.open, '_blank');
    });
    refreshMeta();
    renderWarehouse();
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p class="err">出详情页失败：${esc(e.message)}</p>`);
  }
}

/* ---------------- 询盘解析 ---------------- */

async function doInquiry(rawText) {
  const text = String(rawText || '').trim();
  const inner0 = $('#chat .chat-inner');
  if (!(await ensureTarget(''))) {
    say(inner0, 'ai', '<p>先选一个商品：顶栏下拉里挑一个，再把询盘贴进来。</p>');
    return;
  }
  const inner = $('#chat .chat-inner');
  say(inner, 'user', `<p>${esc(text.slice(0, 220))}${text.length > 220 ? '…' : ''}</p><p class="meta-line">询盘解析</p>`);
  const box = progressBubble('正在抽要素、标风险…');
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: { type: 'inquiry', productId: state.current.id, params: { text, langs: ['en', 'zh'] } },
    });
    const r = await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    const fields = (r.fields || []).map((f) => `<li>${esc(f.label)}：<b>${esc(f.value)}</b></li>`).join('');
    const risks = (r.risks || []).map((x) => `<li><span class="tag">${x.level === 'warn' ? '注意' : '提示'}</span> ${esc(x.text)}</li>`).join('');
    const tiers = (r.tiers || []).map((t) => `<li>${t.qty} 件 · ${esc(t.unit)}</li>`).join('');
    const replies = Object.entries(r.reply || {}).filter(([, v]) => v).map(([lang, v]) => `<details class="reply"><summary>${esc(langLabel(lang) || lang)} 回信</summary><pre class="wh-text">${esc(v)}</pre></details>`).join('');
    say(inner, 'ai', `
      <h3>要素</h3><ul>${fields}</ul>
      ${tiers ? `<h3>阶梯价骨架</h3><ul>${tiers}</ul>` : ''}
      <h3>风险</h3><ul>${risks}</ul>
      <h3>回信</h3>${replies}
      <p class="muted-sm">${esc(r.note || '')}</p>`);
    state.current = await api(`/api/products/${state.current.id}`);
    refreshMeta();
    renderWarehouse();
  } catch (e) {
    box.done();
    say(inner, 'ai', `<p class="err">解析失败：${esc(e.message)}</p>`);
  }
}

/* ---------------- 记账 ---------------- */

async function loadLedger() {
  const money = (v) => Number(v || 0).toFixed(2);
  if (!state.current) {
    $('#summary').innerHTML = `
      <div class="stat"><div class="stat-label">收入</div><div class="stat-value">0.00<span class="stat-unit">CNY</span></div></div>
      <div class="stat"><div class="stat-label">成本</div><div class="stat-value cost">0.00<span class="stat-unit">CNY</span></div></div>
      <div class="stat"><div class="stat-label">利润</div><div class="stat-value">0.00<span class="stat-unit">CNY</span></div></div>`;
    $('#ledgerList').innerHTML = '<li class="hint-row">还没有商品。先去「生图」发一张图或说一句话，账目会记在那个商品下面。</li>';
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
    ul.innerHTML = '<li class="hint-row">还没有账目。卖出一单记一笔收入，运费广告也记上，利润才是真的。</li>';
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
  ['POST', '/api/uploads', '上传素材（原图/多视角实拍）'],
  ['POST', '/api/jobs', '建任务 analyze/visual/image/detail/copy/video'],
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
  out.textContent = results.join(' ');
}

/* ---------------- 事件与两阶段核心调度 ---------------- */

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

// 上传图片时只把文件稳妥入库并展示预览，绝不偷跑乱生图，等用户补充一句话并确认后再进入两阶段流程
$('#file').onchange = async (ev) => {
  const files = [...(ev.target.files || [])].slice(0, 6);
  if (!files.length) return;
  try {
    // 如果当前已有商品且已经有过产物，默认提示或由用户决定；未选商品时自动以文件名建立新商品
    await ensureProduct('', files[0].name);
    const done = [];
    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      const kind = idx === 0 && !whAssets().uploads.length ? 'upload' : 'angle_real';
      const { assetId, url: fileUrl } = await uploadFile(file, { kind });
      done.push({
        id: assetId,
        name: file.name,
        url: fileUrl || `/files/${assetId}.png`,
        preview: URL.createObjectURL(file),
        size: file.size,
      });
    }
    state.uploads = [...(state.uploads || []), ...done].slice(-6);
    const last = state.uploads[state.uploads.length - 1];
    state.lastUpload = done[0].id;
    state.lastUploadName = files[0].name;
    state.lastUploadUrl = done[0].url;
    state.lastUploadPreview = done[0].preview;
    $('#attachInfo').textContent =
      state.uploads.length > 1
        ? `已附 ${state.uploads.length} 张（首图+多视角实拍）：${state.uploads.map((u) => u.name).join('、')}`
        : `已附参考图：${done[0].name}（${(done[0].size / 1024).toFixed(0)}KB）—— 输入一句话需求后点击发送`;
    state.current = await api(`/api/products/${state.current.id}`);
    renderWarehouse();
    renderTray();
  } catch (e) {
    alert(e.message);
  }
  ev.target.value = '';
};

$('#chat').addEventListener('click', (ev) => {
  const quick = ev.target.closest('[data-quick-mode]');
  if (quick) {
    const qm = quick.dataset.quickMode;
    if (qm === 'marketing_mobile') {
      doImage('手机版竖屏营销海报', { template: 'marketing', count: 1, width: 1080, height: 1920 });
    } else if (qm === 'mockup') {
      doImage('品牌线下与移动端商业样机展示', { template: 'mockup', count: 2 });
    }
    return;
  }
  const chip = ev.target.closest('.starter, .tile');
  if (!chip) return;
  if (chip.dataset.tab) {
    switchTab(chip.dataset.tab);
    return;
  }
  $('#ask').value = chip.dataset.fill || chip.textContent;
  $('#btnSend').click();
});

const CLIP_WORDS = /视频|短片|短视频|运镜|动起来|片头/;
const IMAGE_ONLY = /主图|详情图|白底图|海报|套图|精修|展示图/;
const GEO_WORDS = /会问什么|买家问题|买家会问|关键词|锚点|内容资产|GEO|AI 可见度|ai 可见度/i;
const INQUIRY_WORDS = /询盘|回信|报价|买家来信|客户问|inquiry/i;
const looksLikeInquiry = (t) =>
  t.length > 120 &&
  !/^[\u4e00-\u9fa5]/.test(t) &&
  /(price|quote|quotation|pcs|moq|lead time|fob|cif|deposit|sample)/i.test(t);

/**
 * 两阶段视觉导演总入口：
 * - 若当前商品尚未完成前置分析确认（!p.brief?.askedAt）：
 *   先执行阶段一（8维商业分析 + 纯文本主视觉定调 + 弹窗向用户索要多视角与确认交付模式），用户确认后再锁定素材库并按需出图。
 * - 若当前商品已完成前置确认且基底素材库已锁定：
 *   直接复用当前产品的「精修底图 + 多视角库 + 主视觉规范」，立即生成本次点名的新交付物。
 */
async function runDirectorWorkflow(askText) {
  const text = String(askText || '').trim();
  if (!state.current && !text && !state.lastUpload) {
    say($('#chat .chat-inner'), 'ai', '<p>请先在顶栏选定平台与语言，上传 1 张产品实拍图并输入一句话需求～</p>');
    return;
  }

  await ensureProduct(text, state.lastUploadName);
  const inner = $('#chat .chat-inner');
  const detectedMode = detectDeliverableMode(text);
  const thumb = state.lastUploadPreview ? `<img class="thumb" src="${state.lastUploadPreview}" alt="">` : '';

  say(
    inner,
    'user',
    `${text ? `<p>${esc(text)}</p>` : ''}${thumb}<p class="meta-line">${esc(pf(state.platform).name)} · ${esc(langName(state.lang || 'en'))} · 意向：${esc(tplLabel(detectedMode))}</p>`
  );

  const p = state.current;
  const hasBaseAssets = whAssets().base.length > 0;
  const alreadyConfirmed = Boolean(p?.brief?.askedAt);

  // 同产品已确认且基底素材已锁定：直接复用素材库按需出图
  if (alreadyConfirmed && hasBaseAssets) {
    await doImage(text, { template: detectedMode, silent: true });
    return;
  }

  // 阶段一：8 维商业分析 + 纯文本主视觉定调（不生图）→ 前置收口提问卡片
  let analyzeRes;
  try {
    analyzeRes = await runStageOneAnalyze(text);
  } catch (e) {
    say(inner, 'ai', `<p class="err">商业分析阶段出错：${esc(e.message)}</p>`);
    return;
  }

  const confirmed = await askDirectorBrief({
    title: state.current.title,
    thumb: state.lastUploadPreview,
    analysis: analyzeRes.analysis,
    spec: analyzeRes.spec,
    initialMode: detectedMode,
  });

  if (!confirmed) return;

  // 阶段二：锁定「精修底图 + 一致性视角」双素材库 → 按确认的模式精准交付
  const prep = await runPrepare(confirmed.brief, { silent: confirmed.mode !== 'refine' });
  if (!prep) return;

  if (confirmed.mode === 'refine') {
    // 用户要的就是精修图，runPrepare 已直接展示精修成图
    state.lastUpload = null;
    state.lastUploadPreview = null;
    state.uploads = [];
    $('#attachInfo').textContent = '未附图片';
    return;
  }

  await doImage(text, {
    template: confirmed.mode,
    needModel: confirmed.needModel,
    brief: confirmed.brief,
    silent: true,
  });
}

$('#btnSend').onclick = async () => {
  const ask = $('#ask').value.trim();
  $('#ask').value = '';

  if (looksLikeInquiry(ask) || (INQUIRY_WORDS.test(ask) && ask.length > 60)) {
    doInquiry(ask);
    return;
  }
  if (GEO_WORDS.test(ask)) {
    doGeo(ask);
    return;
  }
  if (CLIP_WORDS.test(ask) && !IMAGE_ONLY.test(ask)) {
    doClip(ask);
    return;
  }

  await runDirectorWorkflow(ask);
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
    const rows = (result.subtitles || []).map((s) => `<tr><td class="ts">${s.start}–${s.end}s</td><td>${esc(s.text)}</td></tr>`).join('');
    out.innerHTML = `<h3>结果</h3><div class="muted">${result.videoUrl ? '成片已生成' : 'mock：只出字幕，不出成片（不做 lip sync）'}</div><h3>字幕</h3><table>${rows}</table>`;
  } catch (e) {
    out.innerHTML = `<p class="err">失败：${esc(e.message)}</p>`;
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
buildLangMenu();
wireMenuSearch();
setLang(state.lang || 'en');
$('#btnLang')?.addEventListener('click', (ev) => { ev.stopPropagation(); toggleMenu('#lgMenu', '#btnLang'); });
$('#btnMarket')?.addEventListener('click', (ev) => { ev.stopPropagation(); toggleMenu('#mkMenu', '#btnMarket'); });
document.addEventListener('click', () => closeMenus());
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeMenus(); });

/* 商品抽屉 */
$('#btnProducts').onclick = () => pdOpen($('#pd').classList.contains('hidden'));
$('#pdClose').onclick = () => pdOpen(false);
$('#pdMask').onclick = () => pdOpen(false);
$('#pdSearch').addEventListener('input', renderProductList);
$('#pdList').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-pick]');
  if (!btn) return;
  pdOpen(false);
  $('#prodSel').value = btn.dataset.pick;
  await selectProduct(btn.dataset.pick);
});

/* 仓库 */
$('#btnWarehouse').onclick = () => whOpen($('#wh').classList.contains('hidden'));
$('#whClose').onclick = () => whOpen(false);
$('#whMask').onclick = () => whOpen(false);
$('#whSel').onclick = () => whSetSel(!whSel.on);
$('#whDel').onclick = () => whDeletePicked();
$('#whSelAll').onclick = () => {
  const { base, images } = whAssets();
  [...base, ...images].forEach((a) => whSel.picked.add(a.id));
  renderWhBar();
  renderWarehouse();
};
$('#whSelNone').onclick = () => {
  whSel.picked.clear();
  renderWhBar();
  renderWarehouse();
};
$('.wh-tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.wh-tab');
  if (!btn) return;
  state.whTab = btn.dataset.wh;
  whSel.picked.clear();
  renderWhBar();
  renderWarehouse();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    whOpen(false);
    pdOpen(false);
    $('#pfMenu').classList.add('hidden');
  }
});

function rippleAt(host, ev) {
  if (!host) return;
  const box = host.getBoundingClientRect();
  const size = Math.max(box.width, box.height) * 1.15;
  const span = document.createElement('span');
  span.className = 'ripple';
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  const cx = Number.isFinite(ev.clientX) && ev.clientX > 0 ? ev.clientX : box.left + box.width / 2;
  const cy = Number.isFinite(ev.clientY) && ev.clientY > 0 ? ev.clientY : box.top + box.height / 2;
  span.style.left = `${cx - box.left - size / 2}px`;
  span.style.top = `${cy - box.top - size / 2}px`;
  host.appendChild(span);
  setTimeout(() => span.remove(), 560);
}
document.addEventListener('pointerdown', (ev) => {
  const host = ev.target.closest('.tab, .chip, .pf-item, .tile, .btn.primary, .btn-danger, .pd-item, .market-sel');
  if (host) rippleAt(host, ev);
});

function esc(s) {
  return String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}

/* ---------------- 模型接入状态 ---------------- */

const CAP_LABEL = { text: '文案', image: '出图', asr: '语音识别', video: '商品短视频' };

async function loadMeta() {
  const box = $('#providers');
  if (!box) return;
  try {
    const { providers, markets } = await api('/api/meta');
    fillMarkets(markets);
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

const THEME_KEY = 'dukou:theme';

function paintTheme(t) {
  document.documentElement.dataset.theme = t;
  desiredTheme = t;
  const b = $('#btnTheme');
  if (b) {
    b.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    b.setAttribute('aria-label', t === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    const ico = b.querySelector('.th-ico');
    if (ico) ico.textContent = t === 'dark' ? '☀' : '◐';
  }
  try { localStorage.setItem(THEME_KEY, t); } catch {}
}

let theming = false;
let pendingTheme = null;
let desiredTheme = null;
function applyTheme(t, origin) {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (theming) { pendingTheme = { t, origin }; return; }
  if (!document.startViewTransition || reduce) { paintTheme(t); return; }

  const rect = origin?.getBoundingClientRect?.();
  const x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : innerHeight / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  theming = true;
  root.style.setProperty('--vt-x', x + 'px');
  root.style.setProperty('--vt-y', y + 'px');
  root.style.setProperty('--vt-r', radius + 'px');
  const vt = document.startViewTransition(() => {
    root.classList.add('vt');
    paintTheme(t);
  });
  vt.finished.finally(() => {
    theming = false;
    root.classList.remove('vt');
    if (pendingTheme) {
      const next = pendingTheme;
      pendingTheme = null;
      applyTheme(next.t, next.origin);
    }
  });
}

function initTheme() {
  let t = null;
  try { t = localStorage.getItem(THEME_KEY); } catch {}
  if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  paintTheme(t);
  $('#btnTheme')?.addEventListener('click', (ev) => {
    const cur = desiredTheme || document.documentElement.dataset.theme || 'light';
    desiredTheme = cur === 'dark' ? 'light' : 'dark';
    applyTheme(desiredTheme, ev.currentTarget);
  });
}

(async function boot() {
  if (/static/.test(location.search)) document.documentElement.classList.add('static');
  initTheme();
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

/* 附件托盘：多图可见、可单张移除 */
function renderTray() {
  const tray = $('#uploadTray');
  if (!tray) return;
  const ups = state.uploads || [];
  if (!ups.length) {
    tray.classList.add('hidden');
    tray.innerHTML = '';
    return;
  }
  tray.classList.remove('hidden');
  tray.innerHTML = ups
    .map(function (u, i) {
      const label = (i === 0 ? '主参考' : '视角' + i) + ' · ' + (u.name || '');
      const thumb = u.preview || u.url || '';
      return '<span class="upload-pill" data-upload-id="' + u.id + '">' +
        '<img src="' + thumb + '" alt="">' +
        '<span>' + esc(label) + '</span>' +
        '<button class="rm-up" type="button" aria-label="移除这张" data-rm="' + u.id + '">×</button>' +
        '</span>';
    })
    .join('');
}

function dropUpload(id) {
  const ups = (state.uploads || []).filter(function (u) { return u.id !== id; });
  state.uploads = ups;
  const first = ups[0];
  state.lastUpload = first ? first.id : null;
  state.lastUploadName = first ? first.name : null;
  state.lastUploadUrl = first ? first.url : null;
  state.lastUploadPreview = first ? first.preview : null;
  $('#attachInfo').textContent = ups.length
    ? '已附 ' + ups.length + ' 张：' + ups.map(function (u) { return u.name; }).join('、')
    : '未附图片';
  renderTray();
}

$('#uploadTray') && $('#uploadTray').addEventListener('click', function (ev) {
  const rm = ev.target.closest('[data-rm]');
  if (!rm) return;
  dropUpload(rm.dataset.rm);
});

$('#template') && $('#template').addEventListener('change', function () {
  const sel = $('#template');
  const cnt = $('#imgCount');
  if (!sel || !cnt) return;
  if (sel.value === 'detail') {
    cnt.value = '6';
    cnt.disabled = true;
  } else {
    cnt.disabled = false;
    if (cnt.value === '6') cnt.value = '2';
  }
});
