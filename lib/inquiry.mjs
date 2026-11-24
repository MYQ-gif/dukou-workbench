// 询盘解析：贴一段买家来信 → 五要素 + 风险 + 多语回信 + 阶梯报价骨架
// 依据：全球搜「询盘管理系统」、超迹 AI「邮件生成」；风险条目按外贸常见坑写死，模型只负责措辞。

const FIELDS = [
  { key: 'product', label: '要什么', re: [/([\w\s-]{3,40}?(table|chair|sofa|lamp|bag|dress|machine|robot|panel|tile|bottle|kit))s?\b/i, /(?:need|want|interested in|looking for)\s+([^.,;\n]{3,40})/i] },
  { key: 'qty', label: '数量', re: [/(\d[\d,]{1,7})\s*(?:pcs|pieces|units|sets|个|件)/i] },
  { key: 'dest', label: '目的地', re: [/(?:to|in|ship to|deliver to)\s+([A-Z][a-zA-Z\s]{2,30}?)(?:[.,;\n]|$)/] },
  { key: 'price', label: '要什么价', re: [/\b(FOB|CIF|EXW|DDP|CFR)\b/i, /(?:price|quote|quotation|cost)/i] },
  { key: 'cert', label: '认证要求', re: [/(fumigation|phytosanitary|certificate of origin|CE mark|\bCE\b|\bISO\s?\d{3,}|REACH|FSC|熏蒸|认证)/i] },
  { key: 'payment', label: '付款方式', re: [/(T\/T|L\/C|paypal|deposit|prepay|定金|赊账|net\s?\d+)/i] },
];

const RISK_RULES = [
  { re: /fumigation|熏蒸|wood|solid wood|木质/i, level: 'warn', text: '木质包装要去目的港做熏蒸/热处理，没证会被扣货——先确认谁出证、费用谁承担。' },
  { re: /\bFOB\b/i, level: 'info', text: 'FOB 报价不含海运费与保险，买家可能以为是到手价；回信里把 FOB 与 CIF 两个口径并排给。' },
  { re: /deposit|定金|T\/T/i, level: 'info', text: '常见 30% 定金 + 尾款见提单；若对方要赊账（net 30/60），先查公司资信再谈。' },
  { re: /(?:cheap|discount|lower price|best price|太贵|便宜)/i, level: 'warn', text: '对方先压价：别直接让价，先问数量与目标价，用阶梯价换量。' },
  { re: /(?:urgent|asap|immediately|尽快|急)/i, level: 'info', text: '催得急：先确认库存与船期再承诺交期，别口头答应。' },
  { re: /\d[\d,]{2,}\s*(?:pcs|pieces|units)/i, level: 'info', text: '数量较大：跨一个整柜时运费占比会变，先算体积重再报。' },
];

const pick = (text, rules) => {
  for (const r of rules) {
    const m = text.match(r);
    if (m) return (m[1] || m[0]).trim();
  }
  return '';
};

/** 解析一段询盘原文 */
export function parse(text) {
  const t = String(text || '');
  const fields = {};
  for (const f of FIELDS) fields[f.key] = pick(t, f.re) || '未提及（回信里主动问）';
  // 「We saw your elm dining table」→ 只留产品名
  fields.product = fields.product.replace(/^(?:we|i)\s+(?:saw|need|want|are interested in|like)\s+(?:your\s+)?/i, '').trim();
  const risks = RISK_RULES.filter((r) => r.re.test(t)).map((r) => ({ level: r.level, text: r.text }));
  if (!risks.length) risks.push({ level: 'info', text: '这封没看出硬性风险，回信补问三件事：数量、目的港、认证要求。' });

  const qty = Number((fields.qty || '').replace(/[^\d]/g, '')) || 200;
  const tiers = [qty, Math.round(qty * 2.5), Math.round(qty * 5)].map((q, i) => ({
    qty: q,
    unit: `US$ ${(88 - i * 4).toFixed(1)} / pc（占位，按你的成本改）`,
  }));

  const reply = {
    zh: `您好，\n\n感谢询价 ${fields.product === '未提及（回信里主动问）' ? '我们的产品' : fields.product}。\n关于您提到的 ${qty} 件：\n· 报价：${tiers[0].unit}，${tiers[1].qty} 件以上可再谈\n· 交期：现货 7 天出库，海运约 25 天\n· 认证：熏蒸/原产地证可代办，费用另计\n\n为了准确报价，麻烦确认三点：目的港、包装要求、是否需要定制 logo。\n\nBest regards`,
    en: `Hi,\n\nThanks for your inquiry about ${fields.product === '未提及（回信里主动问）' ? 'our product' : fields.product}.\nFor ${qty} pcs:\n· Price: ${tiers[0].unit} FOB, better rate from ${tiers[1].qty} pcs\n· Lead time: 7 days ex-stock, ~25 days by sea\n· Documents: fumigation / CO can be arranged at cost\n\nTo quote precisely, could you confirm: destination port, packaging, and whether you need custom logo?\n\nBest regards`,
    th: `สวัสดีครับ\n\nขอบคุณที่สอบถามเกี่ยวกับ ${fields.product === '未提及（回信里主动问）' ? 'สินค้าของเรา' : fields.product}\nสำหรับ ${qty} ชิ้น:\n· ราคา: ${tiers[0].unit} FOB\n· ระยะเวลาส่งมอบ: มีสต็อก 7 วัน, ทางเรือประมาณ 25 วัน\n· เอกสาร: ใบรับรองอบไม้ / CO จัดให้ได้ (คิดเพิ่ม)\n\nรบกวนยืนยัน: ท่าเรือปลายทาง, การบรรจุ, และต้องการโลโก้หรือไม่\n\nขอบคุณครับ`,
    vi: `Xin chào,\n\nCảm ơn bạn đã hỏi về ${fields.product === '未提及（回信里主动问）' ? 'sản phẩm của chúng tôi' : fields.product}.\nVới ${qty} chiếc:\n· Giá: ${tiers[0].unit} FOB\n· Thời gian giao: có sẵn 7 ngày, đường biển ~25 ngày\n· Chứng từ: hun trùng / CO có thể làm, phí tính riêng\n\nVui lòng xác nhận: cảng đến, đóng gói, và có cần logo riêng không.\n\nTrân trọng`,
  };

  return {
    fields: Object.entries(fields).map(([k, v]) => ({ key: k, label: (FIELDS.find((f) => f.key === k) || {}).label || k, value: v })),
    risks,
    tiers,
    reply,
    summary: `${fields.product} · ${qty} 件 · ${fields.dest}`,
  };
}

export function promptParse(text, langs = ['en']) {
  return [
    '下面是一封海外买家的询盘原文，做三件事并只输出 JSON：',
    '1) 抽五要素：product / qty / dest / price / cert / payment；没写的填「未提及」；',
    '2) 标风险：level=warn|info，text 一句话说清为什么；',
    '3) 写回信：语言 ' + langs.join(', ') + '，口吻专业友好，不超过 180 词，结尾问三个待确认项。',
    '格式：{"fields":[{"key":"","label":"","value":""}],"risks":[{"level":"","text":""}],"reply":{"en":""}}',
    '不要编造价格与证书，涉及数字写「按实际填」。',
    '',
    '原文：',
    text,
  ].join('\n');
}
