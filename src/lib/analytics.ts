import { getCategory } from './categories';
import { addDays, daysInMonth, getMonthPrefix, pad2, type WeekOption } from './format';
import type { Category, Transaction, TxType } from './types';
import type { ChartPoint } from '@/components/SharkLineChart';

export interface RankItem {
  cat: Category;
  cents: number;
  pct: number;
}

export interface ChartSummary {
  points: ChartPoint[];
  total: number;
  avg: number;
  rankList: RankItem[];
}

export interface MonthRow {
  month: number;
  income: number;
  expense: number;
}

export interface YearRow {
  year: number;
  income: number;
  expense: number;
}

export function getMonthTotals(
  transactions: Transaction[],
  year: number,
  month: number,
  skipInvestment = false,
): { exp: number; inc: number; bal: number } {
  const prefix = getMonthPrefix(year, month);
  let exp = 0;
  let inc = 0;
  for (const tx of transactions) {
    if (!tx.date.startsWith(prefix)) continue;
    if (skipInvestment && getCategory(tx.categoryId).isInvestment) continue;
    if (tx.type === 'expense') exp += tx.amountCents;
    else inc += tx.amountCents;
  }
  return { exp, inc, bal: inc - exp };
}

export function getYearMonthRows(
  transactions: Transaction[],
  year: number,
  skipInvestment = false,
): MonthRow[] {
  const map = new Map<number, { income: number; expense: number }>();
  const prefix = `${year}-`;
  for (const tx of transactions) {
    if (!tx.date.startsWith(prefix)) continue;
    if (skipInvestment && getCategory(tx.categoryId).isInvestment) continue;
    const m = Number(tx.date.slice(5, 7));
    if (!m || m < 1 || m > 12) continue;
    const cur = map.get(m) ?? { income: 0, expense: 0 };
    if (tx.type === 'income') cur.income += tx.amountCents;
    else cur.expense += tx.amountCents;
    map.set(m, cur);
  }
  return Array.from(map.entries())
    .map(([month, v]) => ({ month, income: v.income, expense: v.expense }))
    .sort((a, b) => b.month - a.month);
}

export function getAllYearRows(
  transactions: Transaction[],
  skipInvestment = false,
): YearRow[] {
  const map = new Map<number, { income: number; expense: number }>();
  for (const tx of transactions) {
    if (skipInvestment && getCategory(tx.categoryId).isInvestment) continue;
    const y = Number(tx.date.slice(0, 4));
    if (!y) continue;
    const cur = map.get(y) ?? { income: 0, expense: 0 };
    if (tx.type === 'income') cur.income += tx.amountCents;
    else cur.expense += tx.amountCents;
    map.set(y, cur);
  }
  return Array.from(map.entries())
    .map(([year, v]) => ({ year, income: v.income, expense: v.expense }))
    .sort((a, b) => b.year - a.year);
}

export function buildRealChartData(params: {
  transactions: Transaction[];
  type: TxType;
  scope: 'week' | 'month' | 'year';
  weekOption: WeekOption;
  year: number;
  month: number;
  todayStr: string;
  skipInvestment?: boolean;
}): ChartSummary {
  const { transactions, type, scope, weekOption, year, month, todayStr, skipInvestment = false } =
    params;

  const filtered = transactions.filter(
    (t) => t.type === type && (!skipInvestment || !getCategory(t.categoryId).isInvestment),
  );

  const byCat = new Map<string, number>();
  let points: ChartPoint[] = [];
  let total = 0;
  let avg = 0;

  if (scope === 'week') {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekOption.start, i));
    const daySet = new Set(days);
    points = days.map((d) => {
      const sum = filtered.filter((t) => t.date === d).reduce((s, t) => s + t.amountCents, 0);
      return { label: d.slice(5), value: sum, showTick: true };
    });
    const inWeek = filtered.filter((t) => daySet.has(t.date));
    total = inWeek.reduce((s, t) => s + t.amountCents, 0);
    avg = Math.round(total / 7);
    for (const tx of inWeek) {
      byCat.set(tx.categoryId, (byCat.get(tx.categoryId) ?? 0) + tx.amountCents);
    }
  } else if (scope === 'month') {
    const totalDays = daysInMonth(year, month);
    const prefix = getMonthPrefix(year, month);
    const inMonth = filtered.filter((t) => t.date.startsWith(prefix));
    const daySums = new Map<string, number>();
    for (const tx of inMonth) {
      daySums.set(tx.date, (daySums.get(tx.date) ?? 0) + tx.amountCents);
      byCat.set(tx.categoryId, (byCat.get(tx.categoryId) ?? 0) + tx.amountCents);
    }
    for (let d = 1; d <= totalDays; d++) {
      const ds = `${prefix}-${pad2(d)}`;
      points.push({
        label: pad2(d),
        value: daySums.get(ds) ?? 0,
        showTick: [1, 5, 10, 15, 20, 25, totalDays].includes(d),
      });
    }
    total = inMonth.reduce((s, t) => s + t.amountCents, 0);
    const isCurrentMonth = todayStr.startsWith(prefix);
    const denom = isCurrentMonth ? Math.max(1, Number(todayStr.slice(8, 10))) : totalDays;
    avg = Math.round(total / denom);
  } else {
    const prefix = `${year}-`;
    const inYear = filtered.filter((t) => t.date.startsWith(prefix));
    const monthSums = new Map<number, number>();
    for (const tx of inYear) {
      const m = Number(tx.date.slice(5, 7));
      monthSums.set(m, (monthSums.get(m) ?? 0) + tx.amountCents);
      byCat.set(tx.categoryId, (byCat.get(tx.categoryId) ?? 0) + tx.amountCents);
    }
    for (let m = 1; m <= 12; m++) {
      points.push({ label: `${m}月`, value: monthSums.get(m) ?? 0, showTick: true });
    }
    total = inYear.reduce((s, t) => s + t.amountCents, 0);
    const isCurrentYear = Number(todayStr.slice(0, 4)) === year;
    const denom = isCurrentYear ? Math.max(1, Number(todayStr.slice(5, 7))) : 12;
    avg = Math.round(total / denom);
  }

  const rankList: RankItem[] = Array.from(byCat.entries())
    .map(([cid, cents]) => ({
      cat: getCategory(cid),
      cents,
      pct: total > 0 ? (cents / total) * 100 : 0,
    }))
    .sort((a, b) => b.cents - a.cents);

  return { points, total, avg, rankList };
}
