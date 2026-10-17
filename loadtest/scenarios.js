import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { request, body, key, outcomes, base } from './lib/client.js';
import { calibrationStages, checkoutTarget, checkoutThresholds } from './lib/checkout-contract.mjs';

const users = new SharedArray('loadtest users', () => JSON.parse(open('./.data/users.json')));
const data = JSON.parse(open('./.data/dataset.json'));
const scenario = (__ENV.SCENARIO || 'A').toUpperCase();
const waiting = __ENV.WAITING_ROOM === 'true' || data.waiting;
const window = Number(__ENV.SPIKE_SECONDS || 20);
const arrivals = Number(__ENV.SPIKE_USERS || 5000);
const vus = { preAllocatedVUs: Number(__ENV.PRE_VUS || 200), maxVUs: Number(__ENV.MAX_VUS || 1000) };
const rate = Number(__ENV.RATE || (scenario === 'B' ? 50 : 5));
const duration = __ENV.DURATION || (scenario === 'G' ? '20m' : '60s');
const stressRates = (__ENV.STRESS_RATES || '10,25,50,100,200').split(',').map(Number);
const stressPlateau = __ENV.STEP_DURATION || '29s';
const paymentPollBaseMs = Number(__ENV.PAYMENT_POLL_BASE_MS || 1000);
const paymentPollMaxMs = Number(__ENV.PAYMENT_POLL_MAX_MS || 2000);
const paymentPollJitterMs = Number(__ENV.PAYMENT_POLL_JITTER_MS || 250);
const paymentMaxPolls = Number(__ENV.PAYMENT_MAX_POLLS || 20);
const queueUsers = Number(__ENV.QUEUE_USERS || 5000);
const queueJoinVUs = Number(__ENV.QUEUE_JOIN_VUS || 300);
const queueJoinRate = Number(__ENV.QUEUE_JOIN_RATE || 0);
const queueJoinDuration = __ENV.QUEUE_JOIN_DURATION || '10s';
const queuePollers = Number(__ENV.QUEUE_POLLERS || 500);
const queuePollDuration = __ENV.QUEUE_POLL_DURATION || '60s';
// A joined client receives Retry-After from the join response.  The separate
// polling scenario receives that captured value through this run parameter.
// Do not use a fixed 0-2 s window: 5,000 simultaneous joins would synchronize
// roughly 2,500 status requests/s.
const queueFirstPollAdviceSeconds = Number(__ENV.QUEUE_FIRST_POLL_ADVICE_SECONDS || 10);
const queueJoinMaxAttempts = Number(__ENV.QUEUE_JOIN_MAX_ATTEMPTS || 3);
const statusTokenPool = Number(__ENV.STATUS_TOKEN_POOL || 200);
const statusBurstAfterSeconds = Number(__ENV.STATUS_BURST_AFTER_SECONDS || 15);
const statusBurstRampSeconds = Number(__ENV.STATUS_BURST_RAMP_SECONDS || 1);
const statusBurstDurationSeconds = Number(__ENV.STATUS_BURST_DURATION_SECONDS || 2);
const statusBurstSteadyRate = Number(__ENV.STATUS_BURST_STEADY_RATE || 500);
const statusBurstRate = Number(__ENV.STATUS_BURST_RATE || 2500);
const checkoutVUs = Number(__ENV.CHECKOUT_VUS || 100);
const checkoutRate = Number(__ENV.CHECKOUT_RATE || 20);
const checkoutDuration = __ENV.CHECKOUT_DURATION || '5s';
const checkoutRetries = Number(__ENV.CHECKOUT_MAX_RETRIES || 3);
const checkoutKeyOffset = Number(__ENV.CHECKOUT_KEY_OFFSET || 0);
const calibration = scenario === 'K'
  ? calibrationStages(__ENV.CALIBRATION_STAGES || '10:45,20:45,40:45,60:30', queueUsers)
  : { stages: [], offered: 0 };
const admissionPairs = ['Q', 'V'].includes(scenario)
  ? new SharedArray('admission pairs', () => JSON.parse(open('./.data/admissions.json'))) : [];
