import React,{useState} from 'react';
import {api} from '../../api/client';
import {Modal} from '../ui/Modal';
import {Button,ErrorMessage,fieldClass,useLoad,Link} from '../../pages/shared';
import {vi} from '../../i18n/vi';
import {navigate} from '../../access/navigation';
type Venue={id:string;name:string;sections?:{id:string;name:string;type:'GA'|'SEATED'}[]};
const localDate=(offset:number)=>{const date=new Date(Date.now()+offset);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
export function CreateEventModal({onClose,onEventCreated}:{onClose:()=>void;onEventCreated:()=>void}) {
 const {value:venues,error:loadError}=useLoad('venues',()=>api.request<Venue[]>('/admin/venues'));
 const [venueId,setVenueId]=useState(''),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[prices,setPrices]=useState<Record<string,number>>({}),[names,setNames]=useState<Record<string,string>>({}),[capacities,setCapacities]=useState<Record<string,number>>({});
 const [start,setStart]=useState(localDate(30*86400000)),[end,setEnd]=useState(localDate(30*86400000+7200000)),[saleStart,setSaleStart]=useState(localDate(-60000)),[saleEnd,setSaleEnd]=useState(localDate(29*86400000));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[created,setCreated]=useState('');
 const {value:venue,error:venueError}=useLoad(venueId,()=>venueId?api.request<Venue>(`/admin/venues/${venueId}`):Promise.resolve(undefined));
 async function submit(e:React.FormEvent){e.preventDefault();if(!venue||created)return;setBusy(true);setError('');try{
  const event=await api.createEvent({title,description,venueId,venueName:venue.name,startTime:new Date(start).toISOString(),endTime:new Date(end).toISOString(),saleStartTime:new Date(saleStart).toISOString(),saleEndTime:new Date(saleEnd).toISOString()});setCreated(event.id);
  const mappings=[];
  for(const section of venue.sections||[]){const tier=await api.request<{id:string}>(`/admin/events/${event.id}/tiers`,{method:'POST',body:JSON.stringify({name:names[section.id]||section.name,price:prices[section.id]??120000,currency:'VND',inventoryMode:section.type==='GA'?'COUNTER':'SEATED',totalQuantity:section.type==='GA'?(capacities[section.id]??500):0,maxPerOrder:6})});mappings.push({sectionId:section.id,tierId:tier.id});}
  await api.request(`/admin/events/${event.id}/section-tiers`,{method:'PUT',body:JSON.stringify({mappings})});navigate(`/admin/events/${event.id}`);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Modal isOpen onClose={onClose} title={vi.createDraft} maxWidth="2xl"><form onSubmit={submit} className="space-y-4"><ErrorMessage message={loadError||venueError||error}/>
 <fieldset disabled={busy||!!created} className="space-y-4"><label>{vi.adminEventTitle}<input required maxLength={200} className={fieldClass} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{vi.description}<textarea className={fieldClass} value={description} onChange={e=>setDescription(e.target.value)}/></label>
 <label>{vi.venueTemplate}<select aria-label={vi.venueTemplate} required className={fieldClass} value={venueId} onChange={e=>setVenueId(e.target.value)}><option value="">{vi.choose}</option>{venues?.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
 <div className="grid sm:grid-cols-2 gap-3">{[[vi.startTime,start,setStart],[vi.endTime,end,setEnd],[vi.saleStart,saleStart,setSaleStart],[vi.saleEnd,saleEnd,setSaleEnd]].map(([label,value,set])=><label key={label as string}>{label as string}<input required type="datetime-local" className={fieldClass} value={value as string} onChange={e=>(set as (v:string)=>void)(e.target.value)}/></label>)}</div>
 {venue?.sections?.map(section=><div key={section.id} className="rounded-xl border border-slate-700 p-4"><h4 className="font-bold">{section.name} · {section.type}</h4><label>{vi.tierName}<input className={fieldClass} value={names[section.id]??section.name} onChange={e=>setNames({...names,[section.id]:e.target.value})} required/></label><label>{vi.minorPrice} (VND)<input type="number" min={0} step={1} required className={fieldClass} value={prices[section.id]??120000} onChange={e=>setPrices({...prices,[section.id]:Number(e.target.value)})}/></label>{section.type==='GA'&&<label>{vi.capacity}<input type="number" min={0} step={1} required className={fieldClass} value={capacities[section.id]??500} onChange={e=>setCapacities({...capacities,[section.id]:Number(e.target.value)})}/></label>}</div>)}</fieldset>
 {!created&&<Button type="submit" isLoading={busy} disabled={!venue}>{vi.createDraft}</Button>}{created&&<Link href={`/admin/events/${created}`}>{vi.draftSaved} →</Link>}</form></Modal>;
}
