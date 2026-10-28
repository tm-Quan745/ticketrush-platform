import React from 'react';
import { CalendarDays, Clock, MapPin, Layers, Armchair, Users, ShieldCheck, Receipt, Info } from 'lucide-react';
import type { Event } from '../../types';
import { Card } from '../../pages/shared';
import { adminDate } from './AdminTables';
import { EventImageEditor } from './EventImageEditor';

const tabs=[
 {id:'info',label:'Thông tin',icon:Info},
 {id:'tiers',label:'Hạng vé',icon:Layers},
 {id:'seats',label:'Sơ đồ ghế',icon:Armchair},
 {id:'waiting room',label:'Phòng chờ',icon:Users},
 {id:'inventory and reconcile',label:'Tồn kho & đối soát',icon:ShieldCheck},
 {id:'orders',label:'Đơn hàng',icon:Receipt},
];
export function EventManagementTabs({active,onChange}:{active:string;onChange:(tab:string)=>void}) {
 return <nav aria-label="Quản lý sự kiện" className="flex gap-1 overflow-x-auto border-b border-slate-800 mb-6">
  {tabs.map(({id,label,icon:Icon})=><button key={id} type="button" aria-current={active===id?'page':undefined} onClick={()=>onChange(id)} className={`flex items-center gap-2 px-4 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition focus-visible:outline-2 focus-visible:outline-indigo-400 ${active===id?'border-indigo-500 text-indigo-400 bg-indigo-500/10':'border-transparent text-slate-400 hover:bg-slate-900/80'}`}><Icon size={17} aria-hidden="true"/>{label}</button>)}
 </nav>;
}
export function EventOverview({event,onImageSaved}:{event:Event;onImageSaved:()=>void}) {
 return <div className="grid xl:grid-cols-5 gap-6">
  <div className="xl:col-span-3 space-y-6">
   <Card className="shadow-sm"><h2 className="text-lg font-bold flex gap-2 items-center"><Info size={20} className="text-indigo-400"/>Thông tin sự kiện</h2>
    <p className="mt-4 text-sm text-slate-400 leading-relaxed whitespace-pre-wrap break-words">{event.description||'Chưa có mô tả sự kiện.'}</p>
    <div className="mt-6 pt-5 border-t border-slate-800 flex items-start gap-3"><MapPin size={20} className="text-indigo-400 shrink-0"/><div><p className="font-semibold">{event.venueName||'Chưa có địa điểm'}</p><p className="text-sm text-slate-400 mt-1">{event.venueAddress||'Chưa có địa chỉ'}</p></div></div>
   </Card>
   <Card className="shadow-sm"><h2 className="text-lg font-bold flex items-center gap-2"><CalendarDays size={20} className="text-indigo-400"/>Lịch trình</h2><p className="text-xs text-slate-400 mt-2">Tất cả thời gian theo GMT+7</p>
    <dl className="grid sm:grid-cols-2 gap-5 mt-5">{[['Bắt đầu sự kiện',event.startTime],['Kết thúc sự kiện',event.endTime],['Mở bán vé',event.saleStartTime],['Đóng bán vé',event.saleEndTime]].map(([label,time])=><div key={label} className="rounded-2xl bg-slate-950 p-4 border border-slate-800"><dt className="text-xs text-slate-400 flex gap-2 items-center"><Clock size={14}/>{label}</dt><dd className="font-semibold text-sm mt-2">{adminDate(time)}</dd></div>)}</dl>
   </Card>
  </div>
  <Card className="xl:col-span-2 shadow-sm self-start"><h2 className="text-lg font-bold">Ảnh sự kiện</h2><p className="text-sm text-slate-400 mt-2">Ảnh hiển thị trên danh sách và trang đặt vé.</p><EventImageEditor event={event} done={onImageSaved}/><dl className="border-t border-slate-800 pt-4 mt-4 space-y-3 text-xs text-slate-400"><div><dt>Mã sự kiện</dt><dd className="font-mono break-all mt-1">{event.id}</dd></div><div><dt>Cập nhật gần nhất</dt><dd className="mt-1">{adminDate(event.updatedAt)}</dd></div></dl></Card>
 </div>;
}
