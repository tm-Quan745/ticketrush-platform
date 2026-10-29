import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

test('local frontend health endpoint stays available when the backend is down', { timeout: 30000 }, async () => {
  const portProbe = http.createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = (portProbe.address() as import('node:net').AddressInfo).port;
  await new Promise<void>(resolve => portProbe.close(() => resolve()));

  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    windowsHide: true,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(port), BACKEND_URL: 'http://127.0.0.1:9' },
    stdio: 'ignore',
  });

  try {
    const url = `http://127.0.0.1:${port}/healthz`;
    let response: Response | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        response = await fetch(url);
        break;
      } catch {
        await delay(100);
      }
    }
    assert.equal(response?.status, 200);
    assert.deepEqual(await response?.json(), { status: 'UP' });
  } finally {
    child.kill();
  }
});
