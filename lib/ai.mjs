// AI 链路（马负责）——出图 / 出文案 / 视频字幕翻译 / 视觉导演两阶段备料
import fs from 'node:fs';
import path from 'node:path';
import { newId, nowISO } from './jobs.mjs';
import * as providers from './providers.mjs';
import * as visual from './visual.mjs';
import * as geo from './geo.mjs';
import * as inquiry from './inquiry.mjs';
import * as seedance from './seedance.mjs';
import * as compose from './compose.mjs';

const MOCK = providers.isMock();
const MOCK_CAPS = String(process.env.MOCK_CAPS || '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

export function mode() {
  return MOCK ? 'mock' : 'live';
}

export function providerStatus() {
  return providers.status();
}

const CAP_OF = {
  image: 'IMAGE',
  copy: 'TEXT',
  video: 'ASR',
  clip: 'VIDEO',
  visual: 'IMAGE',
  analyze: 'TEXT',
  geo: 'TEXT',
  inquiry: 'TEXT',
  detail: 'IMAGE',
};

export async function run(job, db, ctx) {
  const cap = CAP_OF[job.type];
  if (!cap) throw new Error(`unknown job type: ${job.type}`);

  // 阶段一纯文本分析（specOnly）只走 TEXT 能力，不消耗出图额度
  const isSpecOnly = job.type === 'analyze' || (job.type === 'visual' && job.params?.specOnly);
  const effectiveCap = isSpecOnly ? 'TEXT' : cap;
  const mocked = MOCK || MOCK_CAPS.includes(effectiveCap);

  // 真实进度上报：链路不传就是 no-op，老调用方零影响
  const report = typeof ctx?.onProgress === 'function' ? ctx.onProgress : () => {};
  report(5, mocked ? '准备假数据' : `调用 ${effectiveCap} 模型`);

  if (mocked) {
    if (isSpecOnly) return mockAnalyze(job, db);
    if (job.type === 'image') return mockImage(job, db, ctx);
    if (job.type === 'copy') return mockCopy(job, db, ctx);
    if (job.type === 'clip') return mockClip(job, db, ctx);
    if (job.type === 'visual') return mockVisual(job, db, ctx);
    if (job.type === 'geo') return mockGeo(job, db, ctx);
    if (job.type === 'inquiry') return mockInquiry(job, db, ctx);
    if (job.type === 'detail') return mockDetail(job, db, ctx);
    return mockVideo(job, db);
  }
  if (!providers.has(effectiveCap)) {
    const c = providers.capability(effectiveCap);
    const missing = [c.baseUrl ? '' : `${effectiveCap}_BASE_URL`, c.key ? '' : `${effectiveCap}_API_KEY`, c.model ? '' : `${effectiveCap}_MODEL`].filter(Boolean);
    throw new Error(`没配 ${missing.join(' / ')}。要么在 .env 里补上，要么把 AI_MOCK 设回 1 用假数据。`);
  }
  if (isSpecOnly) return liveAnalyze(job, db);
  if (job.type === 'image') return liveImage(job, db, ctx);
  if (job.type === 'copy') return liveCopy(job, db, ctx);
  if (job.type === 'clip') return liveClip(job, db, ctx);
  if (job.type === 'visual') return liveVisual(job, db, ctx);
  if (job.type === 'geo') return liveGeo(job, db, ctx);
  if (job.type === 'inquiry') return liveInquiry(job, db, ctx);
  if (job.type === 'detail') return liveDetail(job, db, ctx);
  return liveVideo(job, db, ctx);
}

export const PLATFORMS = [
  { id: 'taobao', name: '淘宝', region: 'domestic', w: 800, h: 800, color: '#ff5000', short: '淘' },
  { id: 'xianyu', name: '闲鱼', region: 'domestic', w: 800, h: 800, color: '#f5c518', short: '闲' },
  { id: 'jd', name: '京东', region: 'domestic', w: 800, h: 800, color: '#e1251b', short: '京' },
  { id: 'amazon', name: 'Amazon', region: 'overseas', w: 2000, h: 2000, color: '#ff9900', short: 'A' },
  { id: 'ebay', name: 'eBay', region: 'overseas', w: 1600, h: 1600, color: '#0064d2', short: 'e' },
  { id: 'shopee', name: 'Shopee', region: 'overseas', w: 1242, h: 1660, color: '#ee4d2d', short: 'S' },
  { id: 'lazada', name: 'Lazada', region: 'overseas', w: 1000, h: 1000, color: '#0f146d', short: 'L' },
  { id: 'tiktok', name: 'TikTok Shop', region: 'overseas', w: 1080, h: 1920, color: '#111111', short: 'T' },
];

export function platform(id) {
  return PLATFORMS.find((p) => p.id === id) || PLATFORMS.find((p) => p.id === 'shopee');
}

/* ---------------- 工具 ---------------- */

function product(db, id) {
  return db.products.find((p) => p.id === id) || null;
}

function addAsset(db, ctx, { productId, kind, url, width, height, meta }) {
  const asset = {
    id: newId('a'),
    productId,
    kind,
    url,
    width: width || 0,
    height: height || 0,
    meta: meta || {},
    createdAt: nowISO(),
  };
  db.assets.push(asset);
  const p = product(db, productId);
  if (p) {
    p.assets = p.assets || [];
    p.assets.push(asset.id);
    p.updatedAt = nowISO();
  }
  return asset;
}

/**
 * 核心防漂移守卫：按优先级提取当前商品可用的参考图 dataURI
 * 优先级默认：精修底图(refined) > 用户多角度实拍(angle_real) > 一致性视角(angle) > 初始上传原图(upload)
 */
function pickReferenceUri(db, productId, uploadsDir, priority = ['refined', 'angle_real', 'angle', 'upload']) {
  const all = (db.assets || []).filter((a) => a.productId === productId && !a.deletedAt && a.url);
  for (const kind of priority) {
    const hit = all
      .filter((a) => a.kind === kind)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    if (hit) {
      const uri = dataUriFor(hit.url, uploadsDir);
      if (uri) return { uri, asset: hit };
    }
  }
  return { uri: null, asset: null };
}

const LANG_LABEL = { en: 'EN', th: 'TH', vi: 'VI', ar: 'AR', fr: 'FR', zh: 'ZH' };

function makePlaceholderSVG({ title, sub, lang, badge, platformId, w = 1242, h = 1660 }) {
  const pf = platform(platformId);
  const pad = Math.round(w * 0.09);
  const imgW = w - pad * 2;
  const imgH = Math.round(imgW * 0.72);
  const imgY = Math.round(h * 0.22);
  const t = escapeXml(truncate(title || 'Handcrafted Goods', 24));
  const s = escapeXml(truncate(sub || 'Handmade with care', 40));
  const b = escapeXml(badge || 'MAIN IMAGE');
  const titleSize = Math.round(w * 0.05);
  const subSize = Math.round(w * 0.024);
  const badgeSize = Math.round(w * 0.042);
  const metaSize = Math.round(w * 0.021);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3ece1"/>
      <stop offset="1" stop-color="#d9c6a8"/>
    </linearGradient>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a87548"/>
      <stop offset="1" stop-color="#6f4526"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect x="${pad}" y="${imgY}" width="${imgW}" height="${imgH}" rx="18" fill="url(#wood)" opacity="0.92"/>
  <rect x="${pad}" y="${imgY}" width="${imgW}" height="${Math.round(imgH * 0.08)}" rx="18" fill="#000" opacity="0.12"/>
  <text x="${w / 2}" y="${Math.round(h * 0.13)}" font-family="Georgia, serif" font-size="${titleSize}" fill="#3a2a1a" text-anchor="middle">${t}</text>
  <text x="${w / 2}" y="${Math.round(h * 0.17)}" font-family="Helvetica, Arial" font-size="${subSize}" fill="#6b5947" text-anchor="middle">${s}</text>
  <text x="${w / 2}" y="${Math.round(h * 0.8)}" font-family="Georgia, serif" font-size="${badgeSize}" fill="#3a2a1a" text-anchor="middle">${b}</text>
  <text x="${w / 2}" y="${Math.round(h * 0.845)}" font-family="Helvetica, Arial" font-size="${metaSize}" fill="#7a6852" text-anchor="middle">${LANG_LABEL[lang] || 'EN'} · ${escapeXml(pf.name)} · ${escapeXml(new Date().toISOString().slice(0, 10))}</text>
</svg>`;
}

function escapeXml(v) {
  return String(v).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function truncate(v, n) {
  const s = String(v || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/* ---------------- 阶段一：纯文本商业分析 + 主视觉定调（不生图） ---------------- */

function mockAnalyze(job, db) {
  const p = product(db, job.productId) || { title: '新商品' };
  const brief = job.params?.brief || p.brief || {};
  const analysis = visual.analyzeMock(p, brief);
  const spec = visual.buildSpec(analysis, (p.visualSpec?.version || 0) + 1);
  p.analysis = analysis;
  p.visualSpec = spec;
  p.category = analysis.category;
  p.updatedAt = nowISO();
  return { analysis, spec, specOnly: true };
}

async function liveAnalyze(job, db) {
  const p = product(db, job.productId) || { title: '新商品' };
  const brief = job.params?.brief || p.brief || {};
  const pf = platform(job.params?.platform || p.platform);
  const baseAnalysis = visual.analyzeMock(p, brief);
  let analysis = baseAnalysis;

  try {
    const cap = providers.capability('TEXT');
    const prompt = visual.promptFor('analyze', {
      title: p.title,
      platform: pf,
      targetLang: job.params?.lang || 'en',
      rawText: [p.rawText, brief.selling].filter(Boolean).join('；'),
    });
    const { data } = await providers.postJSON('TEXT', '/chat/completions', {
      model: cap.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
    const text = data?.choices?.[0]?.message?.content || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]);
      analysis = {
        ...baseAnalysis,
        ...parsed,
        palette: Array.isArray(parsed.palette) && parsed.palette.length >= 3 ? parsed.palette : baseAnalysis.palette,
        selling_points: Array.isArray(parsed.selling_points) && parsed.selling_points.length ? parsed.selling_points : baseAnalysis.selling_points,
      };
    }
  } catch {
    /* 文本分析失败时平滑回退到规则引擎版 */
  }

  const spec = visual.buildSpec(analysis, (p.visualSpec?.version || 0) + 1);
  p.analysis = analysis;
  p.visualSpec = spec;
  p.category = analysis.category;
  p.updatedAt = nowISO();
  return { analysis, spec, specOnly: true };
}

/* ---------------- mock 实现 ---------------- */

const QUALITY_SCALE = { '1k': 1, '2k': 1.5, '4k': 2 };

function imagePlan(job) {
  const params = job.params || {};
  const template = params.template || 'main';
  const pf = platform(params.platform);
  const defaultCnt = template === 'detail' ? 6 : template === 'refine' || template === 'refined' ? 2 : 2;
  const count = clampInt(params.count, 1, 6, defaultCnt);
  const quality = QUALITY_SCALE[params.quality] ? params.quality : '1k';
  const scale = QUALITY_SCALE[quality];
  const baseW = clampInt(params.width, 200, 4000, template === 'display' ? Math.round(pf.w * 0.75) : pf.w);
  const baseH = clampInt(params.height, 200, 4000, template === 'display' ? pf.h : pf.h);
  const w = Math.round(baseW * scale);
  const h = Math.round(baseH * scale);
  return { params, template, pf, count, quality, scale, w, h };
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.max(min, n));
}

function mockImage(job, db, ctx) {
  const { template } = imagePlan(job);
  if (template === 'detail') return mockDetail(job, db, ctx);

  const p = product(db, job.productId) || { title: 'Handcrafted Goods', sellingPoints: [] };
  const { params, pf, count, quality, w, h } = imagePlan(job);
  const lang = params.lang || 'en';
  const assets = [];

  const latestUpload = (db.assets || [])
    .filter((a) => a.productId === job.productId && !a.deletedAt && ['upload', 'angle_real', 'refined'].includes(a.kind) && a.url)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const uploadPath = latestUpload ? path.join(ctx.uploadsDir, path.basename(latestUpload.url)) : null;
  let basePhoto = uploadPath && fs.existsSync(uploadPath) ? compose.dataUri(uploadPath) : null;
  if (!basePhoto) {
    const pool = compose.poolPhotos(path.join(process.cwd(), 'demo'));
    if (pool.length) basePhoto = compose.dataUri(pool[0]);
  }

  const bullets = (p.sellingPoints || []).filter(Boolean).slice(0, 3);
  for (let i = 0; i < count; i++) {
    let svg;
    if (basePhoto) {
      const tint = ['#fff6c9', '#e6ecff', '#ddefe3', '#fbe2cf'][i % 4];
      svg = compose.composeCard({
        photo: basePhoto,
        w,
        h,
        title: i === 0 ? p.title : bullets[i % Math.max(1, bullets.length)] || p.title,
        sub: template === 'marketing' ? 'DUKOU · CAMPAIGN' : template === 'display' ? 'DUKOU · SHOWCASE' : 'DUKOU · HERO',
        bullets,
        badge: `${template.toUpperCase()} ${i + 1}`,
        index: i + 1,
        tint,
      });
    } else {
      svg = makePlaceholderSVG({
        title: p.title,
        sub: (p.sellingPoints || [])[i % Math.max(1, (p.sellingPoints || []).length)] || 'Handmade with care',
        lang,
        badge: `${template.toUpperCase()} ${i + 1}`,
        platformId: pf.id,
        w,
        h,
      });
    }
    const asset = addAsset(db, ctx, {
      productId: job.productId,
      kind: template,
      url: null,
      width: w,
      height: h,
      meta: {
        model: basePhoto ? 'mock-compose-v1' : 'mock-image-v1',
        template,
        lang,
        platform: pf.id,
        count,
        quality,
        baseW: pf.w,
        baseH: pf.h,
        fromUpload: Boolean(basePhoto),
      },
    });
    const filename = `${asset.id}.svg`;
    fs.writeFileSync(path.join(ctx.uploadsDir, filename), svg, 'utf8');
    asset.url = `/files/${filename}`;
    assets.push(asset.id);
  }
  return { assets };
}

function saveCopy(db, ctx, { productId, lang, platformId, copy, model }) {
  if (!productId) return null;
  return addAsset(db, ctx, {
    kind: 'copy',
    url: null,
    width: 0,
    height: 0,
    productId,
    meta: { model, lang, platform: platformId || null, ...copy },
  });
}

function mockCopy(job, db, ctx) {
  const p = product(db, job.productId) || { title: 'Handcrafted Goods', sellingPoints: [] };
  const lang = (job.params && job.params.lang) || 'en';
  const pf = platform(job.params && job.params.platform);
  const points = (p.sellingPoints || []).length ? p.sellingPoints : ['Handmade', 'Solid wood', 'One of a kind'];
  const title = lang === 'en' ? `${p.title} — Handmade, One of a Kind` : p.title;
  const copy = {
    lang,
    title,
    bullets: points.map((x) => `· ${x}`),
    detail:
      lang === 'en'
        ? `Made by hand, one piece at a time. ${points.join(', ')}. Each item carries marks of its own history — no two are alike.`
        : `${points.join('，')}。手工制作，每一件都有它自己的痕迹。`,
    model: 'mock-copy-v1',
  };
  const asset = saveCopy(db, ctx, { productId: job.productId, lang, platformId: pf.id, copy, model: copy.model });
  return { ...copy, assetId: asset ? asset.id : null };
}

function mockVideo(job) {
  const lang = (job.params && job.params.targetLang) || 'en';
  return {
    lang,
    videoUrl: null,
    note: 'mock：视频翻译链路尚未接入，返回字幕样例',
    subtitles: [
      { start: 0.0, end: 2.4, text: lang === 'en' ? 'This table was made by hand.' : '这张桌子是手工做的。' },
      { start: 2.4, end: 5.1, text: lang === 'en' ? 'Solid wood, no chemical finish.' : '实木，没有化学涂层。' },
      { start: 5.1, end: 8.0, text: lang === 'en' ? 'One piece only.' : '只有一件。' },
    ],
  };
}

/* ---------------- live 实现（AI_MOCK=0 且对应能力配好 key 才走这里） ---------------- */

function sniffExt(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return 'png';
}

const EN_IMAGE_HOSTS = /siliconflow|flux|stability|replicate|fal\.|openai|together|deepinfra|novita|bfl/i;

export function imagePromptLang() {
  const forced = String(process.env.IMAGE_PROMPT_LANG || '').toLowerCase();
  if (forced === 'en' || forced === 'zh') return forced;
  const base = String(providers.capability('IMAGE').baseUrl || '').toLowerCase();
  if (!base) return 'zh';
  return EN_IMAGE_HOSTS.test(base) ? 'en' : 'zh';
}

export function imagePrompt(p, { template, lang, w, h, pf, ask, promptLang, needModel }) {
  const pLang = promptLang || imagePromptLang();
  // 优先走 visual.mjs 的结构化导演提示词（包含绝对主体锁定 + 主视觉 spec + 5模式隔离）
  const stepMap = {
    refined: 'refine',
    refine: 'refine',
    display: 'display',
    main: 'main',
    marketing: 'poster',
    mockup: 'mockup',
    detail: 'detail',
  };
  const step = stepMap[template] || 'main';
  const basePrompt = visual.promptFor(step, {
    title: p.title || 'target product',
    spec: p.visualSpec || {},
    analysis: p.analysis || {},
    platform: pf,
    w,
    h,
    lang: pLang,
    needModel: Boolean(needModel),
    ratio: w === h ? '1:1 方形' : w > h ? '16:9 横版' : '9:16 竖版',
  });

  const points = (p.sellingPoints || []).slice(0, 3).join(', ');
  const marketLine = visual.marketLine(p.market || '');
  const extra = [
    marketLine,
    points ? `Core selling points to reflect visually: ${points}.` : '',
    ask ? `Additional user brief: ${truncate(ask, 160)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `${basePrompt} ${extra}`.trim();
}

async function liveCopy(job, db, ctx) {
  const p = product(db, job.productId) || {};
  const lang = (job.params && job.params.lang) || 'en';
  const pf = platform(job.params && job.params.platform);
  const cap = providers.capability('TEXT');

  const prompt = [
    `你是跨境电商运营，为 ${lang} 市场写一条 listing。`,
    `商品：${p.title || ''}`,
    `已知卖点：${(p.sellingPoints || []).join('、') || '（未填，可自行从描述提炼）'}`,
    p.rawText ? `原始描述：${p.rawText}` : '',
    '要求：标题不超过 80 字符；bullets 3–5 条，每条 40 字符内；detail 一段 60–90 词。',
    '只返回 JSON：{"title":"","bullets":[""],"detail":""}，不要任何解释。',
  ]
    .filter(Boolean)
    .join('\n');

  const body = {
    model: cap.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  };

  let { data } = await providers.postJSON('TEXT', '/chat/completions', body);
  let text = data?.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('文案模型返回空内容');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('文案模型没按 JSON 返回');
    parsed = JSON.parse(m[0]);
  }

  const copy = {
    lang,
    title: String(parsed.title || p.title || '').slice(0, 200),
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map(String).slice(0, 6) : [],
    detail: String(parsed.detail || ''),
    model: cap.model,
  };
  const asset = saveCopy(db, ctx, { productId: job.productId, lang, platformId: pf.id, copy, model: copy.model });
  return { ...copy, assetId: asset ? asset.id : null };
}

async function generateOneImage(p, { template, lang, pf, w, h, index, promptOverride, reference, ask, ctx, needModel }) {
  // 硬拦截：除了纯无图调试，禁止在没有参考图的情况下盲目出商品图（防止"传耳机出玻璃杯"）
  if (!reference) {
    throw new Error('[渡口防漂移守卫] 缺少有效的产品参考图，已拦截生成以防主体漂移，请先上传产品实拍图。');
  }

  const cap = providers.capability('IMAGE');
  const prompt = promptOverride || imagePrompt(p, { template, lang, w, h, pf, ask, needModel });
  const siliconflow = /siliconflow/i.test(cap.baseUrl);
  const ark = /volces|ark\.cn-beijing/i.test(cap.baseUrl);
  if (ark && w * h > 4_624_220) {
    const k = Math.sqrt(4_624_220 / (w * h));
    w = Math.max(200, Math.floor((w * k) / 8) * 8);
    h = Math.max(200, Math.floor((h * k) / 8) * 8);
  }

  const body = siliconflow
    ? {
        model: cap.model,
        prompt,
        negative_prompt: 'different product, wrong object, glass cup, warped product, extra parts, floating objects, text, watermark, logo, oversaturated',
        image_size: `${w}x${h}`,
        batch_size: 1,
        num_inference_steps: 28,
        guidance_scale: 7.5,
        image: reference,
      }
    : ark
    ? {
        model: cap.model,
        prompt,
        size: `${w}x${h}`,
        response_format: 'b64_json',
        watermark: false,
        image: reference,
      }
    : {
        model: cap.model,
        prompt,
        size: `${w}x${h}`,
        n: 1,
        image: reference,
      };

  const { data } = await providers.postJSON('IMAGE', '/images/generations', body, { timeout: 180_000 });

  const first = data?.images?.[0] || data?.data?.[0] || null;
  if (!first) throw new Error('出图接口没有返回图片');
  const buf = first.b64_json ? Buffer.from(first.b64_json, 'base64') : await providers.download(first.url);

  const id = newId('a');
  const ext = sniffExt(buf);
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(ctx.uploadsDir, filename), buf);
  return {
    id,
    filename,
    meta: { model: cap.model, template, lang, platform: pf.id, w, h, quality: null, index },
  };
}

