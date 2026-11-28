// 记账——只做加减法和汇总，别在这里塞业务复杂度
//
// 阶段 1 修正：原来 summary() 把不同 currency 的 amount 直接相加，
// currency 取第一条记录的 —— 跨境项目记一笔 USD 一笔 CNY，利润就是错的。
// 现在按币种分组算，同时保留顶层 income/cost/profit/currency 字段，
// 取第一个非空币种的那一组，前端三张卡零改动继续工作。
import { newId, nowISO } from './jobs.mjs';

export const TYPES = ['income', 'cost', 'fee', 'shipping', 'ads', 'refund'];

const round = (n) => Math.round(n * 100) / 100;

export function add(db, input) {
  const type = input.type;
  if (!TYPES.includes(type)) {
    const err = new Error(`invalid type: ${type}`);
    err.code = 'BAD_REQUEST';
    throw err;
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('amount must be a positive number');
    err.code = 'BAD_REQUEST';
    throw err;
  }
  const currency = String(input.currency || 'CNY').toUpperCase().slice(0, 8);
  const entry = {
    id: newId('l'),
    productId: input.productId || null,
    type,
    amount: round(amount),
    currency,
    note: input.note || '',
    occurredAt: input.occurredAt || nowISO(),
  };
  db.ledger.push(entry);
  return entry;
}

export function list(db, { productId, limit = 50 } = {}) {
  let items = db.ledger;
  if (productId) items = items.filter((e) => e.productId === productId);
  items = items
    .slice()
    .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
    .slice(0, limit);
  return items;
}

/** 单一币种的加减：收入 - 支出；退款算负收入 */
function reduceOne(items) {
  const agg = { income: 0, cost: 0, fee: 0, shipping: 0, ads: 0, refund: 0 };
  for (const e of items) agg[e.type] = (agg[e.type] || 0) + e.amount;
  const income = agg.income - agg.refund;
  const cost = agg.cost + agg.fee + agg.shipping + agg.ads;
  return { income: round(income), cost: round(cost), profit: round(income - cost) };
}

/**
 * 汇总。返回体同时满足两类消费者：
 *   - 新：byCurrency[] 按币种分组，跨币种不再混算；
 *   - 旧：顶层 income/cost/profit/currency 保留（取第一个非空币种），现有前端不用改。
 */
export function summary(db, { productId } = {}) {
  const items = list(db, { productId, limit: Number.MAX_SAFE_INTEGER });

  const groups = new Map();
  for (const e of items) {
    const cur = String(e.currency || 'CNY').toUpperCase();
    if (!groups.has(cur)) groups.set(cur, []);
    groups.get(cur).push(e);
  }

  const byCurrency = Array.from(groups.entries())
    .map(([currency, list_]) => ({ currency, count: list_.length, ...reduceOne(list_) }))
    // 条目多的币种排前面，金额相同再按币种名稳定排序
    .sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));

  const primary = byCurrency[0] || { currency: 'CNY', income: 0, cost: 0, profit: 0 };

  return {
    income: primary.income,
    cost: primary.cost,
    profit: primary.profit,
    currency: primary.currency,
    byCurrency,
    mixed: byCurrency.length > 1, // 前端若想提示"存在多币种"可用，不用也无妨
  };
}
