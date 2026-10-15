import { NextResponse } from 'next/server';
import { accountsMode, setUserStatus } from '@/lib/account-service';
import { accountFailure, readBody, rejectCrossOrigin, requireAdmin } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const body = await readBody(req);
    if (body.status !== 'active' && body.status !== 'disabled') return NextResponse.json({ error: '状态无效' }, { status: 400 });
    const { id } = await context.params;
    setUserStatus(admin.id, id, body.status);
    return NextResponse.json({ success: true });
  } catch (error) { return accountFailure(error); }
}
