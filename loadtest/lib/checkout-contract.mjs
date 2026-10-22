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

export function calibrationStages(value, users) {
  if (!Number.isInteger(users) || users < 1) throw new Error('Calibration needs a positive queue cohort');
  const stages = String(value).split(',').map(part => {
    const values = part.split(':');
    if (values.length !== 2) throw new Error('Calibration stages must use RATE:SECONDS pairs');
    const [rate, duration] = values.map(Number);
    if (!Number.isInteger(rate) || !Number.isInteger(duration) || rate < 1 || duration < 1) {
      throw new Error('Calibration stages must use RATE:SECONDS pairs');
    }
    return { rate, duration, offered: rate * duration };
  });
  const offered = stages.reduce((total, stage) => total + stage.offered, 0);
  if (!stages.length || offered > users) throw new Error('Calibration stages exceed the queue cohort');
  return { stages, offered };
}

export function pacedJoinMaxDuration(users, rate, graceSeconds = 30) {
  if (!Number.isInteger(users) || !Number.isInteger(rate) || !Number.isInteger(graceSeconds)
      || users < 1 || rate < 1 || graceSeconds < 0 || users % rate !== 0) {
    throw new Error('Paced join duration needs a positive, divisible cohort and rate');
  }
  // One round ends with sleep(1), so the exact VU rounds themselves consume
  // users / rate seconds before request latency and k6 scheduling overhead.
  return `${users / rate + graceSeconds}s`;
}
