import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './categories';
import { pad2 } from './format';
import type { TxType } from './types';

export interface ParsedImportItem {
  type: TxType;
  amountCents: number;
  categoryId: string;
  date: string;
  note: string;
}

export interface CsvParseResult {
  items: ParsedImportItem[];
  skippedRows: number;
  errors: string[];
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const clean = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  return rows;
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // 2026-11-21 or 2026/11/21 or 2026.11.21 (with optional time)
  const m1 = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m1) {
    const y = Number(m1[1]);
    const mo = Number(m1[2]);
    const d = Number(m1[3]);
    if (y >= 1949 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(mo)}-${pad2(d)}`;
    }
  }

  // 2026年11月21日
  const m2 = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?/);
  if (m2) {
    const y = Number(m2[1]);
    const mo = Number(m2[2]);
    const d = Number(m2[3]);
    if (y >= 1949 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(mo)}-${pad2(d)}`;
    }
  }
  return null;
}

function parseType(raw: string): TxType | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (s.includes('支') || s === 'expense' || s === 'out') return 'expense';
  if (s.includes('收') || s === 'income' || s === 'in') return 'income';
  return null;
}

function parseAmountCents(raw: string): number {
  const cleaned = raw.replace(/[¥￥,\s+]/g, '').replace(/元$/, '');
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(Math.abs(n) * 100);
}

function matchCategory(type: TxType, purposeRaw: string, noteRaw: string): { categoryId: string; note: string } {
  const pool = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  let purpose = purposeRaw.trim();
  let note = noteRaw.trim();

  // Support legacy "用途 - 备注" combined format when note column is empty
  if (!note && purpose.includes(' - ')) {
    const [head, ...rest] = purpose.split(' - ');
    purpose = head.trim();
    note = rest.join(' - ').trim();
  }

  const exact = pool.find((c) => c.name === purpose || c.id === purpose);
  if (exact) return { categoryId: exact.id, note };

  const partial = pool.find((c) => purpose && (purpose.includes(c.name) || c.name.includes(purpose)));
  if (partial) {
    const mergedNote = note ? note : purpose !== partial.name ? purpose : '';
    return { categoryId: partial.id, note: mergedNote };
  }

  const fallback = type === 'expense' ? 'c_riyong' : 'i_shouru';
  const mergedNote = purpose ? (note ? `${purpose} · ${note}` : purpose) : note;
  return { categoryId: fallback, note: mergedNote };
}

export async function readCsvFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('\uFFFD')) return utf8;
  try {
    return new TextDecoder('gb18030').decode(buf);
  } catch {
    return utf8;
  }
}

export function parseBookkeepingCsv(text: string): CsvParseResult {
  const matrix = parseCsvMatrix(text);
  if (matrix.length === 0) {
    return { items: [], skippedRows: 0, errors: ['文件内容为空'] };
  }

  // Detect header row
  const header = matrix[0].map((h) => h.toLowerCase());
  const findCol = (keywords: string[]) =>
    header.findIndex((h) => keywords.some((kw) => h.includes(kw)));

  const hasHeader =
    findCol(['时间', '日期', 'date']) >= 0 ||
    findCol(['金额', 'amount']) >= 0 ||
    findCol(['用途', '分类', 'category']) >= 0;

  const dateCol = hasHeader ? findCol(['时间', '日期', 'date']) : 0;
  const typeCol = hasHeader ? findCol(['支出', '收入', '收支', '类型', 'type']) : 1;
  const purposeCol = hasHeader ? findCol(['用途', '分类', '类别', 'category']) : 2;
  const amountCol = hasHeader ? findCol(['金额', 'amount']) : 3;
  const noteCol = hasHeader ? findCol(['备注', '说明', 'note']) : 4;

  const startRow = hasHeader ? 1 : 0;
  const items: ParsedImportItem[] = [];
  const errors: string[] = [];
  let skippedRows = 0;

  for (let i = startRow; i < matrix.length; i++) {
    const cols = matrix[i];
    const rawDate = dateCol >= 0 ? cols[dateCol] || '' : '';
    const rawType = typeCol >= 0 ? cols[typeCol] || '' : '';
    const rawPurpose = purposeCol >= 0 ? cols[purposeCol] || '' : '';
    const rawAmount = amountCol >= 0 ? cols[amountCol] || '' : '';
    const rawNote = noteCol >= 0 ? cols[noteCol] || '' : '';

    const date = normalizeDate(rawDate);
    if (!date) {
      skippedRows++;
      if (errors.length < 5) errors.push(`第 ${i + 1} 行：时间格式无法识别 (${rawDate || '空'})`);
      continue;
    }

    const amountCents = parseAmountCents(rawAmount);
    if (amountCents <= 0) {
      skippedRows++;
      if (errors.length < 5) errors.push(`第 ${i + 1} 行：金额无效 (${rawAmount || '空'})`);
      continue;
    }

    let type = parseType(rawType);
    if (!type) {
      // Infer from sign if type column missing
      type = rawAmount.trim().startsWith('+') ? 'income' : 'expense';
    }

    const { categoryId, note } = matchCategory(type, rawPurpose, rawNote);
    items.push({
      type,
      amountCents,
      categoryId,
      date,
      note: note.slice(0, 200),
    });
  }

  return { items, skippedRows, errors };
}

export function downloadCsvTemplate(): void {
  const sample = [
    ['时间', '支出/收入', '用途', '金额', '备注'],
    ['2026-11-21', '支出', '蔬菜', '5.00', '早市青菜'],
    ['2026-11-21', '支出', '餐饮', '28.00', '午饭牛肉面'],
    ['2026-11-21', '收入', '报销', '150.00', '出差报销'],
  ];
  const csv = '\uFEFF' + sample.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '简账_导入模板.csv';
  a.click();
  URL.revokeObjectURL(url);
}
