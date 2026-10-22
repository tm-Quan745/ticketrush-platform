import { SharedArray } from 'k6/data';
import { sleep } from 'k6';
const users = new SharedArray('users', () => JSON.parse(open('./.data/users.json')));
const data = JSON.parse(open('./.data/dataset.json'));
// Deliberately reproduce the earlier K/Q/V materialization for diagnosis only.
const materialized = __ENV.MATERIALIZE === 'true' ? Object.fromEntries(users.map(u => [u.id, u])) : null;
console.info(`INIT_READY vu=${__VU} materialize=${__ENV.MATERIALIZE}`);
export const options = { vus: Number(__ENV.PRE_VUS || 100), duration: '10s' };
export default function () {
  if (!users.length || !data.events.length || (materialized && !Object.keys(materialized).length)) throw new Error('Missing fixture');
  sleep(1);
}
