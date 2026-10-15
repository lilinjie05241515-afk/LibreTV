import { NextResponse } from 'next/server';
import { accountsMode, sessionUser } from '@/lib/account-service';

export const runtime = 'nodejs';
export async function GET(req: Request) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const user = sessionUser(req.headers.get('cookie'));
  return user ? NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: '未登录' }, { status: 401 });
}
