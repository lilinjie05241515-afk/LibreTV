'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/header';
import { useAuth } from '@/components/auth';
import { api } from '@/lib/client-api';

type Invite = Awaited<ReturnType<typeof api.adminInvites>>['invites'][number];
type User = Awaited<ReturnType<typeof api.adminUsers>>['users'][number];

export default function AdminPage() {
  const { checked, verified, user, openLogin } = useAuth();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [count, setCount] = useState(1);
  const [days, setDays] = useState(7);
  const [note, setNote] = useState('');
  const [freshCodes, setFreshCodes] = useState<string[]>([]);
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([api.adminInvites(), api.adminUsers()]);
    setInvites(a.invites); setUsers(b.users);
  }, []);
  useEffect(() => {
    if (verified && user?.role === 'admin') void refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : '读取失败'));
  }, [verified, user?.role, refresh]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const format = (value: number) => new Date(value).toLocaleString('zh-CN');

  return <>
    <Header />
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-2xl font-bold text-content">账号管理</h1><p className="text-muted text-sm mt-1">邀请码只在生成时显示一次；请妥善发给受邀者。</p></div>
        <Link href="/" className="text-accent text-sm">返回首页</Link>
      </div>
      {!checked && <p className="text-muted">正在检查权限…</p>}
      {checked && !verified && <div className="bg-surface-raised rounded-xl p-6"><p className="mb-3">请先登录管理员账号。</p><button className="btn-primary" onClick={openLogin}>登录</button></div>}
      {checked && verified && user?.role !== 'admin' && <p role="alert">当前账号没有管理员权限。</p>}
      {checked && verified && user?.role === 'admin' && <>
        {error && <p className="text-danger" role="alert">{error}</p>}
        <section className="bg-surface-raised rounded-xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">生成邀请码</h2>
          <form className="flex flex-wrap gap-3 items-end" onSubmit={(e) => { e.preventDefault(); void run(async () => { const result = await api.adminCreateInvites(count, days, note); setFreshCodes(result.codes); setNote(''); }); }}>
            <label className="text-sm">数量（1–20）<input className="input block w-28 mt-1" type="number" min="1" max="20" value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
            <label className="text-sm">有效期（天）<input className="input block w-28 mt-1" type="number" min="1" max="30" value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
            <label className="text-sm flex-1 min-w-44">备注<input className="input block w-full mt-1" maxLength={100} value={note} onChange={(e) => setNote(e.target.value)} placeholder="可选" /></label>
            <button className="btn-primary" type="submit" disabled={busy}>生成</button>
          </form>
          {freshCodes.length > 0 && <div className="rounded-lg border border-accent p-3"><p className="text-sm mb-2">请立即复制，离开页面后将无法再次查看：</p>{freshCodes.map((code) => <div key={code} className="flex items-center gap-2 mb-2"><input className="input flex-1 font-mono text-sm" value={code} readOnly aria-label="新邀请码" /><button className="text-accent text-sm" onClick={() => void navigator.clipboard.writeText(code)}>复制</button></div>)}</div>}
        </section>
        <section className="bg-surface-raised rounded-xl p-5 overflow-x-auto">
          <h2 className="text-lg font-semibold mb-4">邀请码</h2>
          <table className="w-full text-sm text-left"><thead><tr className="border-b border-line"><th className="py-2">创建时间</th><th>到期时间</th><th>状态</th><th>使用者</th><th>备注</th><th>操作</th></tr></thead><tbody>{invites.map((invite) => {
            const state = invite.revoked_at ? '已撤销' : invite.used_at ? '已使用' : invite.expires_at < Date.now() ? '已过期' : '可使用';
            return <tr key={invite.id} className="border-b border-line/60"><td className="py-2 pr-3">{format(invite.created_at)}</td><td className="pr-3">{format(invite.expires_at)}</td><td className="pr-3">{state}</td><td className="pr-3">{invite.used_by ?? '—'}</td><td className="pr-3">{invite.note || '—'}</td><td>{state === '可使用' && <button className="text-danger" disabled={busy} onClick={() => void run(() => api.adminRevokeInvite(invite.id).then(() => {}))}>撤销</button>}</td></tr>;
          })}</tbody></table>
        </section>
        <section className="bg-surface-raised rounded-xl p-5 overflow-x-auto">
          <h2 className="text-lg font-semibold mb-4">用户</h2>
          <table className="w-full text-sm text-left"><thead><tr className="border-b border-line"><th className="py-2">用户名</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead><tbody>{users.map((entry) => <tr key={entry.id} className="border-b border-line/60"><td className="py-2 pr-3">{entry.username}</td><td className="pr-3">{entry.role === 'admin' ? '管理员' : '用户'}</td><td className="pr-3">{entry.status === 'active' ? '启用' : '停用'}</td><td className="pr-3">{format(entry.created_at)}</td><td className="space-x-3">
            <button className="text-accent" disabled={busy || entry.id === user.id} onClick={() => void run(() => api.adminSetUserStatus(entry.id, entry.status === 'active' ? 'disabled' : 'active').then(() => {}))}>{entry.status === 'active' ? '停用' : '启用'}</button>
            <button className="text-accent" disabled={busy} onClick={() => void run(async () => { const result = await api.adminCreateReset(entry.id); setResetToken(result.token); })}>重置密码</button>
          </td></tr>)}</tbody></table>
          {resetToken && <div className="mt-4 rounded-lg border border-accent p-3"><p className="text-sm mb-2">一次性重置凭证，30 分钟内有效。仅显示本次，请交给对应用户：</p><div className="flex gap-2"><input className="input flex-1 font-mono text-sm" readOnly value={resetToken} aria-label="重置凭证" /><button className="text-accent" onClick={() => void navigator.clipboard.writeText(resetToken)}>复制</button></div></div>}
        </section>
      </>}
    </main>
  </>;
}
