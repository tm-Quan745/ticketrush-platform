import React, { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { SeatReadSeatMap, SeatReadSectionOverview, SeatReadSectionGeometry } from '../../api/generated';
import type { Reservation, TicketTier } from '../../types';
import { vi } from '../../i18n/vi';
import { Button, ErrorMessage, fieldClass, money } from '../../pages/shared';
import { recoverSelection, remainingSeconds, seatState, toggleSelection, validStatus, sortedSeats, aisleBefore, suggestAdjacentSeats } from './model';
import { startPolling } from './polling';

const symbols = { available: '○', selected: '✓', unavailable: '×', mine: '◆', blocked: '▧' };
export function StadiumMap({ map, open, onOpen }: { map: SeatReadSeatMap; open?: string; onOpen: (section: SeatReadSectionOverview) => void }) {
  return <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-3 sm:p-6 shadow-sm dark:shadow-2xl space-y-5 min-w-0">
    <h2 className="text-xl font-black text-slate-900 dark:text-white">{vi.chooseSection}</h2>
    <div className="stadium-frame"><svg viewBox={map.venue.viewBox.join(' ')} role="group" aria-label={vi.stadium} className="w-full h-full">
      {map.venue.stage?.length===4&&<g>
        <rect x={map.venue.stage[0]} y={map.venue.stage[1]} width={map.venue.stage[2]-map.venue.stage[0]} height={map.venue.stage[3]-map.venue.stage[1]} rx="8" fill="#1e1b4b" stroke="#818cf8" strokeWidth="2"/>
        <text x={(map.venue.stage[0]+map.venue.stage[2])/2} y={(map.venue.stage[1]+map.venue.stage[3])/2} dominantBaseline="middle" fill="white" textAnchor="middle" fontSize="14">{vi.stage}</text>
      </g>}
      {map.sections.map(section => <g key={section.id} role="button" tabIndex={0} aria-label={`${vi.choose} ${section.name} · ${vi[section.availability]}`} aria-pressed={open === section.id}
        onClick={() => onOpen(section)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(section); } }} className="stadium-section cursor-pointer outline-offset-4 focus:outline-indigo-400">
        <polygon points={section.geometry.polygon.map(p => `${p.x},${p.y}`).join(' ')} fill={section.geometry.color} fillOpacity={open === section.id ? 0.85 : 0.35} stroke={open === section.id ? 'white' : section.geometry.color} strokeWidth={open === section.id ? 4 : 2} />
        <title>{`${section.name} · ${money(section.price, section.currency)} · ${vi[section.availability]}`}</title>
        <text x={section.geometry.polygon.reduce((sum, p) => sum + p.x, 0) / section.geometry.polygon.length} y={section.geometry.polygon.reduce((sum, p) => sum + p.y, 0) / section.geometry.polygon.length} textAnchor="middle" dominantBaseline="middle" fill="white" stroke="#020617" strokeWidth="3" paintOrder="stroke" fontSize="14" fontWeight="bold" pointerEvents="none">{section.name}</text>
      </g>)}
    </svg></div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">{map.sections.map(section => <button key={section.id} aria-label={`${vi.choose} ${section.name}`} onClick={() => onOpen(section)} aria-pressed={open === section.id} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-400 bg-slate-50 dark:bg-transparent text-left min-w-0">
      <span aria-hidden="true" style={{ color: section.geometry.color }}>◆ </span><span className="font-semibold text-slate-900 dark:text-white">{section.name}</span><span className="block text-sm font-mono text-slate-800 dark:text-slate-200">{money(section.price, section.currency)}</span><span className="block text-sm text-slate-500 dark:text-slate-400">{vi[section.availability]}</span></button>)}</div>
  </section>;
}
export function SeatGrid({ eventId, section, tier, token, own, onHeld, onAdmission }: { eventId: string; section: SeatReadSectionOverview; tier: TicketTier; token?: string; own: Reservation[]; onHeld: (hold: Reservation) => void; onAdmission: () => void }) {
  const [geometry, setGeometry] = useState<SeatReadSectionGeometry>(); const [states, setStates] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [quantity, setQuantity] = useState(2); const [accessible, setAccessible] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  const last = useRef<{ etag?: string; geometry?: SeatReadSectionGeometry; version?: string }>({}); const buttons = useRef(new Map<string, HTMLButtonElement>());
  const limit = tier.maxPerOrder || 6;
  const [now, setNow] = useState(Date.now()); useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const mine = own.filter(r => r.status === 'HELD' && remainingSeconds(r.expires_at, now) > 0).flatMap(r => r.seatIds || []);
  useEffect(() => startPolling(async signal => {
    try {
      const data = await api.seatStatus(eventId, section.id, last.current.etag, signal);
      if (signal.aborted) return;
      if ('notModified' in data) return { retryAfterMs: data.retryAfterMs };
      let shape = last.current.geometry;
      if (!shape || last.current.version !== data.geometryVersion) shape = await api.geometry(eventId, section.id, data.geometryVersion, signal) as SeatReadSectionGeometry;
      if (signal.aborted) return;
      if (!shape || !validStatus(shape, data)) throw new Error(vi.invalidSeats);
      last.current = { etag: data.etag, geometry: shape, version: data.geometryVersion }; setGeometry(shape); setStates(data.states);
      return { retryAfterMs: data.retryAfterMs };
    } catch (e) { if (!signal.aborted) setError(e instanceof ApiError && [429, 503].includes(e.status) ? e.message : vi.failure); throw e; }
  }), [eventId, section.id, revision]);
  function failed(e: unknown) { const failure = e as ApiError; if (['WAITING_ROOM_REQUIRED', 'ADMISSION_REQUIRED'].includes(failure.data?.code)) onAdmission(); else setError(failure.status === 429 || failure.status === 503 ? failure.message : failure.data?.code === 'NO_ADJACENT_SEATS' ? vi.noAdjacent : vi.failure); }
  async function suggest() {
    setBusy(true); setError('');
    try {
      let ids: string[] = [];
      try {
        const result = await api.suggest(eventId, section.id, quantity, accessible, token);
        ids = result.seatIds || [];
      } catch (err) {
        if (geometry && states) {
          ids = suggestAdjacentSeats(geometry, states, quantity, accessible);
        } else {
          throw err;
        }
      }
      if (geometry && states && ids.length) {
        const hasAccessibleMismatch = (!accessible && ids.some(id => geometry.seats.find(s => s.id === id)?.accessible))
          || (accessible && !ids.some(id => geometry.seats.find(s => s.id === id)?.accessible));
        if (hasAccessibleMismatch) {
          ids = suggestAdjacentSeats(geometry, states, quantity, accessible);
        }
      }
      if (!ids.length) {
        setError(vi.noAdjacent);
        return;
      }
      setSelected(ids);
      setNotice(vi.advisory);
    } catch (e) {
      failed(e);
    } finally {
      setBusy(false);
    }
  }
  async function hold() {
    setBusy(true); setError(''); try { onHeld(await api.holdSeats(selected, token)); } catch (e) {
      const failure = e as ApiError;
      if (failure.status === 409 && failure.data?.code === 'SEATS_UNAVAILABLE') {
        const taken: string[] = failure.data.unavailableSeatIds || []; setSelected(current => recoverSelection(current, taken));
        setError(vi.taken(taken.map(id => { const seat = geometry?.seats.find(s => s.id === id); return seat ? vi.seatLabel(seat.rowLabel, seat.number) : id; })));
        last.current.etag = undefined; setRevision(value => value + 1); setNotice(vi.refreshed);
      } else failed(e);
    } finally { setBusy(false); }
  }
  function keyMove(event: React.KeyboardEvent, index: number) {
    if (!geometry) return; const seats = geometry.seats, seat = seats[index]; let target = index;
    if (event.key === 'ArrowLeft') target = index - 1; else if (event.key === 'ArrowRight') target = index + 1;
    else if (event.key === 'Home') target = seats.findIndex(s => s.rowLabel === seat.rowLabel); else if (event.key === 'End') target = seats.map(s => s.rowLabel).lastIndexOf(seat.rowLabel);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { const rows = [...new Set(seats.map(s => s.rowLabel))]; const row = rows[rows.indexOf(seat.rowLabel) + (event.key === 'ArrowDown' ? 1 : -1)]; target = seats.findIndex(s => s.rowLabel === row && s.number === seat.number); } else return;
    event.preventDefault(); buttons.current.get(seats[target]?.id)?.focus();
  }
  return <section aria-label={section.name} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-indigo-500/40 rounded-3xl p-3 sm:p-6 mt-6 space-y-5 min-w-0 shadow-sm dark:shadow-none">
    <h2 className="text-2xl font-black text-slate-900 dark:text-white">{section.name}</h2><p className="text-slate-600 dark:text-slate-300 font-medium">{vi.max(limit)} · {money(tier.price, tier.currency)}</p>
    <ul aria-label={vi.legend} className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">{Object.entries(symbols).map(([key, symbol]) => <li key={key}>{symbol} {vi[key as keyof typeof symbols]}</li>)}<li>♿ {vi.accessible}</li></ul>
    <div className="flex flex-wrap items-end gap-4"><label>{vi.quantity}<input className={fieldClass} type="number" min={1} max={limit} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label>
      <label><input type="checkbox" checked={accessible} onChange={e => setAccessible(e.target.checked)} /> {vi.accessibleRequest}</label>
      <Button onClick={suggest} disabled={busy || !Number.isInteger(quantity) || quantity < 1 || quantity > limit}>{vi.autoPick}</Button></div>
    <p className="text-sm text-slate-500 dark:text-slate-400">{vi.advisory} {vi.aisleRule}</p><ErrorMessage message={error} /><p aria-live="polite" data-testid="seat-notice" className="text-slate-700 dark:text-slate-300">{notice}</p>
    {!geometry ? <p className="text-slate-700 dark:text-slate-300">{vi.loading}</p> : <div role="group" aria-label={vi.chooseSection} className="seat-scroll bg-slate-100/80 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 p-3 rounded-2xl" tabIndex={0}>
      {[...new Set(geometry.seats.map(s => s.rowLabel))].map(row => <div key={row} className="flex gap-1 my-2 items-center w-max"><span className="seat-row-label font-mono font-bold text-center">{row}</span>
        {geometry.seats.map((seat, index) => ({ seat, index })).filter(({ seat }) => seat.rowLabel === row).map(({ seat, index }) => {
          const state = seatState(seat.id, states[index], selected, mine); const unavailable = ['mine', 'blocked', 'unavailable'].includes(state);
          return <button key={seat.id} ref={element => { if (element) buttons.current.set(seat.id, element); else buttons.current.delete(seat.id); }} data-seat-id={seat.id} data-state={state}
            data-aisle={aisleBefore(geometry.seats, index) || undefined} aria-label={`${vi.seatLabel(row, seat.number)}, ${vi[state]}${seat.accessible ? `, ${vi.accessible}` : ''}`} aria-pressed={selected.includes(seat.id)} aria-disabled={unavailable || busy}
            onKeyDown={e => keyMove(e, index)} onClick={() => { if (!busy) setSelected(value => toggleSelection(value, seat.id, limit, !unavailable)); }}
            className={`seat-cell rounded-t-xl rounded-b-md border-2 text-xs font-bold focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500 dark:focus:outline-white transition-colors ${state === 'selected' ? 'bg-indigo-600 border-indigo-400 text-white shadow-sm' : state === 'mine' ? 'bg-emerald-100 text-emerald-900 border-emerald-500 dark:bg-emerald-900 dark:border-emerald-400 dark:text-emerald-100' : unavailable ? 'bg-slate-200 border-slate-300 text-slate-400 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-500' : 'bg-emerald-50 text-emerald-900 border-emerald-500 hover:border-indigo-500 dark:bg-emerald-950 dark:border-emerald-500 dark:text-emerald-200 dark:hover:border-indigo-400'}`}>
            {seat.number} {symbols[state]}{seat.accessible ? ' ♿' : ''}</button>;
        })}</div>)}
    </div>}
    <p className="text-sm text-slate-500 dark:text-slate-400">{vi.gridScroll}</p>
    <div className="selection-summary">
      <h3 className="font-bold text-lg text-slate-900 dark:text-white">{vi.selection} ({selected.length}/{limit})</h3>
      <p className="text-slate-700 dark:text-slate-300 font-medium">{selected.length ? sortedSeats(geometry?.seats.filter(s => selected.includes(s.id)) || []).map(s => vi.seatLabel(s.rowLabel, s.number)).join(' · ') : vi.emptySelection}</p>
      <p className="summary-price text-2xl font-black my-3 text-indigo-600 dark:text-indigo-400">{vi.total}: {money(selected.length * tier.price, tier.currency)}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{vi.serverPrice}</p>
      <Button className="w-full sm:w-auto min-h-11" onClick={hold} isLoading={busy} disabled={!selected.length || selected.length > limit}>{vi.hold}</Button>
    </div>
  </section>;
}
