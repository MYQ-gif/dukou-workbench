/**
 * 视觉总监规则（对应 docs/visual-director-v2.md）
 * 纯逻辑、零依赖：类目表 → 8维产品分析 → 纯文本视觉规范 → 素材计划 → 5模式分步提示词。
 * 生图/文案的真调用在 lib/ai.mjs，这里只负责"该做什么、按什么标准做"。
 */

/** 12 个类目的视觉打法：光位、配色、场景、关键词（融合克制留白与高级材质质感）。 */
export const CATEGORIES = [
  { id: 'tech', name: '科技数码', light: '冷白主光 45° 侧上 + 清晰轮廓边缘光，干净硬阴影', palette: ['#0E1720', '#4FA3D1', '#E6F0F7'], scene: '深色哑光展台 + 拉丝金属与微弱镜面反射 + 极简建筑几何留白', words: ['精密结构', '未来科技', '硬核工艺'] },
  { id: 'beauty', name: '美妆', light: '大型柔光箱 + 漫反射反光板，通透低对比与水润高光', palette: ['#F6EFEA', '#D9A9A0', '#7C4A44'], scene: '微水泥哑光台面 + 凝露水感道具 + 极浅景深呼吸感留白', words: ['细腻质感', '高级氛围', '通透肤感'] },
  { id: 'food', name: '食品', light: '侧逆光 30°，暖调 4000K 突出新鲜光泽', palette: ['#F4E3C8', '#C26B32', '#5B3A24'], scene: '温润原木桌面 + 细腻蒸汽/凝珠 + 丰盛食材层次', words: ['鲜香诱人', '食欲张力', '真实烟火'] },
  { id: 'home', name: '家居', light: '自然窗光侧向漫射，柔和长阴影', palette: ['#F3EFE8', '#B08A6A', '#3E3A35'], scene: '真实建筑空间光影 + 天然织物与木纹肌理 + 克制留白', words: ['温润肌理', '生活美学', '耐看质感'] },
  { id: 'apparel', name: '服饰', light: '大面积漫射柔光 + 微妙发丝轮廓光', palette: ['#EFEDEA', '#8A8579', '#2B2B2B'], scene: '纯色建筑肌理墙面 + 自然动态垂坠感', words: ['利落版型', '面料垂坠', '松弛高级'] },
  { id: 'baby', name: '母婴', light: '全漫射柔光、低对比、零生硬阴影', palette: ['#FBF4EE', '#A8C7C0', '#7A6E63'], scene: '有机棉浅色布艺 + 圆润安全道具 + 洁净台面', words: ['安心亲肤', '柔软呵护', '纯净细节'] },
  { id: 'pet', name: '宠物', light: '明亮自然日光 + 鲜活抓拍感', palette: ['#F2EEE6', '#8FAE86', '#4A443C'], scene: '温馨居家木地板/沙发 + 低机位互动视角', words: ['暖心陪伴', '自然活泼', '细腻毛感'] },
  { id: 'jewel', name: '珠宝', light: '暗调聚光 + 单点锐利高光 + 微距景深', palette: ['#111111', '#C9A227', '#F2F2F0'], scene: '哑光黑丝绒/天然石材 + 镜面微倒影', words: ['璀璨火彩', '高定精工', '稀缺质感'] },
  { id: 'sport', name: '运动', light: '高对比定向硬光 + 冷静金属质感', palette: ['#12151A', '#38B2C4', '#F2F5F7'], scene: '专业赛道/户外质感地面 + 力量动态构图', words: ['敏捷爆发', '轻量化设计', '硬核耐力'] },
  { id: 'tools', name: '五金工具', light: '顶侧工业硬光 + 中性灰冷静环境', palette: ['#E8E8E6', '#3F4A52', '#D97706'], scene: '精密工业工作台 + 结构拆解层次 + 金属拉丝细节', words: ['精工耐用', '结构扎实', '专业可靠'] },
  { id: 'gift', name: '礼盒', light: '暖调侧主光 + 盒内柔光氛围', palette: ['#F7F0E4', '#9C3D2E', '#2E2A26'], scene: '半开合仪式视角 + 烫金/特种纸内衬肌理', words: ['高定仪式', '体面馈赠', '匠心细节'] },
  { id: 'other', name: '其他', light: '45° 商业柔光 + 干净轮廓阴影', palette: ['#F5F3EF', '#7A8794', '#22282E'], scene: '纯净渐变无影墙 + 极简几何展台', words: ['纯粹质感', '真实还原', '克制高级'] },
];

