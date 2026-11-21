import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getSnapshot, saveBudget } from '@/lib/storage';
import type { BudgetSettings, RecurringTemplate } from '@/lib/types';

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
    const body = (await req.json()) as Partial<BudgetSettings>;
    const payload: BudgetSettings = {
      monthlyCents: Math.max(0, Math.round(Number(body.monthlyCents ?? 0))),
      monthlyOverrides: body.monthlyOverrides && typeof body.monthlyOverrides === 'object'
        ? body.monthlyOverrides
        : {},
      categories: body.categories && typeof body.categories === 'object' ? body.categories : {},
      recurringTemplates: Array.isArray(body.recurringTemplates)
        ? (body.recurringTemplates as RecurringTemplate[])
        : [],
    };
    const saved = await saveBudget(payload);
    return NextResponse.json({ budget: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '保存预算失败' },
      { status: 500 },
    );
  }
}
