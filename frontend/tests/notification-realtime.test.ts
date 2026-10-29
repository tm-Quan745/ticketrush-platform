import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { attachNotificationProxy } from '../notification-proxy';
import { connectNotifications, notificationSocketUrl } from '../src/features/notifications/realtime';

test('notification socket uses the API base and secure protocol without credentials in URL', () => {
  assert.equal(notificationSocketUrl('/api/v1', 'https://tickets.example/account'), 'wss://tickets.example/api/v1/notifications/ws');
  assert.equal(notificationSocketUrl('http://localhost:8080/api/v1/', 'http://localhost:3000'), 'ws://localhost:8080/api/v1/notifications/ws');
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onerror?: () => void;
  onclose?: (event: { code: number }) => void;
  sent: string[] = [];
  closed = false;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  send(frame: string) { this.sent.push(frame); }
  close(code = 1006) { if (!this.closed) { this.closed = true; this.onclose?.({ code }); } }
  message(type: string) { this.onmessage?.({ data: JSON.stringify({ type }) }); }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('authenticates in a frame, refreshes on ready/change, reconnects and cleans up', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => 0);
  const original = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  FakeSocket.instances = [];
  let refreshes = 0, tokens = 0;
  const states: boolean[] = [];
  const credentialRefreshes: boolean[] = [];
  const stop = connectNotifications({ url: 'ws://localhost/api/v1/notifications/ws',
    token: async force => { credentialRefreshes.push(force); return `token-${++tokens}`; }, refresh: () => refreshes++, status: state => states.push(state) });
  try {
    await settle();
    const first = FakeSocket.instances[0]; first.onopen?.();
    assert.deepEqual(JSON.parse(first.sent[0]), { type: 'authenticate', token: 'token-1' });
    assert.ok(!first.url.includes('token'));
    first.message('ready'); first.message('heartbeat'); first.message('orders.changed'); first.message('reservations.changed');
    first.onmessage?.({ data: 'invalid' }); first.message('unknown');
    assert.equal(refreshes, 3); assert.deepEqual(states, [true]);
    first.close(1008); assert.deepEqual(states, [true, false]);
    t.mock.timers.tick(999); await settle(); assert.equal(FakeSocket.instances.length, 1);
    t.mock.timers.tick(1); await settle();
    const second = FakeSocket.instances[1]; second.onopen?.();
    assert.equal(JSON.parse(second.sent[0]).token, 'token-2');
    assert.deepEqual(credentialRefreshes, [false, true]);
    stop(); assert.equal(second.closed, true);
    second.message('orders.changed');
    t.mock.timers.tick(60000); await settle();
    assert.equal(FakeSocket.instances.length, 2); assert.equal(refreshes, 3);
  } finally { stop(); globalThis.WebSocket = original; }
});

test('unmount while awaiting credentials never opens a socket', async () => {
  let resolve!: (token: string) => void;
  let refreshes = 0;
  const stop = connectNotifications({ url: 'ws://unused', token: () => new Promise(r => { resolve = r; }),
    refresh: () => refreshes++, status: () => { throw new Error('Unexpected status'); } });
  stop(); resolve('unused'); await settle(); assert.equal(refreshes, 0);
});

test('real upgrade proxy preserves Origin and forwards both directions', { timeout: 10000 }, async () => {
  const backend = http.createServer();
  const proxy = http.createServer();
  let remote: import('node:stream').Duplex | undefined;
  backend.on('upgrade', (req, socket) => {
    assert.equal(req.headers.origin, 'https://tickets.example');
    assert.equal(req.headers['x-forwarded-for'], undefined);
    remote = socket;
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nserver-head');
    socket.on('data', data => socket.write(data));
  });
  backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  attachNotificationProxy(proxy, new URL(`http://127.0.0.1:${(backend.address() as import('node:net').AddressInfo).port}`));
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const request = http.request({ hostname: '127.0.0.1', port: (proxy.address() as import('node:net').AddressInfo).port,
    path: '/api/v1/notifications/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket', Origin: 'https://tickets.example', 'X-Forwarded-For': 'spoofed' } });
  let client: import('node:stream').Duplex | undefined;
  try {
    const upgraded = once(request, 'upgrade'); request.end();
    const [response, socket, head] = await upgraded;
    client = socket;
    assert.equal(response.statusCode, 101);
    assert.equal(head.toString(), 'server-head');
    const echoed = once(socket, 'data'); socket.write('client-payload');
    assert.equal((await echoed)[0].toString(), 'client-payload');
  } finally { client?.destroy(); remote?.destroy(); request.destroy(); proxy.close(); backend.close(); }
});
