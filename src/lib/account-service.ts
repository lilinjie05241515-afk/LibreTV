import crypto from 'node:crypto';
import { hash as hashPassword, verify as verifyPassword, argon2id } from 'argon2';
import { accountDb } from './account-db';

export const ACCOUNT_COOKIE = '__Host-ltv_account';
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const RESET_MS = 30 * 60 * 1000;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;
let dummyHashPromise: Promise<string> | null = null;

export interface AccountUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: number;
}

interface UserRow extends AccountUser { password_hash: string }

export class AccountError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function accountsMode(): boolean { return process.env.AUTH_MODE === 'accounts'; }
export function hasAdmin(): boolean {
  const row = accountDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND status='active'").get() as { n: number };
  return row.n > 0;
}

function digest(value: string): string { return crypto.createHash('sha256').update(value).digest('hex'); }
function normalizedName(name: string): string {
  const value = name.trim().toLowerCase();
  if (!USERNAME_RE.test(value)) throw new AccountError('用户名须为 3–24 位英文字母、数字或下划线');
  return value;
}
function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 128) throw new AccountError('密码长度须为 12–128 位');
}
function normalizedInvite(code: string): string {
  const value = code.replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(value)) throw new AccountError('邀请码无效或已失效');
  return value;
}
function audit(actor: string | null, action: string, target: string | null): void {
  accountDb().prepare('INSERT INTO audit_events VALUES (?,?,?,?,?)').run(crypto.randomUUID(), actor, action, target, Date.now());
}
function safeUser(row: UserRow): AccountUser {
  return { id: row.id, username: row.username, role: row.role, status: row.status, created_at: row.created_at };
}
async function passwordDigest(password: string): Promise<string> {
  validatePassword(password);
  return hashPassword(password, { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function bootstrapAdmin(username: string, password: string, token: string): Promise<AccountUser> {
  const expected = process.env.BOOTSTRAP_TOKEN || '';
  const expiresAt = Number(process.env.BOOTSTRAP_TOKEN_EXPIRES_AT);
  if (expected.length < 32 || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() ||
      !crypto.timingSafeEqual(Buffer.from(digest(token), 'hex'), Buffer.from(digest(expected), 'hex'))) {
    throw new AccountError('初始化凭证无效或已过期', 403);
  }
  const name = normalizedName(username);
  const pwHash = await passwordDigest(password);
  const db = accountDb();
  return db.transaction(() => {
    const row = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin'").get() as { n: number };
    if (row.n) throw new AccountError('管理员已初始化', 409);
    const now = Date.now();
    const user: UserRow = { id: crypto.randomUUID(), username: name, password_hash: pwHash, role: 'admin', status: 'active', created_at: now };
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)').run(user.id, user.username, user.password_hash, user.role, user.status, now, now);
    audit(user.id, 'admin.bootstrap', user.id);
    return safeUser(user);
  })();
}

export async function registerUser(username: string, password: string, inviteCode: string): Promise<AccountUser> {
  const name = normalizedName(username);
  const codeHash = digest(normalizedInvite(inviteCode));
  const available = accountDb().prepare('SELECT 1 FROM invites WHERE code_hash=? AND expires_at>? AND used_at IS NULL AND revoked_at IS NULL').get(codeHash, Date.now());
  if (!available) throw new AccountError('邀请码无效或已失效');
  const pwHash = await passwordDigest(password);
  const db = accountDb();
  return db.transaction(() => {
    const now = Date.now();
    const invite = db.prepare('SELECT id,created_by FROM invites WHERE code_hash=? AND expires_at>? AND used_at IS NULL AND revoked_at IS NULL').get(codeHash, now) as { id: string; created_by: string } | undefined;
    if (!invite) throw new AccountError('邀请码无效或已失效');
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(name)) throw new AccountError('该用户名不可用', 409);
    const user: UserRow = { id: crypto.randomUUID(), username: name, password_hash: pwHash, role: 'user', status: 'active', created_at: now };
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?)').run(user.id, name, pwHash, user.role, user.status, now, now);
    db.prepare('UPDATE invites SET used_by=?,used_at=? WHERE id=? AND used_at IS NULL').run(user.id, now, invite.id);
    audit(user.id, 'account.register', user.id);
    audit(invite.created_by, 'invite.redeem', invite.id);
    return safeUser(user);
  })();
}

export async function authenticate(username: string, password: string): Promise<AccountUser> {
  const name = username.trim().toLowerCase();
  const row = accountDb().prepare('SELECT * FROM users WHERE username=?').get(name) as UserRow | undefined;
  // 未知或停用账号也执行一次 Argon2id 校验，避免通过响应时间判断用户名是否存在。
  const hash = row?.status === 'active'
    ? row.password_hash
    : await (dummyHashPromise ??= passwordDigest('invalid-account-dummy-password'));
  const valid = await verifyPassword(hash, password);
  if (!row || row.status !== 'active' || !valid) throw new AccountError('用户名或密码错误', 401);
  return safeUser(row);
}

