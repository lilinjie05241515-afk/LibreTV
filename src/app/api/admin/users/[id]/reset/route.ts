import { NextResponse } from 'next/server';
import { accountsMode, createPasswordReset } from '@/lib/account-service';
import { accountFailure, rejectCrossOrigin, requireAdmin } from '@/lib/account-http';

export const runtime = 'nodejs';
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!accountsMode()) return NextResponse.json({ error: '未启用账号模式' }, { status: 404 });
  const originError = rejectCrossOrigin(req);
  if (originError) return originError;
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await context.params;
    const token = createPasswordReset(admin.id, id);
    return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return accountFailure(error); }
}
