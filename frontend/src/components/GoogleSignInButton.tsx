import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api/client';

interface GoogleIdentity {
  initialize(options: {client_id: string; callback: (result: {credential: string}) => void; auto_select: boolean}): void;
  renderButton(element: HTMLElement, options: {theme: string; size: string; text: string; locale: string}): void;
}
declare global { interface Window { google?: {accounts: {id: GoogleIdentity}} } }

let scriptPromise: Promise<void> | undefined;
function loadGoogle(): Promise<void> {
  if (window.google?.accounts.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => fail(), 15000);
    const fail = () => { window.clearTimeout(timeout); script.remove(); reject(new Error('Google script unavailable')); };
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onload = () => { window.clearTimeout(timeout); window.google?.accounts.id ? resolve() : fail(); };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = undefined; throw error; });
  return scriptPromise;
}

export function GoogleSignInButton({ onCredential, disabled }: {
  onCredential: (credential: string) => Promise<void>; disabled: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential); callback.current = onCredential;
  const blocked = useRef(disabled); blocked.current = disabled;
  const pending = useRef(false);
  const statusId = useId();
  const [status, setStatus] = useState<'loading' | 'unconfigured' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    container.current?.replaceChildren();
    void api.googleConfig().then(async ({ clientId }) => {
      if (!active) return;
      if (!clientId) { setStatus('unconfigured'); return; }
      await loadGoogle();
      if (!active || !container.current) return;
      const identity = window.google!.accounts.id;
      identity.initialize({ client_id: clientId, auto_select: false, callback: result => {
        if (!active || blocked.current || pending.current) return;
        pending.current = true;
        void callback.current(result.credential).catch(() => { if (active) setStatus('error'); })
          .finally(() => { pending.current = false; });
      } });
      container.current.replaceChildren();
      identity.renderButton(container.current, { theme: 'outline', size: 'large', text: 'continue_with', locale: 'vi' });
      setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [attempt]);
  return <div className="auth-google mt-5">
    <p className="auth-google-label text-center text-sm text-slate-500 mb-3">Hoặc tiếp tục với Google</p>
    {status !== 'ready' && <button type="button" disabled aria-describedby={statusId}
      className="w-full min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400 disabled:cursor-not-allowed">
      Đăng nhập bằng Google
    </button>}
    <div ref={container} aria-busy={disabled || status === 'loading'} className={`${status === 'ready' ? 'flex' : 'hidden'} justify-center ${disabled ? 'pointer-events-none opacity-50' : ''}`} />
    {status === 'loading' && <p id={statusId} role="status" className="text-center text-sm text-slate-500 mt-2">Đang tải đăng nhập Google…</p>}
    {status === 'unconfigured' && <p id={statusId} role="status" className="text-center text-sm text-slate-500 mt-2">Đăng nhập Google chưa được bật. Bạn vẫn có thể đăng nhập bằng email và mật khẩu.</p>}
    {status === 'error' && <p id={statusId} role="alert" className="text-sm text-rose-500 mt-2">Không tải được đăng nhập Google.{' '}
      <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>Thử lại</button></p>}
  </div>;
}