const usersById = ['K', 'Q', 'V'].includes(scenario) ? Object.fromEntries(users.map(user => [user.id, user])) : {};
const loadtestAdmin = scenario === 'K' ? JSON.parse(open('./.data/admin.json')) : null;
const checkoutExpected = checkoutTarget(scenario, admissionPairs.length, checkoutRate, checkoutDuration);
const checkoutStarted = new Counter('checkout_started');
if (!/^\d+s$/.test(stressPlateau)) throw new Error('STEP_DURATION must be an integer number of seconds');
if (queueJoinRate > 0 && queueUsers % queueJoinRate !== 0) throw new Error('QUEUE_USERS must divide evenly by QUEUE_JOIN_RATE');
const stressPhaseSeconds = 1 + Number(stressPlateau.slice(0, -1));
const businessFailures = new Counter('business_failures');
const completed = new Counter('purchases_paid');
const arrivalsStarted = new Counter('arrivals_started');
const queueWait = new Trend('queue_wait_ms', true);
const queueJoinsStarted = new Counter('queue_joins_started');
const queueJoinsAccepted = new Counter('queue_joins_accepted');
const queueJoinResponses = new Counter('queue_join_responses');
const queueJoin5xx = new Counter('queue_join_5xx');
const queueJoinRetries = new Counter('queue_join_retries');
const healthStarted = new Counter('health_started');
const healthCompleted = new Counter('health_completed');
const queuePosition = new Trend('queue_position', true);
const queuePollInterval = new Trend('queue_poll_interval_seconds', true);
const queueRetryAfterHonored = new Counter('queue_retry_after_honored');
const queueRejoinPreserved = new Counter('queue_rejoin_preserved');
const queueStatusResponses = new Counter('queue_status_responses');
const queueStatusSteadyDuration = new Trend('queue_status_steady_duration', true);
const queueStatusBurstDuration = new Trend('queue_status_burst_duration', true);
const queueStatusPostBurstDuration = new Trend('queue_status_post_burst_duration', true);
// Every terminal or retried checkout failure is both labelled for remote-write and
// written to the k6 log. The latter is an audit trail when a remote-write scrape
// is unavailable after a short run.
const checkoutResponses = new Counter('checkout_responses');
const checkoutNon2xxResponses = new Counter('checkout_non_2xx_responses');
const checkoutRetriesMetric = new Counter('checkout_retries');
const checkoutReservationBulkheadRejected = new Counter('checkout_reservation_bulkhead_rejected');
const checkoutOrderBulkheadRejected = new Counter('checkout_order_bulkhead_rejected');
const checkoutReservationPoolUnavailable = new Counter('checkout_reservation_pool_unavailable');
const checkoutOrderPoolUnavailable = new Counter('checkout_order_pool_unavailable');
const checkoutReservationInvalidAdmission = new Counter('checkout_reservation_invalid_admission');
const checkoutReservationAlreadyHeld = new Counter('checkout_reservation_already_held');
const checkoutReservationOtherConflict = new Counter('checkout_reservation_other_conflict');
const calibrationFeedEmpty = new Counter('calibration_admission_feed_empty');
const calibrationFeedErrors = new Counter('calibration_admission_feed_errors');
const calibrationReserveDuration = new Trend('calibration_reserve_duration', true);
const calibrationOrderDuration = new Trend('calibration_order_duration', true);
const calibrationVUs = { preAllocatedVUs: Math.max(10, Math.ceil(vus.preAllocatedVUs / 4)), maxVUs: vus.maxVUs };
function steady(fn, arrivalRate, time) {
  return { executor: 'constant-arrival-rate', exec: fn, rate: arrivalRate, timeUnit: '1s', duration: time,
    ...vus, gracefulStop: '90s' };
}
const spike = { executor: 'constant-arrival-rate', exec: 'purchase', rate: arrivals,
  timeUnit: `${window}s`, duration: `${window}s`, ...vus, gracefulStop: '180s' };
