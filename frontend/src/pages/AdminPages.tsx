import { reconcileMessage, stateLabel } from '../i18n/vi';
import { extraText } from '../i18n/vi';
import { legacyText } from '../i18n/vi';
import React, { useState } from 'react';
import {QrCode,ShieldCheck,Activity,Calendar,Layers,Receipt} from 'lucide-react';
import {GateResult} from '../features/tickets/components/GateResult';
import {vi} from '../i18n/vi';
import { api, ApiError } from '../api/client';
import type { Event, Order, TicketTier, Ticket } from '../types';
import { EventManagementTabs, EventOverview } from '../components/admin/EventManagement';
import { CreateEventModal } from '../components/admin/CreateEventModal';
import { Pagination } from '../components/Pagination';
import { IconButton } from '../components/ui/IconButton';
import { Plus, RefreshCw, Save } from 'lucide-react';
import { AdminPageHeader } from '../components/admin/AdminLayout';
import { AdminEventTable, AdminOrderTable, StatusBadge } from '../components/admin/AdminTables';
import { navigate } from '../access/navigation';
import { Button, Card, ErrorMessage, fieldClass, Link, money, useLoad } from './shared';
import evidenceUrl from '../../../docs/performance/results/finish-sellout-20-2.json?url';
import verifierUrl from '../../../docs/performance/results/finish-sellout-20-2-verify.json?url';

