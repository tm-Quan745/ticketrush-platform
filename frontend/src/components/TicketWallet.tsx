import React, { useEffect, useState } from 'react';
import { Ticket as TicketIcon, Clock, Receipt, AlertCircle } from 'lucide-react';
import { api } from '../api/client';
import type { Ticket, Order, Reservation } from '../types';
import { navigate } from '../access/navigation';
import { Button, Card, ErrorMessage, Link, money, useLoad } from '../pages/shared';
import { TicketPass } from '../features/tickets/components/TicketPass';
import { PrintableTicketModal } from './user/PrintableTicketModal';
import { OrderInvoiceModal } from './user/OrderInvoiceModal';
import { remainingSeconds } from '../features/seating/model';
import { vi, stateLabel } from '../i18n/vi';

export function HoldCard({ hold, now, onResume, onDismiss }: { hold: Reservation; now: number; onResume: () => void; onDismiss?: () => void }) {
    const remaining = remainingSeconds(hold.expires_at, now);
    const isExpired = remaining <= 0 || hold.status === 'EXPIRED';
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
            <p role="timer" className={`my-3 font-mono ${isExpired ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}`}>
                {vi.ttl}: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>
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
    const [tab, setTab] = useState<'tickets' | 'holds' | 'orders'>(initialTab), [revision, setRevision] = useState(0), [now, setNow] = useState(Date.now());
    const [ticket, setTicket] = useState<Ticket | null>(null), [invoice, setInvoice] = useState<Order | null>(null);
    useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
    const { value, error } = useLoad('wallet' + revision, async () => {
        const [orders, holds] = await Promise.all([api.allMyOrders(), api.allMyReservations()]); const tickets: Ticket[] = [];
        for (const order of orders) if (['PAID', 'REFUND_PENDING', 'REFUNDED'].includes(order.status)) tickets.push(...await api.getOrderTickets(order.id));
        return { orders, holds, tickets };
    });
    const paidReservationIds = new Set((value?.orders || []).filter(o => ['PAID', 'CONFIRMED', 'PENDING_PAYMENT'].includes(o.status)).map(o => o.reservationId));
    const userHolds = (value?.holds || []).filter(h => !paidReservationIds.has(h.id));
    const expiredHolds = userHolds.filter(h => h.status === 'EXPIRED' || remainingSeconds(h.expires_at, now) <= 0);

    async function dismissHold(id: string) {
        try { await api.cancelReservation(id); } catch { }
        setRevision(n => n + 1);
    }

    async function clearExpiredHolds() {
        try { await Promise.all(expiredHolds.map(h => api.cancelReservation(h.id))); } catch { }
        setRevision(n => n + 1);
    }

    return <section className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-indigo-300 font-bold">TicketRush</p><h1 className="text-3xl font-black">{initialTab === 'orders' ? vi.orders : vi.wallet}</h1></div><Button variant="secondary" onClick={() => setRevision(n => n + 1)}>{vi.refreshWallet}</Button></div>
        <nav className="flex gap-2 flex-wrap">{(['tickets', 'holds', 'orders'] as const).map(t => <Button key={t} variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>{t === 'tickets' ? vi.tickets : t === 'holds' ? vi.holds : vi.orders}</Button>)}</nav>
        <ErrorMessage message={error} />{!value && !error && <p>{vi.loading}</p>}
        {value && tab === 'tickets' && <><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">{value.tickets.map(t => <div key={t.id}><TicketPass ticket={t} /><div className="flex flex-wrap gap-3 mt-3"><Button variant="secondary" onClick={() => setTicket(t)}>{vi.printTicket}</Button><Link href={`/orders/${t.orderId}`}>{vi.order}</Link></div></div>)}</div>{!value.tickets.length && <Card><TicketIcon /><p>{vi.noTickets}</p></Card>}</>}
        {value && tab === 'holds' && (
            <div className="space-y-4">
                {expiredHolds.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-sm">
                        <div>
                            <p className="font-semibold text-amber-800 dark:text-amber-300">
                                Bạn có {expiredHolds.length} lượt giữ vé đã hết thời gian giữ chỗ.
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                                Các vé này đã được hoàn trả về hệ thống. Bạn có thể xóa để dọn dẹp danh sách hoặc chọn đặt vé lại.
                            </p>
                        </div>
                        <Button variant="secondary" onClick={clearExpiredHolds}>
                            Dọn dẹp lượt hết hạn
                        </Button>
                    </div>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                    {userHolds.map(h => (
                        <HoldCard
                            key={h.id}
                            hold={h}
                            now={now}
                            onResume={() => onResumeReservation ? onResumeReservation(h) : navigate(`/checkout/${h.id}`)}
                            onDismiss={() => dismissHold(h.id)}
                        />
                    ))}
                </div>
                {!userHolds.length && <Card><Clock className="text-slate-400" /><p>{vi.noHolds}</p></Card>}
            </div>
        )}
        {value && tab === 'orders' && <div className="space-y-4">{value.orders.map(o => <Card key={o.id}><Receipt className="text-indigo-300" /><p className="break-all text-xs my-3">{o.id}</p><p className="font-bold">{stateLabel(o.status)}</p><p className="text-xl my-3">{money(o.totalAmount, o.currency)}</p><div className="flex gap-4 items-center"><Link href={`/orders/${o.id}`}>{vi.details}</Link><Button variant="secondary" onClick={() => setInvoice(o)}>{vi.invoice}</Button></div></Card>)}{!value.orders.length && <p>{vi.noOrders}</p>}</div>}
        <PrintableTicketModal ticket={ticket} onClose={() => setTicket(null)} /><OrderInvoiceModal order={invoice} onClose={() => setInvoice(null)} /></section>;
}
