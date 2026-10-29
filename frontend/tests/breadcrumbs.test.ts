import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Breadcrumbs, pageBreadcrumbs } from '../src/components/user/Breadcrumbs';
import { routes } from '../src/access/routes';

test('every registered route has exactly one current breadcrumb and valid parent routes', () => {
  for (const route of routes) {
    const path = route.path.replace(/:[^/]+/g, 'example');
    const crumbs = pageBreadcrumbs(path);
    assert.equal(crumbs.filter(crumb => !crumb.href).length, 1, path);
    assert.equal(crumbs.at(-1)?.href, undefined, path);
    for (const crumb of crumbs.filter(crumb => crumb.href)) assert.ok(crumb.href?.startsWith('/'));
    const html = renderToStaticMarkup(React.createElement(Breadcrumbs, { pathname: path }));
    assert.match(html, /aria-label="Đường dẫn trang"/);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  }
});
test('nested booking and administration breadcrumbs link to the correct parents', () => {
  assert.deepEqual(pageBreadcrumbs('/events/concert/select?section=1').map(c => c.href), ['/', '/events', '/events/concert', undefined]);
  assert.deepEqual(pageBreadcrumbs('/orders/order-1').map(c => c.href), ['/', '/account/orders', undefined]);
  assert.deepEqual(pageBreadcrumbs('/admin/events/new').map(c => c.href), ['/', '/admin', '/admin/events', undefined]);
  assert.equal(pageBreadcrumbs('/unknown').at(-1)?.label, 'Không tìm thấy trang');
});
