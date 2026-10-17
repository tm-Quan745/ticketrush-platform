import test from 'node:test';
import assert from 'node:assert/strict';
import { checkoutTarget, checkoutThresholds } from './lib/checkout-contract.mjs';

test('paced checkout requires the whole offered cohort to start and pay', () => {
  assert.deepEqual(checkoutThresholds(checkoutTarget('V', 120, 20, '5s')), {
    checkout_started: ['count==100'], purchases_paid: ['count==100'],
  });
});
test('simultaneous checkout requires all admissions to pay', () => {
  assert.deepEqual(checkoutThresholds(checkoutTarget('Q', 80)), {
    checkout_started: ['count==80'], purchases_paid: ['count==80'],
  });
});
test('empty and undersized cohorts fail before measurement', () => {
  assert.throws(() => checkoutTarget('Q', 0));
  assert.throws(() => checkoutTarget('V', 99, 20, '5s'));
});
test('invalid rates and durations cannot silently weaken the target', () => {
  for (const rate of [0, -1, NaN, 1.5]) assert.throws(() => checkoutTarget('V', 100, rate, '5s'));
  for (const duration of ['0s', '5ms', '1m', '-5s', '1.5s']) {
    assert.throws(() => checkoutTarget('V', 100, 20, duration));
  }
});
test('other workloads retain their existing contract', () => {
  assert.deepEqual(checkoutThresholds(checkoutTarget('C', 0)), {});
});
