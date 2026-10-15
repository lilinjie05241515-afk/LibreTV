import { NextResponse } from 'next/server';
import { accountsMode, revokeSession } from '@/lib/account-service';
import { clearAccountCookie, rejectCrossOrigin } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function POST(req: Request) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  revokeSession(req.headers.get('cookie'));
  const res = NextResponse.json({ success: true });
  clearAccountCookie(res);
  return res;
}
