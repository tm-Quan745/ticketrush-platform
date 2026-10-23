import React, { useEffect, useState } from 'react';
import { navigate } from '../access/navigation';
export { Button } from '../components/ui/Button';
export { Card } from '../components/ui/Card';
export function Link({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} className={'text-indigo-400 hover:text-indigo-300 ' + className} onClick={event => {
    if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); navigate(href);
    }
  }}>{children}</a>;
}
export function useLoad<T>(key: string, loader: () => Promise<T>) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true; setValue(undefined); setError('');
    loader().then(data => { if (alive) setValue(data); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [key]);
  return { value, error };
}
export const ErrorMessage = ({ message }: { message?: string }) => message ? <p role="alert" className="my-4 text-rose-400">{message}</p> : null;
export const fieldClass = 'block w-full rounded-xl border border-slate-700 bg-slate-900 p-3 my-2';
export const money = (amount: number, currency: string) => {
  const format = new Intl.NumberFormat('vi-VN', { style: 'currency', currency });
  return format.format(amount / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2));
};
