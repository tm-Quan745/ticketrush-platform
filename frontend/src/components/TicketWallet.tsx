import React, { useEffect, useState } from 'react';
import { Ticket as TicketIcon, Clock, Receipt, Search, RefreshCw, ArrowUpRight } from 'lucide-react';
import { api } from '../api/client';
import type { Ticket, Order, Reservation } from '../types';
import { navigate } from '../access/navigation';
import { Button, Card, ErrorMessage, Link, money, useLoad } from '../pages/shared';
import { TicketPass } from '../features/tickets/components/TicketPass';
import { Pagination } from './Pagination';
import { PrintableTicketModal } from './user/PrintableTicketModal';
import { OrderInvoiceModal } from './user/OrderInvoiceModal';
import { remainingSeconds } from '../features/seating/model';
import { vi, stateLabel } from '../i18n/vi';

export function HoldCard({ hold, now, onResume, onDismiss }: { hold: Reservation; now: number; onResume: () => void; onDismiss?: () => void }) {
    const remaining = remainingSeconds(hold.expires_at, now);
    const isExpired = hold.status === 'EXPIRED' || (hold.status === 'HELD' && remaining <= 0);
    return (
        <Card className={isExpired ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20' : ''}>
            <div className="flex items-center justify-between">
                <Clock className={isExpired ? 'text-rose-500 dark:text-rose-400' : 'text-amber-500 dark:text-amber-300'} />
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${isExpired ? 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800' : 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800'}`}>
                    {isExpired ? vi.EXPIRED : stateLabel(hold.status)}
                </span>
            </div>
            <h3 className="font-bold mt-3 text-lg">{hold.tierName}</h3>
            <p className="text-slate-600 dark:text-slate-300 mt-1">{vi.quantity}: {hold.quantity} · {isExpired ? vi.EXPIRED : stateLabel(hold.status)}</p>
            {(hold.status === 'HELD' || isExpired) && <p role="timer" className={`my-3 font-mono ${isExpired ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}>
                {vi.ttl}: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>}
            {isExpired && (
                <div className="p-3 my-3 rounded-xl bg-rose-100/70 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-300 space-y-1">
                    <p className="font-semibold">{vi.expired}</p>
                    <p className="text-slate-600 dark:text-slate-400">Vé đã được tự động hoàn trả lại hệ thống để người khác có thể đặt.</p>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-4">
                <Button disabled={!remaining || hold.status !== 'HELD'} onClick={onResume}>
                    {vi.continueHold}
                </Button>
                {isExpired && (
                    <Button variant="secondary" onClick={() => navigate(hold.eventId ? `/events/${hold.eventId}/queue` : '/events')}>
                        {vi.book} lại
                    </Button>
                )}
                {isExpired && onDismiss && (
                    <Button variant="secondary" onClick={onDismiss} aria-label="Xóa">
                        Xóa
                    </Button>
                )}
            </div>
        </Card>
    );
}

export function TicketWallet({ onResumeReservation, initialTab = 'tickets' }: { onResumeReservation?: (r: Reservation) => void; initialTab?: 'tickets' | 'orders' }) {
    const [tab, setTab] = useState<'tickets' | 'holds' | 'orders'>(initialTab);
    const [page, setPage] = useState(0), [size, setSize] = useState(9), [status, setStatus] = useState('');
    const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [revision, setRevision] = useState(0);
    const [now, setNow] = useState(Date.now());
    const [ticket, setTicket] = useState<Ticket | null>(null), [invoice, setInvoice] = useState<Order | null>(null);
    useEffect(() => {
        if (tab !== 'holds') return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [tab]);
    const { value, error } = useLoad(JSON.stringify(['wallet',tab,page,size,status,query,revision]), async () => {
        if (tab === 'tickets') return {kind:'tickets' as const, data:await api.getMyTickets(page,size,status,query)};
        if (tab === 'orders') return {kind:'orders' as const, data:await api.getMyOrders(page,size)};
        return {kind:'holds' as const, data:await api.getMyReservations(page,size,status ? status as Reservation['status'] : undefined)};
    });
    useEffect(() => {
        if(value && page>0 && page>=value.data.totalPages) setPage(Math.max(0,value.data.totalPages-1));
    },[value,page]);
    function changeTab(next:typeof tab) { setTab(next);setPage(0);setStatus('');setSearch('');setQuery(''); }
    return <section className="wallet-page">
        <div className="wallet-heading"><div><p className="client-eyebrow">TÀI KHOẢN / TRẢI NGHIỆM CỦA BẠN</p><h1>{initialTab === 'orders' ? 'Đơn hàng của tôi' : 'Ví vé của tôi'}</h1><p>Những cuộc hẹn sắp tới, luôn trong tầm tay.</p></div><Button variant="secondary" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={15} className="mr-2"/>{vi.refreshWallet}</Button></div>
        <nav className="wallet-tabs" aria-label="Danh mục ví vé">{([
            ['tickets','Vé của tôi',TicketIcon],['holds','Lượt giữ vé',Clock],['orders','Đơn hàng',Receipt],
        ] as const).map(([key,label,Icon])=><button key={key} type="button" aria-current={tab===key?'page':undefined} onClick={()=>changeTab(key)}><Icon size={18}/>{label}</button>)}</nav>
        <div className="wallet-toolbar">
            {tab==='tickets' ? <form className="wallet-search" role="search" onSubmit={event=>{event.preventDefault();setQuery(search.trim());setPage(0);}}><Search size={17}/><input aria-label="Tìm vé" placeholder="Sự kiện, hạng vé hoặc mã đơn…" maxLength={100} value={search} onChange={event=>setSearch(event.target.value)}/><button type="submit">Tìm kiếm</button></form> : <p className="text-sm text-slate-500">{tab==='orders'?'Theo dõi thanh toán và xem hóa đơn.':'Theo dõi lượt giữ vé và thời hạn thanh toán.'}</p>}
            <div className="wallet-filters">{tab!=='orders' && <label>Trạng thái<select aria-label="Trạng thái" value={status} onChange={event=>{setStatus(event.target.value);setPage(0);}}><option value="">Tất cả</option>{(tab==='tickets'?[['VALID','Còn hiệu lực'],['USED','Đã sử dụng'],['CANCELLED','Đã hủy']]:[['HELD','Đang giữ'],['EXPIRED','Hết hạn'],['CONFIRMED','Đã xác nhận'],['CANCELLED','Đã hủy']]).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>}<label>Mỗi trang<select aria-label="Mỗi trang" value={size} onChange={event=>{setSize(Number(event.target.value));setPage(0);}}>{[9,18,36].map(number=><option key={number} value={number}>{number}</option>)}</select></label></div>
        </div>
        {query&&tab==='tickets'&&<div className="wallet-query">Kết quả cho “{query}” <button onClick={()=>{setQuery('');setSearch('');setPage(0);}}>Xóa tìm kiếm</button></div>}
        <ErrorMessage message={error}/>{error&&<Button variant="secondary" onClick={()=>setRevision(n=>n+1)}>Thử lại</Button>}
        {!value&&!error&&<div className="wallet-empty" role="status"><TicketIcon/><p>Đang tải {tab==='tickets'?'vé':tab==='holds'?'lượt giữ vé':'đơn hàng'}…</p></div>}
        {value?.kind==='tickets'&&tab==='tickets'&&<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{value.data.content.map(item=><div className="wallet-ticket-wrap" key={item.id}><TicketPass ticket={item}/><div className="wallet-ticket-actions"><Button variant="secondary" onClick={()=>setTicket(item)}>{vi.printTicket}</Button><Link href={`/orders/${item.orderId}`} className="flex items-center gap-1 text-xs">Đơn hàng<ArrowUpRight size={14}/></Link></div></div>)}</div>}
        {value?.kind==='holds'&&tab==='holds'&&<div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{value.data.content.map(hold=><HoldCard key={hold.id} hold={hold} now={now} onResume={()=>onResumeReservation?onResumeReservation(hold):navigate(`/checkout/${hold.id}`)}/>)}</div>}
        {value?.kind==='orders'&&tab==='orders'&&<div className="wallet-orders">{value.data.content.map(order=><article className="wallet-order" key={order.id}><div className="wallet-order-icon"><Receipt size={21}/></div><div className="wallet-order-info"><p>{order.items.map(item=>item.tierName).join(' · ')||'Đơn đặt vé'}</p><span>Mã đơn: {order.id}</span><strong>{stateLabel(order.status)}</strong></div><div className="wallet-order-amount"><strong>{money(order.totalAmount,order.currency)}</strong><Link href={`/orders/${order.id}`}>Chi tiết đơn <ArrowUpRight size={13}/></Link></div><Button variant="secondary" onClick={()=>setInvoice(order)}>{vi.invoice}</Button></article>)}</div>}
        {value&&!value.data.content.length&&<div className="wallet-empty"><TicketIcon size={36}/><h2>{status||query?'Không tìm thấy kết quả phù hợp':'Chưa có dữ liệu trong mục này'}</h2><p>{status||query?'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.':'Vé và các giao dịch của bạn sẽ xuất hiện tại đây.'}</p>{status||query?<Button variant="secondary" onClick={()=>{setStatus('');setQuery('');setSearch('');setPage(0);}}>Xóa bộ lọc</Button>:<Link href="/events">Khám phá sự kiện →</Link>}</div>}
        {value&&<Pagination page={value.data.page} totalPages={value.data.totalPages} totalElements={value.data.totalElements} itemLabel={tab==='tickets'?'vé':tab==='holds'?'lượt giữ vé':'đơn hàng'} onPageChange={setPage}/>}
        <PrintableTicketModal ticket={ticket} onClose={()=>setTicket(null)}/><OrderInvoiceModal order={invoice} onClose={()=>setInvoice(null)}/>
    </section>;
}