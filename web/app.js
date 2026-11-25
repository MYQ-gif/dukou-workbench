// 前端逻辑 —— 原生 ES Module，无框架、无构建
// 分工：生图 / 记账 = 主人；视频翻译 = 马；接口层 = 卓
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = { products: [], current: null, tab: 'image', lastUpload: null, video: null, platform: 'shopee', market: 'sg', whTab: 'image' };

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
    syncProductPicker();
    chatReset();
    return;
  }
  const target = preferId || (state.current?.id && items.some((p) => p.id === state.current.id) ? state.current.id : null);
  if (!target) {
    // 进来不替用户选商品：有商品也先停在入口页，等他挑一个或直接说一句话
    state.current = null;
    sel.value = '';
    $('#hTitle').textContent = '还没有选择商品';
    $('#pMeta').textContent = items.length ? `已有 ${items.length} 个商品，点顶栏挑一个，或直接说一句新建` : '发张图或说句话就开始';
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
  const list = p.assets || [];
  const imgs = list.filter((a) => ['main', 'marketing', 'detail', 'sub'].includes(a.kind)).length;
  const clips = list.filter((a) => a.kind === 'clip').length;
  return [imgs ? `${imgs} 张图` : '', clips ? `${clips} 段视频` : ''].filter(Boolean).join(' · ') || '还没有产物';
}

function refreshMeta() {
  const p = state.current;
  if (!p) return;
  const mkHit = (state.markets || []).find((m) => m.id === (state.market || 'us'));
  const mk = mkHit ? mkHit.label : '';
  $('#pMeta').textContent = [pf(p.platform).name, mk, (p.targetLangs || []).join(' / '), assetTally(p)].filter(Boolean).join(' · ');
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
    ? `共 ${count} 个商品。没有？发张图或说一句「新建商品：名字」，我就建一个。`
    : '还没有商品。发张图或说一句「新建商品：名字」，我就建一个。';
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
    // 径向展开：从顶栏按钮的圆心长出，而不是平移滑动
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

/* ---------------- 平台选择 ---------------- */

function setPlatform(id, remember = true) {
  const p = pf(id);
  state.platform = p.id;
  // 平台换了且这个商品还没手动选过市场 → 跟平台默认市场走
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
    $('#pMeta').textContent = $('#pMeta').textContent.replace(/^.*? · /, `${p.name} · `);
  }
}

/* 下拉菜单：同一时间只开一个，点外面关掉 */
function closeMenus() {
  ['#lgMenu', '#mkMenu', '#pfMenu'].forEach((sel) => {
    const m = $(sel); if (m) m.classList.add('hidden');
  });
  $$('.pf-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
function toggleMenu(menuSel, btnSel) {
  const m = $(menuSel), b = $(btnSel);
  if (!m || !b) return;
  const willOpen = m.classList.contains('hidden');
  closeMenus();
  if (willOpen) {
    m.classList.remove('hidden'); b.setAttribute('aria-expanded', 'true');
    const box = m.querySelector('.pf-search');
    if (box) { box.value = ''; if (menuSel === '#mkMenu') fillMarkets(state.markets || []); else buildLangMenu(); }
  }
}

/* 目标语言：出图文案与 listing 文案用哪种语言写 */
const LANGS = [
  ['en','英语'],['es','西班牙语'],['pt','葡萄牙语'],['fr','法语'],['de','德语'],['it','意大利语'],
  ['nl','荷兰语'],['pl','波兰语'],['sv','瑞典语'],['tr','土耳其语'],['ru','俄语'],['ar','阿拉伯语'],
  ['he','希伯来语'],['ja','日语'],['ko','韩语'],['th','泰语'],['vi','越南语'],['id','印尼语'],
  ['ms','马来语'],['zh','中文'],
];
function langName(id) { const hit = LANGS.find((l) => l[0] === id); return hit ? hit[1] : LANGS[0][1]; }
function setLang(id) {
  const next = LANGS.some((l) => l[0] === id) ? id : 'en';
  state.lang = next;
  const name = $('#lgName'); if (name) name.textContent = langName(next);
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
  const box = $('#lgItems'); if (!box) return;
  const q = ($('#lgSearch')?.value || '').trim().toLowerCase();
  const hit = LANGS.filter((l) => !q || l[1].includes(q) || l[0].includes(q));
  box.innerHTML = hit.length
    ? hit.map((l) => '<button class="pf-item" type="button" role="option" data-lg="' + l[0] + '"><span>' + l[1] + '</span><span class="pf-dim">' + l[0].toUpperCase() + '</span></button>').join('')
    : '<p class="pf-empty">没有匹配的语言</p>';
  $$('#lgItems .pf-item').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lg); closeMenus(); }));
  const cur = state.lang || 'en';
  $$('#lgItems .pf-item').forEach((b) => b.classList.toggle('on', b.dataset.lg === cur));
}

