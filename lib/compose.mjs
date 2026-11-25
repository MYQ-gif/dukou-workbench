// 「假装生成」用的合图器：把用户上传的原图（或 demo 池里的照片）套上排版，产出成品图。
// 不调用任何生图 API——纯本地 SVG 合成，浏览器负责渲染。

import fs from 'node:fs';
import path from 'node:path';

const INK = '#0B0B0B';
const PAPER = '#F4EFE2';
const YELLOW = '#FFE600';
const TINTS = ['#fff6c9', '#e6ecff', '#ddefe3', '#fbe2cf'];

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** 从文件读图并转 data URI（SVG 里嵌图最省事） */
export function dataUri(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return null;
  const buf = fs.readFileSync(file);
  return { uri: `data:${mime};base64,${buf.toString('base64')}`, size: bufferSize(buf) };
}

/** 粗读图片尺寸：JPEG 与 PNG 够用，其他按 3:2 兜底 */
export function bufferSize(buf) {
  if (!buf || buf.length < 24) return { w: 1200, h: 800 };
  if (buf[0] === 0x89 && buf[1] === 0x50) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return { w: 1200, h: 800 };
}

const wrap = (text, per) => {
  const out = [];
  let line = '';
  for (const ch of String(text || '')) {
    line += ch;
    if (line.length >= per) {
      out.push(line.replace(/[，。；、）]$/, ''));
      line = '';
    }
  }
  if (line) out.push(line);
  return out;
};

function frame(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${PAPER}"/>
  <rect x="7" y="7" width="${w - 14}" height="${h - 14}" fill="none" stroke="${INK}" stroke-width="12"/>
  ${inner}
</svg>`;
}

export function composeCard({ photo, w, h, title, sub, bullets = [], badge = '', index = 1, segment = null, tint = TINTS[0] }) {
  const pad = Math.round(Math.min(w, h) * 0.055);
  const imgW = w - pad * 2;
  const isDetail = Boolean(segment);

  if (isDetail) {
    const imgY = Math.round(h * 0.19);
    const imgH = Math.round(h * 0.5);
    const lines = wrap(sub, 17).slice(0, 5);
    return frame(
      w,
      h,
      `
  <text x="${pad}" y="${pad + 40}" font-family="Arial Black, Microsoft YaHei, sans-serif" font-size="${Math.round(h * 0.021)}" font-weight="800" fill="${INK}">${String(index).padStart(2, '0')}</text>
  <rect x="${pad + 62}" y="${pad + 20}" width="${w - pad * 2 - 62}" height="4" fill="${INK}"/>
  <text x="${pad}" y="${pad + 118}" font-family="Georgia, Microsoft YaHei, serif" font-size="${Math.round(h * 0.032)}" font-weight="700" fill="${INK}">${esc(title)}</text>
  <rect x="${pad}" y="${imgY}" width="${imgW}" height="${imgH}" fill="#fff" stroke="${INK}" stroke-width="6"/>
  <image x="${pad + 10}" y="${imgY + 10}" width="${imgW - 20}" height="${imgH - 20}" preserveAspectRatio="xMidYMid slice" href="${photo.uri}"/>
  ${lines
    .map(
      (l, i) =>
        `<text x="${pad}" y="${imgY + imgH + 74 + i * 44}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="${Math.round(h * 0.0175)}" fill="#2f2c26">${esc(l)}</text>`
    )
    .join('')}
  <rect x="${pad}" y="${h - pad - 40}" width="236" height="40" fill="${YELLOW}" stroke="${INK}" stroke-width="4"/>
  <text x="${pad + 16}" y="${h - pad - 12}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="20" letter-spacing="2" fill="${INK}">DUKOU · DEMO</text>
`
    );
  }

  const imgY = Math.round(h * 0.205);
  const imgH = Math.round(h * 0.625);
  return frame(
    w,
    h,
    `
  <rect x="${pad}" y="${pad}" width="${Math.round(w / 2.25)}" height="54" fill="${tint}" stroke="${INK}" stroke-width="4"/>
  <text x="${pad + 22}" y="${pad + 37}" font-family="Arial Black, Microsoft YaHei, sans-serif" font-size="26" font-weight="800" letter-spacing="3" fill="${INK}">${esc(badge || 'MAIN')}</text>
  <text x="${pad}" y="${pad + 214}" font-family="Georgia, Microsoft YaHei, serif" font-size="${title.length > 9 ? Math.round(h * 0.038) : Math.round(h * 0.046)}" font-weight="700" fill="${INK}">${esc(title)}</text>
  <text x="${pad}" y="${pad + 262}" font-family="Arial, Microsoft YaHei, sans-serif" font-size="24" letter-spacing="4" fill="#4a463c">${esc(sub || 'DUKOU · DEMO PREVIEW')}</text>
  <rect x="${pad}" y="${imgY}" width="${imgW}" height="${imgH}" fill="#fff" stroke="${INK}" stroke-width="6"/>
  <image x="${pad + 10}" y="${imgY + 10}" width="${imgW - 20}" height="${imgH - 20}" preserveAspectRatio="xMidYMid slice" href="${photo.uri}"/>
  ${bullets
    .slice(0, 3)
    .map(
      (b, i) =>
        `<g transform="translate(${pad},${imgY + imgH + 96 + i * 58})">
          <rect width="18" height="18" y="-14" fill="${YELLOW}" stroke="${INK}" stroke-width="3"/>
          <text x="36" y="0" font-family="Arial, Microsoft YaHei, sans-serif" font-size="27" fill="${INK}">${esc(b)}</text>
        </g>`
    )
    .join('')}
`
  );
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** demo 池：仓库根目录 demo/ 下任意图片，按文件名排序取用 */
export function poolPhotos(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort()
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}
