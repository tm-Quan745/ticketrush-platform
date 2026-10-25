import React from 'react';
import type {Ticket} from '../../../types';
import {vi,stateLabel} from '../../../i18n/vi';
export function gateReason(ticket?:Ticket,code?:string){
 if(code==='TICKET_NOT_FOUND')return vi.invalidTicket;
 if(ticket?.status==='USED')return vi.alreadyUsed;
 if(ticket?.status==='CANCELLED')return vi.cancelledTicket;
 return code?vi.scanRejected:vi.readyTicket;
}
export function GateResult({ticket,accepted,errorCode}:{ticket?:Ticket;accepted:boolean;errorCode?:string}) {
 const allowed=!errorCode&&ticket?.status==='VALID';
 return <div role="status" className={`rounded-3xl border-2 p-6 sm:p-10 ${accepted||allowed?'border-emerald-400 bg-emerald-950/40':'border-rose-400 bg-rose-950/40'}`}>
  <div aria-hidden="true" className="text-5xl font-black mb-4">{accepted||allowed?'✓':'×'}</div>
  <h2 className="text-2xl sm:text-3xl font-black">{accepted?vi.checkInSuccess:gateReason(ticket,errorCode)}</h2>
  {ticket&&<div className="space-y-3 mt-5"><h3 className="text-xl font-bold">{ticket.eventTitle}</h3><p>{ticket.venue} · {ticket.tierName}</p><p>{stateLabel(ticket.status)}</p>{ticket.seat&&<p>{ticket.seat.sectionName} · {vi.seatLabel(ticket.seat.rowLabel,ticket.seat.number)}</p>}{ticket.usedAt&&<p>{vi.usedAt}: {new Date(ticket.usedAt).toLocaleString('vi-VN')}</p>}<p className="break-all text-xs">{ticket.ticketCode}</p></div>}
 </div>;
}
