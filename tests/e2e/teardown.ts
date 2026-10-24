import { readFile, unlink } from 'node:fs/promises';

export default async function teardown() {
  let fixture: { accounts: { ADMIN: { email: string; password: string } }; eventId: string; eventIds?: string[] };
  try { fixture = JSON.parse(await readFile('.tmp/e2e-accounts.json', 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3100';
  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Cleanup requires a local test stack');
  async function request(path: string, body?: unknown, token?: string, method = 'POST') {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(base + '/api/v1' + path, { method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body) });
      if (![429, 503].includes(response.status)) return response;
      await new Promise(resolve => setTimeout(resolve, (Number(response.headers.get('Retry-After')) || 2) * 1000));
    }
    throw new Error('Cleanup retry limit exceeded');
  }
  const login = await request('/auth/login', fixture.accounts.ADMIN);
  if (!login.ok) throw new Error(`Cleanup login failed: ${login.status}`);
  const auth = await login.json();
  try {
    for (const eventId of fixture.eventIds || [fixture.eventId]) {
    const cancel = await request(`/admin/events/${eventId}/cancel`, undefined, auth.accessToken);
    // A partially failed setup can leave a DRAFT, or a previous cleanup a CANCELLED event.
    if (!cancel.ok && cancel.status !== 409) throw new Error(`Event cleanup failed: ${cancel.status}`);
    const visible = await request(`/events/${eventId}`, undefined, undefined, 'GET');
    if (visible.status !== 404) throw new Error(`E2E event remains public: ${eventId} (${visible.status})`);
    }
    await unlink('.tmp/e2e-accounts.json');
  } finally {
    const logout = await request('/auth/logout', { refreshToken: auth.refreshToken });
    if (!logout.ok) throw new Error(`Cleanup logout failed: ${logout.status}`);
  }
}
