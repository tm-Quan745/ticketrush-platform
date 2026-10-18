import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { request, body, key, base } from './lib/client.js';

// Keep complete token-bearing records shared. Binary search deserializes only O(log n) records.
const users = new SharedArray('sellout users', () => JSON.parse(open('./.data/users.json')).sort((a,b) => a.id.localeCompare(b.id)));
const event = JSON.parse(open('./.data/dataset.json')).events.find(e => e.name === 'HOT');
const admin = JSON.parse(open('./.data/admin.json'));
const started = new Counter('sellout_started'), paid = new Counter('sellout_paid');
const sold = new Counter('sellout_sold_out'), errors = new Counter('sellout_errors');
const finished = new Counter('sellout_finished'), bound = new Counter('sellout_token_binding_checked');
const soldLatency = new Trend('sellout_status_duration', true);
export const options = {
  scenarios: { sellout: { executor: 'constant-arrival-rate', rate: 20, timeUnit: '1s', duration: '250s',
    preAllocatedVUs: Number(__ENV.PRE_VUS || 100), maxVUs: Number(__ENV.MAX_VUS || 150), gracefulStop: '60s' } },
  systemTags: ['status','method','name','scenario','expected_response','error_code'],
  summaryTrendStats: ['med','p(95)','p(99)','max'],
  thresholds: { sellout_started: ['count==5000'], sellout_finished: ['count==5000'], sellout_paid: ['count>0'],
    sellout_sold_out: ['count>0'], sellout_errors: ['count==0'], dropped_iterations: ['count==0'],
    sellout_status_duration: ['p(95)<1000'] },
};
function userFor(id) {
  let low=0, high=users.length-1;
  while(low<=high) { const mid=(low+high)>>1, user=users[mid];
    if(user.id===id) return user;
    if(user.id.localeCompare(id)<0) low=mid+1; else high=mid-1;
  }
  return null;
}
function call(method,path,name,payload,user,headers={},expected=[200]) {
  return request(method,path,name,payload,user.token,headers,expected);
}
export default function () {
  const i=exec.scenario.iterationInTest;
  if(i>=5000) return;
  started.add(1); errors.add(0);
  let admission=null;
  for(let attempt=0;attempt<24;attempt++) {
    const response=call('GET',`/internal/loadtest/events/${event.id}/waiting-room/admissions?limit=1`,'admission feed',null,admin);
    if(response.status!==200) { errors.add(1);return; }
    const values=body(response);
    if(Array.isArray(values)&&values.length) { admission=values[0];break; }
    const status=call('GET',`/api/v1/events/${event.id}/waiting-room/status`,'queue status',null,users[i]);
    if(status.status===200&&body(status).soldOut===true) {
      soldLatency.add(status.timings.duration); sold.add(1); finished.add(1);return;
    }
    sleep(0.25);
  }
  const user=admission&&userFor(admission.user);
  if(!user) { errors.add(1);return; }
  const payload={tierId:event.tiers[0],quantity:1+i%4};
  const other=users[(i+1)%users.length].id===user.id ? users[(i+2)%users.length] : users[(i+1)%users.length];
  const wrong=call('POST','/api/v1/reservations','wrong user token',payload,other,
    {'Idempotency-Key':key(i,'8'),'X-Admission-Token':admission.token},[403]);
  if(wrong.status!==403||body(wrong).code!=='INVALID_ADMISSION_TOKEN') { errors.add(1);return; }
  bound.add(1);
  const reserve=call('POST','/api/v1/reservations','reserve',payload,user,
    {'Idempotency-Key':key(i,'3'),'X-Admission-Token':admission.token},[201,409]);
  if(reserve.status===409&&body(reserve).code==='SOLD_OUT') { sold.add(1);finished.add(1);return; }
  if(reserve.status!==201) { errors.add(1);return; }
  const order=call('POST','/api/v1/orders','order',{reservationId:body(reserve).id},user,
    {'Idempotency-Key':key(i,'4'),'X-Mock-Scenario':'SUCCESS','X-Mock-Test-Token':__ENV.MOCK_PAYMENT_TEST_TOKEN},[201]);
  if(order.status!==201) { errors.add(1);return; }
  for(let attempt=0;attempt<20;attempt++) {
    sleep(1);
    const response=call('GET',`/api/v1/orders/${body(order).id}`,'payment status',null,user);
    if(response.status===200&&body(response).status==='PAID') { paid.add(1);finished.add(1);return; }
  }
  errors.add(1);
}
export function handleSummary(value) {
  return {[`/results/${__ENV.RUN_ID}.json`]:JSON.stringify(value,null,2)};
}
