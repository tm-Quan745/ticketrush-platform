import React from 'react';
import { Mail, ShieldCheck, Ticket, Receipt, Palette, UserRound, ArrowUpRight } from 'lucide-react';
import type { User } from '../../types';
import { Card, Link } from '../../pages/shared';
import { useTheme } from '../../context/ThemeContext';

export function ProfilePage({user}:{user:User}) {
 const {theme,setTheme}=useTheme();
 return <section className="max-w-5xl mx-auto space-y-6">
  <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-9">
   <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-indigo-500 to-rose-500"/>
   <div className="flex flex-col sm:flex-row sm:items-center gap-5"><div className="w-20 h-20 shrink-0 rounded-3xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center"><UserRound size={38} aria-hidden="true"/></div><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">Tài khoản TicketRush</p><h1 className="text-3xl font-black">Hồ sơ cá nhân</h1><p className="text-slate-400 mt-2 break-all">{user.email}</p></div></div>
  </div>
  <div className="grid md:grid-cols-3 gap-6">
   <Card className="md:col-span-2 shadow-sm"><h2 className="text-lg font-bold flex gap-2 items-center"><ShieldCheck size={20} className="text-indigo-400"/>Thông tin tài khoản</h2><p className="text-sm text-slate-400 mt-2">Thông tin đang được sử dụng cho vé và đơn hàng của bạn.</p>
    <dl className="mt-6 divide-y divide-slate-800"><div className="pb-5"><dt className="text-xs text-slate-400 flex gap-2 items-center"><Mail size={14}/>Email</dt><dd className="mt-2 font-semibold break-all">{user.email}</dd></div><div className="py-5"><dt className="text-xs text-slate-400">Mã tài khoản</dt><dd className="mt-2 font-mono text-sm break-all">{user.id}</dd></div><div className="pt-5"><dt className="text-xs text-slate-400">Loại tài khoản</dt><dd className="mt-2">{user.role==='USER'?'Khách hàng':user.role==='ADMIN'?'Quản trị viên':'Nhân viên'}</dd></div></dl>
   </Card>
   <div className="space-y-6"><Card className="shadow-sm"><h2 className="font-bold flex items-center gap-2"><Palette size={20} className="text-indigo-400"/>Giao diện</h2><p className="text-sm text-slate-400 mt-2 mb-4">Chọn giao diện phù hợp với bạn.</p><div className="flex flex-wrap gap-2" role="group" aria-label="Chọn giao diện">{([['light','Sáng'],['dark','Tối'],['system','Hệ thống']] as const).map(([mode,label])=><button key={mode} type="button" aria-pressed={theme===mode} onClick={()=>setTheme(mode)} className={`px-3 py-2 rounded-xl border text-sm ${theme===mode?'border-indigo-500 text-indigo-400 bg-indigo-500/10':'border-slate-700 text-slate-400 hover:bg-slate-900/80'}`}>{label}</button>)}</div></Card>
    <Card className="shadow-sm"><h2 className="font-bold mb-4">Truy cập nhanh</h2><div className="space-y-4 text-sm"><Link href="/account/tickets" className="flex items-center gap-2"><Ticket size={18}/>Ví vé của tôi<ArrowUpRight size={15} className="ml-auto"/></Link><Link href="/account/orders" className="flex items-center gap-2"><Receipt size={18}/>Lịch sử đơn hàng<ArrowUpRight size={15} className="ml-auto"/></Link></div></Card>
   </div>
  </div>
 </section>;
}
