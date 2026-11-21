import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { deleteTransaction, updateTransaction } from '@/lib/storage';
import type { TxType } from '@/lib/types';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: '记录 ID 无效' }, { status: 400 });
  }

  try {
    const body = (await req.json()) as {
      type?: TxType;
      amountCents?: number;
      categoryId?: string;
      date?: string;
      note?: string;
    };
    const patch: {
      type?: TxType;
      amountCents?: number;
      categoryId?: string;
      date?: string;
      note?: string;
    } = {};

    if (body.type !== undefined) {
      if (body.type !== 'expense' && body.type !== 'income') {
        return NextResponse.json({ error: '类型无效' }, { status: 400 });
      }
      patch.type = body.type;
    }
    if (body.amountCents !== undefined) {
      const cents = Math.round(Number(body.amountCents));
      if (!Number.isFinite(cents) || cents <= 0) {
        return NextResponse.json({ error: '金额必须大于 0' }, { status: 400 });
      }
      patch.amountCents = cents;
    }
    if (body.categoryId !== undefined) {
      patch.categoryId = String(body.categoryId).trim();
    }
    if (body.date !== undefined) {
      if (!DATE_RE.test(body.date)) {
        return NextResponse.json({ error: '日期格式无效' }, { status: 400 });
      }
      patch.date = body.date;
    }
    if (body.note !== undefined) {
      patch.note = String(body.note).trim().slice(0, 200);
    }

    const updated = await updateTransaction(id, patch);
    if (!updated) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }
    return NextResponse.json({ transaction: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '修改失败' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: '记录 ID 无效' }, { status: 400 });
  }
  try {
    const ok = await deleteTransaction(id);
    if (!ok) {
      return NextResponse.json({ error: '记录不存在' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '删除失败' },
      { status: 500 },
    );
  }
}