export function createSession(userId: string): { token: string; expiresAt: number } {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const expiresAt = now + SESSION_MS;
  accountDb().prepare('INSERT INTO sessions VALUES (?,?,?,?,NULL)').run(digest(token), userId, now, expiresAt);
  return { token, expiresAt };
}
function sessionToken(cookieHeader: string | null): string | null {
  const match = cookieHeader?.split(';').map((s) => s.trim()).find((s) => s.startsWith(ACCOUNT_COOKIE + '='));
  return match ? match.slice(ACCOUNT_COOKIE.length + 1) : null;
}
export function sessionUser(cookieHeader: string | null): AccountUser | null {
  const token = sessionToken(cookieHeader);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const row = accountDb().prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND u.status='active'`).get(digest(token), Date.now()) as UserRow | undefined;
  return row ? safeUser(row) : null;
}
export function revokeSession(cookieHeader: string | null): void {
  const token = sessionToken(cookieHeader);
  if (token) accountDb().prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=?').run(Date.now(), digest(token));
}
export function revokeUserSessions(userId: string): void {
  accountDb().prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(Date.now(), userId);
}

export function createInvites(adminId: string, count: number, days: number, note: string): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new AccountError('每次可生成 1–20 个邀请码');
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new AccountError('有效期须为 1–30 天');
  const db = accountDb();
  return db.transaction(() => Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(16).toString('hex').toUpperCase();
    const code = raw.match(/.{1,4}/g)!.join('-');
    const now = Date.now();
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO invites VALUES (?,?,?,?,?,?,?,?,?)').run(id, digest(raw), adminId, now, now + days * 86400000, null, null, null, note.slice(0, 100));
    audit(adminId, 'invite.create', id);
    return code;
  }))();
}
export function listInvites(): object[] {
  return accountDb().prepare(`SELECT i.id,i.created_at,i.expires_at,i.used_at,i.revoked_at,i.note,u.username AS used_by
    FROM invites i LEFT JOIN users u ON u.id=i.used_by ORDER BY i.created_at DESC LIMIT 200`).all() as object[];
}
export function revokeInvite(adminId: string, inviteId: string): void {
  const result = accountDb().prepare('UPDATE invites SET revoked_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL').run(Date.now(), inviteId);
  if (!result.changes) throw new AccountError('邀请码不存在或已使用', 404);
  audit(adminId, 'invite.revoke', inviteId);
}
export function listUsers(): AccountUser[] {
  return accountDb().prepare('SELECT id,username,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 500').all() as AccountUser[];
}
export function setUserStatus(adminId: string, userId: string, status: 'active' | 'disabled'): void {
  const db = accountDb();
  db.transaction(() => {
    const target = db.prepare('SELECT id,role,status FROM users WHERE id=?').get(userId) as AccountUser | undefined;
    if (!target) throw new AccountError('用户不存在', 404);
    if (target.role === 'admin' && status === 'disabled') {
      const active = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND status='active'").get() as { n: number };
      if (active.n <= 1) throw new AccountError('必须保留一名启用的管理员');
    }
    db.prepare('UPDATE users SET status=? WHERE id=?').run(status, userId);
    if (status === 'disabled') revokeUserSessions(userId);
    audit(adminId, status === 'disabled' ? 'user.disable' : 'user.enable', userId);
  })();
}
export function createPasswordReset(adminId: string, userId: string): string {
  const db = accountDb();
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(userId);
  if (!user) throw new AccountError('用户不存在', 404);
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  db.prepare('DELETE FROM password_resets WHERE user_id=?').run(userId);
  db.prepare('INSERT INTO password_resets VALUES (?,?,?,?,NULL)').run(digest(token), userId, adminId, now + RESET_MS);
  audit(adminId, 'user.reset.issue', userId);
  return token;
}
export async function resetPassword(token: string, password: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AccountError('重置凭证无效或已过期');
  const pwHash = await passwordDigest(password);
  const db = accountDb();
  db.transaction(() => {
    const reset = db.prepare('SELECT user_id FROM password_resets WHERE token_hash=? AND expires_at>? AND used_at IS NULL').get(digest(token), Date.now()) as { user_id: string } | undefined;
    if (!reset) throw new AccountError('重置凭证无效或已过期');
    const now = Date.now();
    db.prepare('UPDATE password_resets SET used_at=? WHERE token_hash=?').run(now, digest(token));
    db.prepare('UPDATE users SET password_hash=?,password_changed_at=? WHERE id=?').run(pwHash, now, reset.user_id);
    revokeUserSessions(reset.user_id);
    audit(reset.user_id, 'user.reset.complete', reset.user_id);
  })();
}
