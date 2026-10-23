import { adminTabs, reconcileMessage, stateLabel } from '../i18n/vi';
import { extraText } from '../i18n/vi';
import { legacyText } from '../i18n/vi';
import React, { useState } from 'react';
import { api } from '../api/client';
import type { Event, Order, TicketTier } from '../types';
import { CreateEventModal } from '../components/admin/CreateEventModal';
import { navigate } from '../access/navigation';
import { Button, Card, ErrorMessage, fieldClass, Link, money, useLoad } from './shared';
import evidenceUrl from '../../../docs/performance/results/finish-sellout-20-2.json?url';
import verifierUrl from '../../../docs/performance/results/finish-sellout-20-2-verify.json?url';

export function GatePage() {
  const [code, setCode] = useState(''); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  async function submit(checkIn: boolean) {
    setError(''); setMessage('');
    try {
      const result = checkIn ? await api.checkInTicket(code) : await api.verifyTicket(code);
      setMessage(stateLabel(result.message));
    } catch (e) { setError((e as Error).message); }
  }
  return <Card><h1 className="text-3xl font-bold">{legacyText.text14}</h1><label className="block mt-6">{legacyText.text15}<input className={fieldClass} value={code} onChange={e => setCode(e.target.value)} /></label>
    <div className="flex gap-3"><Button disabled={!code.trim()} onClick={() => submit(false)}>{legacyText.text16}</Button><Button disabled={!code.trim()} onClick={() => submit(true)}>{legacyText.text17}</Button></div>
    <ErrorMessage message={error} /><p role="status" className="mt-4">{message}</p></Card>;
}
export function AdminHome() {
  return <><h1 className="text-3xl font-bold mb-6">{legacyText.text18}</h1><div className="grid md:grid-cols-3 gap-4">
    <Card><Link href="/admin/events">{legacyText.text19}</Link></Card><Card><Link href="/admin/orders">{legacyText.text20}</Link></Card><Card><Link href="/admin/operations">{legacyText.text21}</Link></Card>
  </div></>;
}
export function OperationsPage() {
  const [revision, setRevision] = useState(0); const [failure, setFailure] = useState('');
  const { value, error } = useLoad('operations' + revision, async () => {
    const [health, outbox, notifications] = await Promise.all([api.getHealth(),
      api.request<Array<{ id: string; status: string }>>('/admin/outbox?status=FAILED'),
      api.request<Array<{ id: string; status: string }>>('/admin/notifications?status=FAILED')]);
    return { health, outbox, notifications };
  });
  async function retry(path: string) {
    try { await api.request(path, { method: 'POST' }); setRevision(n => n + 1); setFailure(''); }
    catch (e) { setFailure((e as Error).message); }
  }
  return <><h1 className="text-3xl font-bold mb-5">{legacyText.text22}</h1><ErrorMessage message={error || failure} />
    <Card>{extraText.s1}{value?.health.status || legacyText.text41}</Card>
    <div className="grid md:grid-cols-2 gap-5 mt-5">{(['outbox', 'notifications'] as const).map(kind => <Card key={kind}>
      <h2 className="text-xl font-bold mb-4">{kind === 'outbox' ? legacyText.text42 : legacyText.text43}</h2>
      {value?.[kind].length === 0 && <p>{legacyText.text23}</p>}
      {value?.[kind].map(item => <div key={item.id} className="my-3"><p>{item.id}</p><Button onClick={() => retry(`/admin/${kind}/${item.id}/${kind === 'outbox' ? 'retry' : 'resend'}`)}>{kind === 'outbox' ? legacyText.text44 : legacyText.text45}</Button></div>)}
    </Card>)}</div>
  </>;
}
export function ResultsPage() {
  return <><h1 className="text-3xl font-bold mb-6">{legacyText.text24}</h1><Card>
    <h2 className="font-bold text-xl mb-3">{legacyText.text25}</h2>
    <p className="text-slate-400 mb-5">{legacyText.text26}</p>
    <div className="flex gap-6"><a className="text-indigo-400" href={evidenceUrl}>{legacyText.text27}</a><a className="text-indigo-400" href={verifierUrl}>{legacyText.text28}</a></div>
  </Card></>;
}
export function AdminEventsPage({ create = false }: { create?: boolean }) {
  const { value, error } = useLoad('admin-events', () => api.getEvents());
  return <><h1 className="text-3xl font-bold mb-5">{legacyText.text29}</h1><Link href="/admin/events/new">{legacyText.text30}</Link><ErrorMessage message={error} />
    <p className="my-4 text-slate-400">{legacyText.text31}</p>
    <div className="grid gap-4">{value?.content.map(event => <Card key={event.id}><Link href={`/admin/events/${event.id}`}>{event.title}</Link></Card>)}</div>
    {create && <CreateEventModal onClose={() => navigate('/admin/events')} onEventCreated={() => navigate('/admin/events')} />}
  </>;
}
export function AdminEventPage({ id }: { id: string }) {
  const [revision, setRevision] = useState(0); const [tab, setTab] = useState('info'); const [failure, setFailure] = useState('');
  const { value, error } = useLoad(id + revision, async () => {
    const [detail, tiers] = await Promise.all([api.getEventDetail(id), api.getAdminInventory(id)]); return { ...detail, tiers };
  });
  async function reconcile() {
    try { const violations = await api.reconcileInventory(id); setFailure(violations.length ? reconcileMessage(violations.length) : legacyText.text46); }
    catch (e) { setFailure((e as Error).message); }
  }
  return <><h1 className="text-3xl font-bold mb-5">{value?.event.title || legacyText.text29}</h1>
    <nav className="flex flex-wrap gap-3 mb-5">{['info', 'tiers', 'waiting room', 'inventory and reconcile', 'orders'].map(name => <Button key={name} variant="secondary" onClick={() => setTab(name)}>{adminTabs[name]}</Button>)}</nav>
    <ErrorMessage message={error} /><p className="my-3">{failure}</p>
    {tab === 'info' && <Card>{value?.event.description}<p>{value?.event.venueName}</p></Card>}
    {(tab === 'tiers' || tab === 'inventory and reconcile') && <div className="grid gap-4">
      {value?.tiers.map(tier => <TierCapacity key={tier.id} tier={tier} done={() => setRevision(n => n + 1)} />)}
      <Button onClick={reconcile}>{legacyText.text32}</Button></div>}
    {tab === 'waiting room' && <QueueSettings id={id} />}
    {tab === 'orders' && <Link href="/admin/orders">{legacyText.text33}</Link>}
  </>;
}
function TierCapacity({ tier, done }: { tier: TicketTier; done: () => void }) {
  const [total, setTotal] = useState(tier.totalQuantity); const [error, setError] = useState('');
  return <Card><h2 className="font-bold">{tier.name}</h2><p>{money(tier.price, tier.currency)}</p><label>{legacyText.text34}<input type="number" min={0} className={fieldClass} value={total} onChange={e => setTotal(Number(e.target.value))} /></label>
    <Button onClick={async () => { try { await api.updateTierCapacity(tier.id, total, tier); done(); } catch (e) { setError((e as Error).message); } }}>{legacyText.text35}</Button><ErrorMessage message={error} /></Card>;
}
function QueueSettings({ id }: { id: string }) {
  const [rate, setRate] = useState(10); const [message, setMessage] = useState('');
  return <Card><label>{legacyText.text36}<input className={fieldClass} type="number" min={1} max={1000} value={rate} onChange={e => setRate(Number(e.target.value))} /></label>
    <Button onClick={async () => { try { await api.configureWaitingRoom(id, true, rate, 'fifo'); setMessage(legacyText.text47); } catch (e) { setMessage((e as Error).message); } }}>{legacyText.text37}</Button><p>{message}</p></Card>;
}
export function AdminOrdersPage() {
  const [revision, setRevision] = useState(0); const [failure, setFailure] = useState('');
  const { value, error } = useLoad('admin-orders' + revision, () => api.request<{ content: Order[] }>('/admin/orders'));
  return <><h1 className="text-3xl font-bold mb-5">{legacyText.text39}</h1><ErrorMessage message={error || failure} /><div className="grid gap-4">
    {value?.content.map(order => <Card key={order.id}><p>{order.id}</p><p>{stateLabel(order.status)} · {money(order.totalAmount, order.currency)}</p>
      <Button disabled={order.status !== 'PAID'} onClick={async () => {
        if (!window.confirm(legacyText.text48)) return;
        try { await api.request(`/admin/orders/${order.id}/refund`, { method: 'POST' }); setRevision(n => n + 1); }
        catch (e) { setFailure((e as Error).message); }
      }}>{legacyText.text40}</Button></Card>)}</div></>;
}

