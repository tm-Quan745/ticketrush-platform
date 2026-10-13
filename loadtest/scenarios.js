import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { request, body, key, outcomes } from './lib/client.js';

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
if (!/^\d+s$/.test(stressPlateau)) throw new Error('STEP_DURATION must be an integer number of seconds');
const stressPhaseSeconds = 1 + Number(stressPlateau.slice(0, -1));
const businessFailures = new Counter('business_failures');
const completed = new Counter('purchases_paid');
const arrivalsStarted = new Counter('arrivals_started');
const queueWait = new Trend('queue_wait_ms', true);
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
};
if (!plans[scenario]) throw new Error('Unknown scenario; choose A..H or W');
export const options = {
  scenarios: plans[scenario],
  // Exclude raw URL, user/token values and VU identifiers from every exported series.
  systemTags: ['status', 'method', 'name', 'scenario', 'expected_response', 'error_code'],
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(95)', 'p(99)'],
  thresholds: {
    http_req_failed: ['rate<0.01'], unexpected_responses: ['rate<0.01'], unexpected_5xx: ['count==0'],
    dropped_iterations: ['count==0'], checks: ['rate==1'], business_failures: ['count==0'],
    ...Object.fromEntries(['sold_out', 'rate_limited', 'waiting_room_required', 'error', 'abandoned', 'paid', 'payment_failed',
      'browse_ok', 'browse_rate_limited', 'login_ok', 'login_rate_limited', 'queue_sold_out'].map(result =>
      [`business_outcomes{result:${result}}`, ['count>=0']])),
    ...(scenario !== 'B' && scenario !== 'F' ? {
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
