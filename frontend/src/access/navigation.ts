import { useSyncExternalStore } from 'react';
export function navigate(path: string, replace = false) {
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  dispatchEvent(new PopStateEvent('popstate'));
}
const subscribe = (notify: () => void) => {
  addEventListener('popstate', notify); return () => removeEventListener('popstate', notify);
};
export const useLocation = () => useSyncExternalStore(subscribe, () => location.pathname + location.search);