/* 目标市场：决定提示词里的文化适配（不是翻译，是改写） */
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

/* 市场按大区分组：先列常用的，再列整表 */
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

function buildPlatformMenu() {  const item = (p) => `<button class="pf-item" data-pf="${p.id}" type="button">
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

/* 底部提示条：删除这类可逆操作给 6 秒后悔时间 */
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
    body.innerHTML = '<p class="muted">还没有商品。新建一个，图和文案会攒在这里。</p>';
    return;
  }
  if (state.whTab === 'image') {
    if (!base.length && !images.length) {
      body.innerHTML = '<p class="muted">还没有图。回「生图」发一句，出来的图会自动进这里。</p>';
      return;
    }
    const order = state.current.detailOrder || [];
    const imagesSorted = images.slice().sort((a, b) => {
      const ia = order.indexOf(a.id);
      const ib = order.indexOf(b.id);
      if (ia < 0 && ib < 0) return 0;
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
    let seq = 0;
    const card = (a) => {
      const isReal = a.kind === 'angle_real';
      const label =
        a.kind === 'refined' ? `精修 · ${a.meta?.crop || '1:1'}` : a.kind === 'angle' ? `视角 · ${a.meta?.angle || ''}` : a.meta?.template || a.kind;
      const picked = whSel.picked.has(a.id);
      const canDrag = a.kind === 'detail';
      seq += 1;
      return `<figure class="wh-item${picked ? ' picked' : ''}" data-asset="${a.id}" data-drag="${canDrag ? '1' : '0'}" draggable="${canDrag}" style="--i:${seq}">
        <img src="${a.url}" alt=""${isReal ? '' : ''}>
        ${whSel.on ? '<span class="pick" aria-hidden="true"></span>' : ''}
        <figcaption>${esc(label)} · ${a.width}×${a.height}
          ${isReal ? '<span class="chip-real">实拍</span>' : a.meta?.usedRefined ? '<span class="chip-ref">引精修</span>' : ''}
        </figcaption>
      </figure>`;
    };
    body.classList.toggle('picking', whSel.on);
    body.innerHTML = [
      base.length ? `<h4 class="wh-group">基底素材 <span class="muted">备料产物，后续出图会引用</span></h4><div class="wh-grid">${base.map(card).join('')}</div>` : '',
      images.length
        ? `<h4 class="wh-group">成品图 ${order.length ? '<span class="muted">详情段可拖拽改顺序</span>' : ''}</h4><div class="wh-grid">${imagesSorted.map(card).join('')}</div>`
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
    say(
      inner,
      'ai',
      `<p>${p ? `「${esc(p.title)}」已经就位。` : '还没选商品。发张图或说一句话，我就建一个新商品；想接着做已有的，点顶栏那个商品名挑一个。'}</p>
     <p>选好平台，发一张商品原图再说要求——我出套图。</p>
     <p class="muted-sm">从这四件事开始，点一下就跑；问到的参数会先跟你确认：</p>
       <div class="tiles">
         <button class="tile" type="button" data-fill="出一版详情页，六段齐全">
           <span class="tile-t">1. 详细页</span>
           <span class="tile-d">品牌 → 卖点 → 细节 → 功能 → 场景 → 购买理由</span>
         </button>
         <button class="tile" type="button" data-fill="这批买家会问什么？顺便把形容词换成数字">
           <span class="tile-t">2. 卖家会问什么</span>
           <span class="tile-d">问题库 + 事实锚点 + 六层关键词，照着改详情</span>
         </button>
         <button class="tile" type="button" data-fill="出一张营销海报，标题写 STAY A WHILE，突出实木手工">
           <span class="tile-t">3. 营销海报</span>
           <span class="tile-d">竖版海报，标题 + 三条卖点，按市场配色</span>
         </button>
         <button class="tile" type="button" data-fill="Hi, we are a furniture retailer in Ho Chi Minh City. We need 200 pcs, 1.2m, natural finish. What is your FOB price and lead time? Do you have fumigation certificate? We prefer T/T 30% deposit.">
           <span class="tile-t">4. 询盘回信</span>
           <span class="tile-d">贴一段买家来信，抽要素、标风险、出多语回信</span>
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
      market: state.market || 'us',
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
  // 只有「刚生成」的 AI 消息做逐段揭示；回放历史一律不动
  if (who === 'ai' && opts.reveal !== false && !opts.replay) el.classList.add('fresh');
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
    fig.innerHTML = `<img src="${a.url}" alt=""><figcaption>${a.kind} · ${a.width}×${a.height}</figcaption>`;
    const img = fig.querySelector('img');
    img.onclick = () => window.open(a.url, '_blank');
    img.onload = () => {
      const scroller = bubble.closest('.chat');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    };
    wrap.appendChild(fig);
  });
  // 三张以上改成横向吸附条，别把气泡撑成一堵墙
  if (assets.length > 3) wrap.classList.add('many');
  bubble.appendChild(wrap);
  patchHistory(bubble.innerHTML);
}

