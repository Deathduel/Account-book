import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getSnapshot, saveBudget } from '@/lib/storage';

export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  try {
    const { budget } = await getSnapshot();
    return NextResponse.json({ budget });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '读取预算失败' },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      monthlyCents?: number;
      categories?: Record<string, number>;
    };
    const monthlyCents = Math.max(0, Math.round(Number(body.monthlyCents ?? 0)));
    const categories: Record<string, number> = {};
    if (body.categories && typeof body.categories === 'object') {
      for (const [k, v] of Object.entries(body.categories)) {
        const n = Math.round(Number(v));
        if (Number.isFinite(n) && n > 0) categories[k] = n;
      }
    }
    const saved = await saveBudget({ monthlyCents, categories });
    return NextResponse.json({ budget: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '保存预算失败' },
      { status: 500 },
    );
  }
}
