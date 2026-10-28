import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Ticket as TicketIcon, MapPin, Clock } from 'lucide-react';
import type { Ticket } from '../../../types';
import { vi, stateLabel } from '../../../i18n/vi';

export function TicketPass({ ticket }: { ticket: Ticket }) {
    const [image, setImage] = useState('');
    const [error, setError] = useState(false);

    useEffect(() => {
        let alive = true;
        setImage('');
        QRCode.toDataURL(ticket.ticketCode, { width: 220, margin: 2 })
            .then(data => {
                if (alive) setImage(data);
            })
            .catch(() => {
                if (alive) setError(true);
            });
        return () => {
            alive = false;
        };
    }, [ticket.ticketCode]);

    return (
        <article
            className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-indigo-500/40 overflow-hidden shadow-xl"
            data-testid="wallet-ticket"
        >
            <div className="p-6 bg-indigo-50/70 dark:bg-gradient-to-br dark:from-indigo-950 dark:to-slate-900 border-b-2 border-dashed border-slate-300 dark:border-slate-600">
                <TicketIcon className="text-indigo-600 dark:text-indigo-300 mb-3" />
                <h2 className="text-xl font-black text-slate-900 dark:text-white">{ticket.eventTitle}</h2>
                <p className="mt-2 font-bold text-slate-800 dark:text-slate-200">{ticket.tierName}</p>
                <p className="mt-3 font-bold text-emerald-600 dark:text-emerald-400">
                    {ticket.status === 'VALID' ? '✓' : ticket.status === 'USED' ? '●' : '×'} {stateLabel(ticket.status)}
                </p>
                {ticket.venue && (
                    <p className="text-sm mt-3 flex items-center gap-2 text-slate-600 dark:text-slate-300">
                        <MapPin size={16} className="shrink-0" />
                        {ticket.venue}
                    </p>
                )}
                {ticket.seat && (
                    <p className="mt-3 font-semibold text-slate-700 dark:text-slate-200" data-testid="ticket-seat">
                        {ticket.seat.sectionName} · {vi.seatLabel(ticket.seat.rowLabel, ticket.seat.number)}
                    </p>
                )}
                {ticket.issuedAt && (
                    <p className="text-xs mt-3 flex items-center gap-2 text-slate-500 dark:text-slate-400">
                        <Clock size={14} className="shrink-0" />
                        {vi.issued}: {new Date(ticket.issuedAt).toLocaleString('vi-VN')}
                    </p>
                )}
                {ticket.usedAt && (
                    <p className="text-xs mt-2 text-slate-500 dark:text-slate-400">
                        {vi.usedAt}: {new Date(ticket.usedAt).toLocaleString('vi-VN')}
                    </p>
                )}
            </div>
            <div className="p-5 bg-white dark:bg-slate-900">
                {image && (
                    <img
                        className="mx-auto rounded-xl shadow-sm border border-slate-100 dark:border-slate-800"
                        src={image}
                        alt={`${vi.qr} ${ticket.ticketCode}`}
                    />
                )}
                {error && <p role="alert" className="text-rose-500 text-sm text-center">{vi.qrFailure}</p>}
                <p className="break-all text-xs mt-4 text-slate-500 dark:text-slate-400 text-center font-mono">
                    {ticket.ticketCode}
                </p>
            </div>
        </article>
    );
}
