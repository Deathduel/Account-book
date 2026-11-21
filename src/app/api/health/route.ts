import { NextResponse } from 'next/server';
import { pingStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await pingStorage();
    return NextResponse.json(
      { ok: true, ...result, timestamp: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Health check failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
