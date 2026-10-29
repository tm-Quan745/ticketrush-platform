import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
const storage = () => { const values = new Map<string, string>(); return {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); }, clear: () => values.clear(),
}; };
Object.defineProperty(globalThis, 'localStorage', { value: storage() });
Object.defineProperty(globalThis, 'sessionStorage', { value: storage() });
const { ApiClient } = await import('../src/api/client');
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

test('image upload sends multipart bytes and bearer auth without a JSON content type', async () => {
  const api = new ApiClient(); api.setAuth('admin-token', {id:'a',email:'a@test',role:'ADMIN'});
  const file = new File(['image bytes'], 'event.png', {type:'image/png'});
  globalThis.fetch = async (url, options) => {
    assert.equal(String(url), '/api/v1/admin/events/images');
    assert.equal(options?.method, 'POST');
    assert.equal((options?.headers as Record<string,string>).Authorization, 'Bearer admin-token');
    assert.equal((options?.headers as Record<string,string>)['Content-Type'], undefined);
    assert.ok(options?.body instanceof FormData);
    assert.equal(await (options.body.get('file') as File).text(), 'image bytes');
    return json({imageUrl:'https://res.cloudinary.com/demo/image/upload/event.png'});
  };
  assert.equal(await api.uploadEventImage(file), 'https://res.cloudinary.com/demo/image/upload/event.png');
});
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
  const api = new ApiClient(); api.setAuth('old', { id: 'u', email: 'e', role: 'USER' });
  const keys: unknown[] = []; const bodies: unknown[] = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/refresh')) return json({ accessToken: 'new', refreshToken: 'rotated' });
    keys.push((options?.headers as Record<string, string>)['Idempotency-Key']); bodies.push(options?.body);
    return keys.length === 1 ? json({ message: 'expired' }, 401) : json({ id: 'order' }, 201);
  };
  assert.equal((await api.createOrder('reservation', 'stable-key')).id, 'order');
  assert.deepEqual(keys, ['stable-key', 'stable-key']); assert.equal(bodies[0], bodies[1]);
  assert.equal(api.getToken(), 'new');
});
test('failed refresh clears session and never logs into a demo account', async () => {
  const api = new ApiClient(); api.setAuth('old', null); const calls: string[] = [];
  globalThis.fetch = async url => { calls.push(String(url)); return json({ message: 'expired' }, 401); };
  await assert.rejects(api.getMe());
  assert.equal(api.getToken(), null);
  assert.deepEqual(calls, ['/api/v1/auth/me', '/api/v1/auth/refresh']);
});
test('logout revokes refresh token even though access tokens remain independently valid', async () => {
  const api = new ApiClient(); api.setAuth('a', null);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/v1/auth/logout'); assert.equal(options?.body, undefined); assert.equal((options?.headers as Record<string,string>)['X-Auth-Mode'], 'cookie');
    return new Response(null, { status: 204 });
  };
  await api.logout(); assert.equal(api.getToken(), null);
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


for (const admin of [false, true]) {
  test(`${admin ? 'admin' : 'public'} event listing fetches only the requested page and retains metadata`, async () => {
    const api = new ApiClient();
    if (admin) api.setAuth('admin-token', {id:'a',email:'admin@test',role:'ADMIN'});
    let requests = 0;
    const result = {content:[{id:'event-25',title:'Concert'}],page:2,totalPages:3,totalElements:25};
    globalThis.fetch = async (input, options) => {
      requests++;
      const url = new URL(String(input), 'http://localhost');
      assert.equal(url.pathname, admin ? '/api/v1/admin/events' : '/api/v1/events');
      assert.equal(url.searchParams.get('page'), '2');
      assert.equal(url.searchParams.get('size'), '12');
      if (admin) assert.equal((options?.headers as Record<string,string>).Authorization, 'Bearer admin-token');
      else {
        assert.equal(url.searchParams.get('keyword'), 'nhạc & vé');
        assert.equal(url.searchParams.get('onSale'), 'true');
      }
      return json(result);
    };
    assert.deepEqual(await (admin ? api.getAdminEvents(2) : api.getEvents('nhạc & vé', true, 2)), result);
    assert.equal(requests, 1);
  });
}

test('event listing defaults to first page and supports an explicit page size', async () => {
  const api = new ApiClient();
  const requests: URL[] = [];
  globalThis.fetch = async input => {
    requests.push(new URL(String(input), 'http://localhost'));
    return json({content:[],page:0,totalPages:0,totalElements:0});
  };
  await api.getEvents();
  await api.getAdminEvents(0, 24);
  assert.equal(requests[0].searchParams.get('page'), '0');
  assert.equal(requests[0].searchParams.get('size'), '12');
  assert.equal(requests[1].searchParams.get('page'), '0');
  assert.equal(requests[1].searchParams.get('size'), '24');
});
