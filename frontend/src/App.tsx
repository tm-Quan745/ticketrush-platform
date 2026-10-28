import { vi } from './i18n/vi';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';
import { Footer } from './components/Footer';
import { AdminSidebar } from './components/admin/AdminLayout';
import { IconButton } from './components/ui/IconButton';
import { LogOut } from 'lucide-react';
import { NotificationCenter } from './components/user/NotificationCenter';
import { can, safeNext } from './access/permissions';
import { matchRoute } from './access/routes';
import { navigate, useLocation } from './access/navigation';
import { Link } from './pages/shared';
import { AccountPage, AuthPage, CheckoutPage, EventPage, EventsPage, OrderPage, QueuePage } from './pages/BuyerPages';
import { AdminEventPage, AdminEventsPage, AdminHome, AdminOrdersPage, GatePage, OperationsPage, ResultsPage } from './pages/AdminPages';

import {AdminVenuesPage} from './pages/AdminVenuesPage';

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, true), [to]); return <p>{vi.redirect}</p>;
}
function Router() {
  const address = useLocation(); const pathname = address.split('?')[0]; const route = matchRoute(pathname);
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const measure = () => document.documentElement.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [pathname]);
  const { user, logout } = useAuth(); const role = user?.role || 'PUBLIC';
  const [forbidden, setForbidden] = useState(false);
  useEffect(() => { setForbidden(false); }, [address, user?.id]);
  useEffect(() => {
    const deny = () => setForbidden(true); addEventListener('auth:forbidden', deny);
    return () => removeEventListener('auth:forbidden', deny);
  }, []);
  const id = pathname.split('/')[2];
  let page: React.ReactNode;
  if (route.permission && !user) page = <Redirect to={'/login?next=' + encodeURIComponent(safeNext(address) || '/events')} />;
  else if (forbidden || (route.permission && !can(role, route.permission)) || route.path === '/403') page = <><h1 className="text-4xl font-bold">403</h1><p className="mt-5">{vi.forbidden}</p></>;
  else switch (route.path) {
    case '/': case '/events': page = <EventsPage />; break;
    case '/events/:id': page = <EventPage id={id} />; break;
    case '/events/:id/queue': page = <QueuePage id={id} />; break;
    case '/events/:id/select': page = <EventPage id={id} select />; break;
    case '/checkout/:reservationId': page = <CheckoutPage id={id} />; break;
    case '/orders/:id': page = <OrderPage id={id} />; break;
    case '/account/profile': case '/account/tickets': case '/account/orders': page = <AccountPage kind={id} />; break;
    case '/login': page = <AuthPage />; break;
    case '/register': page = <AuthPage register />; break;
    case '/gate': page = <GatePage />; break;
    case '/admin': page = <AdminHome />; break;
    case '/admin/events': page = <AdminEventsPage />; break;
    case '/admin/events/new': page = <AdminEventsPage create />; break;
    case '/admin/events/:id': page = <AdminEventPage id={pathname.split('/')[3]} />; break;
    case '/admin/venues': page = <AdminVenuesPage />; break;
    case '/admin/orders': page = <AdminOrdersPage />; break;
    case '/admin/operations': page = <OperationsPage />; break;
    case '/admin/results': page = <ResultsPage />; break;
    default: page = <><h1 className="text-4xl font-bold">404</h1><p>{vi.missing}</p></>;
  }
  if (route.path === '/login' || route.path === '/register') {
    return <main className="auth-page bg-slate-950 text-slate-100" key={pathname}>{page}</main>;
  }
  const adminLayout = can(role, 'admin') && route.layout === 'admin';
  return <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
    <header ref={headerRef} className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-5 flex items-center gap-3 sm:gap-6 flex-wrap">
        <Link href="/events" className="text-2xl font-black">TicketRush</Link>
        <nav className="order-last basis-full sm:order-none sm:basis-auto flex items-center gap-3 sm:flex-1 flex-wrap min-w-0" aria-label={vi.navigation}>
          {role !== 'STAFF' && can(role, 'catalog') && <Link href="/events">{vi.events}</Link>}
          {can(role, 'account') && <><Link href="/account/tickets">{vi.tickets}</Link><Link href="/account/orders">{vi.orders}</Link><Link href="/account/profile">{vi.account}</Link></>}
          {can(role, 'gate') && <Link href="/gate">{vi.gate}</Link>}
          {can(role, 'admin') && <Link href="/admin">{vi.admin}</Link>}
        </nav>
        {user && can(role, 'account') && <NotificationCenter key={user.id} userId={user.id}/>}
        <ThemeToggle />
        {user ? <IconButton label={vi.logout} icon={LogOut} variant="ghost" onClick={() => { void logout().then(() => navigate('/login')).catch(() => navigate('/login')); }}/> : <Link href="/login">{vi.login}</Link>}
      </div>
    </header>
    <div className="w-full max-w-7xl mx-auto flex flex-1 flex-col md:flex-row">
      {adminLayout && <AdminSidebar pathname={pathname} />}
      <main className="flex-1 min-w-0 px-3 sm:px-6 py-6 sm:py-10" key={pathname}>{page}</main>
    </div>
    <Footer role={role} />
  </div>;
}
export function App() { return <ThemeProvider><Router /></ThemeProvider>; }
