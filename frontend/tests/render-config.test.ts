import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('frontend uses the public backend URL so an API request can wake the free Render service', async () => {
  const blueprint = await readFile(new URL('../../render.yaml', import.meta.url), 'utf8');
  assert.match(blueprint, /name: ticketrush-frontend[\s\S]*?key: BACKEND_URL\s+value: https:\/\/ticketrush-backend\.onrender\.com/);
});