async function liveImage(job, db, ctx) {
  const { template } = imagePlan(job);
  // 严格路由：如果请求的是 detail，直接分发给 6 段详情页管线，绝不走普通单图通道
  if (template === 'detail') return liveDetail(job, db, ctx);

  const p = product(db, job.productId) || {};
  const { params, pf, count, quality, w, h } = imagePlan(job);
  const lang = params.lang || 'en';
  const needModel = Boolean(params.needModel || p.brief?.model === 'yes');
  const assets = [];
  const errors = [];

  // 严格复用锁定的基底素材库：精修图(refined) > 多视角实拍(angle_real) > 生成视角(angle) > 初始原图(upload)
  const { uri: reference, asset: refAsset } = pickReferenceUri(db, job.productId, ctx.uploadsDir);
  if (!reference) {
    throw new Error('当前商品还没有参考图，请先上传产品实拍图后再生成。');
  }

  const CONCURRENCY = 3;
  const jobsQueue = Array.from({ length: count }, (_, i) => i);
  const report = typeof ctx?.onProgress === 'function' ? ctx.onProgress : () => {};
  let finished = 0;
  report(12, `参考图已锁定，开始出图（共 ${count} 张）`);
  const worker = async () => {
    while (jobsQueue.length) {
      const i = jobsQueue.shift();
      try {
        const one = await generateOneImage(p, {
          template,
          lang,
          pf,
          w,
          h,
          index: i,
          reference,
          ask: params.prompt,
          ctx,
          needModel,
        });
        const asset = addAsset(db, ctx, {
          productId: job.productId,
          kind: template,
          url: `/files/${one.filename}`,
          width: w,
          height: h,
          meta: {
            ...one.meta,
            count,
            quality,
            usedRefined: refAsset?.kind === 'refined',
            refAssetId: refAsset?.id || null,
            specVersion: p.visualSpec?.version || 1,
          },
        });
        assets.push(asset.id);
      } catch (err) {
        errors.push(err.message);
      } finally {
        finished += 1;
        // 真实进度：12% 起步，出图阶段占到 95%
        report(12 + Math.round((finished / Math.max(1, count)) * 83), `已完成 ${finished}/${count} 张`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, count || 1) }, worker));
  if (assets.length === 0 && errors.length) throw new Error(errors[0]);
  return { assets, errors, usedRefined: refAsset?.kind === 'refined' };
}

