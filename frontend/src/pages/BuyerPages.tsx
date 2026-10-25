import React, { useEffect, useState } from 'react';
import {TicketPass} from '../features/tickets/components/TicketPass';
import {TicketWallet} from '../components/TicketWallet';
import { api, ApiError, pollDelay } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { navigate } from '../access/navigation';
import { landing } from '../access/permissions';
import type { Order, Reservation, Ticket, WaitingRoomStatus } from '../types';
import type { SeatReadSeatMap, SeatReadSectionOverview } from '../api/generated';
import { Button, Card, ErrorMessage, fieldClass, Link, money, useLoad } from './shared';
import { Modal } from '../components/ui/Modal';
import { EventCard } from '../components/EventCard';
import { EventHeader } from '../features/flash-sale/components/EventHeader';
import { TicketCard } from '../features/flash-sale/components/TicketCard';
import { StadiumMap, SeatGrid } from '../features/seating/SeatPicker';
import { startPolling } from '../features/seating/polling';
import { remainingSeconds, sortedSeats } from '../features/seating/model';
import { vi, stateLabel } from '../i18n/vi';
import { Ticket as TicketIcon, Users, Clock, ShieldCheck, Search } from 'lucide-react';

const admissions = new Map<string,string>();
window.addEventListener('auth:expired',()=>admissions.clear());
const message=(e:unknown)=>(e as ApiError).status===429||(e as ApiError).status===503?(e as Error).message:vi.failure;
export function AuthPage({register=false}:{register?:boolean}) {
 const {login}=useAuth();const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{if(register)await api.register(email,password);const user=await login(email,password);navigate(landing(user.role,new URLSearchParams(location.search).get('next')),true);}catch(e){setError(message(e));}finally{setBusy(false);}}
 return <Card className="max-w-md mx-auto"><h1 className="text-3xl font-bold">{register?vi.register:vi.login}</h1><form onSubmit={submit} className="space-y-4 mt-6">
 <label className="block">{vi.email}<input className={fieldClass} type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
 <label className="block">{vi.password}<input className={fieldClass} type="password" autoComplete={register?'new-password':'current-password'} value={password} minLength={register?12:undefined} onChange={e=>setPassword(e.target.value)} required/></label>
 <ErrorMessage message={error}/><Button type="submit" isLoading={busy}>{register?vi.register:vi.login}</Button></form><p className="mt-4"><Link href={register?'/login':'/register'}>{register?vi.hasAccount:vi.createAccount}</Link></p></Card>;
}
export function EventsPage(){
 const [keyword,setKeyword]=useState(''),[query,setQuery]=useState('');const {value,error}=useLoad(query,()=>api.getEvents(query));
 return <><section className="relative mb-8 rounded-3xl bg-gradient-to-br from-indigo-950 via-slate-900 to-rose-950 border border-slate-800 p-8 sm:p-12 overflow-hidden">
 <TicketIcon className="absolute right-8 top-8 w-36 h-36 text-indigo-400/10 rotate-12"/><p className="text-indigo-300 font-bold mb-3">{vi.explore}</p><h1 className="text-4xl sm:text-5xl font-black tracking-tight">{vi.discover}</h1><p className="text-slate-400 mt-5 max-w-xl">{vi.intro}</p>
 <form className="flex gap-3 max-w-lg mt-6" onSubmit={e=>{e.preventDefault();setQuery(keyword);}}><input aria-label={vi.search} className={fieldClass} value={keyword} onChange={e=>setKeyword(e.target.value)}/><Button type="submit" aria-label={vi.search}><Search/></Button></form></section>
 <ErrorMessage message={error?vi.failure:''}/><div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{value?.content.map(event=><EventCard key={event.id} event={event} onSelect={()=>navigate(`/events/${event.id}`)} onJoinQueue={()=>navigate(`/events/${event.id}`)}/>)}</div></>;
}
export function EventPage({id,select=false}:{id:string;select?:boolean}) {
 const {value,error}=useLoad(id,()=>api.getEventDetail(id)); const [map,setMap]=useState<SeatReadSeatMap>();const [section,setSection]=useState<SeatReadSectionOverview>();
 const [tierId,setTierId]=useState(''),[quantity,setQuantity]=useState(1),[failure,setFailure]=useState(''),[busy,setBusy]=useState(false);const [own,setOwn]=useState<Reservation[]>([]);
 const {user}=useAuth();const tier=value?.tiers.find(t=>t.id===(section?.tierId||tierId));
 useEffect(()=>{if(!value?.event.venueId)return;const controller=new AbortController();api.seatmap(id,controller.signal).then(data=>{if(!controller.signal.aborted)setMap(data);}).catch(e=>{if(!controller.signal.aborted)setFailure(message(e));});return()=>controller.abort();},[id,value?.event.venueId]);
 useEffect(()=>{if(!select||!user)return;let alive=true;api.allMyReservations().then(data=>{if(alive)setOwn(data.filter(r=>r.eventId===id));}).catch(e=>{if(alive)setFailure(message(e));});return()=>{alive=false;};},[id,select,user?.id]);
 function admission(){navigate(`/events/${id}/queue`);}
 function open(s:SeatReadSectionOverview){if(!select){admission();return;}setSection(s);setTierId(s.tierId);setQuantity(1);setFailure('');}
 async function reserve(){if(!tier)return;setBusy(true);setFailure('');try{navigate(`/checkout/${(await api.createReservation(tier.id,quantity,admissions.get(id))).id}`);}catch(e){if(['WAITING_ROOM_REQUIRED','ADMISSION_REQUIRED'].includes((e as ApiError).data?.code))admission();else setFailure(message(e));}finally{setBusy(false);}}
 return <><ErrorMessage message={error?vi.failure:failure}/>{value&&<><EventHeader event={value.event}/><p className="my-6 text-slate-400">{value.event.description}</p>
 {!select&&<div className="my-6"><Link href={`/events/${id}/queue`}>{vi.book} →</Link></div>}
 {own.filter(r=>r.status==='HELD'&&remainingSeconds(r.expires_at)>0).map(r=><p key={r.id} className="my-4"><Link href={`/checkout/${r.id}`}>{vi.continueHold}</Link></p>)}
 <div className="grid md:grid-cols-3 gap-4 my-6">{value.tiers.filter(item=>(!value.event.venueId || !!map) && (!map || map.sections.filter(s=>s.tierId===item.id).length!==1)).map(item=><TicketCard key={item.id} tier={item} selected={tier?.id===item.id} onSelect={()=>{if(!select){admission();return;}const mapped=map?.sections.find(s=>s.tierId===item.id);if(mapped)open(mapped);else{setSection(undefined);setTierId(item.id);setQuantity(1);}}}/>)}</div>
 {map&&<StadiumMap map={map} open={section?.id} onOpen={open}/>}
 {select&&section?.type==='SEATED'&&tier?<SeatGrid key={section.id} eventId={id} section={section} tier={tier} token={admissions.get(id)} own={own} onAdmission={admission} onHeld={hold=>navigate(`/checkout/${hold.id}`)}/>:
 select&&<Card className="mt-6"><label>{vi.quantity}<input className={fieldClass} type="number" min={1} max={tier?.maxPerOrder||1} value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/></label>
 {tier&&<p className="my-4 font-bold">{vi.total}: {money(quantity*tier.price,tier.currency)}</p>}<Button onClick={reserve} disabled={!tier||quantity<1||!Number.isInteger(quantity)||quantity>tier.maxPerOrder} isLoading={busy}>{vi.hold}</Button></Card>}
 </>}</>;
}
export function QueuePage({id}:{id:string}) {
 const [status,setStatus]=useState<WaitingRoomStatus>(),[error,setError]=useState('');
 useEffect(()=>{let joined=false;return startPolling(async signal=>{
 try{const result=joined?await api.getWaitingRoomStatus(id,signal):await api.joinWaitingRoom(id,signal);if(signal.aborted)return;setStatus(result);setError('');
 if(result.soldOut)return {stop:true};if(joined&&result.state==='ADMITTED'){if(result.token)admissions.set(id,result.token);navigate(`/events/${id}/select`,true);return {stop:true};}joined=true;
 return {retryAfterMs:Math.max((result as WaitingRoomStatus&{retryAfterMs?:number}).retryAfterMs||0,(result.pollIntervalSeconds||1)*1000)};
 }catch(e){if(!signal.aborted && (e as ApiError).data?.code==='WAITING_ROOM_DISABLED'){navigate(`/events/${id}/select`,true);return {stop:true};}if(!signal.aborted)setError(message(e));throw e;}
 },undefined,1000);},[id]);
 return <section className="max-w-lg mx-auto rounded-3xl bg-slate-900 border border-slate-800 p-8 shadow-2xl text-center"><div className="w-20 h-20 mx-auto rounded-3xl bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mb-6"><Users className="w-10 h-10 text-rose-400"/></div><h1 className="text-3xl font-black">{vi.queue}</h1><p className="mt-4 text-slate-400">{vi.queueIntro}</p><ErrorMessage message={error}/><div className="rounded-2xl bg-slate-950 border border-slate-800 p-6 my-6"><p>{status?.soldOut?vi.soldOut:vi.position}</p>{!status?.soldOut&&<p className="text-5xl font-black text-indigo-400 mt-3">{status?.position??'…'}</p>}</div><Link href={`/events/${id}`}>{vi.back}</Link></section>;
}
export function CheckoutPage({id}:{id:string}) {
 const {value:hold,error}=useLoad(id,()=>api.getReservation(id));const {user}=useAuth();const [now,setNow]=useState(Date.now()),[failure,setFailure]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);const remaining=hold?remainingSeconds(hold.expires_at,now):0;
 const {value:detail}=useLoad(hold?.eventId||'',async()=>hold?api.getEventDetail(hold.eventId):undefined);
 async function pay(){setBusy(true);setFailure('');try{const storageKey=`order-key:${user?.id}:${id}`;let key=sessionStorage.getItem(storageKey);if(!key){key=crypto.randomUUID();sessionStorage.setItem(storageKey,key);}navigate(`/orders/${(await api.createOrder(id,key)).id}`);}catch(e){setFailure(message(e));}finally{setBusy(false);}}
 return <Modal isOpen title={vi.checkout} maxWidth="xl" onClose={()=>navigate(hold?`/events/${hold.eventId}/select`:'/events')}><div className="space-y-5"><ErrorMessage message={error?vi.failure:failure}/>
 <div className={`p-5 rounded-2xl border ${remaining?'bg-indigo-950/40 border-indigo-800 text-indigo-300':'bg-rose-950/40 border-rose-800 text-rose-300'}`}><p className="flex gap-2"><Clock/>{remaining?vi.exclusive:vi.expired}</p><p role="timer" className="my-3 text-xl font-mono">{vi.ttl}: {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</p></div>
 <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5"><h2 className="font-bold">{detail?.event.title}</h2><p>{hold?.tierName}</p><p>{vi.quantity}: {hold?.quantity} · {stateLabel(hold?.status)}</p>{sortedSeats(hold?.seats||[]).map(seat=><p key={seat.id}>{seat.sectionName} · {vi.seatLabel(seat.rowLabel,seat.number)}</p>)}{hold?.unitPrice!==undefined&&<p className="text-2xl font-black my-3">{money(hold.quantity*hold.unitPrice,hold.currency||'VND')}</p>}</div>
 <p className="text-sm text-slate-400">{vi.gateway}</p><Button onClick={pay} isLoading={busy} disabled={!hold||!remaining||hold.status!=='HELD'} className="checkout-primary w-full min-h-11">{vi.pay}</Button>{hold&&!remaining&&<Link href={`/events/${hold.eventId}/queue`}>{vi.book}</Link>}</div></Modal>;
}
export function OrderPage({id}:{id:string}) {
 const [order,setOrder]=useState<Order>(),[tickets,setTickets]=useState<Ticket[]>([]),[error,setError]=useState('');
 useEffect(()=>{let attempt=0;return startPolling(async signal=>{try{const data=await api.getOrder(id,signal);if(signal.aborted)return;setOrder(data);setError('');if(data.status==='PAID'){const issued=await api.getOrderTickets(id);if(!signal.aborted)setTickets(issued);return{stop:true};}if(data.status!=='PENDING_PAYMENT')return{stop:true};return{retryAfterMs:Math.max((data as Order & {retryAfterMs?:number}).retryAfterMs||0,Math.min(10000,1000*2**attempt++))};}catch(e){if(!signal.aborted)setError(message(e));throw e;}},undefined,1000);},[id]);
 return <><h1 className="text-3xl font-black">{vi.order}</h1><p role="status" className="my-6 text-emerald-400">{stateLabel(order?.status)}</p><ErrorMessage message={error}/>{order&&<p className="mb-5 text-xl">{money(order.totalAmount,order.currency)}</p>}<div className="grid md:grid-cols-3 gap-5">{tickets.map(ticket=><TicketPass key={ticket.id} ticket={ticket}/>)}</div><p className="mt-6"><Link href="/account/tickets">{vi.wallet}</Link></p></>;
}
export function AccountPage({kind}:{kind:string}) {
 const {user}=useAuth();return kind==='profile'?<><h1 className="text-3xl font-bold">{vi.profile}</h1><Card className="mt-5">{user?.email}</Card></>:<TicketWallet initialTab={kind==='orders'?'orders':'tickets'}/>;
}