function progressBubble(text, opts = {}) {
  const inner = $('#chat .chat-inner');
  // 长任务（Seedance 出片要等几分钟）先播一个跑动 loader，真进度一到就收起来
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
  // 弹簧步进：显示值追目标值，带一点过冲后落定，别一格一格跳
  let target = 0;
  let cur = 0;
  let vel = 0;
  let raf = null;
  let tag = '';
  const frame = () => {
    // 像素节奏：按固定档位一格一格跳，不做弹簧缓动
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
      // 进度真上来了就把兜底文案收回原句
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
  // 上一张没人答的参数卡先收掉，别叠两张
  document.querySelectorAll('#chat .msg.ai .ask-q').forEach((q) => {
    const m = q.closest('.msg');
    if (m && m.querySelector('.ask-foot')) m.remove();
  });
  const left = [need.count && '几张', need.size && '多大', need.quality && '多清晰'].filter(Boolean).join('、');

  const el = say(inner, 'ai', `
    <p class="ask-q">还差${left}，定完我就开工。</p>
    ${ask ? `<div class="ask-quote">${esc(ask)}</div>` : ''}
    <div class="ask-sub">${esc(title || '新商品')}${thumb ? `<img class="thumb" src="${thumb}" alt="">` : ''}</div>
    ${need.count ? `
    <div class="opt">
      <div class="opt-label">要几张<span class="opt-hint"><b id="cntVal">${st.count}</b> 张 · 拖动会按速度吸附</span></div>
      <div class="snap-wrap">
        <input id="cntRange" class="snap" type="range" min="1" max="6" step="1" value="${st.count}" aria-label="要几张">
        <div class="snap-ticks"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span></div>
      </div>
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

    /* 张数滑块：松手时按拖动速度再走一格，然后吸附到整数 */
    const range = el.querySelector('#cntRange');
    const cntVal = el.querySelector('#cntVal');
    if (range) {
      let samples = [];
      const setCount = (v, fromRange) => {
        st.count = Math.min(6, Math.max(1, Math.round(v)));
        if (cntEl) cntEl.value = '';
        if (cntVal) cntVal.textContent = st.count;
        if (fromRange) range.value = String(st.count);
        sync();
      };
      range.oninput = () => {
        const now = performance.now();
        samples.push({ t: now, v: Number(range.value) });
        samples = samples.filter((s) => now - s.t < 120);
        if (cntVal) cntVal.textContent = range.value;
        st.count = Number(range.value);
        sync();
      };
      const release = () => {
        if (samples.length < 2) return setCount(Number(range.value), true);
        const first = samples[0];
        const last = samples[samples.length - 1];
        const dt = Math.max(16, last.t - first.t);
        const velocity = (last.v - first.v) / dt; // 格/毫秒
        const projected = last.v + velocity * 90; // 惯性再往前推一点
        setCount(projected, true);
        samples = [];
      };
      range.onchange = release;
      if (window.PointerEvent) range.addEventListener('pointerup', release);
      range.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') setTimeout(() => setCount(Number(range.value), true), 0);
      });
    }
  });
}

