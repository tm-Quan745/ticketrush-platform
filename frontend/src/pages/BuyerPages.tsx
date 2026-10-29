import React, { useEffect, useState } from 'react';
import './AuthPage.css';
import { ThemeToggle } from '../components/ThemeToggle';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { TicketPass } from '../features/tickets/components/TicketPass';
import { TicketWallet } from '../components/TicketWallet';
import { EventsHero } from '../components/user/EventsHero';
import { ProfilePage } from '../components/user/ProfilePage';
import { api, ApiError, pollDelay } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { navigate } from '../access/navigation';
import { landing } from '../access/permissions';
import type { Order, Reservation, Ticket, WaitingRoomStatus } from '../types';
import type { SeatReadSeatMap, SeatReadSectionOverview } from '../api/generated';
import { Button, Card, ErrorMessage, fieldClass, Link, money, useLoad } from './shared';
import { Modal } from '../components/ui/Modal';
import { EventCard } from '../components/EventCard';
import { Pagination } from '../components/Pagination';
import { IconButton } from '../components/ui/IconButton';
import { EventHeader } from '../features/flash-sale/components/EventHeader';
import { TicketCard } from '../features/flash-sale/components/TicketCard';
import { StadiumMap, SeatGrid } from '../features/seating/SeatPicker';
import { startPolling } from '../features/seating/polling';
import { remainingSeconds, sortedSeats } from '../features/seating/model';
import { vi, stateLabel } from '../i18n/vi';
import { Ticket as TicketIcon, Users, Clock, ShieldCheck, Search, Mail, LockKeyhole, Eye, EyeOff, ArrowRight } from 'lucide-react';

