export function notificationSocketUrl(base: string, pageUrl: string): string {
  const url = new URL(`${base.replace(/\/$/, '')}/notifications/ws`, pageUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

/** Reconnect with fresh credentials; REST recovers events missed while offline. */
export function connectNotifications(options: {
  url: string;
  token: (refreshCredentials: boolean) => Promise<string | null>;
  refresh: () => void;
  status: (connected: boolean) => void;
}) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let refreshCredentials = false;

  function retry() {
    if (stopped) return;
    options.status(false);
    timer = setTimeout(() => void open(), Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5)) * (1 + Math.random() * 0.2));
  }
  async function open() {
    try {
      const token = await options.token(refreshCredentials);
      refreshCredentials = false;
      if (stopped || !token) return;
      const current = new WebSocket(options.url);
      socket = current;
      const armWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => current.close(), 45000);
      };
      armWatchdog();
      current.onopen = () => {
        if (stopped) { current.close(); return; }
        current.send(JSON.stringify({ type: 'authenticate', token }));
      };
      current.onmessage = event => {
        if (stopped) return;
        try {
          const frame = JSON.parse(event.data);
          if (!['ready', 'orders.changed', 'reservations.changed', 'heartbeat'].includes(frame.type)) return;
          armWatchdog();
          if (frame.type === 'ready') { attempts = 0; options.status(true); }
          if (frame.type !== 'heartbeat') options.refresh();
        } catch { /* Ignore malformed frames; the watchdog reconnects if necessary. */ }
      };
      current.onerror = () => current.close();
      current.onclose = event => {
        refreshCredentials = event.code === 1008;
        clearTimeout(watchdog);
        retry();
      };
    } catch { retry(); }
  }
  void open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(watchdog);
    socket?.close();
  };
}
