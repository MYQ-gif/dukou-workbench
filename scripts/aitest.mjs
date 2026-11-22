// 真模型冒烟：填好 .env 后跑 node scripts/aitest.mjs
// 只做「能通」和「多久」两件事，不落库、不动 data/。
import * as providers from '../lib/providers.mjs';

const st = providers.status();
console.log('模式：', st.mock ? 'mock（AI_MOCK 不是 0）' : st.mode);
for (const c of st.caps) {
  console.log(` ${c.name.padEnd(6)} ${c.configured ? '已配置' : '缺 ' + c.missing.join(' / ')} ${c.model || ''}`);
}

if (st.mock) {
  console.log('\n当前是 mock。把 .env 里的 AI_MOCK 改成 0 再跑这个脚本。');
  process.exit(0);
}

let failed = 0;
for (const c of st.caps) {
  if (!c.configured) {
    failed++;
    continue;
  }
  try {
    const r = await providers.check(c.name.toUpperCase());
    console.log(`\n✓ ${c.name} ${r.ms}ms ${r.model || ''} ${r.sample ? JSON.stringify(r.sample) : ''}`);
  } catch (err) {
    failed++;
    console.log(`\n✗ ${c.name} 失败：${err.message}`);
  }
}

console.log(failed ? `\n${failed} 条链路没通过` : '\n三条链路都通了');
process.exit(failed ? 1 : 0);
