import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrationStages, checkoutTarget, checkoutThresholds } from './lib/checkout-contract.mjs';

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

test('calibration schedule preserves a finite queue cohort', () => {
  assert.deepEqual(calibrationStages('10:45,20:45,40:45,60:30', 5000), {
    stages: [
      { rate: 10, duration: 45, offered: 450 }, { rate: 20, duration: 45, offered: 900 },
      { rate: 40, duration: 45, offered: 1800 }, { rate: 60, duration: 30, offered: 1800 },
    ], offered: 4950,
  });
  assert.throws(() => calibrationStages('10:45,20:45,40:45,60:45', 5000));
});
