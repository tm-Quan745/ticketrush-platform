import React, { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ThemeToggle } from './components/ThemeToggle';
import { can, safeNext } from './access/permissions';
import { matchRoute } from './access/routes';
import { navigate, useLocation } from './access/navigation';
import { Link } from './pages/shared';
import { AccountPage, AuthPage, CheckoutPage, EventPage, EventsPage, OrderPage, QueuePage } from './pages/BuyerPages';
import { AdminEventPage, AdminEventsPage, AdminHome, AdminOrdersPage, GatePage, OperationsPage, ResultsPage } from './pages/AdminPages';

function Redirect({ to }: { to: string }) {
  useEffect(() => navigate(to, true), [to]); return <p>Đang chuyển trang…</p>;
}
function Router() {
  const address = useLocation(); const pathname = address.split('?')[0]; const route = matchRoute(pathname);
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
  else if (forbidden || (route.permission && !can(role, route.permission)) || route.path === '/403') page = <><h1 className="text-4xl font-bold">403</h1><p className="mt-5">Tài khoản của bạn không có quyền truy cập trang này.</p></>;
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
    case '/admin/orders': page = <AdminOrdersPage />; break;
    case '/admin/operations': page = <OperationsPage />; break;
    case '/admin/results': page = <ResultsPage />; break;
    default: page = <><h1 className="text-4xl font-bold">404</h1><p>Không tìm thấy trang.</p></>;
  }
  const adminLayout = can(role, 'admin') && route.layout === 'admin';
  return <div className="min-h-screen bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 py-5 flex items-center gap-6 flex-wrap">
        <Link href="/events" className="text-2xl font-black">TicketRush</Link>
        <nav className="flex items-center gap-5 flex-1" aria-label="Main navigation">
          {role !== 'STAFF' && can(role, 'catalog') && <Link href="/events">Events</Link>}
          {can(role, 'account') && <><Link href="/account/tickets">My tickets</Link><Link href="/account/orders">My orders</Link><Link href="/account/profile">Account</Link></>}
          {can(role, 'gate') && <Link href="/gate">Gate</Link>}
          {can(role, 'admin') && <Link href="/admin">Admin</Link>}
        </nav>
        <ThemeToggle />
        {user ? <button className="text-sm text-slate-400" onClick={() => { void logout().then(() => navigate('/login')).catch(() => navigate('/login')); }}>Đăng xuất</button> : <Link href="/login">Đăng nhập</Link>}
      </div>
    </header>
    <div className="max-w-7xl mx-auto flex flex-col md:flex-row">
      {adminLayout && <aside className="w-full md:w-56 p-6 border-r border-slate-800"><nav className="flex flex-col gap-5" aria-label="Admin navigation">
        <Link href="/admin">Overview</Link><Link href="/admin/events">Events</Link><Link href="/admin/orders">Orders</Link>
        <Link href="/admin/operations">Operations</Link><Link href="/admin/results">Results</Link><Link href="/events">View as customer</Link>
      </nav></aside>}
      <main className="flex-1 min-w-0 px-6 py-10" key={pathname}>{page}</main>
    </div>
    <footer className="max-w-7xl mx-auto p-6 mt-10 border-t border-slate-800 text-sm text-slate-500">TicketRush · Đặt vé sự kiện</footer>
  </div>;
}
export function App() { return <ThemeProvider><Router /></ThemeProvider>; }
