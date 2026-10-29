import './components/ui/button.css';
import { vi } from './i18n/vi';
import './components/user/client-shell.css';
import React, { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SiteHeader } from './components/user/SiteHeader';
import { Breadcrumbs } from './components/user/Breadcrumbs';
import { Footer } from './components/Footer';
import { AdminSidebar } from './components/admin/AdminLayout';



import { can, safeNext, landing } from './access/permissions';
import { matchRoute } from './access/routes';
import { navigate, useLocation } from './access/navigation';

import { AccountPage, AuthPage, CheckoutPage, EventPage, EventsPage, OrderPage, QueuePage } from './pages/BuyerPages';
import { AdminEventPage, AdminEventsPage, AdminHome, AdminOrdersPage, GatePage, OperationsPage, ResultsPage } from './pages/AdminPages';

import {AdminVenuesPage} from './pages/AdminVenuesPage';

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, true), [to]); return <p>{vi.redirect}</p>;
}
function Router() {
  const address = useLocation(); const pathname = address.split('?')[0]; const route = matchRoute(pathname);
  const { user, logout, loading, sessionError, retrySession } = useAuth(); const role = user?.role || 'PUBLIC';
  const [forbidden, setForbidden] = useState(false);
  useEffect(() => { setForbidden(false); }, [address, user?.id]);
  useEffect(() => {
    const deny = () => setForbidden(true); addEventListener('auth:forbidden', deny);
    return () => removeEventListener('auth:forbidden', deny);
  }, []);
  if (loading) return <main className="p-8" role="status">Đang khôi phục phiên đăng nhập…</main>;
  if (sessionError) return <main className="p-8"><p role="alert">{sessionError}</p><button type="button" className="mt-4 underline" onClick={retrySession}>Thử lại</button></main>;
  const id = pathname.split('/')[2];
  let page: React.ReactNode;
  if ((route.path === '/login' || route.path === '/register') && user) page = <Redirect to={landing(user.role, new URLSearchParams(address.split('?')[1] || '').get('next'))} />;
  else if (route.permission && !user) page = <Redirect to={'/login?next=' + encodeURIComponent(safeNext(address) || '/events')} />;
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
    return <main className="auth-page bg-slate-950 text-slate-100" key={pathname}><Breadcrumbs pathname={pathname}/>{page}</main>;
  }
  const adminLayout = can(role, 'admin') && route.layout === 'admin';
  return <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
    <SiteHeader user={user} pathname={pathname} onLogout={logout}/>
    <div className="w-full max-w-7xl mx-auto flex flex-1 flex-col md:flex-row">
      {adminLayout && <AdminSidebar pathname={pathname} />}
      <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 px-3 sm:px-6 py-6 sm:py-10" key={pathname}><Breadcrumbs pathname={forbidden || (route.permission && !can(role, route.permission)) ? '/403' : pathname}/>{page}</main>
    </div>
    <Footer role={role} />
  </div>;
}
export function App() { return <ThemeProvider><Router /></ThemeProvider>; }
