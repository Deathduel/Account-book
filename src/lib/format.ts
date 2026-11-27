import { getCategory } from './categories';
import type { Transaction } from './types';

export const MIN_YEAR = 1949;
export const MAX_YEAR = 2100;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function addDays(dateStr: string, offset: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getMonthPrefix(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function getWeekday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const map = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return map[d.getDay()] ?? '';
}

export function fmtNum(cents: number, force2 = false): string {
  const yuan = cents / 100;
  if (force2) return yuan.toFixed(2);
  if (Number.isInteger(yuan)) return String(yuan);
  return yuan.toFixed(2).replace(/0$/, '');
}

export function splitMoneyParts(cents: number): { sign: string; intPart: string; decPart: string } {
  const s = (Math.abs(cents) / 100).toFixed(2);
  const [intPart, decPart] = s.split('.');
  return { sign: cents < 0 ? '-' : '', intPart, decPart };
}

export function evalCalcExpr(expr: string): number {
  if (!expr) return 0;
  const cleaned = expr.replace(/[+\-.]+$/, '');
  if (!cleaned) return 0;
  const tokens = cleaned.match(/[+-]?[^+-]+/g);
  if (!tokens) return 0;
  let sum = 0;
  for (const t of tokens) {
    const n = parseFloat(t);
    if (!Number.isNaN(n)) sum += n;
  }
  return Math.max(0, Math.round(sum * 100));
}

export interface WeekOption {
  label: string;
  start: string; // Monday YYYY-MM-DD
  end: string;   // Sunday YYYY-MM-DD
}

function getIsoWeekNumber(d: Date): number {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function getRecentWeeks(todayStr: string, count = 6): WeekOption[] {
  const d = new Date(`${todayStr}T00:00:00`);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const thisMonday = addDays(todayStr, diffToMonday);

  const list: WeekOption[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = addDays(thisMonday, -i * 7);
    const end = addDays(start, 6);
    const label =
      i === 0
        ? '本周'
        : i === 1
        ? '上周'
        : `${getIsoWeekNumber(new Date(`${start}T00:00:00`))}周`;
    list.push({ label, start, end });
  }
  return list;
}

export function normalizeDateRange(
  startDate: string,
  endDate: string,
): { start: string; end: string } {
  const s = startDate.trim();
  const e = endDate.trim();
  if (s && e && s > e) {
    return { start: e, end: s };
  }
  return { start: s, end: e };
}

export function filterTransactionsByDateRange(
  transactions: Transaction[],
  startDate: string,
  endDate: string,
): Transaction[] {
  const { start, end } = normalizeDateRange(startDate, endDate);
  return transactions
    .filter((t) => {
      if (start && t.date < start) return false;
      if (end && t.date > end) return false;
      return true;
    })
    .sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)));
}

export function formatPurpose(tx: Transaction): string {
  return getCategory(tx.categoryId).name;
}

export function buildCsvContent(transactions: Transaction[]): string {
  const rows: string[][] = [['时间', '支出/收入', '用途', '金额', '备注']];
  for (const tx of transactions) {
    const purpose = getCategory(tx.categoryId).name.replace(/"/g, '""');
    const note = (tx.note || '').replace(/"/g, '""');
    rows.push([
      tx.date,
      tx.type === 'expense' ? '支出' : '收入',
      `"${purpose}"`,
      (tx.amountCents / 100).toFixed(2),
      `"${note}"`,
    ]);
  }
  return '\uFEFF' + rows.map((r) => r.join(',')).join('\n');
}

export function downloadCsv(transactions: Transaction[], filename: string): void {
  const csv = buildCsvContent(transactions);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
