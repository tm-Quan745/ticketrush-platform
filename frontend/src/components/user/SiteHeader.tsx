import React, { useEffect, useRef, useState } from 'react';
import { Compass, Ticket, ReceiptText, UserRound, ScanLine, LayoutDashboard, Menu, X, LogOut, ArrowUpRight, Zap } from 'lucide-react';
import { can, type Role } from '../../access/permissions';
import { navigate } from '../../access/navigation';
import type { User } from '../../types';
import { ThemeToggle } from '../ThemeToggle';
import { NotificationCenter } from './NotificationCenter';
import { IconButton } from '../ui/IconButton';

export function navigationItems(role: Role) {
  return [
    { href: '/events', label: 'Khám phá', icon: Compass, show: role !== 'STAFF' && can(role, 'catalog') },
    { href: '/account/tickets', label: 'Ví vé', icon: Ticket, show: can(role, 'account') },
    { href: '/account/orders', label: 'Đơn hàng', icon: ReceiptText, show: can(role, 'account') },
    { href: '/account/profile', label: 'Tài khoản', icon: UserRound, show: can(role, 'account') },
    { href: '/gate', label: 'Soát vé', icon: ScanLine, show: can(role, 'gate') },
    { href: '/admin', label: 'Quản trị', icon: LayoutDashboard, show: can(role, 'admin') },
  ].filter(item => item.show);
}
export function isNavigationActive(path: string, href: string) {
  if (href === '/events') return path === '/' || path === '/events' || path.startsWith('/events/');
  if (href === '/account/orders') return path === href || path.startsWith('/orders/');
  return path === href || path.startsWith(href + '/');
}
export function SiteHeader({ user, pathname, onLogout }: { user: User | null; pathname: string; onLogout: () => Promise<void> }) {
  const role = user?.role || 'PUBLIC';
  const [open, setOpen] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const header = useRef<HTMLElement>(null), toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); setError(''); }, [pathname, user?.id]);
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () => document.documentElement.style.setProperty('--app-header-height', `${element.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(measure); observer.observe(element); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const go = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); setOpen(false); navigate(href);
  };
  async function logout() {
    setBusy(true); setError('');
    try { await onLogout(); navigate('/login'); }
    catch { setError('Chưa đăng xuất được. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  }
  return <header className="site-header" ref={header}>
    <a className="skip-navigation" href="#main-content">Đến nội dung chính</a>
    <div className="site-header-inner">
      <a href="/events" className="site-brand" onClick={event => go(event, '/events')} aria-label="TicketRush — Trang chủ"><span><Zap size={21} fill="currentColor"/></span><strong>ticket<span>rush</span><small>YOUR NEXT GREAT MOMENT</small></strong></a>
      <nav id="site-navigation" className={`site-navigation ${open ? 'is-open' : ''}`} aria-label="Điều hướng chính">
        {navigationItems(role).map(({ href, label, icon: Icon }) => <a key={href} href={href} onClick={event => go(event, href)} aria-current={isNavigationActive(pathname, href) ? 'page' : undefined}><Icon size={17} aria-hidden="true"/><span>{label}</span></a>)}
        {user && <button className="mobile-signout" onClick={() => void logout()} disabled={busy}><LogOut size={17}/> Đăng xuất</button>}
      </nav>
      <div className="site-header-actions">
        {user && can(role, 'account') && <NotificationCenter key={user.id} userId={user.id}/>}
        <ThemeToggle/>
        {user ? <div className="desktop-signout"><IconButton label="Đăng xuất" icon={LogOut} disabled={busy} variant="ghost" onClick={() => void logout()}/></div> : <a href="/login" className="site-signin" onClick={event => go(event, '/login')}>Đăng nhập <ArrowUpRight size={15}/></a>}
        <button className="site-menu-toggle" ref={toggle} aria-expanded={open} aria-controls="site-navigation" aria-label={open ? 'Đóng menu' : 'Mở menu'} onClick={() => setOpen(value => !value)}>{open ? <X size={21}/> : <Menu size={21}/>}</button>
      </div>
    </div>
    {error && <p className="px-6 py-2 text-sm text-rose-500" role="alert">{error}</p>}
  </header>;
}
