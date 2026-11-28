// 生成一套「演示专用」数据：不调用任何生图 API——用一张公开照片 + 不同裁切 + SVG 排版，造出一整套成品图。
// 用法：停掉 server（${PORT}）→ node scripts/seed-showcase.mjs → 再启动 server
// 产物：data/uploads/*.svg（本地，不进 git）+ data/db.json 里的 demo 商品

import fs from 'node:fs';
import path from 'node:path';
const PORT = process.env.PORT || '8790';

const ROOT = process.cwd();
const UPLOADS = path.join(ROOT, 'data', 'uploads');
const DB = path.join(ROOT, 'data', 'db.json');
fs.mkdirSync(UPLOADS, { recursive: true });

const pid = 'p_demo_headphones';
const now = new Date().toISOString();

/* ---------- 1) 一张公开照片（同一张，靠裁切出不同视角） ---------- */
const SRC_URL = 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1600&q=80';

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { w: 1600, h: 1067 };
}

let photoB64 = null;
let PHOTO = { w: 1600, h: 1067 };
try {
  const r = await fetch(SRC_URL);
  if (!r.ok) throw new Error(String(r.status));
  const buf = Buffer.from(await r.arrayBuffer());
  PHOTO = jpegSize(buf);
  photoB64 = buf.toString('base64');
  fs.writeFileSync(path.join(UPLOADS, 'a_demo_src.jpg'), buf);
  console.log('photo', PHOTO.w + '×' + PHOTO.h, Math.round(buf.length / 1024) + 'KB');
} catch (e) {
  const local = path.join(UPLOADS, 'a_demo_src.jpg');
  if (fs.existsSync(local)) {
    const buf = fs.readFileSync(local);
    PHOTO = jpegSize(buf);
    photoB64 = buf.toString('base64');
    console.log('联网失败，用本地缓存图', PHOTO.w + '×' + PHOTO.h);
  } else {
    throw new Error('没有照片可用：' + e.message);
  }
}
const HREF = `data:image/jpeg;base64,${photoB64}`;

/* ---------- 2) 画 SVG ---------- */
const INK = '#0B0B0B';
const PAPER = '#F4EFE2';
const YELLOW = '#FFE600';

// crop: 归一化裁切框 [x,y,w,h]（0–1），渲染时按比例映射到原图像素
function photoBlock(x, y, w, h, crop) {
  const [cx, cy, cw, ch] = crop;
  const vx = Math.round(PHOTO.w * cx);
  const vy = Math.round(PHOTO.h * cy);
  const vw = Math.round(PHOTO.w * cw);
  const vh = Math.round(PHOTO.h * ch);
  return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid slice">
    <image width="${PHOTO.w}" height="${PHOTO.h}" href="${HREF}"/>
  </svg>`;
}

function frame(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${PAPER}"/>
  <rect x="7" y="7" width="${w - 14}" height="${h - 14}" fill="none" stroke="${INK}" stroke-width="14"/>
  ${inner}
</svg>`;
}

const wrap = (text, per) => {
  const out = [];
  let line = '';
  for (const ch of text) {
    line += ch;
    if (line.length >= per) { out.push(line.replace(/[，。；、）]$/, '')); line = ''; }
  }
  if (line) out.push(line);
  return out;
};

