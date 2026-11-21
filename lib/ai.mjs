// AI 链路（马负责）——出图 / 出文案 / 视频字幕翻译
// 默认走 mock（AI_MOCK != '0'），保证任何环境都能跑通链路。
// 真调时只需要替换下面三个 live* 函数，接口形状不变。
import fs from 'node:fs';
import path from 'node:path';
import { newId, nowISO } from './jobs.mjs';

const MOCK = process.env.AI_MOCK !== '0';
const BASE_URL = process.env.AI_BASE_URL || '';
const API_KEY = process.env.AI_API_KEY || '';
const TIMEOUT_MS = 90_000;

export function mode() {
  return MOCK || !BASE_URL || !API_KEY ? 'mock' : 'live';
}

/** 统一入口：由 jobs.tick 调用 */
export async function run(job, db, ctx) {
  switch (job.type) {
    case 'image':
      return MOCK ? mockImage(job, db, ctx) : await liveImage(job, db, ctx);
    case 'copy':
      return MOCK ? mockCopy(job, db, ctx) : await liveCopy(job, db, ctx);
    case 'video':
      return MOCK ? mockVideo(job, db) : await liveVideo(job, db);
    default:
      throw new Error(`unknown job type: ${job.type}`);
  }
}

/**
 * 平台尺寸表：出图按平台给的规格走。
 * 国内三家老阵地都是 1:1，海外 Amazon/eBay 也要 1:1，Shopee/Lazada 偏 3:4，TikTok Shop 是 9:16。
 */
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

const LANG_LABEL = { en: 'EN', th: 'TH', vi: 'VI', ar: 'AR', fr: 'FR', zh: 'ZH' };

/** 生成一张占位"商品图"（SVG，尺寸按平台规格）。真调模型时这里换成下载远端图片。 */
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

/* ---------------- mock 实现 ---------------- */

const QUALITY_SCALE = { '1k': 1, '2k': 1.5, '4k': 2 };

function imagePlan(job) {
  const params = job.params || {};
  const template = params.template || 'main';
  const pf = platform(params.platform);
  const count = clampInt(params.count, 1, 6, template === 'detail' ? 3 : 2);
  const quality = QUALITY_SCALE[params.quality] ? params.quality : '1k';
  const scale = QUALITY_SCALE[quality];
  const baseW = clampInt(params.width, 200, 4000, pf.w);
  const baseH = clampInt(params.height, 200, 4000, pf.h);
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
  const p = product(db, job.productId) || { title: 'Handcrafted Goods', sellingPoints: [] };
  const { params, template, pf, count, quality, w, h } = imagePlan(job);
  const lang = params.lang || 'en';
  const assets = [];
  for (let i = 0; i < count; i++) {
    const id = newId('a');
    const svg = makePlaceholderSVG({
      title: p.title,
      sub: (p.sellingPoints || [])[i % Math.max(1, (p.sellingPoints || []).length)] || 'Handmade with care',
      lang,
      badge: `${template.toUpperCase()} ${i + 1}`,
      platformId: pf.id,
      w,
      h,
    });
    const filename = `${id}.svg`;
    fs.writeFileSync(path.join(ctx.uploadsDir, filename), svg, 'utf8');
    const asset = addAsset(db, ctx, {
      productId: job.productId,
      kind: template,
      url: `/files/${filename}`,
      width: w,
      height: h,
      meta: { model: 'mock-image-v1', template, lang, platform: pf.id, count, quality, baseW: pf.w, baseH: pf.h },
    });
    assets.push(asset.id);
  }
  return { assets };
}

/** 文案也进仓库：存成 kind=copy 的资产，正文放 meta 里，前端「仓库 → 文案」读它。 */
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

function mockVideo(job, db) {
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

/* ---------------- live 实现（默认不被调用） ---------------- */

async function callJSON(url, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function liveCopy(job, db, ctx) {
  const p = product(db, job.productId) || {};
  const lang = (job.params && job.params.lang) || 'en';
  const pf = platform(job.params && job.params.platform);
  const prompt = [
    `你是跨境电商运营。请用 ${lang} 为一个商品写 listing。`,
    `商品：${p.title || ''}`,
    `已知卖点：${(p.sellingPoints || []).join('、')}`,
    p.rawText ? `原始描述：${p.rawText}` : '',
    '只返回 JSON：{"title":"","bullets":[""],"detail":""}，不要解释。',
  ]
    .filter(Boolean)
    .join('\n');

  const data = await callJSON(`${BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    model: process.env.AI_TEXT_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  const text = data?.choices?.[0]?.message?.content || '{}';
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('model returned non-JSON');
  }
  const copy = {
    lang,
    title: parsed.title || p.title || '',
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
    detail: parsed.detail || '',
    model: process.env.AI_TEXT_MODEL || 'live',
  };
  const asset = saveCopy(db, ctx, { productId: job.productId, lang, platformId: pf.id, copy, model: copy.model });
  return { ...copy, assetId: asset ? asset.id : null };
}

async function liveImage(job, db, ctx) {
  const p = product(db, job.productId) || {};
  const { params, template, pf, count, quality, w, h } = imagePlan(job);
  const lang = params.lang || 'en';
  const prompt = `E-commerce product photo of ${p.title || 'handcrafted furniture'}, natural window light, warm wood tones, empty space for text, ${lang} market, ${w}x${h}.`;
  const assets = [];
  for (let i = 0; i < count; i++) {
    const data = await callJSON(`${BASE_URL.replace(/\/$/, '')}/images/generations`, {
      model: process.env.AI_IMAGE_MODEL || 'gpt-image-1',
      prompt,
      size: `${w}x${h}`,
      n: 1,
    });
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error('no image returned');
    const id = newId('a');
    const filename = `${id}.png`;
    fs.writeFileSync(path.join(ctx.uploadsDir, filename), Buffer.from(b64, 'base64'));
    const asset = addAsset(db, ctx, {
      productId: job.productId,
      kind: template,
      url: `/files/${filename}`,
      width: w,
      height: h,
      meta: { model: process.env.AI_IMAGE_MODEL || 'live', lang, platform: pf.id, count, quality },
    });
    assets.push(asset.id);
  }
  return { assets };
}

async function liveVideo(job) {
  // 视频翻译链路最复杂，48h 内不做，保留接口形状即可
  throw new Error('video translation not implemented yet');
}
