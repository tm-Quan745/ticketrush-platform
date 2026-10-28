import React from 'react';
import { CalendarDays, Settings2 } from 'lucide-react';
import type { Event, Order } from '../../types';
import { stateLabel } from '../../i18n/vi';
import { Button, Link, money } from '../../pages/shared';

export function StatusBadge({status}:{status:string}) {
  const tone=['PUBLISHED','PAID'].includes(status)?'bg-emerald-500/10 text-emerald-400 border-emerald-500/20':
    ['CANCELLED','PAYMENT_FAILED','EXPIRED'].includes(status)?'bg-rose-500/10 text-rose-400 border-rose-500/20':
    ['DRAFT','PENDING','PENDING_PAYMENT','REFUND_PENDING'].includes(status)?'bg-amber-500/10 text-amber-400 border-amber-500/20':'bg-slate-800 text-slate-400 border-slate-700';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${tone}`}>{stateLabel(status)}</span>;
}

export function adminDate(value?:string) {
  if(!value||Number.isNaN(Date.parse(value)))return '—';
  return new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(value));
}
const cell='px-5 py-4';
const head='px-5 py-3 text-xs font-semibold text-slate-400 whitespace-nowrap';

export function AdminEventTable({events}:{events:Event[]}) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
    <table className="w-full text-left text-sm"><caption className="sr-only">Danh sách sự kiện quản trị</caption>
      <thead className="bg-slate-900/80 border-b border-slate-800"><tr>{['Sự kiện','Trạng thái','Bắt đầu (GMT+7)','Mở bán (GMT+7)','Thao tác'].map(label=><th key={label} scope="col" className={head}>{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-800">{events.map(event=><tr key={event.id} className="hover:bg-slate-900/80 transition">
        <td className={cell}><div className="flex items-center gap-3 min-w-56"><div className="w-12 h-14 rounded-lg overflow-hidden shrink-0 bg-indigo-500/10 flex items-center justify-center">{event.imageUrl?<img src={event.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy"/>:<CalendarDays className="text-indigo-400" size={22}/>}</div><div><Link href={`/admin/events/${event.id}`} className="font-semibold line-clamp-2">{event.title}</Link><p className="text-xs text-slate-400 mt-1">{event.venueName||'Chưa có địa điểm'}</p></div></div></td>
        <td className={cell}><StatusBadge status={event.status}/></td>
        <td className={`${cell} whitespace-nowrap text-slate-400`}>{adminDate(event.startTime)}</td>
        <td className={`${cell} whitespace-nowrap text-slate-400`}>{adminDate(event.saleStartTime)}</td>
        <td className={cell}><Link href={`/admin/events/${event.id}`} title={`Quản lý ${event.title}`} className="relative inline-flex w-11 h-11 items-center justify-center rounded-xl border border-slate-700 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-indigo-400"><Settings2 size={18} aria-hidden="true"/><span className="sr-only">Quản lý {event.title}</span></Link></td>
      </tr>)}</tbody>
    </table>
    {!events.length&&<p className="p-10 text-center text-slate-400">Chưa có sự kiện. Tạo bản nháp để bắt đầu.</p>}
  </div>;
}

export function AdminOrderTable({orders,busy,onRefund}:{orders:Order[];busy:boolean;onRefund:(order:Order)=>void}) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
    <table className="w-full text-left text-sm"><caption className="sr-only">Đơn hàng và hoàn tiền</caption>
      <thead className="bg-slate-900/80 border-b border-slate-800"><tr>{['Mã đơn / Khách hàng','Trạng thái','Giá trị đơn','Ngày tạo (GMT+7)','Thao tác'].map(label=><th key={label} scope="col" className={head}>{label}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-800">{orders.map(order=><tr key={order.id} data-order-id={order.id} className="hover:bg-slate-900/80">
        <td className={cell}><p className="font-mono text-xs break-all min-w-44">{order.id}</p><p className="text-xs text-slate-400 mt-2 break-all">{order.userId}</p></td>
        <td className={cell}><StatusBadge status={order.status}/>{order.manualReview&&<p className="text-xs text-amber-400 mt-2">Cần kiểm tra thủ công</p>}</td>
        <td className={`${cell} whitespace-nowrap font-semibold`}>{money(order.totalAmount,order.currency)}</td>
        <td className={`${cell} whitespace-nowrap text-slate-400`}>{adminDate(order.createdAt)}</td>
        <td className={cell}><Button variant="secondary" size="sm" disabled={busy||order.status!=='PAID'} onClick={()=>onRefund(order)}>Hoàn tiền</Button></td>
      </tr>)}</tbody>
    </table>
    {!orders.length&&<p className="p-10 text-center text-slate-400">Chưa có đơn hàng.</p>}
  </div>;
}