const IMAGE_WORDS = /图|主图|详情|海报|套图|出图|生图/;
// 提到短片/运镜就是出视频；但同时说「主图/详情」时仍按出图走
const CLIP_WORDS = /视频|短片|短视频|运镜|动起来|片头/;
const IMAGE_ONLY = /主图|详情图|白底图|海报|套图/;
const GEO_WORDS = /会问什么|买家问题|买家会问|关键词|锚点|内容资产|GEO|AI 可见度|ai 可见度/i;
const DETAIL_WORDS = /详情页|详情长图|详情图|六段|整页详情/;
const INQUIRY_WORDS = /询盘|回信|报价|买家来信|客户问|inquiry/i;
// 一整段带价格/数量/交期口吻的外文，直接当询盘
const looksLikeInquiry = (t) =>
  t.length > 120 &&
  !/^[\u4e00-\u9fa5]/.test(t) &&
  /(price|quote|quotation|pcs|moq|lead time|fob|cif|deposit|sample)/i.test(t);

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
async function runPrepare(brief, opts = {}) {
  if (!state.current) return null;
  const inner = $('#chat .chat-inner');
  const pid = state.current.id;
  const silent = !!opts.silent;
  try {
    if (brief) await api(`/api/products/${pid}`, { method: 'PATCH', body: { brief } });
    const prog = silent ? progressBubble('后台备料中…') : progressBubble('正在备料：精修 → 三视图 → 视觉规范', { loader: true });
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: { type: 'visual', productId: pid, params: { platform: state.platform, brief: brief || {}, realAngles: brief?.angles || [] } },
    });
    const res = await jobPromise(jobId, (job) => prog.update(job.progress || 0, job.type));
    prog.done();
    await selectProduct(pid, { keepChat: true });
    if (silent) {
      // 精修与三视图只当幕后素材，不当作成品展示
      say(inner, 'ai', '<p class="muted-sm">素材已备好（后台），出图时会拿它当参考图。</p>', { persist: false });
      return { silent: true };
    }
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
  const tpl = opts?.template || $('#template').value;
  const lang = state.lang || 'en';
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
    state.uploads = [];
    $('#attachInfo').textContent = '未附图片';
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

const tplLabel = (t) => ({ main: '主图', marketing: '营销图', detail: '详情页' }[t] || t);
const langLabel = (l) => ({ en: '英语', th: '泰语', vi: '越南语', zh: '中文', ar: '阿拉伯语' }[l] || l);

/* ---------------- GEO 内容资产 ---------------- */

// 没选中商品时：只有一个就自动用它，一个都没有就新建，多个就让用户先挑
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

/* ---------------- 详情页六段 ---------------- */