const plans = {
  A: { smoke: steady('purchase', 1, '60s') },
  B: { browse: steady('browse', rate, duration) },
  C: { spike }, D: { spike, browse: steady('browse', Number(__ENV.BROWSE_RATE || 50), `${window + 30}s`) },
  E: { stress: { executor: 'ramping-arrival-rate', exec: 'purchase', startRate: 1, timeUnit: '1s', ...vus,
    stages: stressRates.flatMap(value => [
      { duration: '1s', target: value }, { duration: stressPlateau, target: value }
    ]).concat([{ duration: '1s', target: 2 }, { duration: '60s', target: 2 }]), gracefulStop: '90s' } },
  F: { auth: steady('login', Number(__ENV.RATE || 10), duration) },
  G: { soak: steady('purchase', rate, duration), browse: steady('browse', Number(__ENV.BROWSE_RATE || 5), duration) },
  H: { spike }, W: { warmup: steady('purchase', 2, __ENV.WARMUP_DURATION || '60s') },
  J: { join: queueJoinRate > 0
    ? { executor: 'per-vu-iterations', exec: 'queueJoin', vus: queueJoinRate, iterations: queueUsers / queueJoinRate,
      maxDuration: __ENV.QUEUE_JOIN_MAX_DURATION || '45s', gracefulStop: '30s' }
    : { executor: 'shared-iterations', exec: 'queueJoin', vus: queueJoinVUs, iterations: queueUsers,
      maxDuration: __ENV.QUEUE_JOIN_MAX_DURATION || '2m', gracefulStop: '30s' } },
  N: { health: { executor: 'per-vu-iterations', exec: 'healthCheck', vus: queueJoinRate,
    iterations: queueUsers / queueJoinRate, maxDuration: __ENV.QUEUE_JOIN_MAX_DURATION || '45s', gracefulStop: '30s' } },
  R: { rejoin: { executor: 'shared-iterations', exec: 'queueRejoin', vus: Math.min(100, queueJoinVUs),
    iterations: Number(__ENV.QUEUE_REJOIN_USERS || 100), maxDuration: '30s', gracefulStop: '10s' } },
  P: { poll: { executor: 'constant-vus', exec: 'queuePoll', vus: queuePollers, duration: queuePollDuration,
    gracefulStop: '30s' } },
  S: { statusMicro: steady('queueStatusMicro', Number(__ENV.STATUS_RATE || 50), __ENV.STATUS_DURATION || '45s') },
  T: { statusBurst: { executor: 'ramping-arrival-rate', exec: 'queueStatusBurst', startRate: statusBurstSteadyRate,
    timeUnit: '1s', ...vus, stages: [
      { duration: `${statusBurstAfterSeconds}s`, target: statusBurstSteadyRate },
      { duration: `${statusBurstRampSeconds}s`, target: statusBurstRate },
      { duration: `${statusBurstDurationSeconds}s`, target: statusBurstRate },
      { duration: '1s', target: statusBurstSteadyRate },
      { duration: __ENV.STATUS_POST_BURST_DURATION || '30s', target: statusBurstSteadyRate }
    ], gracefulStop: '90s' } },
  Q: { checkout: { executor: 'shared-iterations', exec: 'checkout', vus: checkoutVUs, iterations: admissionPairs.length,
    maxDuration: __ENV.CHECKOUT_MAX_DURATION || '5m', gracefulStop: '90s' } },
  V: { checkoutPaced: steady('checkout', checkoutRate, checkoutDuration) },
  K: Object.fromEntries(calibration.stages.reduce((entries, stage, index) => {
    const start = calibration.stages.slice(0, index).reduce((seconds, value) => seconds + value.duration, 0);
    entries.push([`calibration_${stage.rate}`, { executor: 'constant-arrival-rate', exec: 'checkoutCalibration',
      rate: stage.rate, timeUnit: '1s', duration: `${stage.duration}s`, startTime: `${start}s`, ...calibrationVUs, gracefulStop: '90s' }]);
    return entries;
  }, [])),
};
if (!plans[scenario]) throw new Error('Unknown scenario; choose A..H, J, K, N, R, P, Q, S, T, V or W');
export const options = {
  scenarios: plans[scenario],
  // Exclude raw URL, user/token values and VU identifiers from every exported series.
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response', 'error_code'],
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)'],
  thresholds: {
    ...checkoutThresholds(checkoutExpected),
    http_req_failed: ['rate<0.01'], unexpected_responses: ['rate<0.01'], unexpected_5xx: ['count==0'],
    dropped_iterations: ['count==0'], checks: ['rate==1'], business_failures: ['count==0'],
    ...Object.fromEntries(['sold_out', 'rate_limited', 'waiting_room_required', 'error', 'abandoned', 'paid', 'payment_failed', 'rejected_429', 'rejected_503',
      'browse_ok', 'browse_rate_limited', 'login_ok', 'login_rate_limited', 'queue_sold_out'].map(result =>
      [`business_outcomes{result:${result}}`, ['count>=0']])),
    ...(['A', 'C', 'D', 'E', 'G', 'H', 'K', 'Q', 'V', 'W'].includes(scenario) ? {
      'http_req_duration{name:POST /api/v1/reservations}': ['p(95)<1000', 'p(99)<2000'],
      'http_req_duration{name:POST /api/v1/orders}': ['p(95)<1000', 'p(99)<2000'],
    } : {}),
    ...(scenario === 'B' || scenario === 'D' || scenario === 'G' ? {
      'http_req_duration{name:GET /api/v1/events}': ['p(95)<500', 'p(99)<1000'],
      'http_req_duration{name:GET /api/v1/events/{id}}': ['p(95)<500', 'p(99)<1000'],
    } : {}),
    ...(scenario === 'F' ? { 'http_req_duration{name:POST /api/v1/auth/login}': ['p(95)<2000', 'p(99)<3000'] } : {}),
    ...(scenario === 'A' ? { purchases_paid: ['count>=60'] } : {}),
    ...(['C', 'D', 'H'].includes(scenario) ? { arrivals_started: [`count==${arrivals}`] } : {}),
    ...(scenario === 'J' ? { queue_joins_started: [`count==${queueUsers}`], queue_joins_accepted: [`count==${queueUsers}`],
      'http_req_duration{name:POST /api/v1/events/{id}/waiting-room/join}': ['p(95)<1000'] } : {}),
    ...(scenario === 'N' ? { health_started: [`count==${queueUsers}`], health_completed: [`count==${queueUsers}`],
      'http_req_duration{name:GET /actuator/health}': ['p(95)<1000'] } : {}),
    ...(scenario === 'R' ? { queue_rejoin_preserved: [`count==${Number(__ENV.QUEUE_REJOIN_USERS || 100)}`] } : {}),
    ...(scenario === 'P' ? { queue_retry_after_honored: ['count>0'],
      'http_req_duration{name:GET /api/v1/events/{id}/waiting-room/status}': ['p(95)<500', 'p(99)<1000'] } : {}),
    ...(scenario === 'S' ? {
      'http_req_duration{name:GET /api/v1/events/{id}/waiting-room/status}': ['p(95)<500', 'p(99)<1000'],
      queue_status_steady_duration: ['p(95)<500', 'p(99)<1000']
    } : {}),
    ...(scenario === 'K' ? { checkout_started: [`count==${calibration.offered}`], purchases_paid: [`count==${calibration.offered}`],
      calibration_admission_feed_empty: ['count==0'], calibration_admission_feed_errors: ['count==0'] } : {}),
    ...(scenario === 'E' ? Object.fromEntries(stressRates.map(r => `stage-${r}`).concat(['recovery']).flatMap(phase => [
      [`http_req_failed{phase:${phase}}`, ['rate>=0']],
      [`http_req_duration{phase:${phase}}`, ['p(95)>=0']],
      [`purchases_paid{phase:${phase}}`, ['count>=0']],
      [`business_failures{phase:${phase}}`, ['count>=0']],
    ])) : {}),
  },
};

