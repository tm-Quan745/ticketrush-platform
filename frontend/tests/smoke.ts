// Run explicitly against a local dev stack: npx tsx tests/smoke.ts.
// Creates a USER and buys one seeded ticket; no privileged account is required.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const origin = process.env.FRONTEND_URL || 'http://127.0.0.1:3000';
let accessToken = '';
async function request(path: string, method = 'GET', body?: unknown, extra = {}) {
  const res = await fetch(origin + '/api/v1' + path, { method, headers: {
    'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...extra,
  }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = res.status === 204 ? null : await res.json();
  assert.ok(res.ok, `${method} ${path}: ${res.status} ${JSON.stringify(value)}`);
  return value;
}
const credentials = { email: `frontend-smoke-${randomUUID()}@example.test`, password: randomUUID() };
await request('/auth/register', 'POST', credentials);
const tokens = await request('/auth/login', 'POST', credentials); accessToken = tokens.accessToken;
assert.ok((await request('/auth/me')).roles.includes('USER'));
const events = await request('/events?onSale=true'); assert.ok(events.content.length, 'seeded on-sale events required');
const detail = await request(`/events/${events.content[0].id}`);
const tier = detail.tiers.find((t: any) => t.availability !== 'SOLD_OUT'); assert.ok(tier);
assert.equal(tier.availableQuantity, undefined);
const reservation = await request('/reservations', 'POST', { tierId: tier.id, quantity: 1 });
assert.ok(reservation.seconds_remaining > 0);
const headers = { 'Idempotency-Key': randomUUID() };
const order = await request('/orders', 'POST', { reservationId: reservation.id }, headers);
const replay = await request('/orders', 'POST', { reservationId: reservation.id }, headers); assert.equal(replay.id, order.id);
let paid = order;
for (let i = 0; i < 30 && paid.status !== 'PAID'; i++) { await delay(1000); paid = await request(`/orders/${order.id}`); }
assert.equal(paid.status, 'PAID'); assert.equal((await request(`/orders/${order.id}/tickets`)).length, 1);
await request('/auth/logout', 'POST', { refreshToken: tokens.refreshToken });
console.log('PASS: proxy -> Spring -> PostgreSQL: register/login/me/events/reservation/order/replay/webhook/ticket/logout');
console.log(`Created smoke order ${order.id}; one dev ticket purchased.`);
