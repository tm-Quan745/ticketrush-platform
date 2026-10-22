import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
const storage = () => { const values = new Map<string, string>(); return {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear(),
}; };
Object.defineProperty(globalThis, 'localStorage', { value: storage() });
Object.defineProperty(globalThis, 'sessionStorage', { value: storage() });
const { ApiClient } = await import('../frontend/src/api/client');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
test('login loads roles from /me rather than assuming embedded demo user', async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).endsWith('/login')) return json({ accessToken: 'access', refreshToken: 'refresh' });
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer access');
    return json({ id: 'user', email: 'person@example.test', roles: ['USER', 'ADMIN'] });
  };
  const api = new ApiClient();
  assert.equal((await api.login('person@example.test', 'a-long-password')).user.role, 'ADMIN');
  assert.deepEqual(calls, ['/api/v1/auth/login', '/api/v1/auth/me']);
});
test('401 retry rotates tokens and preserves order body and idempotency key', async () => {
  const api = new ApiClient(); api.setAuth('old', { id: 'u', email: 'e', role: 'USER' }, 'refresh');
  const keys: unknown[] = []; const bodies: unknown[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/refresh')) return json({ accessToken: 'new', refreshToken: 'rotated' });
    keys.push((options?.headers as Record<string, string>)['Idempotency-Key']); bodies.push(options?.body);
    return keys.length === 1 ? json({ message: 'expired' }, 401) : json({ id: 'order' }, 201);
  };
  assert.equal((await api.createOrder('reservation', 'stable-key')).id, 'order');
  assert.deepEqual(keys, ['stable-key', 'stable-key']); assert.equal(bodies[0], bodies[1]);
  assert.equal(api.getRefreshToken(), 'rotated');
});
test('failed refresh clears session and never logs into a demo account', async () => {
  const api = new ApiClient(); api.setAuth('old', null, 'invalid'); const calls: string[] = [];
  globalThis.fetch = async url => { calls.push(String(url)); return json({ message: 'expired' }, 401); };
  await assert.rejects(api.getMe());
  assert.equal(api.getToken(), null);
  assert.deepEqual(calls, ['/api/v1/auth/me', '/api/v1/auth/refresh']);
});
test('logout revokes refresh token even though access tokens remain independently valid', async () => {
  const api = new ApiClient(); api.setAuth('a', null, 'r');
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/auth/logout'); assert.equal(options?.body, '{"refreshToken":"r"}');
    return new Response(null, { status: 204 });
  };
  await api.logout(); assert.equal(api.getRefreshToken(), null);
});
test('reservation forwards admission token and propagates backend errors', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal((options?.headers as Record<string, string>)['X-Admission-Token'], 'admission');
    assert.deepEqual(JSON.parse(String(options?.body)), { tierId: 'tier', quantity: 2 });
    return json({ code: 'SOLD_OUT', message: 'No stock' }, 409);
  };
  await assert.rejects(new ApiClient().createReservation('tier', 2, 'admission'), { message: 'No stock' });
});
test('payment check reads backend state and cannot simulate a charge', async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url)); assert.ok(!options?.method || options.method === 'GET');
    return json({ id: 'o', status: 'PENDING_PAYMENT' });
  };
  await assert.rejects(new ApiClient().checkPayment('o'), /PENDING_PAYMENT/);
  assert.deepEqual(calls, ['/api/v1/orders/o']);
});
test('ticket adapter gets order context absent from backend ticket DTO', async () => {
  globalThis.fetch = async url => String(url).endsWith('/tickets')
    ? json([{ id: 'ticket', tierId: 'tier', status: 'VALID' }])
    : json({ id: 'o', items: [{ tierId: 'tier', tierName: 'Standard' }] });
  const tickets = await new ApiClient().getOrderTickets('o');
  assert.equal(tickets[0].orderId, 'o'); assert.equal(tickets[0].tierName, 'Standard');
});
test('capacity update sends complete WriteTier payload', async () => {
  globalThis.fetch = async (_url, options) => {
    assert.deepEqual(JSON.parse(String(options?.body)), { name: 'Standard', price: 100, currency: 'VND', maxPerOrder: 2, totalQuantity: 20 });
    return json({});
  };
  await new ApiClient().updateTierCapacity('tier', 20, { name: 'Standard', price: 100, currency: 'VND', maxPerOrder: 2 } as any);
});