function business(ok, label) {
  businessFailures.add(ok ? 0 : 1);
  check(ok, { [label]: value => value });
  return ok;
}

export function purchase() {
  if (scenario === 'E') {
    const phase = Math.floor((Date.now() - exec.scenario.startTime) / (stressPhaseSeconds * 1000));
    // Phase describes the arrival cohort, including its later polling requests.
    exec.vu.metrics.tags.phase = phase < stressRates.length ? `stage-${stressRates[phase]}` : 'recovery';
  }
  const index = exec.scenario.iterationInTest + (scenario === 'W' ? Math.max(0, users.length - 1000) : 0);
  // k6 may schedule an iteration at the duration boundary. Cap the business cohort, not the offered rate.
  if (['C', 'D', 'H'].includes(scenario) && index >= arrivals) return;
  arrivalsStarted.add(1);
  businessFailures.add(0);
  if (!business(index < users.length, 'distinct user available')) return;
  const user = users[index];
  const event = data.events.find(e => e.name === (scenario === 'W' ? 'WARMUP' : scenario === 'G' ? 'MIXED' : 'HOT'));
  const tier = event.tiers[index % event.tiers.length];
  const headers = { 'Idempotency-Key': key(index, '1') };
  if (waiting && scenario !== 'W' && scenario !== 'G') {
    let state = body(request('POST', `/api/v1/events/${event.id}/waiting-room/join`,
      'POST /api/v1/events/{id}/waiting-room/join', null, user.token, {}, [200, 429]));
    const started = Date.now();
    while (state.state !== 'ADMITTED' && !state.soldOut && Date.now() - started < Number(__ENV.QUEUE_TIMEOUT_MS || 120000)) {
      sleep(Math.max(1, Number(state.pollIntervalSeconds || 1)) + Math.random() * 0.25);
      state = body(request('GET', `/api/v1/events/${event.id}/waiting-room/status`,
        'GET /api/v1/events/{id}/waiting-room/status', null, user.token, {}, [200, 429]));
    }
    queueWait.add(Date.now() - started);
    if (state.soldOut) { outcomes.add(1, { result: 'queue_sold_out' }); return; }
    if (!business(state.state === 'ADMITTED', 'waiting room admitted before deadline')) return;
    headers['X-Admission-Token'] = state.token;
  }
  const quantity = 1 + index % 4;
  const payload = { tierId: tier, quantity };
  let response = request('POST', '/api/v1/reservations', 'POST /api/v1/reservations', payload,
    user.token, headers, [201, 409, 429, 403]);
  // A timeout may have committed. Reuse the key, then recover ALREADY_HELD via the owned listing.
  if (response.status === 0 && index % 5 === 0) {
    response = request('POST', '/api/v1/reservations', 'POST /api/v1/reservations', payload,
      user.token, headers, [201, 409, 429, 403]);
  }
  let reservation = body(response);
  if (response.status === 409 && reservation.code === 'ALREADY_HELD') {
    const owned = body(request('GET', '/api/v1/reservations/me?status=HELD',
      'GET /api/v1/reservations/me', null, user.token));
    reservation = (owned.content || []).find(r => r.tierId === tier) || {};
  } else if (response.status !== 201) {
    const expected = response.status === 409 && reservation.code === 'SOLD_OUT' ||
      response.status === 429 && reservation.code === 'RATE_LIMITED' ||
      response.status === 403 && reservation.code === 'WAITING_ROOM_REQUIRED';
    outcomes.add(1, { result: expected ? reservation.code.toLowerCase() : 'error' });
    business(expected && scenario !== 'A', 'reservation outcome expected');
    return;
  }
  if (!business(Boolean(reservation.id), 'reservation exists')) return;
  const full = ['A', 'W'].includes(scenario);
  if (!full && index % 10 === 0) { outcomes.add(1, { result: 'abandoned' }); return; }
  const mode = full ? 'SUCCESS' : index % 17 === 0 ? 'FAILURE' : index % 13 === 0 ? 'DUPLICATE_WEBHOOK' : 'SUCCESS';
  const orderHeaders = { 'Idempotency-Key': key(index, '2'), 'X-Mock-Scenario': mode,
    'X-Mock-Test-Token': __ENV.MOCK_PAYMENT_TEST_TOKEN };
  const orderResponse = request('POST', '/api/v1/orders', 'POST /api/v1/orders', { reservationId: reservation.id },
    user.token, orderHeaders, [201]);
  const order = body(orderResponse);
  if (!business(orderResponse.status === 201 && Boolean(order.id), 'order created')) return;
  if (index % 7 === 0) {
    const replay = request('POST', '/api/v1/orders', 'POST /api/v1/orders', { reservationId: reservation.id }, user.token, orderHeaders, [201]);
    business(body(replay).id === order.id, 'double click returns same order');
  }
  const expectedState = mode === 'FAILURE' ? 'PAYMENT_FAILED' : 'PAID';
  let status = 'PENDING_PAYMENT';
  for (let poll = 0; poll < paymentMaxPolls && status === 'PENDING_PAYMENT'; poll++) {
    const delayMs = Math.min(paymentPollMaxMs, paymentPollBaseMs * (2 ** Math.min(poll, 1)));
    sleep((delayMs + Math.random() * paymentPollJitterMs) / 1000);
    status = body(request('GET', `/api/v1/orders/${order.id}`, 'GET /api/v1/orders/{id}', null, user.token)).status;
  }
  if (business(status === expectedState, 'payment reached expected state')) {
    outcomes.add(1, { result: expectedState.toLowerCase() });
    if (status === 'PAID') completed.add(1);
  }
}

