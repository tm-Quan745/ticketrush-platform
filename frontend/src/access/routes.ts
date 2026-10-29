import type { Permission } from './permissions';
export interface Route { path: string; layout: 'public' | 'buyer' | 'staff' | 'admin'; permission?: Permission }
export const routes: Route[] = [
  ...['/', '/events', '/events/:id', '/login', '/register', '/403', '/404'].map(path => ({ path, layout: 'public' as const })),
  ...['/events/:id/queue', '/events/:id/select', '/checkout/:reservationId', '/orders/:id'].map(path => ({ path, layout: 'buyer' as const, permission: 'buy' as const })),
  ...['/account/tickets', '/account/orders', '/account/profile'].map(path => ({ path, layout: 'buyer' as const, permission: 'account' as const })),
  { path: '/gate', layout: 'staff', permission: 'gate' },
  ...['/admin', '/admin/events', '/admin/events/new', '/admin/events/:id', '/admin/venues', '/admin/orders', '/admin/operations', '/admin/results']
    .map(path => ({ path, layout: 'admin' as const, permission: 'admin' as const })),
];
export function matchRoute(path: string): Route {
  const pathname = path.split('?')[0];
  return routes.find(route => new RegExp('^' + route.path.replace(/:[^/]+/g, '[^/]+') + '$').test(pathname))
    || routes.find(route => route.path === '/404')!;
}
