import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingNotifications } from '../frontend/src/features/notifications/model';
import type { Order, Reservation } from '../frontend/src/types';

const expired = { id: 'hold-1', userId: 'user-1', eventId: 'event-1', quantity: 2,
  tierName: 'VIP', status: 'EXPIRED', expires_at: '2000-01-01T00:00:00Z' } as Reservation;

test('expired hold without order is visible after refresh with stable read identity and booking link', () => {
  const items = bookingNotifications([], [expired], 'user-1');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Hết thời gian giữ vé');
  assert.match(items[0].message, /2 vé hạng VIP/);
  assert.match(items[0].message, /trả về kho/);
  assert.equal(items[0].href, '/events/event-1');
  assert.equal(items[0].reservationId, expired.id);
  assert.equal(items[0].id, bookingNotifications([], [expired], 'user-1')[0].id);
});

test('does not notify another owner, cancelled/confirmed holds or expiry inferred from client time', () => {
  const reservations = [
    { ...expired, userId: 'other' },
    ...(['HELD', 'CANCELLED', 'CONFIRMED'] as const).map(status => ({ ...expired, status })),
  ];
  assert.deepEqual(bookingNotifications([], reservations, 'user-1'), []);
});

test('expired order and its hold produce only one notification; late successful payment replaces expiry', () => {
  const order = { id: 'order-1', userId: 'user-1', reservationId: expired.id, status: 'EXPIRED' } as Order;
  const items = bookingNotifications([order], [expired], 'user-1');
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Hết thời gian giữ vé');
  assert.equal(items[0].href, '/orders/order-1');
  const paid = bookingNotifications([{ ...order, status: 'PAID' }], [expired], 'user-1');
  assert.equal(paid.length, 1);
  assert.match(paid[0].message, /Thanh toán thành công/);
  assert.notEqual(paid[0].id, items[0].id);
});