async function doDetail(askText) {
  const inner0 = $('#chat .chat-inner');
  if (!(await ensureTarget(askText))) {
    say(inner0, 'ai', '<p>先选一个商品：顶栏下拉里挑一个，再说「出详情页」。</p>');
    return;
  }
  const inner = $('#chat .chat-inner');
  // 没有基底素材就先在后台备一份（不展示精修图），避免纯文生图跑偏
  if (!whAssets().base.length) {
    say(inner, 'ai', '<p class="muted-sm">先把这张图的素材备一下（后台），接着出六段。</p>', { persist: false });
    await runPrepare(null, { silent: true });
  }
  say(inner, 'user', `<p>${esc(askText || '出详情页')}</p><p class="meta-line">详情页 · 六段 · ${esc(pf(state.platform).name)}</p>`);
  const box = progressBubble('正在排六段详情页…');
  try {
    const { jobId } = await api('/api/jobs', {
      method: 'POST',
      body: { type: 'detail', productId: state.current.id, params: { platform: state.platform, lang: state.lang || 'en' } },
    });
    const r = await jobPromise(jobId, (job) => box.update(job.progress || 0, job.status));
    box.done();
    state.current = await api(`/api/products/${state.current.id}`);
    const bySeg = new Map((r.segments || []).map((s) => [s.index, s]));
    const shots = (r.assets || [])
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
    say(inner, 'ai', `
      <p>六段出好了${r.errors?.length ? `（${r.errors.length} 段失败）` : ''}，文案在下面，图在仓库。</p>
      <div class="shots many">${shots}</div>
      <h3>每段文案</h3><ul>${copies}</ul>
      <p class="muted-sm">${esc(r.note || '')}</p>`);
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
  const files = [...(ev.target.files || [])].slice(0, 6);
  if (!files.length) return;
  try {
    await ensureProduct('', files[0].name);
    const done = [];
    for (const file of files) {
      const { assetId, url: fileUrl } = await uploadFile(file);
      done.push({ id: assetId, name: file.name, url: fileUrl || `/files/${assetId}.png`, preview: URL.createObjectURL(file), size: file.size });
    }
    state.uploads = [...(state.uploads || []), ...done].slice(-6);
    const last = state.uploads[state.uploads.length - 1];
    state.lastUpload = last.id;
    state.lastUploadName = files[0].name;
    state.lastUploadUrl = last.url;
    state.lastUploadPreview = last.preview;
    $('#attachInfo').textContent = state.uploads.length > 1
      ? `已附 ${state.uploads.length} 张：${state.uploads.map((u) => u.name).join('、')}`
      : `已附：${last.name}（${(last.size / 1024).toFixed(0)}KB）`;
    // 第一次拿到图：后台备料（不展示精修过程），同时不挡着出图
    const p = state.current;
    if (p && !p.brief?.askedAt) {
      const brief = await askBrief({ title: p.title, thumb: state.lastUploadPreview });
      runPrepare(brief, { silent: true });
    }
  } catch (e) {
    alert(e.message);
  }
  ev.target.value = '';
};

$('#chat').addEventListener('click', (ev) => {
  const chip = ev.target.closest('.starter, .tile');
  if (!chip) return;
  if (chip.dataset.tab) {
    switchTab(chip.dataset.tab);
    return;
  }
  // 点入口 = 直接开工；该问的参数（张数/尺寸/清晰度、素材五问）仍会先弹出来
  $('#ask').value = chip.dataset.fill || chip.textContent;
  $('#btnSend').click();
});

$('#btnSend').onclick = async () => {
  const ask = $('#ask').value.trim();
  $('#ask').value = '';
  // 贴进来一整段买家来信 → 询盘解析
  if (looksLikeInquiry(ask) || (INQUIRY_WORDS.test(ask) && ask.length > 60)) {
    doInquiry(ask);
    return;
  }
  // 「这批买家会问什么」「做关键词」→ GEO 内容资产
  if (GEO_WORDS.test(ask)) {
    doGeo(ask);
    return;
  }
  // 详情页：一次出六段
  if (DETAIL_WORDS.test(ask) && !/视频|短片/.test(ask)) {
    doDetail(ask);
    return;
  }
  // 先认「视频」：一句话里提到短片/运镜，就走 Seedance 出片
  if (CLIP_WORDS.test(ask) && !IMAGE_ONLY.test(ask)) {
    doClip(ask);
    return;
  }
  // 有图，或者话里明显是在要图 → 话里已经说清的参数不再问，只补没说的
  if (state.lastUpload || IMAGE_WORDS.test(ask) || !ask) {
    const known = readIntent(ask);
    const poster = /海报|poster/i.test(ask);
    const opts = await askParams({
      title: state.current ? state.current.title : '新商品',
      thumb: state.lastUploadPreview,
      ask,
      known,
    });
    if (!opts) { $('#ask').value = ask; return; }
    doImage(ask, poster ? { ...opts, template: 'marketing' } : opts);
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

/* 点击处的波纹：只给开关类控件，正文和图片不掺和 */
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

/* 径向揭幕：用 View Transitions 做一圈从按钮扩散的换肤，整页只合成一层，不掉帧 */
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
