import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../frontend/src/api/client';

test('fresh page restores only from cookies and reads server roles; StrictMode shares one bootstrap', async t => {
  const api = new ApiClient(); let refreshes = 0, profiles = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    if (url.endsWith('/refresh')) {
      refreshes++;
      assert.equal(options.credentials, 'include');
      assert.equal(options.body, undefined);
      assert.equal((options.headers as Record<string,string>)['X-Auth-Mode'], 'cookie');
      return Response.json({ accessToken: 'restored' });
    }
    profiles++;
    assert.equal((options.headers as Record<string,string>).Authorization, 'Bearer restored');
    return Response.json({ id: 'u', email: 'u@example.test', roles: ['ADMIN'] });
  });
  const [first, second] = await Promise.all([api.restoreSession(), api.restoreSession()]);
  assert.deepEqual(first, second); assert.equal(first?.role, 'ADMIN');
  assert.equal(refreshes, 1); assert.equal(profiles, 1); assert.equal(api.getUser()?.id, 'u');
});

test('missing or expired cookie ends restoration without fetching a profile', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({}, { status: 401 }); });
  const api = new ApiClient();
  assert.equal(await api.restoreSession(), null); assert.equal(calls, 1); assert.equal(api.getToken(), null);
});

test('temporary refresh outage preserves existing auth and restoration can be retried', async t => {
  const api = new ApiClient(); api.setAuth('old', { id: 'u', email: 'u@test', role: 'USER' });
  let failed = true;
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (failed) return Response.json({}, { status: 503 });
    return Response.json(url.endsWith('/refresh') ? { accessToken: 'new' } : { id: 'u', email: 'u@test', roles: ['USER'] });
  });
  await assert.rejects(api.restoreSession());
  assert.equal(api.getToken(), 'old'); assert.equal(api.getUser()?.id, 'u');
  failed = false;
  assert.equal((await api.restoreSession())?.id, 'u'); assert.equal(api.getToken(), 'new');
});

test('logout waits for rotation, sends no stale bearer, and pending restore cannot resurrect the session', async t => {
  const api = new ApiClient(); api.setAuth('expired-access', null);
  let release!: (response: Response) => void;
  let refreshStarted!: () => void;
  const started = new Promise<void>(resolve => { refreshStarted = resolve; });
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls.push(url);
    if (url.endsWith('/refresh')) {
      refreshStarted(); return new Promise<Response>(resolve => { release = resolve; });
    }
    assert.ok(url.endsWith('/logout'));
    assert.equal((options.headers as Record<string,string>).Authorization, undefined);
    return new Response(null, { status: 204 });
  });
  const restoring = api.restoreSession(); await started;
  const logout = api.logout();
  release(Response.json({ accessToken: 'rotated' }));
  await logout; assert.equal(await restoring, null);
  assert.equal(api.getUser(), null); assert.equal(api.getToken(), null);
  assert.deepEqual(calls, ['/api/v1/auth/refresh', '/api/v1/auth/logout']);
});

test('failed logout keeps the session so the UI can report failure and retry', async t => {
  const api = new ApiClient(); api.setAuth('access', { id: 'u', email: 'u@test', role: 'USER' });
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }));
  await assert.rejects(api.logout());
  assert.equal(api.getToken(), 'access'); assert.equal(api.getUser()?.id, 'u');
});
