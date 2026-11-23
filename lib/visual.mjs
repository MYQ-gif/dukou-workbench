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

/** 详情页六段结构。 */
export const DETAIL_SEGMENTS = [
  { id: 'brand', title: '品牌认知' },
  { id: 'selling', title: '核心卖点' },
  { id: 'detail', title: '产品细节' },
  { id: 'feature', title: '功能展示' },
  { id: 'scene', title: '使用场景' },
  { id: 'reason', title: '购买理由' },
];

/** 需要模特的类目。 */
export const MODEL_CATEGORIES = new Set(['apparel', 'beauty', 'home', 'sport']);
