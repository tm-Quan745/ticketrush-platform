import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import cleanup from './teardown';
export default async function setup() {
  const base = process.env.E2E_BASE_URL || 'http://127.0.0.1:3100';
  if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Generated E2E fixtures require a local stack');
  // Recover the journal from an interrupted prior run before creating another event.
  await cleanup();
  async function request(path: string, body: unknown, token?: string, method = 'POST'): Promise<any> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await fetch(base + '/api/v1' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      if (response.status === 429) { await new Promise(r => setTimeout(r, (Number(response.headers.get('Retry-After')) || 5) * 1000)); continue; }
      if (!response.ok) throw new Error(`Fixture ${path}: ${response.status} ${await response.text()}`);
      return response.status === 204 ? null : response.json();
    }
    throw new Error('Fixture rate limit did not recover');
  }
  const accounts: Record<string, any> = {};
  for (const role of ['USER', 'STAFF', 'ADMIN']) {
    const email = `e2e-${role.toLowerCase()}-${randomUUID()}@example.test`; const password = randomBytes(24).toString('base64url');
    const user = await request('/auth/register', { email, password });
    if (!/^[0-9a-f-]{36}$/.test(user.id)) throw new Error('Invalid fixture UUID');
    // Local fixture administration only. No application endpoint can assign roles.
    execFileSync('docker', ['exec', process.env.E2E_DB_CONTAINER || 'ticketrush-frontend-postgres-1', 'psql', '-U', process.env.E2E_DB_USER || 'ticketrush', '-d', process.env.E2E_DB_NAME || 'ticketrush', '-v', 'ON_ERROR_STOP=1', '-c',
      `BEGIN; DELETE FROM user_roles WHERE user_id='${user.id}'; INSERT INTO user_roles(user_id,role_id) SELECT '${user.id}',id FROM roles WHERE name='${role}'; COMMIT;`], { windowsHide: true, stdio: 'pipe' });
    accounts[role] = { email, password };
  }
  const auth = await request('/auth/login', accounts.ADMIN);
  const now = Date.now(); const iso = (offset: number) => new Date(now + offset).toISOString();
  const event = await request('/admin/events', { title: `E2E live purchase ${randomUUID()}`, description: 'Browser test fixture', venueName: 'Test hall', venueAddress: 'Test city', startTime: iso(86400000), endTime: iso(90000000), saleStartTime: iso(-60000), saleEndTime: iso(3600000) }, auth.accessToken);
  await mkdir('.tmp', { recursive: true }); await mkdir('docs/screenshots', { recursive: true });
  await writeFile('.tmp/e2e-accounts.json', JSON.stringify({ accounts, eventId: event.id }));
  try {
  await request(`/admin/events/${event.id}/tiers`, { name: 'E2E Standard', price: 10000, currency: 'VND', totalQuantity: 100, maxPerOrder: 2 }, auth.accessToken);
  await request(`/admin/events/${event.id}/publish`, undefined, auth.accessToken);
  await request(`/admin/events/${event.id}/waiting-room`, { enabled: true, rate: 10, mode: 'fifo' }, auth.accessToken, 'PUT');
  await request('/auth/logout', { refreshToken: auth.refreshToken });
  } catch (error) { await cleanup(); throw error; }
}