export const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

/** 英文版类目词表：给 Flux / SDXL / Seedream 等英文主导模型使用。 */
export const CATEGORY_EN = {
  tech: { scene: 'dark matte studio pedestal with brushed-metal accents, subtle specular reflection and clean architectural negative space', light: 'cool-white key light at 45° upper-left with crisp rim light and clean shadows', words: ['precision engineered', 'structural clarity', 'futuristic craft'] },
  beauty: { scene: 'matte stone tabletop with subtle water droplets and ultra-shallow depth of field', light: 'large softbox plus reflector, low contrast, luminous clean highlights', words: ['silky texture', 'atmospheric glow', 'refined luxury'] },
  food: { scene: 'natural wooden table with delicate steam or condensation droplets and appetising styling', light: 'back-side light at 30°, warm 4000K golden tone', words: ['mouth-watering', 'fresh', 'rich flavour'] },
  home: { scene: 'lived-in architectural interior with natural fabric and wood grain details', light: 'soft directional window daylight with gentle shadows', words: ['warm tactile', 'timeless design', 'everyday serenity'] },
  apparel: { scene: 'clean neutral architectural backdrop with natural fabric drape', light: 'diffused soft light with subtle rim separation', words: ['tailored silhouette', 'natural drape', 'effortless style'] },
  baby: { scene: 'soft organic cotton fabric and rounded minimal props on a spotless surface', light: 'diffused low-contrast soft light with zero harsh shadows', words: ['gentle & safe', 'cloud-soft', 'pure care'] },
  pet: { scene: 'bright home living space shot from a low eye-level perspective', light: 'natural candid daylight', words: ['warm companionship', 'lively', 'tactile comfort'] },
  jewel: { scene: 'matte black velvet and natural stone base with subtle mirror reflection, macro lens', light: 'dark studio field with a single crisp specular highlight', words: ['brilliant facets', 'fine craftsmanship', 'precious'] },
  sport: { scene: 'textured track or outdoor surface with dynamic energy', light: 'high-contrast directional cool light', words: ['explosive agility', 'lightweight', 'endurance'] },
  tools: { scene: 'clean industrial workbench highlighting mechanical precision and brushed metal', light: 'top-side directional light in neutral industrial grey', words: ['heavy-duty', 'precision-built', 'reliable'] },
  gift: { scene: 'partially opened luxury gift box showcasing textured lining and ceremonial presentation', light: 'warm side key light plus soft inner ambient glow', words: ['ceremonial', 'gift-worthy', 'exquisite'] },
  other: { scene: 'minimalist seamless studio cyclorama with a clean geometric plinth', light: 'soft 45° commercial studio light with clean falloff', words: ['honest craft', 'clean aesthetic', 'restrained'] },
};

const SPEC_GLOSSARY = [
  [/窗光|自然光|日光/g, 'soft daylight from a window'],
  [/柔光/g, 'soft diffused light'],
  [/硬光/g, 'hard directional light'],
  [/侧光|侧上/g, 'side light'],
  [/逆光|轮廓光/g, 'rim and back light'],
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
  [/金属/g, 'brushed metal finish'],
  [/日常|生活/g, 'lived-in feel'],
  [/温柔|温润/g, 'warm and calm'],
  [/坚固|扎实/g, 'sturdy build'],
  [/真实/g, 'true-to-life'],
];

export function specEn(spec = {}) {
  const raw = [spec.lighting, spec.composition, spec.mood, spec.scene].filter(Boolean).join(' ');
  const hits = new Set();
  for (const [re, en] of SPEC_GLOSSARY) if (new RegExp(re.source).test(raw)) hits.add(en);
  return [...hits].slice(0, 6);
}