export function queueJoin() {
  const index = exec.scenario.iterationInTest;
  queueJoinsStarted.add(1);
  if (!business(index < queueUsers && index < users.length, 'distinct queue user available')) return;
  const event = data.events.find(value => value.name === 'HOT');
  let response;
  for (let attempt = 1; attempt <= queueJoinMaxAttempts; attempt += 1) {
    response = request('POST', `/api/v1/events/${event.id}/waiting-room/join`,
      'POST /api/v1/events/{id}/waiting-room/join', null, users[index].token, {}, [200, 500, 502, 503, 504]);
    if (response.status >= 500 && response.status <= 599) {
      queueJoin5xx.add(1, { status: String(response.status) });
      if (attempt < queueJoinMaxAttempts) {
        queueJoinRetries.add(1);
        sleep((0.05 * Math.pow(2, attempt - 1)) + Math.random() * 0.05);
        continue;
      }
    }
    break;
  }
  queueJoinResponses.add(1, { status: String(response.status) });
  const state = body(response);
  const accepted = response.status === 200 && state.state === 'WAITING' && state.position > 0;
  business(accepted, 'queue join accepted');
  if (accepted) {
    queueJoinsAccepted.add(1);
    queuePosition.add(state.position);
    outcomes.add(1, { result: 'queue_joined' });
  }
  // Per-VU iterations yield an exact cohort while keeping one user per VU per
  // second. This avoids a constant-arrival-rate boundary iteration creating a
  // non-existent 901st user in a 900-user setup.
  if (queueJoinRate > 0) sleep(1);
}

// A dependency-free control with the same 90 VU x 10 round cadence as the
// paced join. It attributes the client-side tail without a JWT, Redis or DB.
export function healthCheck() {
  healthStarted.add(1);
  const response = request('GET', '/actuator/health', 'GET /actuator/health', null, null, {}, [200]);
  const accepted = response.status === 200;
  business(accepted, 'health endpoint available');
  if (accepted) healthCompleted.add(1);
  sleep(1);
}