/* ---------------- 字幕翻译 & 短视频 ---------------- */

async function translateLines(lines, targetLang) {
  if (!lines.length) return [];
  const cap = providers.capability('TEXT');
  const prompt = [
    `把下面每条字幕翻译成 ${targetLang}，保持口播语气、简短，不要合并或拆分句子。`,
    `只返回 JSON：{"lines":[""]}，条数与输入一致。`,
    JSON.stringify({ lines }),
  ].join('\n');
  const { data } = await providers.postJSON('TEXT', '/chat/completions', {
    model: cap.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });
  const text = data?.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
  const out = Array.isArray(parsed.lines) ? parsed.lines.map(String) : [];
  return lines.map((_, i) => out[i] || lines[i]);
}

function toSrt(segments) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ts = (s) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const sec = Math.floor((ms % 60_000) / 1000);
    return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms % 1000, 3)}`;
  };
  return segments
    .map((s, i) => `${i + 1}\n${ts(s.start)} --> ${ts(s.end)}\n${s.text}\n`)
    .join('\n');
}

function mimeOf(filename) {
  const ext = path.extname(filename).toLowerCase();
  return (
    {
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.m4a': 'audio/mp4',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.aac': 'audio/aac',
    }[ext] || 'application/octet-stream'
  );
}

async function liveVideo(job, db, ctx) {
  const params = job.params || {};
  const targetLang = params.targetLang || 'en';
  if (!params.fileUrl) throw new Error('没有传视频。选一个文件再点翻译字幕。');

  const name = path.basename(String(params.fileUrl));
  const file = path.join(ctx.uploadsDir, name);
  if (!fs.existsSync(file)) throw new Error('上传的视频找不到，重新选一次文件');

  const cap = providers.capability('ASR');
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append('file', new Blob([buf], { type: mimeOf(name) }), name);
  form.append('model', cap.model);
  form.append('response_format', 'verbose_json');

  const { data } = await providers.postForm('ASR', '/audio/transcriptions', form, { timeout: 300_000 });
  const rawSegments = Array.isArray(data.segments) ? data.segments : [];
  const sourceText = String(data.text || '').trim();
  if (!sourceText && !rawSegments.length) throw new Error('语音识别没返回文字，检查文件里有没有人声');

  const asrSegments = rawSegments.length
    ? rawSegments.map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() })).filter((s) => s.text)
    : [{ start: 0, end: Number(params.duration) || 0, text: sourceText }];

  const translated = await translateLines(asrSegments.map((s) => s.text), targetLang);
  const subtitles = asrSegments.map((s, i) => ({ start: s.start, end: s.end, text: translated[i] }));

  const id = newId('a');
  const filename = `${id}.srt`;
  fs.writeFileSync(path.join(ctx.uploadsDir, filename), toSrt(subtitles), 'utf8');
  const asset = addAsset(db, ctx, {
    productId: job.productId,
    kind: 'subtitle',
    url: `/files/${filename}`,
    width: 0,
    height: 0,
    meta: { lang: targetLang, segments: subtitles.length, asr: cap.model, source: name },
  });

  return {
    lang: targetLang,
    videoUrl: null,
    srtUrl: `/files/${filename}`,
    assetId: asset.id,
    subtitles,
    note: '只出字幕轨，不做口型同步与音色克隆',
  };
}

const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function dataUriFor(url, uploadsDir) {
  if (!url) return null;
  if (/^https?:\/\//.test(url) || url.startsWith('data:')) return url;
  if (!url.startsWith('/files/')) return null;
  const file = path.join(uploadsDir, path.basename(url));
  if (!fs.existsSync(file)) return null;
  const ext = path.extname(file).toLowerCase();
  const mime = MIME_BY_EXT[ext] || 'image/png';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

function latestUploadUrl(db, productId) {
  const p = product(db, productId);
  if (!p) return null;
  const uploads = (p.assets || [])
    .map((id) => db.assets.find((a) => a.id === id))
    .filter((a) => a && !a.deletedAt && ['refined', 'upload', 'angle_real'].includes(a.kind) && a.url);
  return uploads.length ? uploads[uploads.length - 1].url : null;
}

function clipPrompt(p, params) {
  const base = (p.sellingPoints || []).slice(0, 2).join('，');
  if (params.prompt) return String(params.prompt);
  return [
    `电商商品短视频：${p.title || '手作商品'}`,
    base ? `突出${base}` : '',
    '缓慢推近 + 轻微横移，暖色自然光，真实材质细节，画面干净无文字，适合竖版信息流投放',
  ]
    .filter(Boolean)
    .join('；');
}

function mockClip(job, db, ctx) {
  const p = product(db, job.productId) || { title: 'Handcrafted Goods' };
  const svg = makePlaceholderSVG({
    title: p.title,
    sub: 'CLIP · mock',
    lang: 'en',
    badge: 'VIDEO MOCK',
    platformId: (job.params && job.params.platform) || 'shopee',
    w: 720,
    h: 1280,
  });
  const asset = addAsset(db, ctx, {
    productId: job.productId,
    kind: 'clip',
    url: null,
    width: 720,
    height: 1280,
    meta: { model: 'mock-clip-v1', mock: true },
  });
  const filename = `${asset.id}.svg`;
  fs.writeFileSync(path.join(ctx.uploadsDir, filename), svg, 'utf8');
  asset.url = `/files/${filename}`;
  return {
    assets: [asset.id],
    clipUrl: null,
    posterUrl: asset.url,
    note: 'mock：Seedance 未接或 AI_MOCK=1，这里只出首帧预览，不生成真视频',
  };
}

async function liveClip(job, db, ctx) {
  const p = product(db, job.productId) || {};
  const params = job.params || {};
  const firstFrame = dataUriFor(params.imageUrl || latestUploadUrl(db, job.productId), ctx.uploadsDir);
  const prompt = clipPrompt(p, params);

  const { buffer, model, taskId, ms } = await seedance.generateClip({
    prompt,
    firstFrame,
    model: params.model || undefined,
    resolution: params.resolution || '720p',
    duration: Number(params.duration) || 5,
    cameraFixed: Boolean(params.cameraFixed),
  });

  const id = newId('a');
  const filename = `${id}.mp4`;
  fs.writeFileSync(path.join(ctx.uploadsDir, filename), buffer);
  const asset = addAsset(db, ctx, {
    productId: job.productId,
    kind: 'clip',
    url: `/files/${filename}`,
    width: 0,
    height: 0,
    meta: { model, taskId, ms, seconds: Number(params.duration) || 5, hasFirstFrame: Boolean(firstFrame), prompt },
  });

  return {
    assets: [asset.id],
    clipUrl: `/files/${filename}`,
    note: `Seedance 出片 ${Number(params.duration) || 5}s · ${Math.round(ms / 1000)}s 生成`,
  };
}

/* ---------------- 视觉备料：精修底图 + 一致性多视角（永久锁定复用） ---------------- */

function visualPlan(job) {
  const params = job.params || {};
  const brief = params.brief || {};
  const pf = platform(params.platform);
  const realAngles = Array.isArray(params.realAngles) ? params.realAngles : [];
  return { params, brief, pf, realAngles, angles: visual.anglePlan({ realAngles }) };
}

function mockVisual(job, db, ctx) {
  const p = product(db, job.productId) || { title: 'Handcrafted Goods' };
  const { brief, pf, angles } = visualPlan(job);
  const analysis = p.analysis || visual.analyzeMock(p, brief);
  const spec = p.visualSpec || visual.buildSpec(analysis, 1);
  p.analysis = analysis;
  p.visualSpec = spec;

  const assets = [];
  for (const r of visual.refinePlan(pf)) {
    const asset = addAsset(db, ctx, { productId: job.productId, kind: 'refined', url: null, width: r.w, height: r.h, meta: { crop: r.crop, mock: true } });
    const svg = makePlaceholderSVG({ title: p.title, sub: `REFINED · ${r.crop}`, lang: 'en', badge: 'REFINED', platformId: pf.id, w: r.w, h: r.h });
    const filename = `${asset.id}.svg`;
    fs.writeFileSync(path.join(ctx.uploadsDir, filename), svg, 'utf8');
    asset.url = `/files/${filename}`;
    assets.push(asset.id);
  }
  for (const angle of angles.generate) {
    const asset = addAsset(db, ctx, { productId: job.productId, kind: 'angle', url: null, width: 1000, height: 1000, meta: { angle, mock: true } });
    const svg = makePlaceholderSVG({
      title: p.title,
      sub: `${visual.ANGLE_LABEL[angle] || angle} · mock`,
      lang: 'en',
      badge: angle.toUpperCase(),
      platformId: pf.id,
      w: 1000,
      h: 1000,
    });
    const filename = `${asset.id}.svg`;
    fs.writeFileSync(path.join(ctx.uploadsDir, filename), svg, 'utf8');
    asset.url = `/files/${filename}`;
    assets.push(asset.id);
  }
  return {
    assets,
    spec,
    analysis,
    plan: angles,
    note: 'mock：精修与视角已锁定入库',
  };
}

async function liveVisual(job, db, ctx) {
  const p = product(db, job.productId) || {};
  const { brief, pf, angles } = visualPlan(job);

  // 关键修复：备料阶段必须先拿到用户上传的原图作为 reference，绝不允许无图盲生！
  const { uri: uploadReference, asset: uploadAsset } = pickReferenceUri(db, job.productId, ctx.uploadsDir, ['angle_real', 'upload']);
  if (!uploadReference) {
    throw new Error('未找到用户上传的产品实拍图，无法进行精修与多视角备料。请先上传产品原图。');
  }

  const analysis = p.analysis || visual.analyzeMock(p, brief);
  const spec = p.visualSpec || visual.buildSpec(analysis, 1);
  p.analysis = analysis;
  p.visualSpec = spec;

  const lang = imagePromptLang();
  const assets = [];
  const errors = [];

  // 1. 生成并锁定「资产 A：产品精修底图（1:1 与 3:4）」——强制传入 uploadReference
  for (const r of visual.refinePlan(pf)) {
    try {
      const prompt = visual.promptFor('refine', { title: p.title, w: r.w, h: r.h, spec, lang });
      const one = await generateOneImage(p, {
        template: 'refined',
        lang: 'en',
        pf,
        w: r.w,
        h: r.h,
        index: 0,
        promptOverride: prompt,
        reference: uploadReference,
        ctx,
      });
      const asset = addAsset(db, ctx, {
        productId: job.productId,
        kind: 'refined',
        url: `/files/${one.filename}`,
        width: r.w,
        height: r.h,
        meta: { ...one.meta, crop: r.crop, sourceUploadId: uploadAsset?.id || null },
      });
      assets.push(asset.id);
    } catch (err) {
      errors.push(`精修 ${r.crop}: ${err.message}`);
    }
  }

  // 2. 基于刚锁定的精修底图（优先）或原图，生成可推断的「资产 B：一致性多视角图」
  const { uri: angleReference } = pickReferenceUri(db, job.productId, ctx.uploadsDir, ['refined', 'angle_real', 'upload']);
  for (const angle of angles.generate) {
    try {
      const prompt = visual.promptFor('angle', { title: p.title, angle, spec, lang });
      const one = await generateOneImage(p, {
        template: 'angle',
        lang: 'en',
        pf,
        w: 1000,
        h: 1000,
        index: 0,
        promptOverride: prompt,
        reference: angleReference || uploadReference,
        ctx,
      });
      const asset = addAsset(db, ctx, {
        productId: job.productId,
        kind: 'angle',
        url: `/files/${one.filename}`,
        width: 1000,
        height: 1000,
        meta: { ...one.meta, angle },
      });
      assets.push(asset.id);
    } catch (err) {
      errors.push(`${visual.ANGLE_LABEL[angle] || angle}: ${err.message}`);
    }
  }

  if (!assets.length) throw new Error(errors[0] || '基底素材生成失败');
  return { assets, spec, analysis, plan: angles, errors, note: '精修与多视角基底素材已锁定入库，后续全程复用' };
}

/* ---------------- 详情页六段（6 屏完整结构） ---------------- */

function detailPlanFor(job, db) {
  const p = product(db, job.productId) || { title: 'Handcrafted Goods' };
  const params = job.params || {};
  const pf = platform(params.platform || p.platform);
  const anchors = geo.anchors(p);
  const needModel = Boolean(params.needModel || p.brief?.model === 'yes');
  const plan = visual.detailPlan(p, {
    platform: pf,
    anchors,
    lang: params.lang || 'en',
    promptLang: imagePromptLang(),
    needModel,
  });
  return { p, pf, plan };
}

function mockDetail(job, db, ctx) {
  const { p, pf, plan } = detailPlanFor(job, db);
  const assets = [];
  const latestUpload = (db.assets || [])
    .filter((a) => a.productId === job.productId && !a.deletedAt && ['refined', 'angle_real', 'upload'].includes(a.kind) && a.url)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const uploadPath = latestUpload ? path.join(ctx.uploadsDir, path.basename(latestUpload.url)) : null;
  let basePhoto = uploadPath && fs.existsSync(uploadPath) ? compose.dataUri(uploadPath) : null;
  if (!basePhoto) {
    const pool = compose.poolPhotos(path.join(process.cwd(), 'demo'));
    if (pool.length) basePhoto = compose.dataUri(pool[0]);
  }
  for (const seg of plan) {
    const asset = addAsset(db, ctx, {
      productId: job.productId,
      kind: 'detail',
      url: null,
      width: seg.w,
      height: seg.h,
      meta: { template: 'detail', segment: seg.id, segTitle: seg.title, index: seg.index, copy: seg.copy, mock: true },
    });
    const svg = basePhoto
      ? compose.composeCard({
          photo: basePhoto,
          w: seg.w,
          h: seg.h,
          title: seg.title,
          sub: seg.copy.split('\n')[0],
          badge: `DETAIL ${seg.index}`,
          index: seg.index,
          segment: seg.id,
        })
      : makePlaceholderSVG({
          title: `${seg.index}. ${seg.title}`,
          sub: seg.copy.split('\n')[0],
          lang: 'en',
          badge: `DETAIL ${seg.index}`,
          platformId: pf.id,
          w: seg.w,
          h: seg.h,
        });
    const filename = `${asset.id}.svg`;
    fs.writeFileSync(path.join(ctx.uploadsDir, filename), svg, 'utf8');
    asset.url = `/files/${filename}`;
    assets.push(asset.id);
  }
  return {
    assets,
    segments: plan.map((s) => ({ index: s.index, id: s.id, title: s.title, w: s.w, h: s.h, copy: s.copy })),
    note: 'mock：六屏详情页已按结构生成',
  };
}

async function liveDetail(job, db, ctx) {
  const { p, pf, plan } = detailPlanFor(job, db);
  // 严格锁定精修底图与多视角参考图，保证 6 屏产品外观 100% 统一
  const { uri: reference, asset: refAsset } = pickReferenceUri(db, job.productId, ctx.uploadsDir, ['refined', 'angle_real', 'angle', 'upload']);
  if (!reference) {
    throw new Error('生成详情页前缺少产品参考图，请先上传产品实拍图。');
  }

  const assets = [];
  const errors = [];
  const queue = [...plan];
  const worker = async () => {
    while (queue.length) {
      const seg = queue.shift();
      try {
        const one = await generateOneImage(p, {
          template: 'detail',
          lang: 'en',
          pf,
          w: seg.w,
          h: seg.h,
          index: seg.index,
          promptOverride: seg.prompt,
          reference,
          ctx,
        });
        const asset = addAsset(db, ctx, {
          productId: job.productId,
          kind: 'detail',
          url: `/files/${one.filename}`,
          width: seg.w,
          height: seg.h,
          meta: {
            ...one.meta,
            template: 'detail',
            segment: seg.id,
            segTitle: seg.title,
            index: seg.index,
            copy: seg.copy,
            usedRefined: refAsset?.kind === 'refined',
            specVersion: p.visualSpec?.version || 1,
          },
        });
        assets.push(asset.id);
      } catch (err) {
        errors.push(`${seg.index}.${seg.title}: ${err.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, plan.length) }, worker));
  if (!assets.length) throw new Error(errors[0] || '详情页生成全失败');
  return {
    assets,
    segments: plan.map((s) => ({ index: s.index, id: s.id, title: s.title, w: s.w, h: s.h, copy: s.copy })),
    errors,
    note: `六屏详情页已生成${errors.length ? `（${errors.length} 屏失败）` : ''}`,
  };
}

