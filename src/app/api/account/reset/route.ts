import { NextResponse } from 'next/server';
import { accountsMode, resetPassword } from '@/lib/account-service';
import { accountFailure, allowAttempt, readBody, rejectCrossOrigin, sourceIp, stringField } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  if (!allowAttempt(`reset:${sourceIp(req)}`, 5)) return NextResponse.json({ error: '尝试次数过多' }, { status: 429 });
  try {
    const body = await readBody(req);
    await resetPassword(stringField(body, 'token'), stringField(body, 'password'));
    return NextResponse.json({ success: true });
  } catch (error) { return accountFailure(error); }
}
