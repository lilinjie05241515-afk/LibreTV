import { NextResponse } from 'next/server';
import { accountsMode, createInvites, listInvites } from '@/lib/account-service';
import { accountFailure, readBody, rejectCrossOrigin, requireAdmin, stringField } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function GET(req: Request) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ invites: listInvites() });
}
export async function POST(req: Request) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await readBody(req);
    const codes = createInvites(admin.id, Number(body.count ?? 1), Number(body.days ?? 7), stringField(body, 'note'));
    return NextResponse.json({ codes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return accountFailure(error); }
}
