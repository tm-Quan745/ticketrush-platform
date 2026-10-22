import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, ApiError, pollDelay } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { navigate } from '../access/navigation';
import { landing } from '../access/permissions';
import type { Order, Reservation, Ticket, WaitingRoomStatus } from '../types';
import { Button, Card, ErrorMessage, fieldClass, Link, money, useLoad } from './shared';

const admissions = new Map<string, string>();
window.addEventListener('auth:expired', () => admissions.clear());

export function AuthPage({ register = false }: { register?: boolean }) {
  const { login } = useAuth();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (register) await api.register(email, password);
      const user = await login(email, password);
      navigate(landing(user.role, new URLSearchParams(location.search).get('next')), true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Card className="max-w-md mx-auto"><h1 className="text-3xl font-bold">{register ? 'Đăng ký' : 'Đăng nhập'}</h1>
    <form onSubmit={submit} className="space-y-4 mt-6">
      <label className="block">Email<input className={fieldClass} type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label className="block">Mật khẩu<input className={fieldClass} type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength={register ? 12 : undefined} value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <ErrorMessage message={error} /><Button type="submit" isLoading={busy}>{register ? 'Đăng ký' : 'Đăng nhập'}</Button>
    </form><p className="mt-4"><Link href={register ? '/login' : '/register'}>{register ? 'Đã có tài khoản' : 'Tạo tài khoản'}</Link></p>
  </Card>;
}
export function EventsPage() {
  const { value, error } = useLoad('events', () => api.getEvents());
  return <><h1 className="text-3xl font-bold mb-6">Khám phá sự kiện</h1><ErrorMessage message={error} />
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">{value?.content.map(event => <Card key={event.id} hoverEffect>
      <p className="text-indigo-400">{event.venueName}</p><h2 className="text-xl font-bold my-3">{event.title}</h2>
      <p className="text-slate-400 mb-4">{new Date(event.startTime).toLocaleString('vi-VN')}</p><Link href={`/events/${event.id}`}>Xem sự kiện</Link>
    </Card>)}</div></>;
}
export function EventPage({ id, select = false }: { id: string; select?: boolean }) {
  const { value, error } = useLoad(id, () => api.getEventDetail(id));
  const [tierId, setTierId] = useState(''); const [quantity, setQuantity] = useState(1);
  const [failure, setFailure] = useState(''); const [busy, setBusy] = useState(false);
  const tier = value?.tiers.find(item => item.id === tierId);
  async function reserve() {
    if (!tier) return; setBusy(true); setFailure('');
    try {
      const hold = await api.createReservation(tier.id, quantity, admissions.get(id));
      navigate(`/checkout/${hold.id}`);
    } catch (e) {
      const error = e as ApiError;
      if (error.data?.code === 'WAITING_ROOM_REQUIRED' || error.data?.code === 'ADMISSION_REQUIRED') navigate(`/events/${id}/queue`);
      else setFailure(error.message);
    } finally { setBusy(false); }
  }
  return <><h1 className="text-3xl font-bold mb-4">{value?.event.title || 'Sự kiện'}</h1><ErrorMessage message={error || failure} />
    {value && <><p className="text-slate-400 mb-6">{value.event.venueName} · {value.event.description}</p>
      <div className="grid md:grid-cols-3 gap-4">{value.tiers.map(item => <Card key={item.id}>
        <h2 className="text-xl font-bold">{item.name}</h2><p className="my-3">{money(item.price, item.currency)}</p>
        <p className="text-slate-400 mb-4">{item.availability} · Tối đa {item.maxPerOrder} vé</p>
        {select ? <Button variant={tierId === item.id ? 'success' : 'primary'} disabled={item.availability === 'SOLD_OUT'} onClick={() => { setTierId(item.id); setQuantity(1); }}>Chọn {item.name}</Button>
          : <Link href={`/events/${id}/queue`}>Đặt vé</Link>}
      </Card>)}</div>
      {select && <Card className="mt-6"><label>Số lượng<input className={fieldClass} type="number" min={1} max={tier?.maxPerOrder || 1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
        <Button onClick={reserve} disabled={!tier || quantity < 1 || !Number.isInteger(quantity) || quantity > tier.maxPerOrder} isLoading={busy}>Giữ vé</Button>
      </Card>}
    </>}
  </>;
}
export function QueuePage({ id }: { id: string }) {
  const [status, setStatus] = useState<WaitingRoomStatus>(); const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    let joined = false;
    async function poll() {
      try {
        const result = joined ? await api.getWaitingRoomStatus(id) : await api.joinWaitingRoom(id);
        if (stopped) return;
        setStatus(result); setError('');
        if (result.soldOut) return;
        // Always read status after joining; it is the current admission authority.
        if (joined && result.state === 'ADMITTED') {
          if (result.token) admissions.set(id, result.token);
          navigate(`/events/${id}/select`, true); return;
        }
        joined = true;
        timer = setTimeout(poll, pollDelay(result as WaitingRoomStatus & { retryAfterMs?: number }, (result.pollIntervalSeconds || 1) * 1000));
      } catch (e) {
        if (stopped) return;
        const failure = e as ApiError; setError(failure.message);
        if (failure.status === 429 || failure.status === 503) timer = setTimeout(poll, pollDelay(failure, 1000));
      }
    }
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [id]);
  return <Card><h1 className="text-3xl font-bold">Phòng chờ</h1><ErrorMessage message={error} />
    <p className="my-5">{status?.soldOut ? 'Sự kiện đã hết vé.' : `Đang chờ · Vị trí ${status?.position ?? '…'}`}</p><Link href={`/events/${id}`}>Về sự kiện</Link></Card>;
}
export function CheckoutPage({ id }: { id: string }) {
  const { value: hold, error } = useLoad(id, () => api.getReservation(id));
  const { user } = useAuth();
  const [now, setNow] = useState(Date.now()); const [failure, setFailure] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const remaining = hold ? Math.max(0, Math.ceil((Date.parse(hold.expires_at) - now) / 1000)) : 0;
  async function pay() {
    setBusy(true); setFailure('');
    try {
      const storageKey = `order-key:${user?.id}:${id}`;
      let key = sessionStorage.getItem(storageKey); if (!key) { key = crypto.randomUUID(); sessionStorage.setItem(storageKey, key); }
      const order = await api.createOrder(id, key); navigate(`/orders/${order.id}`);
    } catch (e) { setFailure((e as Error).message); } finally { setBusy(false); }
  }
  return <Card><h1 className="text-3xl font-bold">Thanh toán</h1><ErrorMessage message={error || failure} />
    <p role="timer" className="my-6 text-xl">Thời gian giữ vé: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</p>
    <p className="mb-4">Số lượng: {hold?.quantity} · {hold?.status}</p>
    <p className="mb-4 text-slate-400">Thanh toán thử nghiệm qua mock gateway; không thu tiền thật. Trạng thái thanh toán được cập nhật từ backend.</p>
    <Button onClick={pay} isLoading={busy} disabled={!hold || remaining === 0 || hold.status !== 'HELD'}>Tạo đơn và thanh toán</Button>
  </Card>;
}
function TicketQR({ ticket }: { ticket: Ticket }) {
  const [image, setImage] = useState('');
  useEffect(() => {
    let active = true; QRCode.toDataURL(ticket.ticketCode, { width: 220 }).then(data => { if (active) setImage(data); });
    return () => { active = false; };
  }, [ticket.ticketCode]);
  return <Card><h2 className="font-bold">{ticket.tierName}</h2><p>{ticket.status}</p>{image && <img src={image} alt={`QR vé ${ticket.ticketCode}`} />}<p className="break-all text-xs">{ticket.ticketCode}</p></Card>;
}
export function OrderPage({ id }: { id: string }) {
  const [order, setOrder] = useState<Order>(); const [tickets, setTickets] = useState<Ticket[]>([]); const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false; let timer: ReturnType<typeof setTimeout>; let attempt = 0;
    async function poll() {
      try {
        const data = await api.getOrder(id); if (stopped) return; setOrder(data); setError('');
        if (data.status === 'PAID') { const issued = await api.getOrderTickets(id); if (!stopped) setTickets(issued); return; }
        if (data.status !== 'PENDING_PAYMENT') return;
        timer = setTimeout(poll, pollDelay(data as Order & { retryAfterMs?: number }, Math.min(10000, 1000 * 2 ** attempt++)));
      } catch (e) {
        if (stopped) return; const failure = e as ApiError; setError(failure.message);
        if ([429, 503].includes(failure.status)) timer = setTimeout(poll, pollDelay(failure, Math.min(10000, 1000 * 2 ** attempt++)));
      }
    }
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, [id]);
  return <><h1 className="text-3xl font-bold">Đơn hàng</h1><p role="status" className="my-6 text-emerald-400">{order?.status || 'Đang tải'}</p>
    <ErrorMessage message={error} />{order && <p className="mb-5">{money(order.totalAmount, order.currency)}</p>}
    <div className="grid md:grid-cols-3 gap-4">{tickets.map(ticket => <TicketQR key={ticket.id} ticket={ticket} />)}</div></>;
}
export function AccountPage({ kind }: { kind: string }) {
  const { user } = useAuth();
  const { value, error } = useLoad(kind, async () => kind === 'profile' ? [] : (await api.getMyOrders()).content);
  return <><h1 className="text-3xl font-bold">{kind === 'profile' ? 'Hồ sơ' : kind === 'tickets' ? 'Vé của tôi' : 'Đơn hàng của tôi'}</h1>
    <ErrorMessage message={error} />{kind === 'profile' ? <Card className="mt-5">{user?.email}</Card> : <div className="grid gap-4 mt-6">
      {value?.filter(order => kind !== 'tickets' || order.status === 'PAID').map(order => <Card key={order.id}><Link href={`/orders/${order.id}`}>{order.id}</Link><p>{order.status} · {money(order.totalAmount, order.currency)}</p></Card>)}
    </div>}</>;
}
