import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Footer } from '../frontend/src/components/Footer';
import { ThemeProvider } from '../frontend/src/context/ThemeContext';
import { can, roles } from '../frontend/src/access/permissions';
import { matchRoute } from '../frontend/src/access/routes';

for (const role of roles) {
  test(`footer exposes working, authorized navigation for ${role}`, () => {
    const html = renderToStaticMarkup(React.createElement(ThemeProvider, null, React.createElement(Footer, { role })));
    assert.equal((html.match(/<footer\b/g) || []).length, 1);
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1]);
    assert.ok(links.includes('/events'));
    assert.equal(links.includes('/account/tickets'), role === 'USER');
    assert.equal(links.includes('/account/orders'), role === 'USER');
    assert.equal(links.includes('/account/profile'), role === 'USER');
    assert.equal(links.includes('/gate'), role === 'STAFF' || role === 'ADMIN');
    assert.equal(links.includes('/admin'), role === 'ADMIN');
    assert.equal(links.includes('/admin/operations'), role === 'ADMIN');
    assert.equal(links.includes('/admin/results'), role === 'ADMIN');
    assert.equal(links.includes('/login'), role === 'PUBLIC');
    assert.equal(links.includes('/register'), role === 'PUBLIC');
    for (const href of links) {
      const route = matchRoute(href);
      assert.notEqual(route.path, '/404', href);
      if (route.permission) assert.ok(can(role, route.permission), `${role}: ${href}`);
    }
    assert.doesNotMatch(html, /All Systems Operational|v2\.4-prod|1900-888|ops@ticketrush/);
  });
}
