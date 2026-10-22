// Local-only M2 micro-measurement; no credentials are written to versioned evidence.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(),project='ticketrush-m2-read';
const runtime=path.join(root,'.tmp','m2-measure');fs.mkdirSync(runtime,{recursive:true});
const envFile=path.join(runtime,'private.env');
const compose=['compose','--env-file',envFile,'-p',project,'-f','docker-compose.yml','-f','infrastructure/compose.seat-read.yml'];
const run=(args,options={})=>execFileSync('docker',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024,...options});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function env(){return Object.fromEntries(fs.readFileSync(envFile,'utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));}
function token(user,role,secret){const b=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const now=Math.floor(Date.now()/1000);const body=b({alg:'HS256',typ:'JWT'})+'.'+b({sub:user,iss:'ticketrush',aud:['ticketrush-api'],roles:[role],iat:now,exp:now+3600});return body+'.'+crypto.createHmac('sha256',Buffer.from(secret,'base64')).update(body).digest('base64url');}
async function scrape(){const secret=env().METRICS_PASSWORD;const response=await fetch('http://127.0.0.1:28882/actuator/prometheus',{headers:{Authorization:'Basic '+Buffer.from('prometheus:'+secret).toString('base64')}});if(!response.ok)throw new Error('Metrics '+response.status);return response.text();}
function metrics(text){
 const counts={hit:0,rebuild:0,buckets:{},requests:0};
 for(const line of text.split('\n')) {
  const match=line.match(/^([^ {]+)(?:\{(.*)\})? ([^ ]+)$/);if(!match)continue;
  const [,name,labels='',raw]=match,value=Number(raw);
  if(name==='seat_read_cache_total'){if(labels.includes('result="hit"'))counts.hit+=value;if(labels.includes('result="rebuild"'))counts.rebuild+=value;}
  if(labels.includes('/sections/{sectionId}/seats')&&name==='http_server_requests_seconds_bucket'){const le=labels.match(/le="([^"]+)"/)[1];counts.buckets[le]=(counts.buckets[le]||0)+value;}
  if(labels.includes('/sections/{sectionId}/seats')&&name==='http_server_requests_seconds_count')counts.requests+=value;
 }
 return counts;
}
function p95(before,after){let prevBound=0,prevCount=0;const total=after.requests-before.requests,target=total*.95;
 for(const key of Object.keys(after.buckets).sort((a,b)=>Number(a)-Number(b))){const bound=Number(key),count=after.buckets[key]-(before.buckets[key]||0);if(count>=target){return Number.isFinite(bound)?1000*(prevBound+(bound-prevBound)*(target-prevCount)/Math.max(1,count-prevCount)):null;}prevBound=bound;prevCount=count;}return null;
}
const mode=process.argv[2];
if(mode==='up'){
 if(!fs.existsSync(envFile)){
  const values={POSTGRES_DB:'ticketrush_m2_read',POSTGRES_USER:'ticketrush',RABBITMQ_USER:'ticketrush',SPRING_PROFILES_ACTIVE:'dev',DEV_SEED_ENABLED:'false'};
  for(const name of ['POSTGRES_PASSWORD','REDIS_PASSWORD','RABBITMQ_PASSWORD','JWT_SECRET','PAYMENT_WEBHOOK_SECRET','METRICS_PASSWORD'])values[name]=crypto.randomBytes(32).toString('base64');
  fs.writeFileSync(envFile,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
 }
 const config=env();config.BACKEND_VCS_REF=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 fs.writeFileSync(envFile,Object.entries(config).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
 run([...compose,'up','-d','--build','--wait','backend'],{stdio:'inherit'});
}else if(mode==='fixture'){
 const catalog=await (await fetch('http://127.0.0.1:28882/api/v1/events')).json();const event=catalog.content.find(e=>e.description==='[dev-seated-v1]');if(!event)throw new Error('Dev event missing');
 const map=await (await fetch(`http://127.0.0.1:28882/api/v1/events/${event.id}/seatmap`)).json();const section=map.sections.find(s=>s.code==='STAND_A');
 const identities=Array.from({length:300},()=>crypto.randomUUID());
 const sql='BEGIN;'+identities.map(id=>`INSERT INTO users(id,email,password_hash) VALUES('${id}','${id}@m2-read.example','measurement-only'); INSERT INTO user_roles(user_id,role_id) SELECT '${id}',id FROM roles WHERE name='USER';`).join('\n')+'COMMIT;';
 run([...compose,'exec','-T','postgres','psql','-U','ticketrush','-d','ticketrush_m2_read','-v','ON_ERROR_STOP=1'],{input:sql});
 fs.writeFileSync(path.join(runtime,'credentials.json'),JSON.stringify({event:event.id,section:section.id,tokens:identities.map(id=>token(id,'USER',env().JWT_SECRET))}),{mode:0o600});
 console.log(JSON.stringify({event:event.id,section:section.id,users:300,seats:section.seatCount}));
}else if(mode==='measure'){
 const provenance={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),docker:run(['version','--format','{{.Server.Version}}']).trim(),startedAt:new Date().toISOString(),runs:[]};
 // Warm the public metadata path and section before taking counter deltas.
 const credentials=JSON.parse(fs.readFileSync(path.join(runtime,'credentials.json')));
 for(let i=0;i<20;i++)await fetch(`http://127.0.0.1:28882/api/v1/events/${credentials.event}/sections/${credentials.section}/seats`,{headers:{Authorization:'Bearer '+credentials.tokens[i]}});
 for(let index=0;index<6;index++){
  const rate=index%2===0?200:400,id=`m2-read-${rate}-${Math.floor(index/2)+1}`;
  const beforeText=await scrape(),before=metrics(beforeText),samples=[];
  fs.writeFileSync(path.join(runtime,`${id}-before.prom`),beforeText);
  let done=false,exit;
  const log=fs.openSync(path.join(runtime,`${id}.log`),'w');
  const child=spawn('docker',[...compose,'run','--rm','--name',`${project}-k6-run`,'-e',`RATE=${rate}`,'-e',`RUN_ID=${id}`,'k6','run','/scripts/seat-read.js'],{windowsHide:true,stdio:['ignore',log,log]});
  child.on('exit',code=>{exit=code;done=true;});child.on('error',error=>{console.error(error);done=true;exit=-1;});
  while(!done){
   const ids=run(['ps','--filter',`label=com.docker.compose.project=${project}`,'--format','{{.ID}}']).trim().split(/\r?\n/).filter(Boolean);
   try{const stats=run(['stats','--no-stream','--format','{{json .}}',...ids]).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);samples.push({at:new Date().toISOString(),stats});}catch(error){samples.push({at:new Date().toISOString(),error:'stats sampling failed'});}
   await pause(1000);
  }
  fs.closeSync(log);const afterText=await scrape(),after=metrics(afterText);
  fs.writeFileSync(path.join(runtime,`${id}-after.prom`),afterText);fs.writeFileSync(path.join(runtime,`${id}-stats.json`),JSON.stringify(samples,null,2));
  const data=JSON.parse(fs.readFileSync(path.join(runtime,`${id}-k6.json`))),values=n=>data.metrics[n]?.values||{};
  const successful=values('seat_read_success').count||0,dropped=values('dropped_iterations').count||0;
  const hit=after.hit-before.hit,rebuild=after.rebuild-before.rebuild;
  const result={id,rate,durationSeconds:60,distinctUsers:300,exit,successful,offered:rate*60,dropped,workMinimum:successful>=rate*60*.99&&dropped===0,k6p95Ms:values('http_req_duration')['p(95)'],serverHistogramP95Ms:p95(before,after),serverRequests:after.requests-before.requests,server5xx:values('seat_read_5xx').count||0,cacheHits:hit,cacheRebuilds:rebuild,cacheHitRatio:hit/(hit+rebuild)};
  provenance.runs.push(result);console.log(JSON.stringify(result));fs.writeFileSync(path.join(runtime,'measurement.json'),JSON.stringify(provenance,null,2));
  await pause(3000);
 }
 const ids=run(['ps','-aq','--filter',`label=com.docker.compose.project=${project}`]).trim().split(/\r?\n/).filter(Boolean);
 const caps=JSON.parse(run(['inspect',...ids])).map(c=>({name:c.Name,image:c.Image,cpuLimit:c.HostConfig.NanoCpus/1e9,memoryLimitBytes:c.HostConfig.Memory}));
 provenance.containers=caps;provenance.k6Cap={cpus:2,memoryBytes:536870912};provenance.finishedAt=new Date().toISOString();
 fs.writeFileSync(path.join(runtime,'measurement.json'),JSON.stringify(provenance,null,2));
}else if(mode==='down'){run([...compose,'down'],{stdio:'inherit'});}else throw new Error('Use up | fixture | measure | down');
