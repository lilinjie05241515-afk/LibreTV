import { NextResponse } from 'next/server';
import { accountsMode, revokeInvite } from '@/lib/account-service';
import { accountFailure, rejectCrossOrigin, requireAdmin } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await context.params;
    revokeInvite(admin.id, id);
    return NextResponse.json({ success: true });
  } catch (error) { return accountFailure(error); }
}