const admissions = new Map<string, string>();
window.addEventListener('auth:expired', () => admissions.clear());
const message = (e: unknown) => (e as ApiError).status === 429 || (e as ApiError).status === 503 ? (e as Error).message : vi.failure;
export function AuthPage({ register = false }: { register?: boolean }) {
    const { login, loginWithGoogle } = useAuth(); const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    async function googleLogin(credential: string) {
        setBusy(true); setError('');
        try { const user = await loginWithGoogle(credential); navigate(landing(user.role, new URLSearchParams(location.search).get('next')), true); }
        catch (e) { setError(e instanceof ApiError && e.data?.code === 'GOOGLE_ACCOUNT_CONFLICT'
            ? 'Email này đã có tài khoản. Vui lòng đăng nhập bằng mật khẩu đã đăng ký.'
            : e instanceof ApiError && e.status === 409 ? 'Có yêu cầu đăng nhập đồng thời. Vui lòng thử lại.'
            : 'Đăng nhập Google chưa thành công. Vui lòng thử lại.'); }
        finally { setBusy(false); }
    }
    async function submit(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { if (register) await api.register(email, password); const user = await login(email, password); navigate(landing(user.role, new URLSearchParams(location.search).get('next')), true); } catch (e) { setError(message(e)); } finally { setBusy(false); } }
    return <section className="auth-layout" aria-labelledby="auth-title">
        <aside className="auth-story">
            <TicketIcon className="auth-story-mark" aria-hidden="true" />
            <p className="auth-story-eyebrow font-bold mb-3">Khám phá sự kiện cùng TicketRush</p>
            <h2 >Sự kiện yêu thích.<br />Trải nghiệm đáng nhớ.</h2>
            <p className="auth-story-copy">Đăng nhập để đặt vé, theo dõi đơn hàng và lưu tất cả vé của bạn ở một nơi.</p>
            <div className="auth-features">
                <div><span className="auth-feature-icon"><Search size={22} aria-hidden="true" /></span><p><strong>Khám phá sự kiện</strong><span>Tìm trải nghiệm tiếp theo dành cho bạn.</span></p></div>
                <div><span className="auth-feature-icon"><TicketIcon size={22} aria-hidden="true" /></span><p><strong>Vé của bạn, trong tầm tay</strong><span>Xem vé và thông tin chỗ ngồi trong ví vé.</span></p></div>
                <div><span className="auth-feature-icon"><Clock size={22} aria-hidden="true" /></span><p><strong>Theo dõi đơn hàng</strong><span>Kiểm tra trạng thái đặt vé và thanh toán.</span></p></div>
            </div>
            <Link href="/events" className="auth-explore">Khám phá sự kiện <ArrowRight size={18} aria-hidden="true" /></Link>
        </aside>
        <div className="auth-form-panel">
            <div className="auth-actions">
                <Link href="/events" className="auth-brand text-2xl font-black">TicketRush</Link>
                <ThemeToggle className="auth-theme-toggle" />
            </div>
            <nav className="auth-mode" aria-label="Tài khoản">
                <a href="/login" aria-current={!register ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('/login'); }}>Đăng nhập</a>
                <a href="/register" aria-current={register ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate('/register'); }}>Đăng ký</a>
            </nav>
            <div className="auth-heading"><span className="auth-kicker">{register ? 'BẮT ĐẦU CÙNG TICKETRUSH' : 'CHÀO MỪNG TRỞ LẠI'}</span>
                <h1 id="auth-title">{register ? 'Tạo tài khoản của bạn' : 'Đăng nhập'}</h1>
                <p>{register ? 'Lưu vé và quản lý những trải nghiệm của bạn ở một nơi.' : 'Trải nghiệm tiếp theo chỉ cách bạn một lần đăng nhập.'}</p>
            </div>
            <GoogleSignInButton onCredential={googleLogin} disabled={busy} />
            <div className="auth-divider"><span>hoặc sử dụng email</span></div>
            <form onSubmit={submit} className="auth-form" aria-label={register ? 'Đăng ký bằng email' : 'Đăng nhập bằng email'}>
                <div><label htmlFor="auth-email">{vi.email}</label><div className="auth-input-wrap"><Mail size={18} aria-hidden="true" /><input id="auth-email" type="email" autoComplete="username" placeholder="ban@example.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} /></div></div>
                <div><label htmlFor="auth-password">{vi.password}</label><div className="auth-input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'Tạo mật khẩu của bạn' : 'Nhập mật khẩu'} value={password} minLength={register ? 12 : undefined} aria-describedby={register ? 'auth-password-hint' : undefined} onChange={e => setPassword(e.target.value)} required disabled={busy} /><button type="button" className="auth-password-toggle" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
                    {register && <p id="auth-password-hint" className="auth-hint">Sử dụng ít nhất 12 ký tự cho mật khẩu của bạn.</p>}
                </div>
                <ErrorMessage message={error} />
                <Button type="submit" isLoading={busy} className="auth-submit">{register ? 'Tạo tài khoản' : 'Đăng nhập'}<ArrowRight size={18} className="ml-2" aria-hidden="true" /></Button>
            </form>
            <p className="auth-switch">{register ? 'Bạn đã có tài khoản?' : 'Bạn chưa có tài khoản?'} <Link href={register ? '/login' : '/register'}>{register ? 'Đăng nhập' : 'Đăng ký ngay'}</Link></p>
            <p className="auth-footnote"><ShieldCheck size={16} aria-hidden="true" />{register ? 'Sẵn sàng cho những trải nghiệm mới.' : 'Vé và đơn hàng của bạn luôn ở cùng một nơi.'}</p>
        </div>
    </section>;
}
export function EventsPage() {
    const [keyword, setKeyword] = useState(''), [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const [onSale, setOnSale] = useState(false);
    const { value, error } = useLoad(JSON.stringify([query, page, onSale]), () => api.getEvents(query, onSale, page));
    return <><EventsHero keyword={keyword} onKeyword={setKeyword} onSearch={()=>{setQuery(keyword.trim());setPage(0);}}/>
        <div className="catalog-heading"><div><h2>{query?`Kết quả cho “${query}”`:'Khám phá sự kiện'}</h2><p>Chọn một cuộc hẹn đáng mong chờ.</p></div><div className="catalog-switch" aria-label="Lọc mở bán"><button aria-pressed={!onSale} onClick={()=>{setOnSale(false);setPage(0);}}>Tất cả sự kiện</button><button aria-pressed={onSale} onClick={()=>{setOnSale(true);setPage(0);}}>Đang mở bán</button></div></div>
        <ErrorMessage message={error ? vi.failure : ''} />
        {!value && !error && <p role="status">Đang tải sự kiện…</p>}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{value?.content.map(event => <EventCard key={event.id} event={event} onSelect={() => navigate(`/events/${event.id}`)} onJoinQueue={() => navigate(`/events/${event.id}`)} />)}</div>
        {value?.content.length === 0 && <p>{vi.noEvents}</p>}
        {value && <Pagination page={value.page} totalPages={value.totalPages} totalElements={value.totalElements} onPageChange={setPage} />}
    </>;
}
export function EventPage({ id, select = false }: { id: string; select?: boolean }) {
    const { value, error } = useLoad(id, () => api.getEventDetail(id)); const [map, setMap] = useState<SeatReadSeatMap>(); const [section, setSection] = useState<SeatReadSectionOverview>();
    const [tierId, setTierId] = useState(''), [quantity, setQuantity] = useState(1), [failure, setFailure] = useState(''), [busy, setBusy] = useState(false); const [own, setOwn] = useState<Reservation[]>([]);
    const { user } = useAuth(); const tier = value?.tiers.find(t => t.id === (section?.tierId || tierId));
    useEffect(() => { if (!value?.event.venueId) return; const controller = new AbortController(); api.seatmap(id, controller.signal).then(data => { if (!controller.signal.aborted) setMap(data); }).catch(e => { if (!controller.signal.aborted) setFailure(message(e)); }); return () => controller.abort(); }, [id, value?.event.venueId]);
    useEffect(() => { if (!select || !user) return; let alive = true; api.allMyReservations().then(data => { if (alive) setOwn(data.filter(r => r.eventId === id)); }).catch(e => { if (alive) setFailure(message(e)); }); return () => { alive = false; }; }, [id, select, user?.id]);
    function admission() { navigate(`/events/${id}/queue`); }
    function open(s: SeatReadSectionOverview) { if (!select) { admission(); return; } setSection(s); setTierId(s.tierId); setQuantity(1); setFailure(''); }
    async function reserve() { if (!tier) return; setBusy(true); setFailure(''); try { navigate(`/checkout/${(await api.createReservation(tier.id, quantity, admissions.get(id))).id}`); } catch (e) { if (['WAITING_ROOM_REQUIRED', 'ADMISSION_REQUIRED'].includes((e as ApiError).data?.code)) admission(); else setFailure(message(e)); } finally { setBusy(false); } }
    return <><ErrorMessage message={error ? vi.failure : failure} />{value && <><EventHeader event={value.event} /><p className="my-6 text-slate-400">{value.event.description}</p>
        {!select && <div className="my-6"><Link href={`/events/${id}/queue`}>{vi.book} →</Link></div>}
        {own.filter(r => r.status === 'HELD' && remainingSeconds(r.expires_at) > 0).map(r => <p key={r.id} className="my-4"><Link href={`/checkout/${r.id}`}>{vi.continueHold}</Link></p>)}
        <div className="grid md:grid-cols-3 gap-4 my-6">{value.tiers.filter(item => (!value.event.venueId || !!map) && (!map || map.sections.filter(s => s.tierId === item.id).length !== 1)).map(item => <TicketCard key={item.id} tier={item} selected={tier?.id === item.id} onSelect={() => { if (!select) { admission(); return; } const mapped = map?.sections.find(s => s.tierId === item.id); if (mapped) open(mapped); else { setSection(undefined); setTierId(item.id); setQuantity(1); } }} />)}</div>
        {map && <StadiumMap map={map} open={section?.id} onOpen={open} />}
        {select && section?.type === 'SEATED' && tier ? <SeatGrid key={section.id} eventId={id} section={section} tier={tier} token={admissions.get(id)} own={own} onAdmission={admission} onHeld={hold => navigate(`/checkout/${hold.id}`)} /> :
            select && <Card className="mt-6"><label>{vi.quantity}<input className={fieldClass} type="number" min={1} max={tier?.maxPerOrder || 1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
                {tier && <p className="my-4 font-bold">{vi.total}: {money(quantity * tier.price, tier.currency)}</p>}<Button onClick={reserve} disabled={!tier || quantity < 1 || !Number.isInteger(quantity) || quantity > tier.maxPerOrder} isLoading={busy}>{vi.hold}</Button></Card>}
    </>}</>;
}
export function QueuePage({ id }: { id: string }) {
    const [status, setStatus] = useState<WaitingRoomStatus>(), [error, setError] = useState('');
    useEffect(() => {
        let joined = false; return startPolling(async signal => {
            try {
                const result = joined ? await api.getWaitingRoomStatus(id, signal) : await api.joinWaitingRoom(id, signal); if (signal.aborted) return; setStatus(result); setError('');
                if (result.soldOut) return { stop: true }; if (joined && result.state === 'ADMITTED') { if (result.token) admissions.set(id, result.token); navigate(`/events/${id}/select`, true); return { stop: true }; } joined = true;
                return { retryAfterMs: Math.max((result as WaitingRoomStatus & { retryAfterMs?: number }).retryAfterMs || 0, (result.pollIntervalSeconds || 1) * 1000) };
            } catch (e) { if (!signal.aborted && (e as ApiError).data?.code === 'WAITING_ROOM_DISABLED') { navigate(`/events/${id}/select`, true); return { stop: true }; } if (!signal.aborted) setError(message(e)); throw e; }
        }, undefined, 1000);
    }, [id]);
    return <section className="max-w-lg mx-auto rounded-3xl bg-slate-900 border border-slate-800 p-8 shadow-2xl text-center"><div className="w-20 h-20 mx-auto rounded-3xl bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center mb-6"><Users className="w-10 h-10 text-rose-400" /></div><h1 className="text-3xl font-black">{vi.queue}</h1><p className="mt-4 text-slate-400">{vi.queueIntro}</p><ErrorMessage message={error} /><div className="rounded-2xl bg-slate-950 border border-slate-800 p-6 my-6"><p>{status?.soldOut ? vi.soldOut : vi.position}</p>{!status?.soldOut && <p className="text-5xl font-black text-indigo-400 mt-3">{status?.position ?? '…'}</p>}</div><Link href={`/events/${id}`}>{vi.back}</Link></section>;
}
export function CheckoutPage({ id }: { id: string }) {
    const { value: hold, error } = useLoad(id, () => api.getReservation(id)); const { user } = useAuth(); const [now, setNow] = useState(Date.now()), [failure, setFailure] = useState(''), [busy, setBusy] = useState(false);
    const { value: myOrders } = useLoad(`orders-checkout-${id}`, () => api.allMyOrders());
    useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []); const remaining = hold ? remainingSeconds(hold.expires_at, now) : 0;
    const { value: detail } = useLoad(hold?.eventId || '', async () => hold ? api.getEventDetail(hold.eventId) : undefined);
    const existingPaidOrder = myOrders?.find(o => o.reservationId === id && ['PAID', 'CONFIRMED', 'PENDING_PAYMENT'].includes(o.status));
    const isAlreadyPaid = hold?.status === 'CONFIRMED' || !!existingPaidOrder;
    const isExpired = !remaining || hold?.status === 'EXPIRED';
    async function pay() { setBusy(true); setFailure(''); try { const storageKey = `order-key:${user?.id}:${id}`; let key = sessionStorage.getItem(storageKey); if (!key) { key = crypto.randomUUID(); sessionStorage.setItem(storageKey, key); } navigate(`/orders/${(await api.createOrder(id, key)).id}`); } catch (e) { setFailure(message(e)); } finally { setBusy(false); } }
    return <Modal isOpen title={vi.checkout} maxWidth="xl" onClose={() => navigate(hold ? `/events/${hold.eventId}/select` : '/events')}><div className="space-y-5"><ErrorMessage message={error ? vi.failure : failure} />
        {isAlreadyPaid ? <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 space-y-2"><p className="font-bold">Lượt giữ vé này đã được tạo đơn hoặc thanh toán thành công.</p>{existingPaidOrder && <p><Link href={`/orders/${existingPaidOrder.id}`}>{vi.order}: {existingPaidOrder.id} →</Link></p>}</div> :
            isExpired ? <div className="p-5 rounded-2xl border bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 space-y-2"><p className="flex items-center gap-2 font-bold"><Clock className="w-5 h-5 text-rose-500" />{vi.expired}</p><p role="timer" className="my-2 text-xl font-mono font-bold text-rose-600 dark:text-rose-400">{vi.ttl}: 0:00</p><p className="text-sm text-slate-600 dark:text-slate-400">Thời gian giữ vé 10 phút đã kết thúc. Vé đã được tự động hoàn trả lại hệ thống để người khác có thể chọn.</p>{hold?.eventId && <div className="pt-2"><Link href={`/events/${hold.eventId}/queue`} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-500">{vi.book} lại vé mới →</Link></div>}</div> :
                <div className="p-5 rounded-2xl border bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300"><p className="flex gap-2"><Clock />{vi.exclusive}</p><p role="timer" className="my-3 text-xl font-mono">{vi.ttl}: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p></div>}
        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 text-slate-900 dark:text-slate-100"><h2 className="font-bold">{detail?.event.title}</h2><p>{hold?.tierName}</p><p>{vi.quantity}: {hold?.quantity} · {isExpired ? vi.EXPIRED : stateLabel(hold?.status)}</p>{sortedSeats(hold?.seats || []).map(seat => <p key={seat.id}>{seat.sectionName} · {vi.seatLabel(seat.rowLabel, seat.number)}</p>)}{hold?.unitPrice !== undefined && <p className="text-2xl font-black my-3">{money(hold.quantity * hold.unitPrice, hold.currency || 'VND')}</p>}</div>
        <p className="text-sm text-slate-400">{vi.gateway}</p><Button onClick={pay} isLoading={busy} disabled={!hold || isExpired || hold.status !== 'HELD' || isAlreadyPaid} className="checkout-primary w-full min-h-11">{vi.pay}</Button>{hold && isExpired && !isAlreadyPaid && <Link href={`/events/${hold.eventId}/queue`}>{vi.book}</Link>}</div></Modal>;
}
export function OrderPage({ id }: { id: string }) {
    const [order, setOrder] = useState<Order>(), [tickets, setTickets] = useState<Ticket[]>([]), [error, setError] = useState('');
    useEffect(() => { let attempt = 0; return startPolling(async signal => { try { const data = await api.getOrder(id, signal); if (signal.aborted) return; setOrder(data); setError(''); if (data.status === 'PAID') { const issued = await api.getOrderTickets(id); if (!signal.aborted) setTickets(issued); return { stop: true }; } if (data.status !== 'PENDING_PAYMENT') return { stop: true }; return { retryAfterMs: Math.max((data as Order & { retryAfterMs?: number }).retryAfterMs || 0, Math.min(10000, 1000 * 2 ** attempt++)) }; } catch (e) { if (!signal.aborted) setError(message(e)); throw e; } }, undefined, 1000); }, [id]);
    return <><h1 className="text-3xl font-black">{vi.order}</h1><p role="status" className="my-6 text-emerald-400">{stateLabel(order?.status)}</p><ErrorMessage message={error} />{order && <p className="mb-5 text-xl">{money(order.totalAmount, order.currency)}</p>}<div className="grid md:grid-cols-3 gap-5">{tickets.map(ticket => <TicketPass key={ticket.id} ticket={ticket} />)}</div><p className="mt-6"><Link href="/account/tickets">{vi.wallet}</Link></p></>;
}
export function AccountPage({ kind }: { kind: string }) {
    const { user } = useAuth(); return kind === 'profile' ? user && <ProfilePage user={user}/> : <TicketWallet initialTab={kind === 'orders' ? 'orders' : 'tickets'} />;
}
