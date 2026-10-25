import React,{useEffect,useState} from 'react';
import {Ticket as TicketIcon,Clock,Receipt} from 'lucide-react';
import {api} from '../api/client';
import type {Ticket,Order,Reservation} from '../types';
import {navigate} from '../access/navigation';
import {Button,Card,ErrorMessage,Link,money,useLoad} from '../pages/shared';
import {TicketPass} from '../features/tickets/components/TicketPass';
import {PrintableTicketModal} from './user/PrintableTicketModal';
import {OrderInvoiceModal} from './user/OrderInvoiceModal';
import {remainingSeconds} from '../features/seating/model';
import {vi,stateLabel} from '../i18n/vi';
export function HoldCard({hold,now,onResume}:{hold:Reservation;now:number;onResume:()=>void}) {
 const remaining=remainingSeconds(hold.expires_at,now);
 return <Card><Clock className="text-amber-300"/><h3 className="font-bold mt-3">{hold.tierName}</h3><p>{vi.quantity}: {hold.quantity} · {stateLabel(hold.status)}</p><p role="timer" className="my-3 font-mono">{vi.ttl}: {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</p><Button disabled={!remaining||hold.status!=='HELD'} onClick={onResume}>{vi.continueHold}</Button></Card>;
}
export function TicketWallet({onResumeReservation,initialTab='tickets'}:{onResumeReservation?:(r:Reservation)=>void;initialTab?:'tickets'|'orders'}) {
 const [tab,setTab]=useState<'tickets'|'holds'|'orders'>(initialTab),[revision,setRevision]=useState(0),[now,setNow]=useState(Date.now());
 const [ticket,setTicket]=useState<Ticket|null>(null),[invoice,setInvoice]=useState<Order|null>(null);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);
 const {value,error}=useLoad('wallet'+revision,async()=>{
  const [orders,holds]=await Promise.all([api.allMyOrders(),api.allMyReservations()]);const tickets:Ticket[]=[];
  for(const order of orders)if(['PAID','REFUND_PENDING','REFUNDED'].includes(order.status))tickets.push(...await api.getOrderTickets(order.id));
  return {orders,holds,tickets};
 });
 return <section className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-indigo-300 font-bold">TicketRush</p><h1 className="text-3xl font-black">{initialTab==='orders'?vi.orders:vi.wallet}</h1></div><Button variant="secondary" onClick={()=>setRevision(n=>n+1)}>{vi.refreshWallet}</Button></div>
 <nav className="flex gap-2 flex-wrap">{(['tickets','holds','orders'] as const).map(t=><Button key={t} variant={tab===t?'primary':'secondary'} onClick={()=>setTab(t)}>{t==='tickets'?vi.tickets:t==='holds'?vi.holds:vi.orders}</Button>)}</nav>
 <ErrorMessage message={error}/>{!value&&!error&&<p>{vi.loading}</p>}
 {value&&tab==='tickets'&&<><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{value.tickets.map(t=><div key={t.id}><TicketPass ticket={t}/><div className="flex flex-wrap gap-3 mt-3"><Button variant="secondary" onClick={()=>setTicket(t)}>{vi.printTicket}</Button><Link href={`/orders/${t.orderId}`}>{vi.order}</Link></div></div>)}</div>{!value.tickets.length&&<Card><TicketIcon/><p>{vi.noTickets}</p></Card>}</>}
 {value&&tab==='holds'&&<div className="grid md:grid-cols-2 gap-4">{value.holds.filter(h=>h.status==='HELD').map(h=><HoldCard key={h.id} hold={h} now={now} onResume={()=>onResumeReservation?onResumeReservation(h):navigate(`/checkout/${h.id}`)}/>)}{!value.holds.some(h=>h.status==='HELD')&&<p>{vi.noHolds}</p>}</div>}
 {value&&tab==='orders'&&<div className="space-y-4">{value.orders.map(o=><Card key={o.id}><Receipt className="text-indigo-300"/><p className="break-all text-xs my-3">{o.id}</p><p className="font-bold">{stateLabel(o.status)}</p><p className="text-xl my-3">{money(o.totalAmount,o.currency)}</p><div className="flex gap-4 items-center"><Link href={`/orders/${o.id}`}>{vi.details}</Link><Button variant="secondary" onClick={()=>setInvoice(o)}>{vi.invoice}</Button></div></Card>)}{!value.orders.length&&<p>{vi.noOrders}</p>}</div>}
 <PrintableTicketModal ticket={ticket} onClose={()=>setTicket(null)}/><OrderInvoiceModal order={invoice} onClose={()=>setInvoice(null)}/></section>;
}
