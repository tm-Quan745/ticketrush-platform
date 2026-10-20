export const roles = ['PUBLIC', 'USER', 'STAFF', 'ADMIN'] as const;
export type Role = typeof roles[number];
export const permissions = ['catalog', 'buy', 'account', 'gate', 'admin'] as const;
export type Permission = typeof permissions[number];
const grants: Record<Role, readonly Permission[]> = {
  PUBLIC: ['catalog'], USER: ['catalog', 'buy', 'account'],
  STAFF: ['catalog', 'gate'], ADMIN: ['catalog', 'admin'],
};
export const can = (role: Role, permission: Permission) => grants[role]?.includes(permission) ?? false;
export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://local.invalid');
    if (url.origin !== 'https://local.invalid' || /^\/(login|register)(\/|$)/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
export const landing = (role: Role, next?: string | null) =>
  role === 'ADMIN' ? '/admin' : role === 'STAFF' ? '/gate' : safeNext(next) || '/events';
