import { NextResponse } from 'next/server';
import { ACCOUNT_COOKIE, AccountError, type AccountUser, sessionUser } from './account-service';

const attempts = new Map<string, { count: number; resetAt: number }>();
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
}, 60_000);
cleanup.unref();

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 8192) throw new AccountError('请求内容过长');
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch { /* fall through */ }
  throw new AccountError('请求格式错误');
}
export function stringField(body: Record<string, unknown>, key: string): string {
  return typeof body[key] === 'string' ? body[key] as string : '';
}
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const expected = process.env.PUBLIC_ORIGIN || new URL(req.url).origin;
  return !!origin && origin === expected;
}
export function sourceIp(req: Request): string {
  // 仅在反向代理后使用，并让 Caddy 覆盖客户端传入的 X-Forwarded-For。
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
export function allowAttempt(key: string, max = 10): boolean {
  const now = Date.now();
  const old = attempts.get(key);
  if (!old || old.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  if (old.count >= max) return false;
  old.count += 1;
  return true;
}
export function accountFailure(error: unknown): NextResponse {
  if (error instanceof AccountError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('Account request failed', error);
  return NextResponse.json({ error: '服务器暂时无法处理请求' }, { status: 500 });
}
export function rejectCrossOrigin(req: Request): NextResponse | null {
  return sameOrigin(req) ? null : NextResponse.json({ error: '请求来源无效' }, { status: 403 });
}
export function requireAdmin(req: Request): AccountUser | NextResponse {
  const user = sessionUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: '没有管理员权限' }, { status: 403 });
  return user;
}
export function setAccountCookie(res: NextResponse, token: string, expiresAt: number): void {
  res.cookies.set(ACCOUNT_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/',
    maxAge: Math.floor((expiresAt - Date.now()) / 1000),
  });
  // A successful account login invalidates the old browser-side shared-password cookie.
  res.cookies.set('ltv_session', '', { httpOnly: true, secure: true, maxAge: 0, path: '/' });
}
export function clearAccountCookie(res: NextResponse): void {
  res.cookies.set(ACCOUNT_COOKIE, '', { httpOnly: true, secure: true, maxAge: 0, path: '/' });
  res.cookies.set('ltv_session', '', { httpOnly: true, secure: true, maxAge: 0, path: '/' });
}
