import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, ApiError, pollDelay, retryAfter } from '../src/api/client';
test('refresh is single flight and each original request retries only once', async () => {
  const api = new ApiClient(); api.setAuth('old', null); let refreshes = 0; let retries = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/refresh')) { refreshes++; await new Promise(r => setTimeout(r, 10)); return Response.json({ accessToken: 'new', refreshToken: 'rotated' }); }
    if ((options?.headers as Record<string, string>).Authorization === 'Bearer old') return new Response(null, { status: 401 });
    retries++; return Response.json({ message: 'still unauthorized' }, { status: 401 });
  };
  await Promise.allSettled([api.getMyOrders(), api.getMyReservations()]);
  assert.equal(refreshes, 1); assert.equal(retries, 2); assert.equal(api.getToken(), null);
});
test('Retry-After supports seconds and dates; jitter never polls earlier', () => {
  assert.equal(retryAfter('3'), 3000); assert.equal(retryAfter('invalid'), undefined);
  assert.ok((retryAfter(new Date(Date.now() + 5000).toUTCString()) || 0) > 3500);
  for (let i = 0; i < 30; i++) assert.ok(pollDelay({ retryAfterMs: 4000 }, 100) >= 4000);
});
test('429 and 503 preserve retry metadata and friendly messages', async () => {
  for (const status of [429, 503]) {
    globalThis.fetch = async () => Response.json({ message: 'busy' }, { status, headers: { 'Retry-After': '7' } });
    await assert.rejects(new ApiClient().getEvents(), (e: unknown) => e instanceof ApiError && e.retryAfterMs === 7000 && e.message.includes('7'));
  }
});
test('tokens are never written to browser storage', async () => {
  const writes: string[] = []; Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { removeItem() {}, setItem(key: string) { writes.push(key); } } });
  const api = new ApiClient(); api.setAuth('secret', { id: '1', email: 'u', role: 'STAFF' });
  assert.deepEqual(writes, []); assert.equal(new ApiClient().getToken(), null);
});


test('Spring void endpoints accept empty 200 and 204 while malformed JSON still fails', async () => {
  for (const status of [200, 204]) {
    globalThis.fetch = async () => new Response(null, { status });
    assert.equal(await new ApiClient().request('/admin/events/event/section-tiers', {method: 'PUT'}), undefined);
  }
  globalThis.fetch = async () => new Response('{broken', {status: 200});
  await assert.rejects(new ApiClient().request('/admin/events'), SyntaxError);
});
