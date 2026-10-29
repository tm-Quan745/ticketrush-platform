import React from 'react';
import { matchRoute } from '../../access/routes';
import { Link } from '../../pages/shared';

type Crumb = { label: string; href?: string };
export function pageBreadcrumbs(pathname: string): Crumb[] {
  const path = pathname.split('?')[0];
  const route = matchRoute(path).path;
  const home = { label: 'Trang chủ', href: '/' };
  const events = { label: 'Sự kiện', href: '/events' };
  const admin = { label: 'Quản trị', href: '/admin' };
  const event = { label: 'Chi tiết sự kiện', href: `/events/${path.split('/')[2]}` };
  const labels: Record<string, string> = {
    '/events': 'Sự kiện', '/login': 'Đăng nhập', '/register': 'Đăng ký',
    '/account/profile': 'Tài khoản', '/account/tickets': 'Ví vé', '/account/orders': 'Đơn hàng',
    '/gate': 'Soát vé', '/403': 'Không có quyền truy cập', '/404': 'Không tìm thấy trang',
    '/admin/venues': 'Địa điểm', '/admin/orders': 'Đơn hàng',
    '/admin/operations': 'Vận hành', '/admin/results': 'Kết quả',
  };
  if (route === '/') return [{ label: 'Trang chủ' }];
  if (route === '/events/:id') return [home, events, { label: event.label }];
  if (route === '/events/:id/queue' || route === '/events/:id/select')
    return [home, events, event, { label: route.endsWith('/queue') ? 'Phòng chờ' : 'Chọn vé' }];
  if (route === '/checkout/:reservationId') return [home, { label: 'Ví vé', href: '/account/tickets' }, { label: 'Thanh toán' }];
  if (route === '/orders/:id') return [home, { label: 'Đơn hàng', href: '/account/orders' }, { label: 'Chi tiết đơn hàng' }];
  if (route === '/admin') return [home, { label: admin.label }];
  if (route.startsWith('/admin/events')) {
    const crumbs: Crumb[] = [home, admin];
    if (route !== '/admin/events') crumbs.push({ label: 'Sự kiện', href: '/admin/events' });
    return [...crumbs, { label: route === '/admin/events' ? 'Sự kiện' : route.endsWith('/new') ? 'Tạo sự kiện' : 'Chi tiết sự kiện' }];
  }
  return [home, ...(route.startsWith('/admin/') ? [admin] : []), { label: labels[route] || 'Không tìm thấy trang' }];
}

export function Breadcrumbs({ pathname }: { pathname: string }) {
  return <nav className="page-breadcrumbs" aria-label="Đường dẫn trang"><ol>
    {pageBreadcrumbs(pathname).map((crumb, index) => <li key={index}>
      {index > 0 && <span className="breadcrumb-separator" aria-hidden="true">/</span>}
      {crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current="page">{crumb.label}</span>}
    </li>)}
  </ol></nav>;
}