/** 目标市场视觉与文化适配词条 */
export const MARKETS = [
  { id: 'us', label: '美国', lang: 'en', line: 'bright high-key studio light, single bold hero product, benefit-first framing, minimal clutter' },
  { id: 'uk', label: '英国', lang: 'en', line: 'understated editorial styling, muted palette, natural daylight, restrained copy without loud badges' },
  { id: 'de', label: '德国', lang: 'de', line: 'neutral grey surround, precise engineering detail, technical clarity, zero marketing hype' },
  { id: 'fr', label: '法国', lang: 'fr', line: 'editorial aesthetic, soft warm neutrals, refined lifestyle framing, quiet typography space' },
  { id: 'jp', label: '日本', lang: 'ja', line: 'quiet composition with generous negative space, muted refined palette, clean delicate hierarchy; avoid loud red stickers' },
  { id: 'kr', label: '韩国', lang: 'ko', line: 'clean pastel palette, luminous finish, curated minimal props, soft studio light' },
  { id: 'sg', label: '新加坡', lang: 'en', line: 'tidy modern urban apartment setting, bright daylight, clean typography margin' },
  { id: 'th', label: '泰国', lang: 'th', line: 'warm tropical daylight, vivid natural colour, inviting lifestyle home setting' },
  { id: 'vn', label: '越南', lang: 'vi', line: 'bright daylight, practical modern home setting, clear value presentation' },
  { id: 'id', label: '印尼', lang: 'id', line: 'warm family context, approachable premium styling, balanced saturation' },
  { id: 'my', label: '马来西亚', lang: 'ms', line: 'modest contemporary styling, warm neutrals, bright living room context' },
  { id: 'ph', label: '菲律宾', lang: 'en', line: 'bright cheerful daylight, warm home context, clean focal hierarchy' },
  { id: 'br', label: '巴西', lang: 'pt', line: 'vibrant sunlight, expressive lifestyle framing, energetic contrast' },
  { id: 'mx', label: '墨西哥', lang: 'es', line: 'warm terracotta tones, artisanal texture, sunlit courtyard context' },
  { id: 'ae', label: '中东', lang: 'ar', line: 'luxury restraint, cool marble and subtle warm gold accents, modest styling, RTL-friendly negative space' },
  { id: 'au', label: '澳洲', lang: 'en', line: 'sunlit outdoor lifestyle, relaxed natural materials, honest framing' },
  { id: 'cn', label: '中国内地', lang: 'zh', line: 'high-craft commercial e-commerce lighting, clear focal selling point, structured copy safe zones' },
  { id: 'ca', label: '加拿大', lang: 'en', line: 'clean natural light, honest product scale, clear specification space' },
  { id: 'it', label: '意大利', lang: 'it', line: 'warm stone and terracotta tones, artisanal craft emphasis' },
  { id: 'es', label: '西班牙', lang: 'es', line: 'sunlit warm tones, expressive yet clean editorial framing' },
  { id: 'nl', label: '荷兰', lang: 'nl', line: 'crisp daylight, functional minimalist framing, zero unnecessary props' },
  { id: 'pl', label: '波兰', lang: 'pl', line: 'cool neutral background, sturdy practical styling' },
  { id: 'se', label: '瑞典', lang: 'sv', line: 'pale wood and off-white, calm Scandinavian minimalism, soft overcast light' },
  { id: 'tr', label: '土耳其', lang: 'tr', line: 'rich warm tones, refined hospitality cues' },
  { id: 'sa', label: '沙特', lang: 'ar', line: 'luxury restraint, gold accents on deep neutrals, RTL-friendly layout' },
  { id: 'il', label: '以色列', lang: 'he', line: 'bright daylight, practical modern use, RTL-friendly layout' },
  { id: 'za', label: '南非', lang: 'en', line: 'sun-warmed outdoor settings, crisp contrast' },
  { id: 'eg', label: '埃及', lang: 'ar', line: 'warm sandstone palette, clear product focus' },
  { id: 'ng', label: '尼日利亚', lang: 'en', line: 'vivid contrast, crisp mobile-first focal point' },
  { id: 'ke', label: '肯尼亚', lang: 'en', line: 'natural earth tones, bright outdoor light' },
  { id: 'ru', label: '俄罗斯', lang: 'ru', line: 'cool daylight, sturdy build emphasis' },
  { id: 'in', label: '印度', lang: 'en', line: 'warm vibrant accents on clean neutrals, family lifestyle context' },
  { id: 'tw', label: '中国台湾', lang: 'zh', line: 'soft warm light, refined compact home styling, quiet negative space' },
  { id: 'hk', label: '中国香港', lang: 'zh', line: 'compact modern interior, crisp high-craft lighting' },
  { id: 'mo', label: '中国澳门', lang: 'zh', line: 'refined hotel-suite warm lighting, tidy composition' },
  { id: 'nz', label: '新西兰', lang: 'en', line: 'open natural light, clean outdoor lifestyle context' },
  { id: 'cl', label: '智利', lang: 'es', line: 'bright coastal light, clean home staging' },
  { id: 'arg', label: '阿根廷', lang: 'es', line: 'warm evening light, tactile rustic styling' },
  { id: 'co', label: '哥伦比亚', lang: 'es', line: 'tropical daylight, lush greens and warm clay' },
];

