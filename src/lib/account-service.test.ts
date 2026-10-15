import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeAccountDb } from './account-db';
import { ACCOUNT_COOKIE, authenticate, bootstrapAdmin, createInvites, createPasswordReset, createSession, hasAdmin, listInvites, listUsers, registerUser, resetPassword, revokeInvite, revokeSession, sessionUser, setUserStatus } from './account-service';
import { guardRequest } from './api-guard';
import { POST as legacyLogin } from '@/app/api/auth/route';
import { POST as registerRoute } from '@/app/api/account/register/route';
import { GET as adminInvitesRoute } from '@/app/api/admin/invites/route';
import { GET as statusRoute } from '@/app/api/status/route';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'libretv-accounts-'));
const bootstrap = 'a'.repeat(64);
let adminId = '';
let aliceId = '';

beforeAll(() => {
  process.env.AUTH_MODE = 'accounts';
  process.env.LIBRETV_DB_PATH = path.join(dir, 'accounts.sqlite');
  process.env.BOOTSTRAP_TOKEN = bootstrap;
  process.env.BOOTSTRAP_TOKEN_EXPIRES_AT = String(Date.now() + 30 * 60_000);
  process.env.PASSWORD = 'old-shared-password';
});
afterAll(() => {
  closeAccountDb();
  delete process.env.AUTH_MODE;
  delete process.env.LIBRETV_DB_PATH;
  delete process.env.BOOTSTRAP_TOKEN;
  delete process.env.BOOTSTRAP_TOKEN_EXPIRES_AT;
  delete process.env.PASSWORD;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('invite-only account lifecycle', () => {
  it('requires one-time bootstrap token and keeps one administrator', async () => {
    expect(hasAdmin()).toBe(false);
    await expect(bootstrapAdmin('Owner', 'owner-password-123', 'wrong')).rejects.toThrow('初始化凭证无效或已过期');
    process.env.BOOTSTRAP_TOKEN_EXPIRES_AT = String(Date.now() - 1);
    await expect(bootstrapAdmin('Owner', 'owner-password-123', bootstrap)).rejects.toThrow('初始化凭证无效或已过期');
    process.env.BOOTSTRAP_TOKEN_EXPIRES_AT = String(Date.now() + 30 * 60_000);
    const admin = await bootstrapAdmin('Owner', 'owner-password-123', bootstrap);
    adminId = admin.id;
    expect(admin.username).toBe('owner');
    expect(hasAdmin()).toBe(true);
    await expect(bootstrapAdmin('Another', 'another-password-123', bootstrap)).rejects.toThrow('管理员已初始化');
    expect(() => setUserStatus(adminId, adminId, 'disabled')).toThrow('必须保留一名启用的管理员');
  });

  it('redeems an invite exactly once, including concurrent submissions', async () => {
    const [invite] = createInvites(adminId, 1, 7, '朋友');
    expect(invite.replace(/-/g, '')).toMatch(/^[A-F0-9]{32}$/);
    const results = await Promise.allSettled([
      registerUser('Alice_1', 'alice-password-123', invite),
      registerUser('Bob_1', 'bob-password-12345', invite),
    ]);
    const successful = results.filter((r) => r.status === 'fulfilled');
    expect(successful).toHaveLength(1);
    const winner = (successful[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof registerUser>>>).value;
    aliceId = winner.id;
    expect(listInvites()[0]).toMatchObject({ used_by: winner.username });
    await expect(registerUser('third', 'third-password-123', invite)).rejects.toThrow('邀请码无效或已失效');
    const [revokable] = createInvites(adminId, 1, 1, '撤销');
    const unused = (listInvites() as Array<{ id: string; note: string }>).find((entry) => entry.note === '撤销')!;
    revokeInvite(adminId, unused.id);
    await expect(registerUser('fourth', 'fourth-password-123', revokable)).rejects.toThrow('邀请码无效或已失效');
  });

  it('rejects old shared-password sessions and revokes individual sessions', async () => {
    const old = new Request('https://local.test/api/search', { headers: { cookie: 'ltv_session=any-value' } });
    expect(guardRequest(old)?.status).toBe(401);
    const legacy = await legacyLogin(new Request('https://local.test/api/auth', { method: 'POST', body: JSON.stringify({ password: 'old-shared-password' }) }));
    expect(legacy.status).toBe(410);
    const { token } = createSession(aliceId);
    const cookie = `${ACCOUNT_COOKIE}=${token}`;
    expect(sessionUser(cookie)?.id).toBe(aliceId);
    expect(guardRequest(new Request('https://local.test/api/search', { headers: { cookie } }))).toBeNull();
    revokeSession(cookie);
    expect(sessionUser(cookie)).toBeNull();
  });

  it('resets passwords once and invalidates old sessions', async () => {
    const target = listUsers().find((u) => u.id === aliceId)!;
    const initialPassword = target.username === 'alice_1' ? 'alice-password-123' : 'bob-password-12345';
    expect((await authenticate(target.username, initialPassword)).id).toBe(aliceId);
    const session = createSession(aliceId);
    const reset = createPasswordReset(adminId, aliceId);
    await resetPassword(reset, 'new-secure-password-123');
    expect(sessionUser(`${ACCOUNT_COOKIE}=${session.token}`)).toBeNull();
    await expect(resetPassword(reset, 'another-secure-pass-123')).rejects.toThrow('重置凭证无效或已过期');
    await expect(authenticate(target.username, initialPassword)).rejects.toThrow('用户名或密码错误');
    expect((await authenticate(target.username, 'new-secure-password-123')).id).toBe(aliceId);
    setUserStatus(adminId, aliceId, 'disabled');
    await expect(authenticate(target.username, 'new-secure-password-123')).rejects.toThrow('用户名或密码错误');
  });

  it('checks request origin, per-user role and live status at API boundaries', async () => {
    const [code] = createInvites(adminId, 1, 7, '接口测试');
    const url = 'https://local.test/api/account/register';
    const body = JSON.stringify({ username: 'viewer_1', password: 'viewer-password-123', invite: code });
    const crossOrigin = await registerRoute(new Request(url, { method: 'POST', headers: { origin: 'https://evil.test' }, body }));
    expect(crossOrigin.status).toBe(403);
    const registered = await registerRoute(new Request(url, { method: 'POST', headers: { origin: 'https://local.test' }, body }));
    expect(registered.status).toBe(200);
    const cookie = registered.headers.get('set-cookie')?.match(/__Host-ltv_account=([^;]+)/)?.[1];
    expect(cookie).toBeTruthy();
    const viewerCookie = `${ACCOUNT_COOKIE}=${cookie}`;
    const status = await statusRoute(new Request('https://local.test/api/status', { headers: { cookie: viewerCookie } }));
    expect((await status.json()).user).toMatchObject({ username: 'viewer_1', role: 'user' });
    const forbidden = await adminInvitesRoute(new Request('https://local.test/api/admin/invites', { headers: { cookie: viewerCookie } }));
    expect(forbidden.status).toBe(403);
    const noCookie = await adminInvitesRoute(new Request('https://local.test/api/admin/invites'));
    expect(noCookie.status).toBe(401);
    const allowed = await adminInvitesRoute(new Request('https://local.test/api/admin/invites', { headers: { cookie: `${ACCOUNT_COOKIE}=${createSession(adminId).token}` } }));
    expect(allowed.status).toBe(200);
  });
});
