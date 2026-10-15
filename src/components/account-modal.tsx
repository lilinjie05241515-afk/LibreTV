'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';

type Mode = 'login' | 'register' | 'reset' | 'bootstrap';

export function AccountModal({ setupRequired, onSuccess, onClose }: {
  setupRequired: boolean;
  onSuccess: () => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>(setupRequired ? 'bootstrap' : 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [invite, setInvite] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => { if (setupRequired) setMode('bootstrap'); }, [setupRequired]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape' && !setupRequired) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, setupRequired]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    if (mode !== 'login' && password !== confirm) { setError('两次输入的密码不一致'); return; }
    setBusy(true);
    try {
      if (mode === 'bootstrap') await api.accountBootstrap(username, password, token);
      if (mode === 'register') await api.accountRegister(username, password, invite);
      if (mode === 'login') await api.accountLogin(username, password);
      if (mode === 'reset') {
        await api.accountReset(token, password);
        setPassword(''); setConfirm(''); setToken(''); setMode('login');
        setNotice('密码已重置，请登录');
        return;
      }
      await onSuccess();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '操作失败');
    } finally { setBusy(false); }
  };
  const switchMode = (next: Mode) => { setMode(next); setError(''); setNotice(''); setPassword(''); setConfirm(''); };
  const title = { login: '账号登录', register: '邀请码注册', reset: '重置密码', bootstrap: '初始化管理员' }[mode];

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4" onClick={(e) => { if (e.target === e.currentTarget && !setupRequired) onClose(); }}>
      <div className="bg-surface-raised rounded-xl p-6 w-full max-w-sm shadow-2xl" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="text-lg font-semibold text-content mb-2">{title}</h2>
        {mode === 'bootstrap' && <p className="text-sm text-muted mb-4">请使用服务器提供的一次性初始化凭证，并由站点所有者本人设置管理员密码。</p>}
        {mode === 'register' && <p className="text-sm text-muted mb-4">每个邀请码只能注册一个账号。</p>}
        {mode === 'reset' && <p className="text-sm text-muted mb-4">请输入管理员提供的一次性重置凭证。</p>}
        <form onSubmit={submit} className="space-y-3">
          {mode !== 'reset' && <label className="block text-sm text-content">用户名
            <input className="input w-full mt-1" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3–24 位英文字母、数字或下划线" required />
          </label>}
          {mode === 'register' && <label className="block text-sm text-content">邀请码
            <input className="input w-full mt-1" value={invite} onChange={(e) => setInvite(e.target.value)} autoComplete="off" required />
          </label>}
          {(mode === 'bootstrap' || mode === 'reset') && <label className="block text-sm text-content">{mode === 'bootstrap' ? '初始化凭证' : '重置凭证'}
            <input className="input w-full mt-1" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required />
          </label>}
          <label className="block text-sm text-content">{mode === 'login' ? '密码' : '新密码'}
            <input className="input w-full mt-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 12} required />
          </label>
          {mode !== 'login' && <label className="block text-sm text-content">确认密码
            <input className="input w-full mt-1" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </label>}
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          {notice && <p className="text-sm text-content" role="status">{notice}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? '处理中…' : title}</button>
        </form>
        {!setupRequired && <div className="flex justify-between gap-2 mt-4 text-sm">
          {mode !== 'login' && <button className="text-accent" onClick={() => switchMode('login')}>返回登录</button>}
          {mode !== 'register' && <button className="text-accent" onClick={() => switchMode('register')}>邀请码注册</button>}
          {mode !== 'reset' && <button className="text-accent" onClick={() => switchMode('reset')}>重置密码</button>}
        </div>}
      </div>
    </div>
  );
}
