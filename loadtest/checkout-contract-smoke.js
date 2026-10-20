// Isolated k6 threshold regression, without network traffic or booking fixtures.
// Default: exit 99 (zero paid). With -e PAID=100: exit 0.
import { Counter } from 'k6/metrics';
import { checkoutThresholds } from './lib/checkout-contract.mjs';

const started = new Counter('checkout_started');
const paid = new Counter('purchases_paid');
export const options = { vus: 1, iterations: 1, thresholds: checkoutThresholds(100) };
export default function () {
  started.add(100);
  paid.add(Number(__ENV.PAID || 0));
}
