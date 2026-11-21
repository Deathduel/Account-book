import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { deleteTransactionsBatch } from '@/lib/storage';

export async function POST(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { ids?: unknown };
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: '请选择要删除的记录' }, { status: 400 });
    }

    const ids = body.ids
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (ids.length === 0) {
      return NextResponse.json({ error: '记录 ID 无效' }, { status: 400 });
    }

    const deletedCount = await deleteTransactionsBatch(ids);
    return NextResponse.json({ ok: true, deletedCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '批量删除失败' },
      { status: 500 },
    );
  }
}
