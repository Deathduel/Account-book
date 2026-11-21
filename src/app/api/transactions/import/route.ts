import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { importTransactions, type CreateTxInput } from '@/lib/storage';
import type { TxType } from '@/lib/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      items?: Array<{
        type?: TxType;
        amountCents?: number;
        categoryId?: string;
        date?: string;
        note?: string;
      }>;
      skipDuplicates?: boolean;
    };

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json({ error: '没有可导入的数据' }, { status: 400 });
    }
    if (body.items.length > 5000) {
      return NextResponse.json({ error: '单次最多导入 5000 条记录' }, { status: 400 });
    }

    const validItems: CreateTxInput[] = [];
    for (const raw of body.items) {
      const type = raw.type;
      const amountCents = Math.round(Number(raw.amountCents));
      const categoryId = String(raw.categoryId || '').trim();
      const date = String(raw.date || '').trim();
      const note = String(raw.note || '').trim().slice(0, 200);
      if (
        (type === 'expense' || type === 'income') &&
        Number.isFinite(amountCents) &&
        amountCents > 0 &&
        categoryId &&
        DATE_RE.test(date)
      ) {
        validItems.push({ type, amountCents, categoryId, date, note });
      }
    }

    if (validItems.length === 0) {
      return NextResponse.json({ error: '未解析到有效账单记录' }, { status: 400 });
    }

    const result = await importTransactions(validItems, body.skipDuplicates !== false);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '导入失败' },
      { status: 500 },
    );
  }
}
