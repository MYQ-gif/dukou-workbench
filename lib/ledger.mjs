// 记账（卓负责）——只做加减法和汇总，别在这里塞业务复杂度
import { newId, nowISO } from './jobs.mjs';

export const TYPES = ['income', 'cost', 'fee', 'shipping', 'ads', 'refund'];

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
  const entry = {
    id: newId('l'),
    productId: input.productId || null,
    type,
    amount,
    currency: input.currency || 'CNY',
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

/** 收入 - 支出；退款算负数收入 */
export function summary(db, { productId } = {}) {
  const items = list(db, { productId, limit: Number.MAX_SAFE_INTEGER });
  const agg = { income: 0, cost: 0, fee: 0, shipping: 0, ads: 0, refund: 0 };
  for (const e of items) agg[e.type] = (agg[e.type] || 0) + e.amount;
  const income = agg.income - agg.refund;
  const cost = agg.cost + agg.fee + agg.shipping + agg.ads;
  const round = (n) => Math.round(n * 100) / 100;
  return {
    income: round(income),
    cost: round(cost),
    profit: round(income - cost),
    currency: items[0]?.currency || 'CNY',
  };
}