export function queueRejoin() {
  const index = exec.scenario.iterationInTest;
  const event = data.events.find(value => value.name === 'HOT');
  const user = users[index];
  if (!business(Boolean(user), 'sample queue user available')) return;
  const before = body(request('GET', `/api/v1/events/${event.id}/waiting-room/status`,
    'GET /api/v1/events/{id}/waiting-room/status', null, user.token, {}, [200]));
  const after = body(request('POST', `/api/v1/events/${event.id}/waiting-room/join`,
    'POST /api/v1/events/{id}/waiting-room/join', null, user.token, {}, [200]));
  const preserved = before.state === 'WAITING' && after.state === 'WAITING' && before.position === after.position;
  if (preserved) queueRejoinPreserved.add(1);
  business(preserved, 'rejoin preserves queue position');
}

export function queuePoll() {
  const index = (exec.vu.idInTest - 1) % queueUsers;
  const event = data.events.find(value => value.name === 'HOT');
  const user = users[index];
  if (!business(Boolean(user), 'distinct queue poller available')) return;
  // This is sampled uniformly from the Retry-After returned by the join.
  // It spreads a simultaneous cohort over that advised interval without
  // keeping a k6 VU alive for every waiting user in production tests.
  if (exec.scenario.iterationInInstance === 0) sleep(Math.random() * queueFirstPollAdviceSeconds);
  const response = request('GET', `/api/v1/events/${event.id}/waiting-room/status`,
    'GET /api/v1/events/{id}/waiting-room/status', null, user.token, {}, [200, 429]);
  queueStatusResponses.add(1, { status: String(response.status) });
  if (Date.now() - exec.scenario.startTime >= 15_000) queueStatusSteadyDuration.add(response.timings.duration);
  const state = body(response);
  const retryAfter = Number(response.headers['Retry-After'] || 1);
  if (response.status === 200) {
    const honored = retryAfter === Number(state.pollIntervalSeconds);
    if (honored) queueRetryAfterHonored.add(1);
    business(honored, 'status Retry-After matches advised interval');
    queuePollInterval.add(retryAfter);
    outcomes.add(1, { result: 'queue_polled' });
  } else {
    outcomes.add(1, { result: 'rate_limited' });
    business(false, 'queue status was not rate limited');
  }
  // The server varies its advisory interval; this small client delay prevents exact second boundaries.
  sleep(Math.max(1, retryAfter) + Math.random() * 0.1);
}

export function queueStatusMicro() {
  const index = Math.floor(Math.random() * Math.min(statusTokenPool, queueUsers));
  const event = data.events.find(value => value.name === 'HOT');
  const user = users[index];
  if (!business(Boolean(user), 'distinct status user available')) return;
  const response = request('GET', `/api/v1/events/${event.id}/waiting-room/status`,
    'GET /api/v1/events/{id}/waiting-room/status', null, user.token, {}, [200, 429]);
  queueStatusResponses.add(1, { status: String(response.status) });
  if (Date.now() - exec.scenario.startTime >= 15_000) queueStatusSteadyDuration.add(response.timings.duration);
  if (response.status === 200) {
    outcomes.add(1, { result: 'queue_polled' });
  } else {
    outcomes.add(1, { result: 'rate_limited' });
    business(false, 'status micro-run was not rate limited');
  }
}

export function queueStatusBurst() {
  const index = Math.floor(Math.random() * Math.min(statusTokenPool, queueUsers));
  const event = data.events.find(value => value.name === 'HOT');
  const user = users[index];
  if (!business(Boolean(user), 'random status user available')) return;
  const response = request('GET', `/api/v1/events/${event.id}/waiting-room/status`,
    'GET /api/v1/events/{id}/waiting-room/status', null, user.token, {}, [200, 429, 503]);
  queueStatusResponses.add(1, { status: String(response.status) });
  const elapsed = (Date.now() - exec.scenario.startTime) / 1000;
  const burstStart = statusBurstAfterSeconds + statusBurstRampSeconds;
  if (elapsed >= burstStart && elapsed < burstStart + statusBurstDurationSeconds)
    queueStatusBurstDuration.add(response.timings.duration);
  if (elapsed >= burstStart + statusBurstDurationSeconds + 1)
    queueStatusPostBurstDuration.add(response.timings.duration);
  if (response.status === 200) outcomes.add(1, { result: 'queue_polled' });
  else if (response.status === 429) { outcomes.add(1, { result: 'rate_limited' }); business(false, 'burst status was not rate limited'); }
  else if (response.status === 503) { outcomes.add(1, { result: 'rejected_503' }); business(true, 'burst status rejection was controlled'); }
  else { outcomes.add(1, { result: 'error' }); business(false, 'burst status was controlled'); }
}