function mainCard({ title, sub, bullets, badge, crop, w, h }) {
  const pad = 70;
  const imgY = Math.round(h * 0.30);
  const imgH = Math.round(h * 0.52);
  return frame(
    w,
    h,
    `
  <rect x="${pad}" y="${pad}" width="${Math.round(w / 2.25)}" height="54" fill="${YELLOW}" stroke="${INK}" stroke-width="4"/>
  <text x="${pad + 22}" y="${pad + 37}" font-family="Arial Black, Microsoft YaHei, sans-serif" font-size="26" font-weight="800" letter-spacing="3" fill="${INK}">${badge}</text>
  <text x="${pad}" y="${pad + 146}" font-family="Georgia, Microsoft YaHei, serif" font-size="${title.length > 9 ? 56 : 68}" font-weight="700" fill="${INK}">${title}</text>
  <text x="${pad}" y="${pad + 194}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="24" letter-spacing="4" fill="#4a463c">${sub}</text>
  <rect x="${pad}" y="${imgY}" width="${w - pad * 2}" height="${imgH}" fill="#fff" stroke="${INK}" stroke-width="6"/>
  ${photoBlock(pad + 10, imgY + 10, w - pad * 2 - 20, imgH - 20, crop)}
  ${bullets
    .map(
      (b, i) =>
        `<g transform="translate(${pad},${imgY + imgH + 98 + i * 58})">
          <rect width="18" height="18" y="-14" fill="${YELLOW}" stroke="${INK}" stroke-width="3"/>
          <text x="36" y="0" font-family="Arial, Microsoft YaHei, sans-serif" font-size="27" fill="${INK}">${b}</text>
        </g>`
    )
    .join('')}
`
  );
}

function detailCard({ index, title, copy, crop, w, h }) {
  const pad = 64;
  const imgY = Math.round(h * 0.19);
  const imgH = Math.round(h * 0.5);
  const lines = wrap(copy, 17).slice(0, 5);
  return frame(
    w,
    h,
    `
  <text x="${pad}" y="${pad + 44}" font-family="Arial Black, Microsoft YaHei, sans-serif" font-size="32" font-weight="800" fill="${INK}">${String(index).padStart(2, '0')}</text>
  <rect x="${pad + 62}" y="${pad + 22}" width="${w - pad * 2 - 62}" height="4" fill="${INK}"/>
  <text x="${pad}" y="${pad + 124}" font-family="Georgia, Microsoft YaHei, serif" font-size="52" font-weight="700" fill="${INK}">${title}</text>
  <rect x="${pad}" y="${imgY}" width="${w - pad * 2}" height="${imgH}" fill="#fff" stroke="${INK}" stroke-width="6"/>
  ${photoBlock(pad + 10, imgY + 10, w - pad * 2 - 20, imgH - 20, crop)}
  ${lines
    .map(
      (l, i) =>
        `<text x="${pad}" y="${imgY + imgH + 78 + i * 46}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="28" fill="#2f2c26">${l}</text>`
    )
    .join('')}
  <rect x="${pad}" y="${h - pad - 40}" width="236" height="40" fill="${YELLOW}" stroke="${INK}" stroke-width="4"/>
  <text x="${pad + 16}" y="${h - pad - 12}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="20" letter-spacing="2" fill="${INK}">DUKOU · SHOPEE</text>
