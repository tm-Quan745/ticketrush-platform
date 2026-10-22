import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, roles, permissions, landing, safeNext } from '../frontend/src/access/permissions';
import { routes, matchRoute } from '../frontend/src/access/routes';
const expected = { PUBLIC: [true, false, false, false, false], USER: [true, true, true, false, false], STAFF: [true, false, false, true, false], ADMIN: [true, false, false, false, true] };
for (const role of roles) for (const [i, permission] of permissions.entries()) test(`${role}: ${permission}`, () => assert.equal(can(role, permission), expected[role][i]));
test('next rejects off-origin, backslash, control and authentication loops', () => {
  for (const path of ['//evil.test', 'https://evil.test', '/\\evil.test', '/\nevil.test', '/login', '/register?next=/admin']) assert.equal(safeNext(path), null);
  assert.equal(safeNext('/events/id/queue?x=1#zone'), '/events/id/queue?x=1#zone');
  assert.equal(landing('USER', '/events/id/queue'), '/events/id/queue');
  assert.equal(landing('USER', '//evil.test'), '/events');
  assert.equal(landing('STAFF', '/account/orders'), '/gate');
  assert.equal(landing('ADMIN', '/account/orders'), '/admin');
});
test('every mapped private route has the intended permission; unknown paths are 404', () => {
  for (const route of routes) {
    const matched = matchRoute(route.path.replace(/:[^/]+/g, 'example'));
    assert.equal(matched.path, route.path);
    if (route.layout === 'admin') assert.equal(route.permission, 'admin');
    if (route.layout === 'staff') assert.equal(route.permission, 'gate');
    if (route.layout === 'buyer') assert.ok(['buy', 'account'].includes(route.permission!));
  }
  assert.equal(matchRoute('/admin/events/new').path, '/admin/events/new');
  assert.equal(matchRoute('/unknown').path, '/404');
});