/* ============ GEO 内容资产 ============ */

function saveTextAsset(db, ctx, { productId, kind, text, meta = {} }) {
  return addAsset(db, ctx, {
    kind,
    url: null,
    width: 0,
    height: 0,
    productId,
    meta: { model: meta.model || 'geo-v1', text, ...meta },
  });
}

function mockGeo(job, db, ctx) {
  const p = product(db, job.productId) || { title: 'Handcrafted Goods' };
  const brief = (job.params && job.params.brief) || p.brief || {};
  const qs = geo.questions(p, brief);
  const ancs = geo.anchors(p);
  const kws = geo.keywords(p, (job.params && job.params.lang) || 'en');
  const bl = geo.blocks(p, qs, ancs);

  const assets = [];
  const a1 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'faq', text: bl.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n'), meta: { model: 'mock-geo-v1', part: 'faq' } });
  const a2 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'anchor', text: ancs.map((a) => `${a.before} → ${a.after}（${a.why}）`).join('\n'), meta: { model: 'mock-geo-v1', part: 'anchor' } });
  const a3 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'keyword_layer', text: kws.map((k) => `${k.layer} ${k.term} → ${k.where}`).join('\n'), meta: { model: 'mock-geo-v1', part: 'keyword' } });
  for (const a of [a1, a2, a3]) if (a) assets.push(a.id);

  return {
    assets,
    questions: qs,
    anchors: ancs,
    keywords: kws,
    blocks: bl,
    note: 'mock：问题库与锚点按模板生成，接上 TEXT 模型后会更贴你的品类',
  };
}

