// 看「真正发给生图模型的 prompt」长什么样：category + 视觉规范 + 卖点 + 硬性画质约束
import * as visual from '../lib/visual.mjs';
import { imagePrompt } from '../lib/ai.mjs';

const p = {
  title: '老榆木餐桌',
  rawText: '老爸给奶奶手做的桌子，桌面有岁月痕迹。',
  sellingPoints: ['实木手工', '老料新做', '一口价含运费'],
  brief: { selling: '实木手工，老料新做', usage: 'main' },
};
const analysis = visual.analyzeMock(p, p.brief);
p.visualSpec = visual.buildSpec(analysis, 1);

const prompt = imagePrompt(p, { template: 'main', lang: 'en', w: 1242, h: 1660, pf: { name: 'Shopee' }, ask: '白底主图，标题写 STAY A WHILE' });
console.log('--- prompt ---\n' + prompt + '\n--- 长度 ' + prompt.length + ' 字符 ---');
