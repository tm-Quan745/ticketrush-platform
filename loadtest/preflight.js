import http from 'k6/http';
import { check } from 'k6';

// This small probe runs inside the same k6 Compose network as a measurement.
// Its remote-write output verifies both service discovery and the receiver.
export const options = { vus: 1, iterations: 1 };

export default function () {
  const response = http.get('http://prometheus:9090/-/ready');
  check(response, { 'Prometheus is ready from k6': value => value.status === 200 });
}
