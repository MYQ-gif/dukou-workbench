/**
 * 视觉总监规则（对应 docs/visual-director-v2.md）
 * 纯逻辑、零依赖：类目表 → 产品分析 → 视觉规范 → 素材计划 → 分步提示词。
 * 生图/文案的真调用在 lib/ai.mjs，这里只负责"该做什么、按什么标准做"。
 */

/** 12 个类目的视觉打法：光位、配色、场景、关键词。 */
export const CATEGORIES = [
  { id: 'tech', name: '科技数码', light: '冷白主光 45° 侧上，硬阴影', palette: ['#0E1720', '#4FA3D1', '#E6F0F7'], scene: '暗场 + 拉丝金属台面 + 微弱反射', words: ['精密', '结构', '未来'] },
  { id: 'beauty', name: '美妆', light: '柔光箱 + 大面积反光板，低对比', palette: ['#F6EFEA', '#D9A9A0', '#7C4A44'], scene: '哑光台面 + 水感道具 + 极浅景深', words: ['质感', '柔润', '高级'] },
  { id: 'food', name: '食品', light: '侧逆光 30°，暖调 4000K', palette: ['#F4E3C8', '#C26B32', '#5B3A24'], scene: '木质桌面 + 蒸汽/水珠 + 丰盛堆叠', words: ['诱人', '新鲜', '烟火'] },
  { id: 'home', name: '家居', light: '窗光自然侧光，软阴影', palette: ['#F3EFE8', '#B08A6A', '#3E3A35'], scene: '实景房间 + 生活痕迹 + 织物纹理', words: ['温润', '耐看', '日常'] },
  { id: 'apparel', name: '服饰', light: '柔光 + 轻微轮廓光', palette: ['#EFEDEA', '#8A8579', '#2B2B2B'], scene: '白墙/素色背景 + 真人模特动态', words: ['版型', '垂坠', '自在'] },
  { id: 'baby', name: '母婴', light: '柔光、低对比、无硬阴影', palette: ['#FBF4EE', '#A8C7C0', '#7A6E63'], scene: '浅色布艺 + 圆润道具 + 干净台面', words: ['安心', '柔软', '细致'] },
  { id: 'pet', name: '宠物', light: '自然光 + 抓拍感', palette: ['#F2EEE6', '#8FAE86', '#4A443C'], scene: '居家地面/沙发 + 低机位 + 动感', words: ['陪伴', '活泼', '毛感'] },
  { id: 'jewel', name: '珠宝', light: '暗场 + 单点高光 + 微距', palette: ['#111111', '#C9A227', '#F2F2F0'], scene: '黑色绒面 + 倒影台 + 极浅景深', words: ['火彩', '精致', '稀贵'] },
  { id: 'sport', name: '运动', light: '高对比硬光 + 冷调', palette: ['#12151A', '#38B2C4', '#F2F5F7'], scene: '场地/路面 + 动态 + 汗水质感', words: ['爆发', '轻盈', '耐力'] },
  { id: 'tools', name: '五金工具', light: '硬光顶侧 + 工业灰环境', palette: ['#E8E8E6', '#3F4A52', '#D97706'], scene: '工作台 + 剖面/拆解 + 磨痕', words: ['耐用', '扎实', '做工'] },
  { id: 'gift', name: '礼盒', light: '暖侧光 + 内衬氛围光', palette: ['#F7F0E4', '#9C3D2E', '#2E2A26'], scene: '开合结构 + 内衬材质 + 仪式感', words: ['仪式', '馈赠', '体面'] },
  { id: 'other', name: '其他', light: '柔光 45° + 干净背景', palette: ['#F5F3EF', '#7A8794', '#22282E'], scene: '纯色背景 + 简洁道具', words: ['清晰', '真实', '克制'] },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/**
 * 英文版类目词表：Flux / SDXL / Stability 这类模型吃英文。
 * 与 CATEGORIES 一一对应，写的是"拍什么、怎么打光、什么感觉"，不是翻译腔。
 */
export const CATEGORY_EN = {
  tech: { scene: 'dark studio with a brushed-metal surface and faint reflections', light: 'cool-white key at 45° from upper left, crisp hard shadows', words: ['precision', 'engineered', 'future-facing'] },
  beauty: { scene: 'matte tabletop, watery props, very shallow depth of field', light: 'large softbox plus reflector, low contrast, clean highlights', words: ['smooth', 'dewy', 'premium'] },
  food: { scene: 'wooden table, steam and droplets, generous styling', light: 'back-side light at 30°, warm 4000K', words: ['appetising', 'fresh', 'homely'] },
  home: { scene: 'real room setting, lived-in details, visible fabric grain', light: 'soft window light from the side, gentle shadows', words: ['warm', 'timeless', 'everyday'] },
  apparel: { scene: 'plain wall or neutral backdrop, model in motion', light: 'soft light with a subtle rim', words: ['good drape', 'true fit', 'relaxed'] },
  baby: { scene: 'light fabric, rounded props, spotless surface', light: 'soft, low contrast, no hard shadows', words: ['safe', 'gentle', 'careful'] },
  pet: { scene: 'floor or sofa at home, low camera angle, sense of motion', light: 'natural daylight, candid feel', words: ['companionship', 'lively', 'soft fur'] },
  jewel: { scene: 'black velvet, mirror base, extremely shallow depth of field', light: 'dark field with a single specular highlight, macro', words: ['brilliance', 'delicate', 'rare'] },
  sport: { scene: 'track or road surface, dynamic pose, sweat texture', light: 'high-contrast hard light, cool tone', words: ['explosive', 'light', 'endurance'] },
  tools: { scene: 'workbench, cutaway or teardown, scuff marks', light: 'hard light from top-side, industrial grey surround', words: ['durable', 'solid', 'well-made'] },
  gift: { scene: 'open-and-close structure, visible lining, sense of ritual', light: 'warm side light plus inner ambient glow', words: ['ceremonial', 'giftable', 'presentable'] },
  other: { scene: 'solid background with minimal props', light: 'soft 45° light, clean falloff', words: ['clear', 'honest', 'restrained'] },
};

/** 中文视觉规范词 → 英文短语（Flux/SDXL 用）。没命中的就丢掉，不硬翻。 */
const SPEC_GLOSSARY = [
  [/窗光|自然光|日光/g, 'soft daylight from a window'],
  [/柔光/g, 'soft diffused light'],
  [/硬光/g, 'hard directional light'],
  [/侧光|侧上/g, 'side light'],
  [/逆光/g, 'back light'],
  [/暖/g, 'warm tone'],
  [/冷/g, 'cool tone'],
  [/低对比/g, 'low contrast'],
  [/高对比/g, 'high contrast'],
  [/浅景深/g, 'shallow depth of field'],
  [/居中|中心/g, 'centred composition'],
  [/留白/g, 'generous negative space'],
  [/三分/g, 'rule-of-thirds composition'],
  [/俯拍/g, 'top-down angle'],
  [/平视/g, 'eye-level angle'],
  [/45°?/g, '45-degree angle'],
  [/木|实木/g, 'natural wood'],
  [/织物|布/g, 'fabric texture'],
  [/金属/g, 'metal finish'],
  [/日常|生活/g, 'lived-in feel'],
  [/温柔|温润/g, 'warm and calm'],
  [/坚固|扎实/g, 'sturdy build'],
  [/真实/g, 'true-to-life'],
];

export function specEn(spec = {}) {
  const raw = [spec.lighting, spec.composition, spec.mood].filter(Boolean).join(' ');
  const hits = new Set();
  // 注意：词表里的正则带 g，直接 test() 会保留 lastIndex，第二次起就误判，所以每次重建
  for (const [re, en] of SPEC_GLOSSARY) if (new RegExp(re.source).test(raw)) hits.add(en);
  return [...hits].slice(0, 5);
}

/** 目标市场：同一条商品卖到不同国家，视觉与文案要贴当地习惯（不是翻译，是改写）。 */
export const MARKETS = [
  { id: 'us', label: '美国', lang: 'en', line: 'bright high-key light, one big hero product, benefit-first framing, minimal props' },
  { id: 'uk', label: '英国', lang: 'en', line: 'understated styling, muted palette, natural daylight, restrained copy and no hard-sell badges' },
  { id: 'de', label: '德国', lang: 'de', line: 'neutral grey surround, precise engineering detail, technical callouts, no marketing hype' },
  { id: 'fr', label: '法国', lang: 'fr', line: 'editorial mood, soft warm neutrals, slightly imperfect home styling, quiet copy' },
  { id: 'jp', label: '日本', lang: 'ja', line: 'quiet composition with generous negative space, muted palette, product at everyday scale; avoid loud saturated red and price badges' },
  { id: 'kr', label: '韩国', lang: 'ko', line: 'clean pastel palette, glossy finish, small styled props, soft studio light' },
  { id: 'sg', label: '新加坡', lang: 'en', line: 'tidy urban apartment setting, bright daylight, multicultural cues, clean typography' },
  { id: 'th', label: '泰国', lang: 'th', line: 'warm tropical daylight, vivid but natural colour, casual lived-in home setting' },
  { id: 'vn', label: '越南', lang: 'vi', line: 'bright daylight, practical home setting, visible value for money, simple props' },
  { id: 'id', label: '印尼', lang: 'id', line: 'warm family context, affordable-premium styling, moderate saturation, friendly tone' },
  { id: 'my', label: '马来西亚', lang: 'ms', line: 'multicultural modest styling, warm neutrals, family living room context' },
  { id: 'ph', label: '菲律宾', lang: 'en', line: 'bright cheerful light, family home context, saturated accents used sparingly' },
  { id: 'br', label: '巴西', lang: 'pt', line: 'vibrant saturated accents, outdoor sunlight, expressive lifestyle framing' },
  { id: 'mx', label: '墨西哥', lang: 'es', line: 'warm terracotta palette, handcrafted texture, sunlit courtyard context' },
  { id: 'ae', label: '中东', lang: 'ar', line: 'luxury restraint, cool marble and warm gold accents used sparingly, modest dress, no alcohol or pork references' },
  { id: 'au', label: '澳洲', lang: 'en', line: 'sunlit outdoor lifestyle, relaxed styling, natural materials, honest copy' },
  { id: 'cn', label: '中国内地', lang: 'zh', line: 'bright e-commerce lighting, clear selling-point badges, red accents acceptable, dense information layout' },
  { id: 'ca', label: '加拿大', lang: 'en', line: 'clean natural light, honest product scale, low-pressure copy with clear specs' },
  { id: 'it', label: '意大利', lang: 'it', line: 'warm terracotta and stone, food-and-family styling, generous table space' },
  { id: 'es', label: '西班牙', lang: 'es', line: 'sunlit warm tones, social table setting, expressive but not loud typography' },
  { id: 'nl', label: '荷兰', lang: 'nl', line: 'flat daylight, plain functional framing, no decorative props, honest numbers' },
  { id: 'pl', label: '波兰', lang: 'pl', line: 'cool neutral background, sturdy practical styling, price clarity' },
  { id: 'se', label: '瑞典', lang: 'sv', line: 'pale wood and white, calm minimal styling, soft overcast light' },
  { id: 'tr', label: '土耳其', lang: 'tr', line: 'rich warm colour, tea-and-guest hosting cues, generous serving sizes' },
  { id: 'sa', label: '沙特', lang: 'ar', line: 'luxury restraint, gold accents on deep neutrals, no alcohol or pork references, RTL-friendly layouts' },
  { id: 'il', label: '以色列', lang: 'he', line: 'bright daylight, practical family use, straightforward framing, RTL-friendly layouts' },
  { id: 'za', label: '南非', lang: 'en', line: 'sun-warmed outdoor settings, bold colour blocks, value-for-money framing' },
  { id: 'eg', label: '埃及', lang: 'ar', line: 'warm dusty palette, family gathering scenes, clear price and delivery info' },
  { id: 'ng', label: '尼日利亚', lang: 'en', line: 'vivid saturated colour, celebratory styling, mobile-first small text' },
  { id: 'ke', label: '肯尼亚', lang: 'en', line: 'natural earth tones, outdoor light, durable-use framing' },
  { id: 'ru', label: '俄罗斯', lang: 'ru', line: 'cool daylight, sturdy winter-proof framing, spec-heavy callouts' },
  { id: 'in', label: '印度', lang: 'en', line: 'festive colour accents on warm neutrals, family use, value framing' },
  { id: 'tw', label: '中国台湾', lang: 'zh', line: 'soft warm light, small-space home styling, quiet and tidy composition' },
  { id: 'hk', label: '中国香港', lang: 'zh', line: 'compact urban interior, tight framing for small flats, efficient copy' },
  { id: 'mo', label: '中国澳门', lang: 'zh', line: 'compact interior, warm hotel-style lighting, tidy composition' },
  { id: 'nz', label: '新西兰', lang: 'en', line: 'open natural light, outdoor lifestyle context, relaxed unposed styling' },
  { id: 'cl', label: '智利', lang: 'es', line: 'bright coastal light, simple home staging, clear shipping notes' },
  { id: 'arg', label: '阿根廷', lang: 'es', line: 'warm evening light, bold rustic styling, generous portions' },
  { id: 'co', label: '哥伦比亚', lang: 'es', line: 'tropical daylight, vivid greens and warm clay, lively but tidy' },
];

export const MARKET_BY_ID = Object.fromEntries(MARKETS.map((m) => [m.id, m]));

/** 市场适配那一行（英文，直接进提示词）。 */
export function marketLine(id) {
  const m = MARKET_BY_ID[id];
  if (!m) return '';
  return `Market fit (${m.label}): ${m.line}.`;
}

/** 平台默认市场：国内平台给 cn，东南亚平台给 sg，其余给 us。 */
export function defaultMarket(platformId) {
  if (['taobao', 'xianyu', 'jd'].includes(platformId)) return 'cn';
  if (['shopee', 'lazada', 'tiktok'].includes(platformId)) return 'sg';
  return 'us';
}

/** 类目关键词 → 类目 id（写死关键词，不调模型）。 */
const CATEGORY_HINTS = [
  ['tech', /手机|耳机|键盘|相机|充电|蓝牙|数码|电脑|显示器|音箱|智能|tablet|laptop|usb/i],
  ['beauty', /口红|粉底|精华|面霜|香水|面膜|护肤|彩妆|美妆|眼影/i],
  ['food', /茶|咖啡|零食|坚果|糕点|酱|油|米|面|食品|饮料|蜂蜜/i],
  ['home', /桌|椅|柜|床|沙发|灯|收纳|地毯|餐具|家居|木/i],
  ['apparel', /衣|裤|裙|鞋|包|帽|袜|外套|卫衣|服饰/i],
  ['baby', /婴|童|宝宝|奶瓶|辅食|尿布|玩具/i],
  ['pet', /猫|狗|宠物|猫粮|狗粮|牵引/i],
  ['jewel', /项链|戒指|耳环|手链|珠宝|银|金饰|玉/i],
  ['sport', /运动|健身|瑜伽|跑鞋|球|哑铃|户外/i],
  ['tools', /扳手|螺丝|电钻|工具|五金|锤|钳/i],
  ['gift', /礼盒|礼包|伴手礼|套装礼/i],
];

export function guessCategory(text = '') {
  for (const [id, re] of CATEGORY_HINTS) if (re.test(text)) return id;
  return 'other';
}

/** 补素材卡：5 个问题，全部可跳过，带默认值。 */
export const ASK_QUESTIONS = [
  { id: 'angles', q: '有侧面 / 背面 / 45° 的实拍吗？有就传，没有我就按能看清的角度来', kind: 'angles', def: [] },
  { id: 'usage', q: '这张主要用在哪？', kind: 'choice', options: ['电商主图', '产品展示图', '营销海报', '详情页'], def: '电商主图' },
  { id: 'model', q: '要不要用模特？（只有服饰/美妆/家居/运动才问）', kind: 'choice', options: ['要', '不要'], def: '不要' },
  { id: 'selling', q: '一句话卖点（不填我就从图里推断，并在分析里标注）', kind: 'text', def: '' },
  { id: 'market', q: '卖到哪个市场？客单价大概多少？（可跳过）', kind: 'text', def: '' },
];

/** 三视图默认角度；有实拍的角度不生成。 */
export const ANGLE_DEFAULT = ['front', 'deg45', 'side_right'];
export const ANGLE_LABEL = { front: '正面', deg45: '45°', side_left: '左侧', side_right: '右侧', back: '背面', top: '俯视', bottom: '仰视' };

/**
 * 哪些角度要生成、哪些跳过。
 * realAngles：用户已上传的实拍角度；info：从参考图判断"看不看得见"的角度（默认只认 front/45/side）。
 */
export function anglePlan({ realAngles = [], wanted = ANGLE_DEFAULT, visible = {} } = {}) {
  const have = new Set(realAngles.map((a) => (a === 'side' ? 'side_right' : a)));
  const generate = [];
  const skip = [];
  for (const a of wanted) {
    if (have.has(a)) skip.push({ angle: a, reason: '用你上传的实拍图，不生成' });
    else if (visible[a] === false) skip.push({ angle: a, reason: '参考图看不到这个角度，不编造' });
    else generate.push(a);
  }
  return { generate, skip };
}

/** 精修图的两个裁切（主图位 / 详情位）。 */
export function refinePlan(platform) {
  const w = (platform && platform.w) || 1000;
  const h = (platform && platform.h) || 1000;
  return [
    { crop: '1:1', w, h: w },
    { crop: '3:4', w: Math.round(w * 0.75), h: Math.round((w * 0.75) / 0.75) },
  ];
}

/** 产品分析（mock / 无 TEXT 模型时的确定性版本）。 */
export function analyzeMock(p = {}, brief = {}) {
  const text = `${p.title || ''} ${(p.sellingPoints || []).join(' ')} ${brief.selling || ''}`;
  const cat = CATEGORY_BY_ID[guessCategory(text)] || CATEGORY_BY_ID.other;
  const selling = (p.sellingPoints && p.sellingPoints.length ? p.sellingPoints : String(brief.selling || '').split(/[。；;]/).filter(Boolean)).slice(0, 3);
  return {
    category: cat.id,
    positioning: `面向${brief.market || '海外'}市场的${cat.name}，主打${selling[0] || cat.words[0]}`,
    target_user: brief.market ? `${brief.market} 市场的日常消费者` : '注重品质与性价比的日常消费者',
    selling_points: selling.length ? selling : cat.words.map((w) => `${w}感`),
    differences: [`${cat.words[0]}的做工细节`, `${cat.words[1]}的材质表现`, `${cat.words[2]}的使用场景`],
    brand_keywords: cat.words,
    visual_style: `${cat.name}质感 · ${cat.light.split('，')[0]}`,
    palette: cat.palette,
    design_direction: `${cat.light}；${cat.scene}；主体占画面 55–70%，四边留 8% 安全区`,
    assumptions: [
      p.sellingPoints && p.sellingPoints.length ? '' : '卖点为 AI 推断',
      brief.market ? '' : '目标市场未提供，按泛海外推断',
    ].filter(Boolean),
  };
}

/** 由分析推导「视觉规范」（文字，不生图）。 */
export function buildSpec(analysis, version = 1) {
  const cat = CATEGORY_BY_ID[analysis.category] || CATEGORY_BY_ID.other;
  return {
    version,
    category: analysis.category,
    composition: '产品居中偏下 1/3，上方留白放标题；视觉重心在主体最亮处，视线朝右',
    lighting: cat.light,
    palette: { base: analysis.palette[0], accent: analysis.palette[1], support: analysis.palette[2], ink: '#1A1917' },
    scene: cat.scene,
    typography: '标题 28px/600、卖点 15px/500、正文 13px/400；单一左边缘；卖点不超过 3 条',
    mood: analysis.brand_keywords,
    do: ['产品外观/颜色/比例与精修图一致', '同产品所有物料共用本 spec 的光位与配色', '文字只出现在安全区内'],
    dont: ['不加渐变背景与光晕', '不改 logo 与包装文字', '不猜看不见的背面结构'],
  };
}

/** 分步提示词：每步一个短模板，只带该步需要的字段（别整份塞给模型）。 */
export function promptFor(step, ctx = {}) {
  if (ctx.lang === 'en') return promptForEn(step, ctx);
  const a = ctx.analysis || {};
  const s = ctx.spec || {};
  const pf = ctx.platform || {};
  const base = `产品：${ctx.title || ''}。`;
  switch (step) {
    case 'analyze':
      return `你是电商视觉总监。读这张产品图与描述，输出 JSON：category(12 类之一)、positioning、target_user、selling_points[3]、differences[3 且必须可拍出来]、brand_keywords[3-5]、visual_style、palette[3 个 hex]、design_direction、assumptions[](哪些是推断)。${base}`;
    case 'refine':
      return `${base}把这张随手拍修成电商级产品图：外观/颜色/比例/结构完全不变，只修瑕疵、材质质感、光影高光、干净阴影、边缘锐度，去背景杂物，纯白或极浅灰背景，无道具无文字。输出 ${ctx.w || 1000}×${ctx.h || 1000}。`;
    case 'angle':
      return `${base}基于精修图生成「${ANGLE_LABEL[ctx.angle] || ctx.angle}」视图。产品外观/颜色/比例一致，纯色背景（取精修图背景色），固定主光方向与色温，同一地平线。看不到的结构不要编造。`;
    case 'spec':
      return `基于产品分析输出视觉规范 JSON：composition、lighting、palette{base,accent,support,ink}、scene、typography、mood[3]、do[3]、dont[3]。分析：${JSON.stringify(a).slice(0, 800)}`;
    case 'main':
      return `${base}版式与配色按视觉规范 v${s.version}：${s.lighting}；${s.composition}；主色 ${s.palette && s.palette.base}。生成${pf.name || ''}电商主图 ${ctx.w}×${ctx.h}：产品占 55–70%，核心卖点 ≤3 条（每条 ≤8 字），只突出一个重点，文字留安全区。产品必须与参考图一致。`;
    case 'poster':
      return `${base}按视觉规范 v${s.version} 出一张${ctx.ratio || '竖版'}营销海报 ${ctx.w}×${ctx.h}：主色 ${s.palette && s.palette.base}，场景 ${s.scene}，标题与卖点按 ${s.typography}，版式与同产品其他物料统一。`;
    case 'detail':
      return `${base}详情页第 ${ctx.seg} 段「${ctx.segTitle}」，${ctx.w}×${ctx.h}，按视觉规范 v${s.version}：${s.lighting}；本段只讲这一件事，与相邻段视觉连续。`;
    case 'model':
      return `${base}生成自然真实的${ctx.usage || '使用'}场景模特图：模特风格贴合 ${a.target_user}，产品外观/颜色一致，配色与光位按视觉规范 v${s.version}。不要明星脸，不要生成可识别真人。`;
    default:
      return base;
  }
}

/** 英文版分步提示词：给 Flux / SDXL 这类吃英文的模型用。 */
function promptForEn(step, ctx = {}) {
  const s = ctx.spec || {};
  const pf = ctx.platform || {};
  const catId = s.category || (ctx.analysis && ctx.analysis.category) || 'other';
  const cat = CATEGORY_EN[catId] || CATEGORY_EN.other;
  const look = specEn(s).join('; ') || `${cat.light}; ${cat.words.join(' / ')}`;
  const subject = ctx.title || 'the product';
  const ref = 'keep the product identical to the reference photo: same shape, colour, proportion, hardware and wear marks.';
  switch (step) {
    case 'refine':
      return `Turn this casual phone photo into a professional e-commerce product shot of "${subject}". ${ref} Only clean up: blemishes, material texture, light and highlight, soft shadow, edge sharpness; remove background clutter to pure white or a very light grey with no props and no text. Output ${ctx.w || 1000}x${ctx.h || 1000}.`;
    case 'angle':
      return `From the refined product photo, render the "${ANGLE_LABEL[ctx.angle] || ctx.angle}" view of "${subject}". ${ref} Plain seamless background matching the refined shot, same key-light direction and colour temperature, same horizon line. Do not invent structure that cannot be seen.`;
    case 'main':
      return `E-commerce main image of "${subject}" for ${pf.name || 'marketplace'}, ${ctx.w}x${ctx.h}. ${look}. Product occupies 55-70% of frame, at most three short selling points, one clear focal idea, safe margin left for headline text. ${ref}`;
    case 'poster':
      return `Marketing poster of "${subject}", ${ctx.ratio || 'vertical'} ${ctx.w}x${ctx.h}. ${look}. Headline area kept clean, layout consistent with this product's other assets. ${ref}`;
    case 'detail':
      return `Detail-page panel ${ctx.seg} "${ctx.segTitle}" for "${subject}", ${ctx.w}x${ctx.h}. ${look}. This panel communicates one idea only, visually continuous with the neighbouring panels. ${ref}`;
    case 'model':
      return `Lifestyle shot of "${subject}" in a real ${ctx.usage || 'everyday'} setting. Natural, believable model; product identical to the reference. Lighting and palette follow ${look}. No celebrity faces, no identifiable real person.`;
    default:
      return `Product shot of "${subject}". ${look}.`;
  }
}

/** 素材台账：列出某商品可复用的基底素材。 */
export function baseAssets(db, productId) {
  const list = (db.assets || []).filter((x) => x.productId === productId);
  return {
    refined: list.filter((x) => x.kind === 'refined'),
    angles: list.filter((x) => x.kind === 'angle' || x.kind === 'angle_real'),
    spec: (db.products || []).find((p) => p.id === productId)?.visualSpec || null,
  };
}

/** 生成物料时该引用哪个角度素材：实拍优先。 */
export function pickAngle(db, productId, angle) {
  const list = (db.assets || []).filter((x) => x.productId === productId && (x.kind === 'angle' || x.kind === 'angle_real'));
  return list.find((x) => x.meta?.angle === angle && x.kind === 'angle_real') || list.find((x) => x.meta?.angle === angle) || null;
}

/** 详情页六段结构：每段只讲一件事，文案里的数字来自事实锚点。 */
export const DETAIL_SEGMENTS = [
  { id: 'brand', title: '品牌认知', ask: '产品全貌，正面干净背景，留标题区', head: (p) => `${p.title}｜一个人的手工，一群人的日子` },
  { id: 'selling', title: '核心卖点', ask: '主卖点的特写，光线强调材质', head: (p) => `${(p.sellingPoints || [])[0] || '实木手工'}，看得见摸得着` },
  { id: 'detail', title: '产品细节', ask: '榫卯/桌角/纹理的微距细节', head: () => '细节经得起凑近看' },
  { id: 'feature', title: '功能展示', ask: '承重、开合、稳定的动作瞬间', head: () => '稳固，是坐下来的前提' },
  { id: 'scene', title: '使用场景', ask: '真实家居场景里的使用画面', head: () => '放在家里，比图片里更好看' },
  { id: 'reason', title: '购买理由', ask: '整组物料的收束画面，配一句行动号召', head: () => '今天就下单，七天可退' },
];

/** 详情页计划：六段各自的尺寸、提示词、文案（数字优先用事实锚点）。 */
export function detailPlan(product, { platform = {}, anchors = [], lang = 'en', promptLang = 'zh' } = {}) {
  const w = Math.round((platform.w || 800) * 1);
  const h = Math.round(w * 1.4);
  const nums = anchors.map((a) => a.after).filter(Boolean);
  return DETAIL_SEGMENTS.map((seg, i) => {
    const anchor = nums.length ? nums[i % nums.length] : '';
    const copy = [
      seg.head(product),
      anchor ? `· ${anchor}` : '',
      `· ${(product.sellingPoints || [])[i % Math.max(1, (product.sellingPoints || []).length)] || '实木手工，老料新做'}`,
    ]
      .filter(Boolean)
      .join('\n');
    return {
      id: seg.id,
      index: i + 1,
      title: seg.title,
      copy,
      w,
      h,
      prompt: promptFor('detail', {
        title: product.title,
        seg: i + 1,
        segTitle: `${seg.title}：${seg.ask}`,
        spec: product.visualSpec || {},
        platform,
        w,
        h,
        lang: promptLang,
      }),
    };
  });
}

/** 需要模特的类目。 */
export const MODEL_CATEGORIES = new Set(['apparel', 'beauty', 'home', 'sport']);
