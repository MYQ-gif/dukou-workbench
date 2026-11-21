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
      return MOCK ? mockCopy(job, db) : await liveCopy(job, db);
    case 'video':
      return MOCK ? mockVideo(job, db) : await liveVideo(job, db);
    default:
      throw new Error(`unknown job type: ${job.type}`);
  }
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

/** 生成一张占位"商品图"（SVG）。真调模型时这里换成下载远端图片。 */
function makePlaceholderSVG({ title, sub, lang, badge }) {
  const t = escapeXml(truncate(title || 'Handcrafted Goods', 26));
  const s = escapeXml(truncate(sub || 'Handmade with care', 42));
  const b = escapeXml(badge || 'MAIN IMAGE');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1242" height="1660" viewBox="0 0 1242 1660">
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
  <rect width="1242" height="1660" fill="url(#bg)"/>
  <rect x="120" y="420" width="1002" height="720" rx="18" fill="url(#wood)" opacity="0.92"/>
  <rect x="120" y="420" width="1002" height="60" rx="18" fill="#000" opacity="0.12"/>
  <text x="621" y="250" font-family="Georgia, serif" font-size="64" fill="#3a2a1a" text-anchor="middle">${t}</text>
  <text x="621" y="330" font-family="Helvetica, Arial" font-size="30" fill="#6b5947" text-anchor="middle">${s}</text>
  <text x="621" y="1320" font-family="Georgia, serif" font-size="52" fill="#3a2a1a" text-anchor="middle">${b}</text>
  <text x="621" y="1390" font-family="Helvetica, Arial" font-size="26" fill="#7a6852" text-anchor="middle">${LANG_LABEL[lang] || 'EN'} · ${escapeXml(new Date().toISOString().slice(0, 10))}</text>
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

function mockImage(job, db, ctx) {
  const p = product(db, job.productId) || { title: 'Handcrafted Goods', sellingPoints: [] };
  const template = (job.params && job.params.template) || 'main';
  const lang = (job.params && job.params.lang) || 'en';
  const count = template === 'detail' ? 3 : 2;
  const assets = [];
  for (let i = 0; i < count; i++) {
    const id = newId('a');
    const svg = makePlaceholderSVG({
      title: p.title,
      sub: (p.sellingPoints || [])[i % Math.max(1, (p.sellingPoints || []).length)] || 'Handmade with care',
      lang,
      badge: `${template.toUpperCase()} ${i + 1}`,
    });
    const filename = `${id}.svg`;
    fs.writeFileSync(path.join(ctx.uploadsDir, filename), svg, 'utf8');
    const asset = addAsset(db, ctx, {
      productId: job.productId,
      kind: template,
      url: `/files/${filename}`,
      width: 1242,
      height: 1660,
      meta: { model: 'mock-image-v1', template, lang },
    });
    assets.push(asset.id);
  }
  return { assets };
}

function mockCopy(job, db) {
  const p = product(db, job.productId) || { title: 'Handcrafted Goods', sellingPoints: [] };
  const lang = (job.params && job.params.lang) || 'en';
  const points = (p.sellingPoints || []).length ? p.sellingPoints : ['Handmade', 'Solid wood', 'One of a kind'];
  const title = lang === 'en' ? `${p.title} — Handmade, One of a Kind` : p.title;
  return {
    lang,
    title,
    bullets: points.map((x) => `· ${x}`),
    detail:
      lang === 'en'
        ? `Made by hand, one piece at a time. ${points.join(', ')}. Each item carries marks of its own history — no two are alike.`
        : `${points.join('，')}。手工制作，每一件都有它自己的痕迹。`,
    model: 'mock-copy-v1',
  };
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

async function liveCopy(job, db) {
  const p = product(db, job.productId) || {};
  const lang = (job.params && job.params.lang) || 'en';
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
  return {
    lang,
    title: parsed.title || p.title || '',
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets : [],
    detail: parsed.detail || '',
    model: process.env.AI_TEXT_MODEL || 'live',
  };
}

async function liveImage(job, db, ctx) {
  const p = product(db, job.productId) || {};
  const lang = (job.params && job.params.lang) || 'en';
  const prompt = `E-commerce product photo of ${p.title || 'handcrafted furniture'}, natural window light, warm wood tones, empty space for text, ${lang} market, 3:4 vertical.`;
  const data = await callJSON(`${BASE_URL.replace(/\/$/, '')}/images/generations`, {
    model: process.env.AI_IMAGE_MODEL || 'gpt-image-1',
    prompt,
    size: '1024x1536',
    n: 1,
  });
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('no image returned');
  const id = newId('a');
  const filename = `${id}.png`;
  fs.writeFileSync(path.join(ctx.uploadsDir, filename), Buffer.from(b64, 'base64'));
  const asset = addAsset(db, ctx, {
    productId: job.productId,
    kind: (job.params && job.params.template) || 'main',
    url: `/files/${filename}`,
    width: 1024,
    height: 1536,
    meta: { model: process.env.AI_IMAGE_MODEL || 'live', lang },
  });
  return { assets: [asset.id] };
}

async function liveVideo(job) {
  // 视频翻译链路最复杂，48h 内不做，保留接口形状即可
  throw new Error('video translation not implemented yet');
}
