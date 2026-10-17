// Checkout calibration requires every offered admitted buyer to reach PAID.
export function checkoutTarget(scenario, admissions, rate, duration) {
  if (!['Q', 'V'].includes(scenario)) return 0;
  if (!Number.isInteger(admissions) || admissions < 1) throw new Error('Checkout requires fresh admissions');
  if (scenario === 'Q') return admissions;
  if (!Number.isInteger(rate) || rate < 1 || !/^[1-9]\d*s$/.test(duration)) {
    throw new Error('Checkout requires a positive integer rate and duration in whole seconds');
  }
  const target = rate * Number(duration.slice(0, -1));
  if (target > admissions) throw new Error('Not enough admissions for the offered checkout cohort');
  return target;
}

export function checkoutThresholds(target) {
  return target ? { checkout_started: [`count==${target}`], purchases_paid: [`count==${target}`] } : {};
}