async function liveGeo(job, db, ctx) {
  const p = product(db, job.productId) || {};
  const brief = (job.params && job.params.brief) || p.brief || {};
  const cap = providers.capability('TEXT');
  const body = {
    model: cap.model,
    messages: [{ role: 'user', content: geo.promptGeo(p, brief) }],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  };
  const { data } = await providers.postJSON('TEXT', '/chat/completions', body);
  const text = data?.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('GEO 模型没按 JSON 返回');
    parsed = JSON.parse(m[0]);
  }
  const qs = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 20) : [];
  const ancs = Array.isArray(parsed.anchors) ? parsed.anchors.slice(0, 6) : [];
  const kws = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 8) : [];
  const bl = parsed.blocks || { faq: [], param: [], compare: [] };

  const assets = [];
  const a1 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'faq', text: (bl.faq || []).map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n'), meta: { model: cap.model, part: 'faq' } });
  const a2 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'anchor', text: ancs.map((a) => `${a.before} → ${a.after}（${a.why}）`).join('\n'), meta: { model: cap.model, part: 'anchor' } });
  const a3 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'keyword_layer', text: kws.map((k) => `${k.layer} ${k.term} → ${k.where}`).join('\n'), meta: { model: cap.model, part: 'keyword' } });
  for (const a of [a1, a2, a3]) if (a) assets.push(a.id);

  return { assets, questions: qs, anchors: ancs, keywords: kws, blocks: bl, note: 'GEO 内容资产已备好，三张卡在仓库「内容资产」里' };
}

