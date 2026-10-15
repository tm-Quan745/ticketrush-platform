import http from 'k6/http';
import { Counter, Rate } from 'k6/metrics';

export const unexpected5xx = new Counter('unexpected_5xx');
export const unexpected = new Rate('unexpected_responses');
export const outcomes = new Counter('business_outcomes');
export const base = __ENV.BASE_URL || 'http://localhost:28087';

export function request(method, path, name, body, token, extra = {}, expected = [200]) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = http.request(method, base + path, body === null ? null : JSON.stringify(body), {
    headers, timeout: __ENV.REQUEST_TIMEOUT || '5s', tags: { name },
    responseCallback: http.expectedStatuses(...expected),
  });
  // A caller can deliberately handle a transient 5xx (for example, a bounded
  // front-door join retry). It records that response in its own metric; it is
  // not an unexpected HTTP failure for the run-level threshold.
  unexpected5xx.add(response.status >= 500 && !expected.includes(response.status) ? 1 : 0);
  unexpected.add(!expected.includes(response.status));
  return response;
}

export function body(response) {
  try { return response.json(); } catch (_) { return {}; }
}

export function key(iteration, purpose) {
  // Deterministic per run/user/action; retries replay the exact same UUID.
  const suffix = (iteration + 1).toString(16).padStart(12, '0');
  return `00000000-0000-4000-8${purpose}00-${suffix}`;
}