export const MARKET_BY_ID = Object.fromEntries(MARKETS.map((m) => [m.id, m]));

export function marketLine(id) {
  const m = MARKET_BY_ID[id];
  if (!m) return '';
  return `Market & cultural fit (${m.label}): ${m.line}.`;
}

export function defaultMarket(platformId) {
  if (['taobao', 'xianyu', 'jd'].includes(platformId)) return 'cn';
  if (['shopee', 'lazada', 'tiktok'].includes(platformId)) return 'sg';
  return 'us';
}

const CATEGORY_HINTS = [
  ['tech', /手机|耳机|键盘|相机|充电|蓝牙|数码|电脑|显示器|音箱|智能|headphone|earphone|tablet|laptop|usb/i],
  ['beauty', /口红|粉底|精华|面霜|香水|面膜|护肤|彩妆|美妆|眼影|serum|cream|lipstick/i],
  ['food', /茶|咖啡|零食|坚果|糕点|酱|油|米|面|食品|饮料|蜂蜜|coffee|tea|snack/i],
  ['home', /桌|椅|柜|床|沙发|灯|收纳|地毯|餐具|家居|木|table|chair|lamp/i],
  ['apparel', /衣|裤|裙|鞋|包|帽|袜|外套|卫衣|服饰|shirt|dress|bag|shoe/i],
  ['baby', /婴|童|宝宝|奶瓶|辅食|尿布|玩具|baby|kids/i],
  ['pet', /猫|狗|宠物|猫粮|狗粮|牵引|pet|cat|dog/i],
  ['jewel', /项链|戒指|耳环|手链|珠宝|银|金饰|玉|ring|necklace|jewelry/i],
  ['sport', /运动|健身|瑜伽|跑鞋|球|哑铃|户外|sport|fitness|yoga/i],
  ['tools', /扳手|螺丝|电钻|工具|五金|锤|钳|tool|drill|wrench/i],
  ['gift', /礼盒|礼包|伴手礼|套装礼|gift/i],
];

export function guessCategory(text = '') {
  for (const [id, re] of CATEGORY_HINTS) if (re.test(text)) return id;
  return 'other';
}

/** 5 种核心交付模式定义 */
export const DELIVERABLE_MODES = [
  { id: 'refine', label: '产品精修图', desc: '100% 锁定外观材质，修复瑕疵与商业光影，输出纯净底图' },
  { id: 'display', label: '产品展示图', desc: '置入契合品类调性的高级商业布景，突出材质与空间氛围' },
  { id: 'main', label: '电商主图', desc: '围绕单一核心卖点打造高点击主图，预留清晰文案安全区' },
  { id: 'marketing', label: '营销海报', desc: '适配平台尺寸与语言的商业海报，支持延伸手机版与线下样机' },
  { id: 'detail', label: '详情页套图', desc: '完整 6 屏详情页动线（品牌→卖点→细节→功能→场景→购买理由）' },
];

/** 多视角白名单：只自动推断正面与45°，其余角度优先向用户索要实拍图，绝不盲目脑补背面盲区 */
export const ANGLE_DEFAULT = ['front', 'deg45'];
export const ANGLE_LABEL = {
  front: '正面',
  deg45: '45°侧角',
  side_left: '左侧面',
  side_right: '右侧面',
  back: '背面',
  top: '俯视',
  bottom: '仰视',
  detail_macro: '局部细节',
};

export function anglePlan({ realAngles = [], wanted = ANGLE_DEFAULT, visible = {} } = {}) {
  const have = new Set(realAngles.map((a) => (a === 'side' ? 'side_right' : a)));
  const generate = [];
  const skip = [];
  for (const a of wanted) {
    if (have.has(a)) skip.push({ angle: a, reason: '已收到用户实拍图，直接入库复用（零生成成本）' });
    else if (visible[a] === false) skip.push({ angle: a, reason: '原图未展示该盲区结构，跳过以防主体漂移' });
    else generate.push(a);
  }
  return { generate, skip };
}

