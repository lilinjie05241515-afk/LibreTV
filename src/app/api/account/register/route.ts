import { NextResponse } from 'next/server';
import { accountsMode, createSession, hasAdmin, registerUser } from '@/lib/account-service';
import { accountFailure, allowAttempt, readBody, rejectCrossOrigin, setAccountCookie, sourceIp, stringField } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  if (!hasAdmin()) return NextResponse.json({ error: '站点尚未初始化' }, { status: 503 });
  if (!allowAttempt(`register:${sourceIp(req)}`, 10)) return NextResponse.json({ error: '尝试次数过多' }, { status: 429 });
  try {
    const body = await readBody(req);
    const name = stringField(body, 'username').trim().toLowerCase();
    if (!allowAttempt(`register-name:${name}`, 10)) return NextResponse.json({ error: '尝试次数过多' }, { status: 429 });
    const user = await registerUser(stringField(body, 'username'), stringField(body, 'password'), stringField(body, 'invite'));
    const { token, expiresAt } = createSession(user.id);
    const res = NextResponse.json({ user });
    setAccountCookie(res, token, expiresAt);
    return res;
  } catch (error) { return accountFailure(error); }
}
