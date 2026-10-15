import { NextResponse } from 'next/server';
import { accountsMode, listUsers } from '@/lib/account-service';
import { requireAdmin } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function GET(req: Request) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ users: listUsers() });
}