/** 精修图的两个标准裁切（主图 1:1 / 详情与展示 3:4） */
export function refinePlan(platform) {
  const w = (platform && platform.w) || 1000;
  return [
    { crop: '1:1', w, h: w },
    { crop: '3:4', w: Math.round(w * 0.75), h: w },
  ];
}

/** 8 维商业与品类定向分析（阶段一必做，纯文本输出，不生图） */
export function analyzeMock(p = {}, brief = {}) {
  const text = `${p.title || ''} ${(p.sellingPoints || []).join(' ')} ${p.rawText || ''} ${brief.selling || ''}`;
  const cat = CATEGORY_BY_ID[guessCategory(text)] || CATEGORY_BY_ID.other;
  const rawSelling = p.sellingPoints && p.sellingPoints.length
    ? p.sellingPoints
    : String(brief.selling || p.rawText || '')
        .split(/[。；;，,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2 && s.length <= 24);
  const selling = rawSelling.slice(0, 3);
  const marketObj = MARKET_BY_ID[p.market || brief.market] || { label: '目标跨境/电商' };

  return {
    category: cat.id,
    categoryName: cat.name,
    positioning: `面向${marketObj.label}市场的${cat.name}单品，围绕「${selling[0] || cat.words[0]}」建立高质感心智定位`,
    target_user: `注重工业质感、设计审美与真实使用体验的${marketObj.label}主流消费人群`,
    selling_points: selling.length ? selling : cat.words.map((w) => `${w}工艺表达`),
    differences: [
      `外观与结构呈现高度一致的${cat.words[0]}辨识度`,
      `光线折射下清晰可见的${cat.words[1]}材质细节`,
      `贴合日常高频使用痛点的${cat.words[2]}场景表现`,
    ],
    brand_keywords: [...cat.words, '克制高级', '真实质感'],
    visual_style: `${cat.name}商业广告级视觉 · ${cat.light.split('，')[0]} · 呼吸感留白排版`,
    palette: cat.palette,
    design_direction: `${cat.light}；${cat.scene}；产品主体严格锁定原图外观占画面 55–70%，四边预留 ≥8% 文案安全区`,
    assumptions: [
      selling.length ? '' : '核心卖点暂按品类视觉特征提炼，可在下方卡片微调',
      brief.angles?.length ? '' : '当前仅收到单角度参考图，背面/未见盲区将严格锁定不强行脑补',
    ].filter(Boolean),
  };
}

/** 由分析推导【纯文本主视觉规范（Key Visual Spec）】（不生图，作为全套物料统一标尺） */
export function buildSpec(analysis, version = 1) {
  const cat = CATEGORY_BY_ID[analysis.category] || CATEGORY_BY_ID.other;
  return {
    version,
    category: analysis.category,
    composition: '产品居中偏下占据画面 55–70% 视觉绝对焦点，上方及侧边预留 ≥20% 干净负空间安全区',
    lighting: cat.light,
    palette: {
      base: analysis.palette[0],
      accent: analysis.palette[1],
      support: analysis.palette[2],
      ink: '#1A1917',
    },
    scene: cat.scene,
    typography: '非对称杂志级克制排版：主标题简洁有力、核心卖点 ≤3 条、单一左对齐轴线、严禁廉价促销贴纸',
    mood: analysis.brand_keywords,
    do: [
      '100% 保持产品工业造型、颜色、比例、Logo 位置与参考图完全一致',
      '同产品周期内所有主图、海报、详情页共用本主视觉光位与色板',
      '预留充足负空间，画面克制高级',
    ],
    dont: [
      '严禁篡改产品物种、比例或增减额外零件',
      '严禁强行脑补参考图中看不见的背面或底部盲区',
      '严禁生成乱码伪文字或杂乱牛皮癣贴纸',
    ],
  };
}

/** 绝对主体锁定前缀（注入所有生图提示词，彻底杜绝"传耳机生成玻璃杯"） */
const SUBJECT_LOCK_EN =
  'STRICT SUBJECT IDENTITY LOCK: Preserve the exact product from the reference image — identical industrial design, silhouette, proportions, materials, textures, colours, and structural details. Do NOT change the object category, do NOT replace the product with another item, and do NOT invent unseen back/hidden parts.';

const SUBJECT_LOCK_ZH =
  '【绝对主体锁定】严格保持参考图中的产品本体完全一致：工业造型、轮廓比例、颜色、材质纹理、细节结构 100% 还原，严禁替换成其他物品或擅自篡改外观。';

/** 分步提示词：严格隔离 5 种交付模式 + 基础素材生成 */
export function promptFor(step, ctx = {}) {
  if (ctx.lang === 'en') return promptForEn(step, ctx);
  const a = ctx.analysis || {};
  const s = ctx.spec || {};
  const pf = ctx.platform || {};
  const base = `产品名称：${ctx.title || '目标商品'}。${SUBJECT_LOCK_ZH}`;
  const modelLine = ctx.needModel
    ? `加入自然真实的模特穿戴/使用交互（模特气质贴合 ${a.target_user || '目标客群'}，非网红脸，主体产品仍占视觉焦点）。`
    : '纯产品商业静物拍摄，不出现无关人物。';

  switch (step) {
    case 'analyze':
      return [
        '你是「渡口」资深商业视觉与电商设计总监。请基于商品信息完成 8 维商业分析并输出 JSON（不要输出任何额外解释）：',
        '{"category":"tech|beauty|food|home|apparel|baby|pet|jewel|sport|tools|gift|other",',
        '"positioning":"1.产品定位",',
        '"target_user":"2.目标用户画像",',
        '"selling_points":["3.核心卖点1","卖点2","卖点3"],',
        '"differences":["4.可视化竞争优势1","优势2","优势3"],',
        '"brand_keywords":["5.品牌关键词1","词2","词3"],',
        '"visual_style":"6.适合的视觉风格（秉持克制留白与高级材质质感）",',
        '"palette":["#主色","#辅色","#点缀色"],',
        '"design_direction":"8.整体设计方向（光影/构图/材质/情绪）",',
        '"assumptions":["推断说明"]}',
        `商品信息：标题「${ctx.title || ''}」，平台「${pf.name || ''}」，目标语言「${ctx.targetLang || 'en'}」，补充描述「${ctx.rawText || ''}」。`,
      ].join('\n');

    case 'refine':
      return `${base}将参考图精修为品牌级商业产品白底/浅灰底图：仅修复表面划痕瑕疵、强化材质高级质感、整理主光高光与自然接地阴影、提升边缘锐度，去除背景杂物；纯净无影背景（#F7F7F5），无任何道具与文字。输出 ${ctx.w || 1000}×${ctx.h || 1000}。`;

    case 'angle':
      return `${base}基于参考精修图生成产品的「${ANGLE_LABEL[ctx.angle] || ctx.angle}」标准视角图：纯色背景与精修图一致，统一主光方向与色温，产品比例与结构完全吻合；参考图中看不到的背面盲区不要编造。`;

    case 'display':
      return `${base}【模式：产品展示图】遵循主视觉规范 v${s.version || 1}（光影：${s.lighting || ''}；场景：${s.scene || ''}；主色调：${s.palette?.base || ''}）。将产品自然置入契合其品类调性的高级商业布景中，突出材质肌理与空间氛围感，${modelLine} 画面克制留白，无任何促销贴纸或文字。输出 ${ctx.w}×${ctx.h}。`;

    case 'main':
      return `${base}【模式：电商高点击主图】适配 ${pf.name || '电商平台'}（${ctx.w}×${ctx.h}），遵循主视觉规范 v${s.version || 1}（${s.lighting || ''}；${s.composition || ''}）。产品主体占画面 55–70%，围绕单一最强核心卖点构建商业视觉焦点，顶部或侧边留出充足文案安全区，画面干净无乱码文字。`;

    case 'poster':
      return `${base}【模式：商业营销海报】适配 ${pf.name || ''}（${ctx.ratio || '竖版'} ${ctx.w}×${ctx.h}），遵循主视觉规范 v${s.version || 1}（主色 ${s.palette?.base || ''}，场景 ${s.scene || ''}）。杂志级克制网格构图，顶部与底部预留清晰标题与卖点安全区，${modelLine} 商业广告大片质感，无乱码文字。`;

    case 'mockup':
      return `${base}【模式：品牌线下与数字样机展示】保持产品视觉风格与主视觉规范 v${s.version || 1} 完全一致，生成该产品在真实商业空间（高级零售橱窗、品牌展架、户外灯箱海报或移动端旗舰店界面）中的落地展示效果，突出商业高级感。`;

    case 'detail':
      return `${base}【模式：电商详情页第 ${ctx.seg} 屏 · ${ctx.segTitle}】（${ctx.w}×${ctx.h}），遵循主视觉规范 v${s.version || 1}（${s.lighting || ''}）。竖版详情页构图，预留充足文案排版留白；本屏聚焦「${ctx.segFocus || ctx.segTitle}」，${modelLine} 与整套详情页保持光影色调连续一致，无乱码文字。`;

    default:
      return `${base}输出商业产品摄影图，光影干净，构图克制。`;
  }
}

/** 英文版分步提示词（供 Flux / Seedream 等生图模型使用） */
function promptForEn(step, ctx = {}) {
  const s = ctx.spec || {};
  const pf = ctx.platform || {};
  const catId = s.category || (ctx.analysis && ctx.analysis.category) || 'other';
  const cat = CATEGORY_EN[catId] || CATEGORY_EN.other;
  const look = specEn(s).join('; ') || `${cat.light}; ${cat.words.join(' / ')}`;
  const subject = ctx.title || 'the product';
  const modelClause = ctx.needModel
    ? 'Include a natural, relatable lifestyle model interacting with or wearing the product while keeping the product as the unmistakable focal point.'
    : 'Pure commercial product photography with no people.';

  switch (step) {
    case 'refine':
      return `${SUBJECT_LOCK_EN} Retouch this product photo of "${subject}" into a flagship commercial e-commerce studio shot: clean up surface blemishes, enhance authentic material textures, refine key highlights and soft grounded contact shadows, crisp edges, seamless pure off-white background (#F7F7F5), zero props, zero text or watermarks. Output ${ctx.w || 1000}x${ctx.h || 1000}.`;

    case 'angle':
      return `${SUBJECT_LOCK_EN} Render the "${ANGLE_LABEL[ctx.angle] || ctx.angle}" view of "${subject}" matching the refined reference photo: identical seamless solid background, same key-light direction and colour temperature, exact same scale and horizon line. Do not fabricate unseen back/hidden details.`;

    case 'display':
      return `${SUBJECT_LOCK_EN} [PRODUCT SHOWCASE] Place "${subject}" into a curated commercial studio/lifestyle environment: ${cat.scene}; ${look}. ${modelClause} Emphasise tactile material craft and atmospheric depth, generous negative space, no promotional badges, no text or gibberish letters. Output ${ctx.w}x${ctx.h}.`;

    case 'main':
      return `${SUBJECT_LOCK_EN} [E-COMMERCE MAIN HERO IMAGE] High-CTR marketplace hero image of "${subject}" for ${pf.name || 'e-commerce'}, ${ctx.w}x${ctx.h}. ${look}. Product occupies 55-70% of the frame with a single bold visual focal point and clean negative space reserved in the upper/side margin for listing copy. Absolutely no text, no watermarks, no pseudo-letters.`;

    case 'poster':
      return `${SUBJECT_LOCK_EN} [COMMERCIAL MARKETING POSTER] Editorial commercial campaign poster of "${subject}", ${ctx.ratio || 'vertical'} ${ctx.w}x${ctx.h}. ${look}. ${modelClause} Clean layout grid with generous negative space at top and bottom for headline typography, zero gibberish lettering.`;

    case 'mockup':
      return `${SUBJECT_LOCK_EN} [BRAND SHOWCASE MOCKUP] Commercial brand presentation mockup featuring "${subject}" in a high-end retail storefront display, exhibition stand, outdoor lightbox billboard, and mobile flagship screen, maintaining identical visual palette and lighting (${look}).`;

    case 'detail':
      return `${SUBJECT_LOCK_EN} [E-COMMERCE DETAIL PAGE PANEL ${ctx.seg}: ${ctx.segTitle}] Vertical detail-page visual (${ctx.w}x${ctx.h}) for "${subject}". ${look}. Specific visual direction for this panel: ${ctx.segFocus || ctx.segTitle}. ${modelClause} Leave clean negative space for Chinese/English typography layout, visually continuous with the rest of the 6-panel suite, zero baked-in gibberish text.`;

    default:
      return `${SUBJECT_LOCK_EN} Commercial studio shot of "${subject}". ${look}.`;
  }
}

/** 素材台账：列出某商品可复用的持久化基底素材 */
export function baseAssets(db, productId) {
  const list = (db.assets || []).filter((x) => x.productId === productId && !x.deletedAt);
  return {
    refined: list.filter((x) => x.kind === 'refined'),
    angles: list.filter((x) => x.kind === 'angle' || x.kind === 'angle_real'),
    uploads: list.filter((x) => x.kind === 'upload'),
    spec: (db.products || []).find((p) => p.id === productId)?.visualSpec || null,
  };
}

/** 详情页 6 屏完整结构（严格对应：1.品牌认知 → 2.核心卖点 → 3.产品细节 → 4.功能展示 → 5.使用场景 → 6.购买理由） */
export const DETAIL_SEGMENTS = [
  {
    id: 'brand',
    title: '品牌认知',
    ask: '主视觉定调：产品完整正面/45°黄金视角，高级光影与品牌秩序感，顶部留出大标题空间',
    focus: 'Hero brand statement shot: full product silhouette at golden 45-degree angle with flagship commercial lighting and generous top negative space for brand headline',
    head: (p) => `${p.title}｜高定质感，一眼入心`,
  },
  {
    id: 'selling',
    title: '核心卖点',
    ask: '核心差异化卖点视觉化呈现，突出材质质感与核心优势焦点',
    focus: 'Visualizing the primary selling point with dramatic directional lighting that highlights core material superiority and craftsmanship',
    head: (p) => `${(p.sellingPoints || [])[0] || '旗舰级精工设计'}，一眼看得见的差距`,
  },
  {
    id: 'detail',
    title: '产品细节',
    ask: '基于原图真实材质与工艺的局部微距放大展示（纹理/接缝/质感特写）',
    focus: 'Macro close-up detail shot magnifying the authentic surface texture, precision edges, joints, and tactile finish from the reference product',
    head: () => '局部放大经得起挑剔，每一处都是真材实料',
  },
  {
    id: 'feature',
    title: '功能展示',
    ask: '核心功能原理与结构设计感视觉拆解，清晰传达硬核使用价值',
    focus: 'Structural and functional showcase illustrating ergonomic design, mechanical/functional precision, and practical performance clarity',
    head: () => '硬核结构与功能逻辑，专为高频使用打磨',
  },
  {
    id: 'scene',
    title: '使用场景',
    ask: '目标客群在真实高频生活/工作场景中的沉浸式使用体验',
    focus: 'Immersive real-world usage scenario tailored to the target audience lifestyle, warm natural atmosphere, effortless daily integration',
    head: () => '融入你的日常高光时刻，比想象中更顺手',
  },
  {
    id: 'reason',
    title: '购买理由',
    ask: '整套视觉收束画面：产品全貌与品质背书构图，预留核心参数清单与购买理由区',
    focus: 'Clean trust-building closing composition with balanced product framing and structured negative space for key specs and reasons to buy',
    head: () => '严选品质背书，现在就是入手的最佳时机',
  },
];

/** 详情页计划：6 段各自尺寸、提示词、文案 */
export function detailPlan(product, { platform = {}, anchors = [], lang = 'en', promptLang = 'en', needModel = false } = {}) {
  const w = Math.round(platform.w || 800);
  const h = Math.round(w * 1.4);
  const nums = anchors.map((a) => a.after).filter(Boolean);
  return DETAIL_SEGMENTS.map((seg, i) => {
    const anchor = nums.length ? nums[i % nums.length] : '';
    const sp = (product.sellingPoints || [])[i % Math.max(1, (product.sellingPoints || []).length)];
    const copy = [
      seg.head(product),
      anchor ? `· ${anchor}` : '',
      sp ? `· ${sp}` : '',
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
        segFocus: seg.focus,
        spec: product.visualSpec || {},
        analysis: product.analysis || {},
        platform,
        w,
        h,
        lang: promptLang,
        needModel: seg.id === 'scene' ? needModel : false,
      }),
    };
  });
}

/** 默认建议询问模特的类目 */
export const MODEL_CATEGORIES = new Set(['apparel', 'beauty', 'home', 'sport', 'jewel']);
