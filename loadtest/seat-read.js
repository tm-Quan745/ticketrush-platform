import http from 'k6/http';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
const fixture=JSON.parse(open('/results/credentials.json'));
const ok=new Counter('seat_read_success');
const errors=new Counter('seat_read_5xx');
const rate=Number(__ENV.RATE);
export const options={
  scenarios:{read:{executor:'constant-arrival-rate',rate,timeUnit:'1s',duration:'60s',preAllocatedVUs:100,maxVUs:300}},
  thresholds:{seat_read_success:[`count>=${rate*60*0.99}`],dropped_iterations:['count==0']},
  summaryTrendStats:['avg','p(95)','p(99)','max'],
};
export default function(){
  const identity=exec.scenario.iterationInTest%fixture.tokens.length;
  const res=http.get(`http://backend:8080/api/v1/events/${fixture.event}/sections/${fixture.section}/seats`,
    {headers:{Authorization:`Bearer ${fixture.tokens[identity]}`},tags:{name:'section-seats'},timeout:'5s'});
  ok.add(res.status===200?1:0);errors.add(res.status>=500?1:0);
}
export function handleSummary(data){return {[`/results/${__ENV.RUN_ID}-k6.json`]:JSON.stringify(data,null,2)};}