`
  );
}

/* ---------- 3) 落盘 ---------- */
const made = [];
function save(name, svg) {
  fs.writeFileSync(path.join(UPLOADS, name), svg);
  made.push(name);
  return `/files/${name}`;
}

// 主图：整图 / 右侧特写
const main1 = save('a_demo_main1.svg', mainCard({
  title: '黑色头戴式蓝牙耳机',
  sub: 'DUKOU · ACTIVE NOISE CANCELLING',
  bullets: ['40 小时续航，充电 10 分钟听 5 小时', '双麦克风主动降噪，通勤也安静', '整机 236g，久戴不夹头'],
  badge: 'MAIN 1',
  crop: [0, 0, 1, 1],
  w: 1242,
  h: 1660,
}));
const main2 = save('a_demo_main2.svg', mainCard({
  title: 'STAY IN YOUR OWN SOUND',
  sub: 'DUKOU · WIRELESS OVER-EAR',
  bullets: ['记忆棉耳罩，可 30° 旋转收进包里', '蓝牙 5.3，双设备同时在线', '支持 LC3 低延迟，看剧不飘'],
  badge: 'MAIN 2',
  crop: [0.42, 0.05, 0.58, 0.9],
  w: 1242,
  h: 1660,
}));

// 六段详情：同一张图的不同裁切，讲不同的事
const SEGS = [
  { id: 'brand', title: '品牌认知', copy: '一副耳机，隔开一天的噪音。工位、地铁、深夜书桌，戴上就只剩自己的声音。', crop: [0, 0, 1, 1] },
  { id: 'selling', title: '核心卖点', copy: '40 小时续航 · 主动降噪 · 236g 轻量。三个最常被问到的点，一次讲清楚。', crop: [0.3, 0.15, 0.7, 0.8] },
  { id: 'detail', title: '产品细节', copy: '耳罩是慢回弹记忆棉，外层蛋白皮，夏天不闷；头梁内侧有金属滑轨，可调 4 档。', crop: [0.05, 0.45, 0.45, 0.55] },
  { id: 'feature', title: '功能展示', copy: '双击右耳罩暂停，长按 2 秒进入通透模式；摘下自动暂停，戴回继续播放。', crop: [0.55, 0.42, 0.45, 0.58] },
  { id: 'scene', title: '使用场景', copy: '通勤、办公、睡前。三种场景的降噪强度可以分开存，切场景不用重新调。', crop: [0.12, 0.08, 0.76, 0.7] },
  { id: 'reason', title: '购买理由', copy: '同价位少见的双设备同时在线，笔记本和手机来回切不用断开重连。', crop: [0.28, 0.05, 0.62, 0.62] },
];
const detailUrls = SEGS.map((s, i) =>
  save(
    `a_demo_detail${i + 1}.svg`,
    detailCard({ index: i + 1, title: s.title, copy: s.copy, crop: s.crop, w: 1242, h: 1739 })
  )
);

/* ---------- 4) 写 db ---------- */
const db = fs.existsSync(DB) ? JSON.parse(fs.readFileSync(DB, 'utf8')) : {};
db.products = (db.products || []).filter((p) => p.id !== pid);
db.assets = (db.assets || []).filter((a) => a.productId !== pid);
db.jobs = (db.jobs || []).filter((j) => j.productId !== pid);
db.ledger = (db.ledger || []).filter((l) => l.productId !== pid);

const A = (id, kind, url, w, h, meta = {}) => ({ id, productId: pid, kind, url, width: w, height: h, meta, createdAt: now });
const assets = [
  A('a_demo_src', 'upload', '/files/a_demo_src.jpg', PHOTO.w, PHOTO.h, { demo: true }),
  A('a_demo_m1', 'main', main1, 1242, 1660, { template: 'main', demo: true }),
  A('a_demo_m2', 'marketing', main2, 1242, 1660, { template: 'marketing', demo: true }),
  ...SEGS.map((s, i) =>
    A(`a_demo_d${i + 1}`, 'detail', detailUrls[i], 1242, 1739, {
      template: 'detail', segment: s.id, segTitle: s.title, index: i + 1, copy: s.copy, demo: true,
    })
  ),
];

db.products.push({
  id: pid,
  title: '黑色头戴式蓝牙耳机',
  platform: 'shopee',
  market: 'us',
  lang: 'en',
  rawText: '客户实拍：哑光黑头戴耳机，黄色背景，俯拍。',
  sellingPoints: ['40 小时续航', '主动降噪', '236g 轻量'],
  brief: { usage: 'main', angles: ['front'], selling: '40 小时续航、主动降噪', priceTier: 'mid', askedAt: now },
  createdAt: now,
  assets: assets.map((a) => a.id),
  detailOrder: SEGS.map((_, i) => `a_demo_d${i + 1}`),
});
db.assets.push(...assets);

[
  { type: 'income', amount: 128.5, note: '首单（US 站）' },
  { type: 'shipping', amount: 30, note: '海运' },
  { type: 'ads', amount: 18, note: '关键词广告' },
].forEach((r, i) =>
  db.ledger.push({ id: `l_demo${i + 1}`, productId: pid, type: r.type, amount: r.amount, currency: 'CNY', note: r.note, createdAt: now })
);

fs.writeFileSync(DB, JSON.stringify(db, null, 2));

console.log('\n演示商品：', pid, '（黑色头戴式蓝牙耳机）');
console.log('资产：1 原图 + 2 主图 + 6 详情 =', assets.length, '张');
console.log('账目 3 条：128.5 - 30 - 18 → 利润 80.5');
console.log('重启 server 后打开 http://localhost:${PORT}');