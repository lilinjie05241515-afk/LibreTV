import { NextResponse } from 'next/server';
import { accountsMode, authenticate, createSession } from '@/lib/account-service';
import { accountFailure, allowAttempt, readBody, rejectCrossOrigin, setAccountCookie, sourceIp, stringField } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  try {
    const body = await readBody(req);
    const name = stringField(body, 'username').trim().toLowerCase();
    if (!allowAttempt(`login-ip:${sourceIp(req)}`) || !allowAttempt(`login-name:${name}`)) return NextResponse.json({ error: '尝试次数过多，请稍后重试' }, { status: 429 });
    const user = await authenticate(name, stringField(body, 'password'));
    const { token, expiresAt } = createSession(user.id);
    const res = NextResponse.json({ user });
    setAccountCookie(res, token, expiresAt);
    return res;
  } catch (error) { return accountFailure(error); }
}
