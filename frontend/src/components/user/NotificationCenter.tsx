import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, RefreshCw, X, Receipt } from 'lucide-react';
import { api, ApiError, pollDelay } from '../../api/client';
import { IconButton } from '../ui/IconButton';
import { navigate } from '../../access/navigation';
import { notificationReadKey, bookingNotifications, parseReadNotifications, type OrderNotification } from '../../features/notifications/model';
import { connectNotifications, notificationSocketUrl } from '../../features/notifications/realtime';

export function NotificationCenter({userId}:{userId:string}) {
 const [open,setOpen]=useState(false),[items,setItems]=useState<OrderNotification[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 const [read,setRead]=useState<string[]>(()=>{try{return parseReadNotifications(localStorage.getItem(notificationReadKey(userId)));}catch{return [];}});
 const dialog=useRef<HTMLDialogElement>(null);
 const [connected,setConnected]=useState(false);
 const refreshRef=useRef<()=>void>(()=>{});
 const unread=items.filter(item=>!read.includes(item.id)).length;
 useEffect(()=>{
  let alive=true,inFlight=false,pending=false,nextAllowedAt=0;let timer:ReturnType<typeof setTimeout>|undefined;
  async function refresh() {
   if(!alive)return;
   if(inFlight){pending=true;return;}
   clearTimeout(timer);
   if(Date.now()<nextAllowedAt){timer=setTimeout(refresh,nextAllowedAt-Date.now());return;}
   if(document.hidden){timer=setTimeout(refresh,60000);return;}
   inFlight=true;let delay=60000;
   try {
    // Listing reservations may expire holds and their orders; read orders afterwards.
    const reservations=await api.getMyReservations();
    if(!alive)return;
    const result=await api.getMyOrders();
    if(alive){setItems(bookingNotifications(result.content,reservations.content,userId));setError('');}
   }catch(e){if(alive)setError('Chưa tải được thông báo. Vui lòng thử lại.');delay=pollDelay(e instanceof ApiError?e:{},60000);nextAllowedAt=Date.now()+delay;}
   finally{inFlight=false;if(alive){setLoading(false);timer=setTimeout(refresh,pending?Math.max(0,nextAllowedAt-Date.now()):delay);pending=false;}}
  }
  const visible=()=>{if(!document.hidden)void refresh();};
  refreshRef.current=()=>void refresh();
  const disconnect=connectNotifications({
   url:notificationSocketUrl(import.meta.env?.VITE_API_BASE_URL||'/api/v1',window.location.href),
   token:async(forceRefresh)=>{if(forceRefresh&&!await api.refreshSession())return null;await api.getMe();return api.getToken();},
   refresh:()=>void refresh(),status:setConnected,
  });
  void refresh();document.addEventListener('visibilitychange',visible);
  return ()=>{alive=false;disconnect();clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
 },[userId]);
 useEffect(()=>{if(revision)refreshRef.current();},[revision]);
 useEffect(()=>{if(open){dialog.current?.showModal();}else{dialog.current?.close();}},[open]);
 function mark(ids:string[]) {
  const next=[...new Set([...read,...ids])].slice(-500);setRead(next);
  try{localStorage.setItem(notificationReadKey(userId),JSON.stringify(next));}catch{/* Read state remains available for this session. */}
 }
 return <><div className="relative"><IconButton label={`Thông báo${unread?`, ${unread} chưa đọc`:''}`} icon={Bell} variant="ghost" aria-haspopup="dialog" onClick={()=>{setOpen(true);setRevision(value=>value+1);}}/>{unread>0&&<span aria-hidden="true" className="pointer-events-none absolute -top-1 -right-1 rounded-full bg-rose-600 text-white text-[10px] font-bold min-w-5 px-1 text-center">{unread}</span>}</div>
  <dialog ref={dialog} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} aria-labelledby="notification-heading" className="notification-dialog bg-slate-900 text-slate-100 border border-slate-800 rounded-3xl p-0 shadow-2xl">
   <div className="p-5 border-b border-slate-800"><div className="flex items-center justify-between gap-3"><h2 id="notification-heading" className="text-xl font-bold">Thông báo</h2><IconButton label="Đóng thông báo" icon={X} variant="ghost" onClick={()=>setOpen(false)}/></div><p className="text-sm text-slate-400 mt-1">50 đơn hàng và 50 lượt giữ vé gần nhất · {connected ? 'đang cập nhật realtime.' : 'đang kết nối realtime, tự làm mới mỗi phút.'}</p><div className="flex items-center justify-between mt-4"><span className="text-sm text-slate-400">{unread} chưa đọc</span><div className="flex gap-2"><IconButton label="Đánh dấu tất cả đã đọc" icon={CheckCheck} disabled={!unread} onClick={()=>mark(items.map(item=>item.id))}/><IconButton label="Làm mới thông báo" icon={RefreshCw} onClick={()=>setRevision(value=>value+1)}/></div></div></div>
   <div className="p-4 space-y-3 overflow-y-auto min-h-32">
    {loading&&<p role="status" className="p-4 text-sm text-slate-400">Đang tải thông báo…</p>}
    {error&&<p role="alert" className="p-4 text-sm text-rose-400">{error}</p>}
    {!loading&&!error&&!items.length&&<div className="py-10 text-center text-slate-400"><Bell className="mx-auto mb-3" size={28}/><p>Chưa có thông báo.</p></div>}
    {items.map(item=><div key={item.id} className={`flex items-start gap-3 p-4 rounded-2xl border ${read.includes(item.id)?'border-slate-800':'border-indigo-500/40 bg-indigo-500/10'}`}><Receipt size={20} className="shrink-0 text-indigo-400 mt-1"/><button type="button" className="min-w-0 flex-1 text-left" onClick={()=>{mark([item.id]);setOpen(false);navigate(item.href);}}><span className="block font-bold text-sm">{item.title}{!read.includes(item.id)&&<span className="sr-only"> · Chưa đọc</span>}</span><span className="block mt-2 text-sm text-slate-400 leading-relaxed">{item.message}</span><span className="block mt-2 text-xs text-slate-400 break-all">{item.reservationId ? 'Mã giữ vé' : 'Mã đơn'}: {item.reservationId || item.orderId}</span></button>{!read.includes(item.id)&&<IconButton label={`Đánh dấu đã đọc ${item.reservationId || item.orderId}`} icon={Check} variant="ghost" onClick={()=>mark([item.id])}/>}</div>)}
   </div><p className="p-4 border-t border-slate-800 text-xs text-slate-400">Trạng thái đã đọc được lưu trên trình duyệt này.</p>
  </dialog>
 </>;
}
