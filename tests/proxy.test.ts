import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

test('real HTTP proxy preserves request, status, response headers and fails closed on outage', { timeout: 30000 }, async () => {
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.writeHead(409, { 'Content-Type': 'application/json', 'Retry-After': '2' });
      res.end(JSON.stringify({ path: req.url, body, authorization: req.headers.authorization,
        key: req.headers['idempotency-key'], forwarded: req.headers['x-forwarded-for'] }));
    });
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const backendPort = (upstream.address() as any).port;
  const portProbe = http.createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
  const frontendPort = (portProbe.address() as any).port; await new Promise<void>(resolve => portProbe.close(() => resolve()));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(frontendPort), BACKEND_URL: `http://127.0.0.1:${backendPort}` }, stdio: 'ignore' });
  try {
    const url = `http://127.0.0.1:${frontendPort}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { await fetch(url + '/actuator/health'); ready = true; break; } catch { await delay(100); }
    }
    assert.ok(ready, 'frontend process starts');
    const response = await fetch(url + '/api/v1/orders?test=true', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-only', 'Idempotency-Key': 'stable', 'X-Forwarded-For': 'spoofed' },
      body: '{"reservationId":"reservation"}' });
    assert.equal(response.status, 409); assert.equal(response.headers.get('Retry-After'), '2');
    assert.deepEqual(await response.json(), { path: '/api/v1/orders?test=true', body: '{"reservationId":"reservation"}', authorization: 'Bearer test-only', key: 'stable' });
    upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve()));
    const unavailable = await fetch(url + '/api/v1/events');
    assert.equal(unavailable.status, 502); assert.equal((await unavailable.json()).code, 'BACKEND_UNAVAILABLE');
  } finally {
    child.kill(); upstream.closeAllConnections(); upstream.close();
  }
});