function requestWithAdmissionRetry(method, path, name, payload, user, headers, accepted) {
  let response;
  for (let attempt = 0; attempt <= checkoutRetries; attempt++) {
    response = request(method, path, name, payload, user.token, headers, accepted);
    const result = body(response);
    const responseTags = { endpoint: name, status: String(response.status), code: String(result.code || 'NONE') };
    checkoutResponses.add(1, responseTags);
    if (response.status < 200 || response.status >= 300) {
      checkoutNon2xxResponses.add(1, responseTags);
      console.warn(`checkout_non_2xx endpoint=${name} status=${response.status} code=${responseTags.code}`);
    }
    const reservation = name.endsWith('reservations');
    if (result.code === 'BULKHEAD_REJECTED') {
      (reservation ? checkoutReservationBulkheadRejected : checkoutOrderBulkheadRejected).add(1);
    }
    if (result.code === 'DATABASE_POOL_TIMEOUT') {
      (reservation ? checkoutReservationPoolUnavailable : checkoutOrderPoolUnavailable).add(1);
    }
    if (reservation && result.code === 'INVALID_ADMISSION_TOKEN') checkoutReservationInvalidAdmission.add(1);
    if (reservation && result.code === 'ALREADY_HELD') checkoutReservationAlreadyHeld.add(1);
    if (reservation && response.status === 409 && !['SOLD_OUT', 'ALREADY_HELD'].includes(result.code)) {
      checkoutReservationOtherConflict.add(1);
    }
    if (![429, 503].includes(response.status) || attempt === checkoutRetries) return { response, result };
    checkoutRetriesMetric.add(1, { endpoint: name, status: String(response.status) });
    const retryAfter = Math.max(1, Number(response.headers['Retry-After'] || 1));
    sleep(retryAfter + Math.random() * 0.25);
  }
  return { response, result: body(response) };
}

function nextCalibrationAdmission(event) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = http.get(`${base}/internal/loadtest/events/${event.id}/waiting-room/admissions?limit=1`, {
      headers: { Authorization: `Bearer ${loadtestAdmin.token}` },
      tags: { name: 'GET /internal/loadtest/admissions' }, timeout: __ENV.REQUEST_TIMEOUT || '5s',
    });
    if (response.status === 200) {
      const values = body(response);
      if (Array.isArray(values) && values.length === 1) return values[0];
      calibrationFeedEmpty.add(1);
    } else {
      calibrationFeedErrors.add(1, { status: String(response.status) });
    }
    sleep(0.25);
  }
  return null;
}

export function checkoutCalibration() {
  checkoutStarted.add(1);
  completed.add(0);
  const phase = exec.scenario.name.replace('calibration_', '');
  const offset = calibration.stages.slice(0, calibration.stages.findIndex(stage => String(stage.rate) === phase))
    .reduce((total, stage) => total + stage.offered, 0);
  const index = offset + exec.scenario.iterationInScenario;
  const event = data.events.find(value => value.name === 'HOT');
  const admission = nextCalibrationAdmission(event);
  const user = admission && usersById[admission.user];
  if (!business(Boolean(admission && user), 'calibration admission belongs to a seeded user')) return;
  const payload = { tierId: event.tiers[index % event.tiers.length], quantity: 1 + index % 4 };
  const reservationAttempt = requestWithAdmissionRetry('POST', '/api/v1/reservations', 'POST /api/v1/reservations', payload,
    user, { 'Idempotency-Key': key(index, '3'), 'X-Admission-Token': admission.token }, [201, 409, 429, 403, 503]);
  calibrationReserveDuration.add(reservationAttempt.response.timings.duration, { phase });
  const reservation = reservationAttempt.result;
  if (reservationAttempt.response.status !== 201) {
    const outcome = reservation.code === 'SOLD_OUT' ? 'sold_out'
      : reservationAttempt.response.status === 429 ? 'rejected_429'
      : reservationAttempt.response.status === 503 ? 'rejected_503' : 'error';
    outcomes.add(1, { result: outcome });
    business(false, 'calibration reservation must succeed');
    return;
  }
  const orderAttempt = requestWithAdmissionRetry('POST', '/api/v1/orders', 'POST /api/v1/orders', { reservationId: reservation.id }, user,
    { 'Idempotency-Key': key(index, '4'), 'X-Mock-Scenario': 'SUCCESS', 'X-Mock-Test-Token': __ENV.MOCK_PAYMENT_TEST_TOKEN }, [201, 429, 503]);
  calibrationOrderDuration.add(orderAttempt.response.timings.duration, { phase });
  const order = orderAttempt.result;
  if (!business(orderAttempt.response.status === 201 && Boolean(order.id), 'calibration order created')) return;
  let status = 'PENDING_PAYMENT';
  for (let poll = 0; poll < paymentMaxPolls && status === 'PENDING_PAYMENT'; poll++) {
    const delayMs = Math.min(paymentPollMaxMs, paymentPollBaseMs * (2 ** Math.min(poll, 1)));
    sleep((delayMs + Math.random() * paymentPollJitterMs) / 1000);
    status = body(request('GET', `/api/v1/orders/${order.id}`, 'GET /api/v1/orders/{id}', null, user.token)).status;
  }
  if (business(status === 'PAID', 'calibration payment paid')) {
    outcomes.add(1, { result: 'paid' });
    completed.add(1);
  }
}

