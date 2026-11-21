import crypto from 'node:crypto';
import { cookies } from 'next/headers';

export const AUTH_COOKIE_NAME = 'jianzhang_auth';

export function isPinEnabled(): boolean {
  return Boolean(process.env.APP_PIN && process.env.APP_PIN.trim().length > 0);
}

function getSecret(): string {
  return process.env.APP_AUTH_SECRET || process.env.APP_PIN || 'jianzhang-local-secret';
}

export function createAuthToken(): string {
  const pin = process.env.APP_PIN || '';
  return crypto.createHmac('sha256', getSecret()).update(`pin:${pin}`).digest('hex');
}

export async function isAuthenticated(): Promise<boolean> {
  if (!isPinEnabled()) return true;
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return false;
  const expected = createAuthToken();
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export function verifyPin(inputPin: string): boolean {
  const expected = (process.env.APP_PIN || '').trim();
  if (!expected) return true;
  const a = Buffer.from(inputPin.trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
