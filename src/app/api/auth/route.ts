import { NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME, createAuthToken, isAuthenticated, isPinEnabled, verifyPin } from '@/lib/auth';

export async function GET() {
  const authed = await isAuthenticated();
  return NextResponse.json({
    pinEnabled: isPinEnabled(),
    authenticated: authed,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { pin?: string };
    const pin = String(body.pin ?? '');
    if (!verifyPin(pin)) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true });
    if (isPinEnabled()) {
      res.cookies.set(AUTH_COOKIE_NAME, createAuthToken(), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
    }
    return res;
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}