export function checkout() {
  const index = exec.scenario.iterationInTest;
  // k6 can schedule one extra arrival at the duration boundary.
  if (index >= checkoutExpected) return;
  checkoutStarted.add(1);
  completed.add(0);
  const admission = admissionPairs[index];
  const user = admission && usersById[admission.user];
  if (!business(Boolean(admission && user), 'admission pair belongs to a seeded user')) return;
  const event = data.events.find(value => value.name === 'HOT');
  const payload = { tierId: event.tiers[index % event.tiers.length], quantity: 1 + index % 4 };
  const reservationAttempt = requestWithAdmissionRetry('POST', '/api/v1/reservations', 'POST /api/v1/reservations', payload,
    user, { 'Idempotency-Key': key(index + checkoutKeyOffset, '3'), 'X-Admission-Token': admission.token }, [201, 409, 429, 403, 503]);
  const reservationResponse = reservationAttempt.response;
  const reservation = reservationAttempt.result;
  if (reservationResponse.status !== 201) {
    const outcome = reservation.code === 'SOLD_OUT' ? 'sold_out'
      : reservationResponse.status === 429 ? 'rejected_429'
      : reservationResponse.status === 503 ? 'rejected_503' : 'error';
    outcomes.add(1, { result: outcome });
    business(false, 'admitted checkout reservation must succeed');
    return;
  }
  const orderHeaders = { 'Idempotency-Key': key(index + checkoutKeyOffset, '4'), 'X-Mock-Scenario': 'SUCCESS',
    'X-Mock-Test-Token': __ENV.MOCK_PAYMENT_TEST_TOKEN };
  const orderAttempt = requestWithAdmissionRetry('POST', '/api/v1/orders', 'POST /api/v1/orders', { reservationId: reservation.id },
    user, orderHeaders, [201, 429, 503]);
  const orderResponse = orderAttempt.response;
  const order = orderAttempt.result;
  if ([429, 503].includes(orderResponse.status)) {
    outcomes.add(1, { result: orderResponse.status === 429 ? 'rejected_429' : 'rejected_503' });
    business(false, 'admitted checkout order must succeed');
    return;
  }
  if (!business(orderResponse.status === 201 && Boolean(order.id), 'queue checkout order created')) return;
  let status = 'PENDING_PAYMENT';
  for (let poll = 0; poll < paymentMaxPolls && status === 'PENDING_PAYMENT'; poll++) {
    const delayMs = Math.min(paymentPollMaxMs, paymentPollBaseMs * (2 ** Math.min(poll, 1)));
    sleep((delayMs + Math.random() * paymentPollJitterMs) / 1000);
    status = body(request('GET', `/api/v1/orders/${order.id}`, 'GET /api/v1/orders/{id}', null, user.token)).status;
  }
  if (business(status === 'PAID', 'queue checkout payment paid')) {
    outcomes.add(1, { result: 'paid' });
    completed.add(1);
  }
}

export function browse() {
  businessFailures.add(0);
  const index = exec.scenario.iterationInTest;
  const event = data.events[3 + index % (data.events.length - 3)];
  const path = index % 2 ? `/api/v1/events/${event.id}` : '/api/v1/events?page=0&size=20';
  const name = index % 2 ? 'GET /api/v1/events/{id}' : 'GET /api/v1/events';
  const response = request('GET', path, name, null, null, {}, [200, 429]);
  business([200, 429].includes(response.status), 'browse response expected');
  outcomes.add(1, { result: response.status === 429 ? 'browse_rate_limited' : 'browse_ok' });
}

export function login() {
  businessFailures.add(0);
  const user = users[exec.scenario.iterationInTest % users.length];
  const response = request('POST', '/api/v1/auth/login', 'POST /api/v1/auth/login',
    { email: user.email, password: user.password }, null, {}, [200, 429]);
  business([200, 429].includes(response.status), 'login or limiter expected');
  outcomes.add(1, { result: response.status === 429 ? 'login_rate_limited' : 'login_ok' });
}

export function handleSummary(summary) {
  return { [`/results/${__ENV.RUN_ID || scenario}.json`]: JSON.stringify(summary, null, 2),
    stdout: JSON.stringify({ scenario, thresholds: Object.fromEntries(Object.entries(summary.metrics)
      .filter(([, value]) => value.thresholds).map(([name, value]) => [name, value.thresholds])) }) + '\n' };
}
