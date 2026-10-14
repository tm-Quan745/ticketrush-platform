import http from 'k6/http';
import { check, sleep } from 'k6';

// This small probe runs inside the same k6 Compose network as a measurement.
// Its remote-write output verifies both service discovery and the receiver.
// The Prometheus remote-write output flushes periodically. Keep this probe above
// that interval, then the runner verifies its tagged sample through Prometheus.
export const options = { vus: 1, duration: '6s' };

export default function () {
  const response = http.get('http://prometheus:9090/-/ready');
  check(response, { 'Prometheus is ready from k6': value => value.status === 200 });
  sleep(1);
}
