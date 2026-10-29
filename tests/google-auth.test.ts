import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient } from '../frontend/src/api/client';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
test('Google credentials are exchanged for application tokens and server roles', async () => {
  const client = new ApiClient(); const calls: string[] = [];
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).endsWith('/google')) {
      assert.equal(options?.body, JSON.stringify({credential: 'google-id-token'}));
      return json({accessToken: 'app-access', refreshToken: 'app-refresh'});
    }
    assert.equal((options?.headers as Record<string,string>).Authorization, 'Bearer app-access');
    return json({id:'u',email:'person@gmail.com',roles:['USER']});
  };
  assert.equal((await client.loginWithGoogle('google-id-token')).user.role, 'USER');
  assert.equal(client.getToken(), 'app-access');
  assert.deepEqual(calls, ['/api/v1/auth/google','/api/v1/auth/me']);
});
test('invalid Google token does not refresh an existing session', async () => {
  const client = new ApiClient(); client.setAuth('existing', null); const calls: string[] = [];
  globalThis.fetch = async url => { calls.push(String(url)); return json({code:'INVALID_GOOGLE_TOKEN'},401); };
  await assert.rejects(client.loginWithGoogle('invalid'));
  assert.deepEqual(calls, ['/api/v1/auth/google']);
});
test('failure loading the application user clears newly issued Google login session', async () => {
  const client = new ApiClient();
  globalThis.fetch = async url => String(url).endsWith('/google')
    ? json({accessToken:'a',refreshToken:'r'}) : json({message:'unavailable'},503);
  await assert.rejects(client.loginWithGoogle('credential'));
  assert.equal(client.getToken(),null);  assert.equal(client.getUser(),null);
});
