import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { createTransaction, getSnapshot } from '@/lib/storage';
import type { TxType } from '@/lib/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  try {
    const snapshot = await getSnapshot();
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '读取数据失败' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      type?: TxType;
      amountCents?: number;
      categoryId?: string;
      date?: string;
      note?: string;
    };

    const type = body.type;
    const amountCents = Math.round(Number(body.amountCents));
    const categoryId = String(body.categoryId || '').trim();
    const date = String(body.date || '').trim();
    const note = String(body.note || '').trim().slice(0, 200);

    if (type !== 'expense' && type !== 'income') {
      return NextResponse.json({ error: '收支类型无效' }, { status: 400 });
    }
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: '金额必须大于 0' }, { status: 400 });
    }
    if (!categoryId) {
      return NextResponse.json({ error: '请选择分类' }, { status: 400 });
    }
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: '日期格式应为 YYYY-MM-DD' }, { status: 400 });
    }

    const created = await createTransaction({ type, amountCents, categoryId, date, note });
    return NextResponse.json({ transaction: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '保存失败' },
      { status: 500 },
    );
  }
}
