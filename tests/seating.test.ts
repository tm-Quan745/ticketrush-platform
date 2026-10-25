import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StadiumMap} from '../frontend/src/features/seating/SeatPicker';
import {toggleSelection,recoverSelection,seatState,remainingSeconds,validStatus} from '../frontend/src/features/seating/model';
import {startPolling,jitterDelay,type PollEnvironment} from '../frontend/src/features/seating/polling';
import {ApiClient} from '../frontend/src/api/client';

test('seat selection enforces limit, toggles off and refuses unavailable seats',()=>{
 assert.deepEqual(toggleSelection(['a','b'],'c',2,true),['a','b']);assert.deepEqual(toggleSelection(['a'],'a',2,false),[]);assert.deepEqual(toggleSelection([],'b',6,false),[]);
});
test('409 recovery removes only conflicting ids',()=>assert.deepEqual(recoverSelection(['a','b','c'],['b','x']),['a','c']));
test('mine comes only from own reservation ids; blocked and sold have distinct states',()=>{
 assert.equal(seatState('a','H',[],['a']),'mine');assert.equal(seatState('a','H',[],[]),'unavailable');assert.equal(seatState('a','B',[],[]),'blocked');assert.equal(seatState('a','A',['a'],[]),'selected');
});
test('TTL never resets and expired holds remain at zero',()=>{assert.equal(remainingSeconds('2030-01-01T00:00:10Z',Date.parse('2030-01-01T00:00:07Z')),3);assert.equal(remainingSeconds('2000-01-01T00:00:00Z'),0);});
test('fixed-order status length and alphabet must match geometry',()=>{
 const geometry={eventId:'e',sectionId:'s',tierId:'t',seats:[{id:'a',rowLabel:'R1',number:1,x:1,y:1,accessible:false}]};
 assert.equal(validStatus(geometry,{geometryVersion:'v',states:'A'}),true);assert.equal(validStatus(geometry,{geometryVersion:'v',states:'AH'}),false);assert.equal(validStatus(geometry,{geometryVersion:'v',states:'X'}),false);
});
test('jitter keeps default polls between 2.5 and 2.875 seconds and respects Retry-After',()=>{
 assert.equal(jitterDelay(0,()=>0),2500);assert.equal(jitterDelay(0,()=>1),2875);assert.equal(jitterDelay(7000,()=>.5),7525);
});
function environment(){let hidden=false,listener=()=>{},next:(()=>void)|undefined,delay=0,now=0;
 const env:PollEnvironment={hidden:()=>hidden,listen:f=>{listener=f;return()=>{listener=()=>{};}},set:(f,ms)=>{next=f;delay=ms;return 1 as any;},clear:()=>{next=undefined;},now:()=>now};
 return {env,hide:()=>{hidden=true;listener();},show:()=>{hidden=false;listener();},tick:()=>{now+=delay;const f=next;next=undefined;f?.();},pending:()=>!!next,delay:()=>delay};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
test('unmount aborts in-flight polling and prevents reschedule',async()=>{const e=environment();let signal:AbortSignal|undefined,resolve!:()=>void;const stop=startPolling(async s=>{signal=s;await new Promise<void>(r=>resolve=r);},e.env);stop();resolve();await flush();assert.equal(signal?.aborted,true);assert.equal(e.pending(),false);});
test('hidden tab pauses timer, aborts request and resumes respecting deadline',async()=>{const e=environment();let calls=0;const stop=startPolling(async()=>{calls++;return{retryAfterMs:9000};},e.env,2500,()=>0);await flush();assert.equal(e.delay(),9000);e.hide();assert.equal(e.pending(),false);e.show();assert.equal(e.delay(),9000);e.tick();await flush();assert.equal(calls,2);stop();});
test('late reply after visibility abort never schedules another poll',async()=>{const e=environment();let finish!:()=>void;const stop=startPolling(async()=>{await new Promise<void>(r=>finish=r);},e.env);e.hide();finish();await flush();assert.equal(e.pending(),false);stop();});
test('sold-out terminal response stops polling',async()=>{const e=environment();const stop=startPolling(async()=>({stop:true}),e.env);await flush();assert.equal(e.pending(),false);e.hide();e.show();assert.equal(e.pending(),false);stop();});
test('Retry-After on overload controls retry timer',async()=>{const e=environment();const stop=startPolling(async()=>{throw {retryAfterMs:12000};},e.env,2500,()=>0);await flush();assert.equal(e.delay(),12000);stop();});
test('transport sends If-None-Match and treats 304 as reuse, not auth error',async()=>{
 const previous=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async(_url,options)=>{calls++;if(calls===1)return Response.json({geometryVersion:'v',states:'A'},{headers:{ETag:'"one"'}});assert.equal((options?.headers as Record<string,string>)['If-None-Match'],'"one"');return new Response(null,{status:304,headers:{ETag:'"one"'}});};
 const client=new ApiClient(),first=await client.seatStatus('e','s');assert.equal(first.etag,'"one"');const second=await client.seatStatus('e','s',first.etag);assert.ok('notModified'in second);
 }finally{globalThis.fetch=previous;}
});
test('stadium component uses server polygons, accessible section controls and no exact availability',()=>{
 const html=renderToStaticMarkup(React.createElement(StadiumMap,{map:{eventId:'e',observedAt:'',venue:{id:'v',name:'Stadium',templateKey:'v',templateVersion:1,viewBox:[0,0,640,520]},tiers:[],sections:[{id:'s',code:'A',name:'Stand A',type:'SEATED',tierId:'t',geometry:{polygon:[{x:3,y:4},{x:10,y:4},{x:5,y:8}],viewBox:[0,0,640,520],color:'#abcdef'},availability:'LOW',price:100,currency:'VND',counts:null,rowCount:1,seatCount:12345}]},onOpen:()=>{}}));
 assert.match(html,/3,4 10,4 5,8/);assert.match(html,/tabindex="0"/);assert.match(html,/Sắp hết vé/);assert.doesNotMatch(html,/12345|availableQuantity|3D/);
});

import {money} from '../frontend/src/pages/shared';
import {aisleBefore, sortedSeats} from '../frontend/src/features/seating/model';
test('aisle boundaries use server segments and never insert a gap between rows',()=>{
 const seats=[{rowLabel:'A',number:1,adjacencySegment:0},{rowLabel:'A',number:2,adjacencySegment:0},{rowLabel:'A',number:3,adjacencySegment:1},{rowLabel:'B',number:1,adjacencySegment:0}] as any;
 assert.deepEqual(seats.map((_:unknown,i:number)=>aisleBefore(seats,i)),[false,false,true,false]);
});
test('checkout sorts a copy by row and numeric seat number',()=>{
 const seats=[{rowLabel:'B',number:1},{rowLabel:'A',number:10},{rowLabel:'A',number:2}];
 assert.deepEqual(sortedSeats(seats),[seats[2],seats[1],seats[0]]);assert.equal(seats[0].rowLabel,'B');
});
test('server minor-unit amounts use currency scale: VND 1250 and USD 12.50',()=>{assert.match(money(1250,'VND'),/1[.,]250/);assert.match(money(1250,'USD'),/12[.,]50/);});
