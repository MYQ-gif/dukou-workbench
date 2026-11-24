// 英文路径自检：同一条产品，中/英两版 prompt + 分步模板的英文版
import * as visual from '../lib/visual.mjs';
import { imagePrompt, imagePromptLang } from '../lib/ai.mjs';

const p = {
  title: '老榆木餐桌',
  rawText: '老爸给奶奶手做的桌子，桌面有岁月痕迹。',
  sellingPoints: ['实木手工', '老料新做', '一口价含运费'],
  brief: { selling: '实木手工，老料新做', usage: 'main' },
};
const analysis = visual.analyzeMock(p, p.brief);
p.visualSpec = visual.buildSpec(analysis, 1);

const opts = { template: 'main', lang: 'en', w: 1242, h: 1660, pf: { name: 'Shopee' }, ask: '白底主图，标题写 STAY A WHILE' };
const zh = imagePrompt(p, { ...opts, promptLang: 'zh' });
const en = imagePrompt(p, { ...opts, promptLang: 'en' });

const cjk = (s) => (s.match(/[\u4e00-\u9fa5]/g) || []).length;
console.log('===== zh =====', zh.length, '字符');
console.log(zh);
console.log('\n===== en =====', en.length, '字符');
console.log(en);

const steps = ['refine', 'angle', 'detail', 'model'];
console.log('\n===== 分步模板（en）=====');
for (const s of steps) {
  const out = visual.promptFor(s, { title: p.title, spec: p.visualSpec, seg: 2, segTitle: '核心卖点', angle: 'deg45', w: 800, h: 1120, lang: 'en' });
  console.log(`\n[${s}] ${out}`);
}

const plan = visual.detailPlan(p, { platform: { name: 'Shopee', w: 800 }, anchors: [], promptLang: 'en' });
console.log('\n详情页首段 prompt（en）:', plan[0].prompt);

console.log('\n--- 自检 ---');
console.log('自动判定:', imagePromptLang(), '| 英文版中文字符数:', cjk(en.replace(p.title, '').replace(p.rawText, '')));
console.log('specEn:', JSON.stringify(visual.specEn(p.visualSpec)));
