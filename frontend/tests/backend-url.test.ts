import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBackendUrl } from '../backend-url';

test('backend URL accepts local URLs and Render private host ports', () => {
  assert.equal(resolveBackendUrl('https://api.example.test').href, 'https://api.example.test/');
  assert.equal(resolveBackendUrl('ticketrush-backend:8080').href, 'http://ticketrush-backend:8080/');
});
