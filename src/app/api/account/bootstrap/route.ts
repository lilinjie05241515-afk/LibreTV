import { NextResponse } from 'next/server';
import { accountsMode, bootstrapAdmin, createSession, hasAdmin } from '@/lib/account-service';
import { accountFailure, allowAttempt, readBody, rejectCrossOrigin, setAccountCookie, sourceIp, stringField } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  if (hasAdmin()) return NextResponse.json({ error: '管理员已初始化' }, { status: 409 });
  if (!allowAttempt(`bootstrap:${sourceIp(req)}`, 5)) return NextResponse.json({ error: '尝试次数过多' }, { status: 429 });
  try {
    const body = await readBody(req);
    const user = await bootstrapAdmin(stringField(body, 'username'), stringField(body, 'password'), stringField(body, 'token'));
    const { token, expiresAt } = createSession(user.id);
    const res = NextResponse.json({ user });
    setAccountCookie(res, token, expiresAt);
    return res;
  } catch (error) { return accountFailure(error); }
}