/* ============ 询盘解析 ============ */

function mockInquiry(job, db, ctx) {
  const p = product(db, job.productId) || { title: '' };
  const text = (job.params && job.params.text) || '';
  const r = inquiry.parse(text);
  const assets = [];
  const a1 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'inquiry', text, meta: { model: 'mock-inquiry-v1', product: p.title } });
  const a2 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'reply', text: r.reply.en, meta: { model: 'mock-inquiry-v1', lang: 'en' } });
  for (const a of [a1, a2]) if (a) assets.push(a.id);
  return { assets, fields: r.fields, risks: r.risks, tiers: r.tiers, reply: r.reply, summary: r.summary, note: 'mock：五要素按规则抽取，接上 TEXT 模型后更准' };
}

async function liveInquiry(job, db, ctx) {
  const text = (job.params && job.params.text) || '';
  const langs = (job.params && job.params.langs) || ['en', 'zh'];
  const cap = providers.capability('TEXT');
  const body = {
    model: cap.model,
    messages: [{ role: 'user', content: inquiry.promptParse(text, langs) }],
    temperature: 0.5,
    response_format: { type: 'json_object' },
  };
  const { data } = await providers.postJSON('TEXT', '/chat/completions', body);
  const raw = data?.choices?.[0]?.message?.content || '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('询盘模型没按 JSON 返回');
    parsed = JSON.parse(m[0]);
  }
  const fields = Array.isArray(parsed.fields) ? parsed.fields : [];
  const risks = Array.isArray(parsed.risks) ? parsed.risks : [];
  const reply = parsed.reply && typeof parsed.reply === 'object' ? parsed.reply : { en: '' };
  const assets = [];
  const a1 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'inquiry', text, meta: { model: cap.model } });
  const a2 = saveTextAsset(db, ctx, { productId: job.productId, kind: 'reply', text: reply.en || Object.values(reply)[0] || '', meta: { model: cap.model, lang: 'en' } });
  for (const a of [a1, a2]) if (a) assets.push(a.id);
  return { assets, fields, risks, tiers: [], reply, summary: fields.map((f) => f.value).filter(Boolean).slice(0, 3).join(' · '), note: '询盘已解析，回信可复制' };
}
