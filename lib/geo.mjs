// GEO 内容资产：买家问题库 / 事实锚点 / 六层关键词 / FAQ·参数·对比三件套
// 依据：创贸集团《全球搜 GEO 方案》——逆向法（先找真实问题再布局答案）、六层布局、第 7 步「用事实替代形容词」。

export const QUESTION_CATS = [
  { id: 'scene', name: '场景选型', who: '终端使用者', where: 'ChatGPT / 独立站 FAQ', tpl: (p) => `小户型或有限空间，选什么尺寸的${p}更合适？` },
  { id: 'cost', name: '成本回报', who: '采购 / 老板', where: 'AI 搜索对比页', tpl: (p) => `${p}到目标市场含运一共多少？多久回本？` },
  { id: 'ops', name: '运营维护', who: '门店运营', where: 'WhatsApp 首次提问', tpl: (p) => `${p}日常怎么保养？出了问题怎么修？` },
  { id: 'quality', name: '出品体验', who: '终端使用者', where: '评论区 / Reddit / Quora', tpl: (p) => `${p}的材质和做工稳定吗？色差大不大？` },
  { id: 'compliance', name: '合规售后', who: '报关 / 进口商', where: '询盘正文', tpl: (p) => `${p}出口需要哪些认证？售后怎么覆盖？` },
];

export const LAYERS = [
  { id: 'L1', name: '产品词', where: '标题前段' },
  { id: 'L2', name: '场景词', where: '五点第 1 条' },
  { id: 'L3', name: '能力词', where: '五点第 2–3 条' },
  { id: 'L4', name: '比较词', where: '对比表' },
  { id: 'L5', name: '行业教育词', where: 'FAQ / 博客' },
  { id: 'L6', name: '采购方案词', where: '详情首屏 / 落地页' },
];

const ADJ = [
  { re: /高(品质|质量)|优质/, before: '高品质', after: '含水率 8–10%，桌板厚 4cm，接口榫卯', why: '材质用参数说话' },
  { re: /快速发货|发货快|现货/, before: '快速发货', after: '现货 7 天出库，海运 25 天到主要港口', why: '给出可核算的交期' },
  { re: /售后无忧|售后好/, before: '售后无忧', after: '5 年结构保修，开裂免费换板', why: '把承诺写成条款' },
  { re: /耐用|结实/, before: '结实耐用', after: '承重 120kg，5 年结构保修', why: '承重要有数字' },
  { re: /环保|绿色/, before: '环保材料', after: 'E0 级板材，甲醛释放 ≤0.05mg/m³', why: '环保认标准不认形容词' },
  { re: /性价比|便宜/, before: '性价比高', after: 'FOB 单价按 200/500/1000 件阶梯下浮 3%/6%', why: '价格要能算' },
];

function priceTiers(qty = 200) {
  return [qty, Math.round(qty * 2.5), Math.round(qty * 5)];
}

/** 买家问题库（无模型也能出，按类目与卖点套模板） */
export function questions(product, brief = {}) {
  const name = product.title || '这个商品';
  const out = [];
  const push = (item) => {
    if (!out.some((x) => x.q === item.q)) out.push(item);
  };
  for (const c of QUESTION_CATS) {
    push({ cat: c.id, catName: c.name, q: c.tpl(name), who: c.who, where: c.where });
    if (brief.selling) push({ cat: c.id, catName: c.name, q: `${brief.selling}体现在哪里？有数据吗？`, who: c.who, where: c.where });
  }
  // 比价/竞品这一类只问一次，挂在「成本与回报」下
  const cost = QUESTION_CATS.find((c) => c.id === 'cost') || QUESTION_CATS[0];
  push({ cat: cost.id, catName: cost.name, q: `${name}和中国/越南/印尼同类比，差在哪？`, who: cost.who, where: cost.where });
  return out.slice(0, 15);
}

/** 事实锚点：把形容词换成数字（第 7 步：60% 引用错误源自只有形容词） */
export function anchors(product) {
  const text = [product.title, product.rawText, ...(product.sellingPoints || []), product.brief?.selling || ''].filter(Boolean).join(' ');
  const hit = ADJ.filter((a) => a.re.test(text));
  const chosen = hit.length ? hit : [ADJ[0], ADJ[1], ADJ[2]];
  return chosen.slice(0, 4).map((a, i) => ({
    before: a.before,
    after: a.after + (i === 0 ? '（数字按你的实际改，别照抄）' : ''),
    why: a.why,
  }));
}

/** 六层关键词：L1–L6 各一条，标出该放哪 */
export function keywords(product, lang = 'en') {
  const title = (product.title || 'product').toLowerCase();
  const cat = product.brief?.usage || '电商';
  const rows = [
    { layer: 'L1', term: `${title}`, where: LAYERS[0].where },
    { layer: 'L2', term: `${title} for small apartment`, where: LAYERS[1].where },
    { layer: 'L3', term: `handmade ${title} joinery`, where: LAYERS[2].where },
    { layer: 'L4', term: `${title} vs mdf veneer`, where: LAYERS[3].where },
    { layer: 'L5', term: `how to care for ${title}`, where: LAYERS[4].where },
    { layer: 'L6', term: `bulk order ${title} supplier`, where: LAYERS[5].where },
  ];
  return rows.map((r) => ({ ...r, lang, note: cat }));
}

/** FAQ / 参数块 / 对比表：AI 只吃结构化短答案，所以每条 40–80 字 */
export function blocks(product, qs, ancs) {
  const name = product.title || '商品';
  const faq = qs.slice(0, 5).map((q) => ({
    q: q.q,
    a: `按 ${name} 的实际参数回答：材质/尺寸/交期/认证写具体数字，超过 3 句就拆成两条。`,
  }));
  const param = [
    `材质：${product.rawText || '按实物填写'}`,
    '尺寸：长 × 宽 × 高（cm），误差 ±1cm',
    '交期：现货 7 天出库 / 定制 25–35 天',
    '认证：按目的国填写（熏蒸、CE、REACH 等）',
  ];
  const compare = ancs.slice(0, 3).map((a) => ({ dim: a.before, us: a.after, them: '同行常见写法：只写形容词' }));
  return { faq, param, compare };
}

/** 给 TEXT 模型的提示词（真链路用；mock 直接走上面三个函数） */
export function promptGeo(product, brief = {}) {
  const briefLine = [brief.usage && `用途：${brief.usage}`, brief.market && `市场：${brief.market}`, brief.selling && `卖点：${brief.selling}`]
    .filter(Boolean).join('；');
  return [
    `商品：${product.title || ''}`,
    product.rawText ? `描述：${product.rawText}` : '',
    briefLine ? `补充：${briefLine}` : '',
    '任务：做 GEO 内容资产，输出 JSON：',
    '{ "questions":[{"cat":"scene|cost|ops|quality|compliance","q":"买家原话式问题"}],  // 15 条，覆盖五类',
    '  "anchors":[{"before":"形容词","after":"带数字的事实","why":"为什么这样改"}],      // 4 条',
    '  "keywords":[{"layer":"L1..L6","term":"英文词","where":"放哪里"}],                 // 6 条',
    '  "blocks":{"faq":[{"q":"","a":""}],"param":[""],"compare":[{"dim":"","us":"","them":""}]} }',
    '要求：问题要像买家在 AI 里搜的原话；锚点必须是可核实的具体数字，不确定就写「待补」而不是编。',
  ].filter(Boolean).join('\n');
}