export function GatePage() {
 const [code,setCode]=useState(''),[ticket,setTicket]=useState<Ticket>(),[errorCode,setErrorCode]=useState<string>(),[failure,setFailure]=useState(''),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false);
 const [counts,setCounts]=useState({accepted:0,rejected:0});
 async function submit(checkIn:boolean){
  const scanned=code.trim();setBusy(true);setFailure('');setErrorCode(undefined);setTicket(undefined);setAccepted(false);
  try{const result=checkIn?await api.checkInTicket(scanned):await api.verifyTicket(scanned);setTicket(result.ticket);
   if(checkIn){setAccepted(true);setCounts(c=>({...c,accepted:c.accepted+1}));}
   else if(result.ticket?.status!=='VALID')setCounts(c=>({...c,rejected:c.rejected+1}));
  }catch(e){const error=e as ApiError;setErrorCode(error.data?.code||'FAILED');setCounts(c=>({...c,rejected:c.rejected+1}));
   if(error.data?.code==='TICKET_NOT_USABLE'){try{setTicket((await api.verifyTicket(scanned)).ticket);}catch(detailError){setFailure((detailError as Error).message);}}
   else if(error.data?.code!=='TICKET_NOT_FOUND')setFailure(error.message);
  }finally{setBusy(false);}
 }
 return <section className="max-w-3xl mx-auto space-y-6"><div className="flex items-center gap-4"><QrCode className="w-12 h-12 text-indigo-300"/><div><p className="text-sm text-indigo-300">TicketRush</p><h1 className="text-3xl font-black">{legacyText.text14}</h1></div></div>
 <Card><label className="block font-bold">{legacyText.text15}<input className={fieldClass} value={code} maxLength={64} disabled={busy} onChange={e=>setCode(e.target.value)} autoComplete="off"/></label><div className="flex flex-wrap gap-3 mt-4"><Button disabled={!code.trim()||busy} variant="secondary" onClick={()=>submit(false)}>{legacyText.text16}</Button><Button className="min-h-12" disabled={!code.trim()||busy} onClick={()=>submit(true)}>{legacyText.text17}</Button></div><ErrorMessage message={failure}/></Card>
 {(ticket||errorCode)&&<GateResult ticket={ticket} accepted={accepted} errorCode={errorCode}/>}
 <Card><p className="font-bold mb-3">{vi.sessionCounts}</p><div className="flex flex-wrap gap-6"><p>✓ {vi.checkIns}: {counts.accepted}</p><p>× {vi.rejections}: {counts.rejected}</p></div></Card></section>;
}
export function AdminHome() {
 const [revision,setRevision]=useState(0);
 const {value,error}=useLoad('dashboard'+revision,async()=>{const [events,orders]=await Promise.all([api.allAdminEvents(),api.allAdminOrders()]);return {events,orders};});
 return <><AdminPageHeader title={legacyText.text18} description="Theo dõi sự kiện và đơn hàng, tiếp tục công việc quản lý trong ngày.">
 <IconButton label="Làm mới" icon={RefreshCw} onClick={()=>setRevision(n=>n+1)}/><IconButton label="Tạo sự kiện" icon={Plus} variant="primary" onClick={()=>navigate('/admin/events/new')}/></AdminPageHeader><ErrorMessage message={error}/>
 <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{[
 {label:'Tổng sự kiện',count:value?.events.length,icon:Calendar,href:'/admin/events'},
 {label:'Bản nháp',count:value?.events.filter(event=>event.status==='DRAFT').length,icon:Layers,href:'/admin/events'},
 {label:'Tổng đơn hàng',count:value?.orders.length,icon:Receipt,href:'/admin/orders'},
 {label:'Đơn đã thanh toán',count:value?.orders.filter(order=>order.status==='PAID').length,icon:ShieldCheck,href:'/admin/orders'},
 ].map(({label,count,icon:Icon,href})=><Card key={label} className="shadow-sm"><div className="flex items-center justify-between gap-3"><p className="text-sm text-slate-400">{label}</p><Icon size={20} className="text-indigo-400"/></div><p className="text-3xl font-black my-4">{count??'—'}</p><Link href={href} className="text-xs">Xem danh sách →</Link></Card>)}</div>
 <p className="text-xs text-slate-400 mt-3">Số liệu toàn bộ dữ liệu tại lần tải gần nhất.</p>
 <section className="mt-8"><div className="flex items-center justify-between gap-3 mb-4"><h2 className="text-lg font-bold">Sự kiện mới tạo</h2><Link href="/admin/events" className="text-sm">Xem tất cả sự kiện →</Link></div>
 {!value&&!error&&<p role="status">Đang tải tổng quan…</p>}{value&&<AdminEventTable events={[...value.events].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5)}/>}</section>
 <Card className="mt-6 shadow-sm flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold">Vận hành & soát vé</h2><p className="text-sm text-slate-400 mt-2">Kiểm tra tình trạng hệ thống hoặc mở cổng check-in.</p></div><div className="flex gap-5 text-sm"><Link href="/admin/operations">Kiểm tra vận hành →</Link><Link href="/gate">Mở cổng soát vé →</Link></div></Card></>;
}
async function failedRecords(kind:string){const all:Array<{id:string;status:string}>=[];for(let page=0;;page++){const rows=await api.request<Array<{id:string;status:string}>>(`/admin/${kind}?status=FAILED&page=${page}&size=100`);all.push(...rows);if(rows.length<100)return all;}}
export function OperationsPage() {
 const [revision,setRevision]=useState(0),[failure,setFailure]=useState(''),[busy,setBusy]=useState(false);
 const {value,error}=useLoad('operations'+revision,async()=>{const [health,outbox,notifications]=await Promise.all([api.getHealth(),failedRecords('outbox'),failedRecords('notifications')]);return {health,outbox,notifications};});
 async function retry(path:string){setBusy(true);try{await api.request(path,{method:'POST'});setRevision(n=>n+1);setFailure('');}catch(e){setFailure((e as Error).message);}finally{setBusy(false);}}
 return <><AdminPageHeader title={vi.systemHealth} description="Theo dõi tình trạng dịch vụ và xử lý các bản ghi gửi thất bại."><IconButton label="Làm mới" icon={RefreshCw} disabled={busy} onClick={()=>setRevision(n=>n+1)}/></AdminPageHeader><ErrorMessage message={error||failure}/><Card><Activity className="text-indigo-400"/><p className="font-bold text-xl mt-3">{vi.systemHealth}</p><p className="text-3xl mt-3">{value?.health.status||(error?'—':vi.loading)}</p></Card>
 <div className="grid md:grid-cols-2 gap-5 mt-5">{(['outbox','notifications'] as const).map(kind=><Card key={kind}><h2 className="text-xl font-bold mb-4">{kind==='outbox'?vi.failedOutbox:vi.failedNotifications}</h2>{value?.[kind].length===0&&<p>{vi.noFailures}</p>}{value?.[kind].map(item=><div key={item.id} className="my-3 border-t border-slate-700 pt-3"><p className="break-all text-xs mb-2">{item.id}</p><Button disabled={busy} onClick={()=>retry(`/admin/${kind}/${item.id}/${kind==='outbox'?'retry':'resend'}`)}>{kind==='outbox'?vi.retry:vi.resend}</Button></div>)}</Card>)}</div></>;
}
export function ResultsPage() {
  return <><AdminPageHeader title={legacyText.text24} description="Xem báo cáo kiểm chứng và kết quả đo hiệu năng đã lưu."/><Card>
    <h2 className="font-bold text-xl mb-3">{legacyText.text25}</h2>
    <p className="text-slate-400 mb-5">{legacyText.text26}</p>
    <div className="flex gap-6"><a className="text-indigo-400" href={evidenceUrl}>{legacyText.text27}</a><a className="text-indigo-400" href={verifierUrl}>{legacyText.text28}</a></div>
  </Card></>;
}
export function AdminEventsPage({create=false}:{create?:boolean}) {
 const [page,setPage]=useState(0),[revision,setRevision]=useState(0);
 const {value,error}=useLoad(JSON.stringify(['admin-events',page,revision]),()=>api.getAdminEvents(page));
 return <><AdminPageHeader title={vi.eventList} description="Quản lý thông tin, lịch mở bán và kho vé của từng sự kiện."><IconButton label="Làm mới" icon={RefreshCw} onClick={()=>setRevision(n=>n+1)}/><IconButton label={vi.createDraft} icon={Plus} variant="primary" onClick={()=>navigate('/admin/events/new')}/></AdminPageHeader><ErrorMessage message={error}/>
 {!value&&!error&&<p role="status">Đang tải sự kiện…</p>}
 {value&&<AdminEventTable events={value.content}/>}
 {value&&<Pagination page={value.page} totalPages={value.totalPages} totalElements={value.totalElements} onPageChange={setPage}/>}
 {create&&<CreateEventModal onClose={()=>navigate('/admin/events')} onEventCreated={()=>navigate('/admin/events')}/>}</>;
}
export function AdminEventPage({id}:{id:string}) {
 const [revision,setRevision]=useState(0),[tab,setTab]=useState('info'),[failure,setFailure]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const {value,error}=useLoad(id+revision,async()=>{const [event,tiers,sections]=await Promise.all([api.adminEvent(id),api.getAdminInventory(id),api.adminSections(id)]);return {event,tiers,sections};});
 async function action(kind:'publish'|'cancel'){if(kind==='cancel'&&!confirm(vi.confirmCancel))return;setBusy(true);setFailure('');try{await api.request(`/admin/events/${id}/${kind}`,{method:'POST'});setRevision(n=>n+1);}catch(e){setFailure((e as Error).message);}finally{setBusy(false);}}
 async function reconcile(){setFailure('');try{const violations=await api.reconcileInventory(id);setNotice(violations.length?reconcileMessage(violations.length)+': '+JSON.stringify(violations):vi.reconcileOk);}catch(e){setFailure((e as Error).message);}}
 return <><Link href="/admin/events" className="inline-block text-sm mb-5">← Danh sách sự kiện</Link><AdminPageHeader title={value?.event.title||vi.eventList} description="Quản lý nội dung, lịch bán vé và vận hành sự kiện.">{value&&<><StatusBadge status={value.event.status}/>{value.event.status==='DRAFT'&&<Button disabled={busy} onClick={()=>action('publish')}>{vi.publish}</Button>}{value.event.status==='PUBLISHED'&&<Button variant="danger" disabled={busy} onClick={()=>action('cancel')}>{vi.cancelEvent}</Button>}</>}</AdminPageHeader><ErrorMessage message={error||failure}/>{notice&&<p role="status" className="mb-5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 text-sm">{notice}</p>}
 {value&&<div className="flex flex-wrap gap-3 mb-6 text-sm text-slate-400"><span className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">{value.tiers.length} hạng vé</span><span className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800">{value.sections.length} khu vực</span></div>}
 <EventManagementTabs active={tab} onChange={setTab}/>
 {!value&&!error&&<p role="status">Đang tải sự kiện…</p>}
 {value&&tab==='info'&&<EventOverview key={id+revision} event={value.event} onImageSaved={()=>{setNotice(vi.saved);setRevision(n=>n+1);}}/>}
 {value&&tab==='tiers'&&<><div className="grid xl:grid-cols-2 gap-4">{value.tiers.map(tier=><TierCapacity key={tier.id+revision} tier={tier} done={()=>setRevision(n=>n+1)}/>)}</div>{value.tiers.length===0&&<Card><p className="text-slate-400">Chưa có hạng vé cho sự kiện này.</p></Card>}{value.event.status==='DRAFT'&&<div className="grid xl:grid-cols-2 gap-6"><AddTier id={id} done={()=>setRevision(n=>n+1)}/><SectionMapping id={id} tiers={value.tiers} sections={value.sections} done={()=>setRevision(n=>n+1)}/></div>}</>}
 {value&&tab==='seats'&&<AdminSeats eventId={id} sections={value.sections} published={value.event.status==='PUBLISHED'}/>}
 {value&&tab==='inventory and reconcile'&&<div className="space-y-4">{value.tiers.filter(t=>t.inventoryMode!=='SEATED').map(t=><Card key={t.id}><h2>{t.name} · COUNTER</h2><p>{vi.capacity}: {t.totalQuantity} · {vi.available}: {t.availableQuantity} · {vi.held}: {t.heldQuantity} · {vi.sold}: {t.soldQuantity}</p></Card>)}{value.sections.filter(s=>s.type==='SEATED').map(s=><Card key={s.id}><h2 className="font-bold">{s.name} · SEATED</h2>{s.counts?<p>{vi.physical}: {s.counts.physical} · {vi.available}: {s.counts.available} · {vi.held}: {s.counts.held} · {vi.sold}: {s.counts.sold} · {vi.blocked}: {s.counts.blocked}</p>:<p>{vi.draft}</p>}</Card>)}<Button onClick={reconcile}>{vi.reconcile}</Button></div>}
 {tab==='waiting room'&&<QueueSettings id={id}/>}{tab==='orders'&&<Card><h2 className="text-lg font-bold">Quản lý đơn hàng</h2><p className="text-sm text-slate-400 mt-2 mb-5">Mở danh sách đơn hàng toàn hệ thống để kiểm tra giao dịch và xử lý hoàn tiền.</p><Link href="/admin/orders">Xem tất cả đơn hàng →</Link></Card>}</>;
}
function TierCapacity({tier,done}:{tier:TicketTier;done:()=>void}) {
 const [total,setTotal]=useState(tier.totalQuantity),[price,setPrice]=useState(tier.price),[error,setError]=useState('');
 return <Card><h2 className="text-xl font-bold">{tier.name} · {tier.inventoryMode}</h2><p>{money(tier.price,tier.currency)}</p>{tier.inventoryMode==='SEATED'?<p className="mt-3 text-slate-400">{vi.derivedCapacity}</p>:<><label>{vi.capacity}<input className={fieldClass} type="number" min={0} value={total} onChange={e=>setTotal(Number(e.target.value))}/></label><label>{vi.minorPrice} ({tier.currency})<input className={fieldClass} type="number" min={0} value={price} onChange={e=>setPrice(Number(e.target.value))}/></label><IconButton label={vi.save} icon={Save} variant="primary" onClick={async()=>{try{const current=price!==tier.price?await api.updateTierCapacity(tier.id,tier.totalQuantity,{...tier,price}):tier;await api.request(`/admin/tiers/${tier.id}/capacity`,{method:'PATCH',body:JSON.stringify({totalQuantity:total,expectedVersion:current.version})});done();}catch(e){setError((e as Error).message);}}}/></>}<ErrorMessage message={error}/></Card>;
}
function AddTier({id,done}:{id:string;done:()=>void}) {
 const [name,setName]=useState(''),[price,setPrice]=useState(0),[mode,setMode]=useState('SEATED'),[error,setError]=useState('');
 return <Card className="mt-5"><h2 className="font-bold">{vi.addTier}</h2><label>{vi.tierName}<input className={fieldClass} value={name} onChange={e=>setName(e.target.value)}/></label><label>{vi.minorPrice} (VND)<input className={fieldClass} type="number" min={0} value={price} onChange={e=>setPrice(Number(e.target.value))}/></label><select aria-label={vi.capacity} className={fieldClass} value={mode} onChange={e=>setMode(e.target.value)}><option>SEATED</option><option>COUNTER</option></select><Button disabled={!name.trim()} onClick={async()=>{try{await api.request(`/admin/events/${id}/tiers`,{method:'POST',body:JSON.stringify({name,price,currency:'VND',inventoryMode:mode,totalQuantity:0,maxPerOrder:6})});done();}catch(e){setError((e as Error).message);}}}>{vi.addTier}</Button><ErrorMessage message={error}/></Card>;
}
function SectionMapping({id,tiers,sections,done}:{id:string;tiers:TicketTier[];sections:import('../api/generated').AdminSection[];done:()=>void}) {
 const [mapping,setMapping]=useState<Record<string,string>>(Object.fromEntries(sections.map(s=>[s.id,s.tierId||'']))),[error,setError]=useState('');
 return <Card className="mt-5"><h2 className="font-bold text-xl">{vi.mapping}</h2>{sections.map(s=><label key={s.id} className="block my-3">{s.name}<select className={fieldClass} value={mapping[s.id]} onChange={e=>setMapping({...mapping,[s.id]:e.target.value})}><option value="">{vi.choose}</option>{tiers.filter(t=>t.inventoryMode===(s.type==='GA'?'COUNTER':'SEATED')).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>)}<Button disabled={sections.some(s=>!mapping[s.id])} onClick={async()=>{try{await api.request(`/admin/events/${id}/section-tiers`,{method:'PUT',body:JSON.stringify({mappings:sections.map(s=>({sectionId:s.id,tierId:mapping[s.id]}))})});done();}catch(e){setError((e as Error).message);}}}>{vi.saveMapping}</Button><ErrorMessage message={error}/></Card>;
}
function AdminSeats({eventId,sections,published}:{eventId:string;sections:import('../api/generated').AdminSection[];published:boolean}) {
 const [sectionId,setSectionId]=useState(sections.find(s=>s.type==='SEATED')?.id||''),[selected,setSelected]=useState<string[]>([]),[revision,setRevision]=useState(0),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const {value:seats,error:loadError}=useLoad(eventId+sectionId+revision,()=>sectionId?api.adminSeats(eventId,sectionId):Promise.resolve([]));
 async function change(blocked:boolean){setBusy(true);try{await api.request(`/admin/events/${eventId}/seats/block`,{method:'POST',body:JSON.stringify({seats:seats?.filter(s=>selected.includes(s.id)).map(s=>({id:s.id,expectedVersion:s.version})),blocked,reason})});setError('');setSelected([]);setRevision(n=>n+1);}catch(e){setError((e as ApiError).status===409?vi.seatChanged:(e as Error).message);setSelected([]);setRevision(n=>n+1);}finally{setBusy(false);}}
 return <Card><h2 className="text-xl font-bold">{vi.seatManagement}</h2><label>{vi.section}<select aria-label={vi.section} className={fieldClass} value={sectionId} onChange={e=>{setSectionId(e.target.value);setSelected([]);}}>{sections.filter(s=>s.type==='SEATED').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><ErrorMessage message={error||loadError}/><div className="seat-scroll bg-slate-950 rounded-xl">{[...new Set(seats?.map(s=>s.rowLabel))].map(row=><div key={row} className="flex gap-1 my-2 w-max items-center"><span className="seat-row-label">{row}</span>{seats?.map((seat,index)=>({seat,index})).filter(({seat})=>seat.rowLabel===row).map(({seat,index})=><button key={seat.id} data-admin-seat={seat.id} data-status={seat.status} aria-label={`${vi.seatLabel(row,seat.number)}, ${seat.status}`} aria-pressed={selected.includes(seat.id)} disabled={busy||!published||!['AVAILABLE','BLOCKED'].includes(seat.status)} data-aisle={index>0&&seats[index-1].rowLabel===row&&seats[index-1].adjacencySegment!==seat.adjacencySegment||undefined} onClick={()=>setSelected(current=>current.includes(seat.id)?current.filter(id=>id!==seat.id):[...current,seat.id])} className={`seat-cell rounded-lg border ${selected.includes(seat.id)?'bg-indigo-600 border-white':seat.status==='BLOCKED'?'bg-rose-950 border-rose-400':'border-slate-600'}`}>{seat.number}{selected.includes(seat.id)?'✓':seat.status==='BLOCKED'?'▧':'○'}</button>)}</div>)}</div><label className="block mt-4">{vi.reason}<input className={fieldClass} value={reason} maxLength={500} onChange={e=>setReason(e.target.value)}/></label><div className="flex gap-3 flex-wrap">{[true,false].map(blocked=><Button key={String(blocked)} disabled={busy||!reason.trim()||!selected.length||seats?.some(s=>selected.includes(s.id)&&s.status!==(blocked?'AVAILABLE':'BLOCKED'))} onClick={()=>change(blocked)}>{blocked?vi.blockSeat:vi.unblockSeat}</Button>)}</div></Card>;
}
function QueueSettings({id}:{id:string}) {
 const {value,error}=useLoad(id,()=>api.call('GET /api/v1/admin/events/{id}/waiting-room',{path:{id}}));
 return <><ErrorMessage message={error}/>{value&&<QueueForm id={id} initial={value}/>}</>;
}
function QueueForm({id,initial}:{id:string;initial:{enabled:boolean;rate:number;mode:'fifo'|'lottery'}}) {
 const [rate,setRate]=useState(initial.rate),[enabled,setEnabled]=useState(initial.enabled),[mode,setMode]=useState(initial.mode),[message,setMessage]=useState('');
 return <Card><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> {vi.waitingEnabled}</label><label className="block mt-3">{vi.admissionRate}<input className={fieldClass} type="number" min={1} max={1000} value={rate} onChange={e=>setRate(Number(e.target.value))}/></label><label>{vi.queueMode}<select className={fieldClass} value={mode} onChange={e=>setMode(e.target.value as 'fifo'|'lottery')}><option value="fifo">{vi.fifo}</option><option value="lottery">{vi.lottery}</option></select></label><IconButton label={vi.save} icon={Save} variant="primary" onClick={async()=>{try{await api.configureWaitingRoom(id,enabled,rate,mode);setMessage(vi.saved);}catch(e){setMessage((e as Error).message);}}}/><p role="status">{message}</p></Card>;
}
export function AdminOrdersPage() {
 const [revision,setRevision]=useState(0),[failure,setFailure]=useState(''),[busy,setBusy]=useState(false);
 const {value,error}=useLoad('admin-orders'+revision,()=>api.allAdminOrders());
 async function refund(order:Order) {
  if(!confirm(vi.confirmRefund))return;
  setBusy(true);setFailure('');
  try{await api.request(`/admin/orders/${order.id}/refund`,{method:'POST'});setRevision(n=>n+1);}
  catch(e){setFailure((e as ApiError).data?.code==='TICKET_ALREADY_USED'?vi.refundUsed:(e as Error).message);}
  finally{setBusy(false);}
 }
 return <><AdminPageHeader title={vi.orders} description="Tra cứu giao dịch và xử lý hoàn tiền cho đơn đã thanh toán."><IconButton label="Làm mới" icon={RefreshCw} disabled={busy} onClick={()=>setRevision(n=>n+1)}/></AdminPageHeader>
 <ErrorMessage message={error||failure}/>
 {!value&&!error&&<p role="status">Đang tải đơn hàng…</p>}
 {value&&<><p className="text-sm text-slate-400 mb-4">{value.length} đơn hàng · Hoàn tiền cần được xác nhận trước khi thực hiện.</p><AdminOrderTable orders={value} busy={busy} onRefund={order=>{void refund(order);}}/></>}
 </>;
}
