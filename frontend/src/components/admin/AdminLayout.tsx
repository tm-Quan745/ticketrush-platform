import React from 'react';
import { Activity, ArrowUpRight, CalendarDays, ChartNoAxesCombined, ChevronRight, LayoutDashboard, Receipt, ShieldCheck, Ticket } from 'lucide-react';
import { navigate } from '../../access/navigation';
import { Link } from '../../pages/shared';

const items = [
  {href:'/admin',label:'Tổng quan',icon:LayoutDashboard},
  {href:'/admin/events',label:'Sự kiện',icon:CalendarDays},
  {href:'/admin/venues',label:'Sơ đồ địa điểm',icon:LayoutDashboard},
  {href:'/admin/orders',label:'Tất cả đơn hàng',icon:Receipt},
  {href:'/admin/operations',label:'Vận hành',icon:Activity},
  {href:'/admin/results',label:'Kết quả',icon:ChartNoAxesCombined},
];

export function AdminSidebar({pathname}:{pathname:string}) {
  return <aside className="admin-sidebar w-full md:w-60 shrink-0 p-3 md:my-6 md:ml-3 md:rounded-3xl border-b md:border border-slate-800 bg-slate-900/40">
    <div className="flex items-center gap-3 px-2 py-3 mb-3"><span className="rounded-2xl bg-gradient-to-br from-indigo-500/20 to-rose-500/10 border border-indigo-500/20 p-3 text-indigo-400"><ShieldCheck size={22} aria-hidden="true"/></span><div><p className="font-black text-slate-100 tracking-tight">TicketRush</p><p className="text-[10px] tracking-widest uppercase font-semibold text-slate-400 mt-1">Không gian quản trị</p></div></div>
    <p className="hidden md:block px-3 mb-3 text-[10px] font-bold tracking-widest uppercase text-slate-500">Quản lý</p>
    <nav aria-label="Điều hướng quản trị" className="flex overflow-x-auto md:flex-col gap-1.5 pb-2 md:pb-0">
      {items.map(({href,label,icon:Icon})=>{
        const active=href==='/admin'?pathname===href:pathname===href||pathname.startsWith(href+'/');
        return <a key={href} href={href} aria-current={active?'page':undefined} onClick={event=>{if(event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate(href);}}} className={`group relative flex shrink-0 items-center gap-3 px-3 py-3 rounded-2xl text-sm font-semibold transition whitespace-nowrap focus-visible:outline-2 focus-visible:outline-indigo-400 ${active?'bg-indigo-500/10 text-indigo-400 ring-1 ring-inset ring-indigo-500/25':'text-slate-400 hover:bg-slate-900/80 hover:text-slate-100'}`}><span className={`flex w-8 h-8 items-center justify-center rounded-xl ${active?'bg-indigo-500/15':'bg-slate-800/40'}`}><Icon size={18} aria-hidden="true"/></span>{label}{active&&<ChevronRight size={15} aria-hidden="true" className="hidden md:block ml-auto"/>}</a>;
      })}
    </nav>
    <div className="mt-3 md:mt-6 border-t border-slate-800 pt-4 px-2 text-sm flex flex-wrap md:flex-col gap-4">
      <Link href="/gate" className="flex items-center gap-2"><Ticket size={16} aria-hidden="true"/> Cổng soát vé</Link>
      <Link href="/events" className="flex items-center gap-2">Xem như khách hàng <ArrowUpRight size={16} aria-hidden="true"/></Link>
    </div>
  </aside>;
}

export function AdminPageHeader({title,description,children}:{title:string;description:string;children?:React.ReactNode}) {
  return <div className="mb-7 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
    <div><p className="text-xs uppercase tracking-widest font-bold text-indigo-400 mb-2">Quản trị / TicketRush</p><h1 className="text-3xl font-black tracking-tight text-slate-100">{title}</h1><p className="text-sm text-slate-400 mt-3 max-w-2xl leading-relaxed">{description}</p></div>
    {children&&<div className="flex flex-wrap items-center gap-3 shrink-0">{children}</div>}
  </div>;
}
