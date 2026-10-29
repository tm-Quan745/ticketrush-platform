import assert from 'node:assert/strict';
import test from 'node:test';
import { isBackendUnavailable } from '../src/api/availability';

test('backend availability classifies proxy failures and timeouts without classifying ordinary auth errors', () => {
  for (const status of [502, 503, 504]) assert.equal(isBackendUnavailable({ status }), true);
  assert.equal(isBackendUnavailable(new TypeError('Failed to fetch')), true);
  assert.equal(isBackendUnavailable(Object.assign(new Error('Timed out'), { name: 'TimeoutError' })), true);
  assert.equal(isBackendUnavailable({ status: 401 }), false);
  assert.equal(isBackendUnavailable({ status: 500 }), false);
});
