import { vi } from '../../../i18n/vi';
import React from 'react';
import { FlashSaleEvent } from '../types/flashSale.types';
import { CountdownTimer } from './CountdownTimer';
import { Calendar, MapPin, Users, Flame, Clock } from 'lucide-react';
import { formatDateTime } from '../../../lib/utils';

interface EventHeaderProps {
  event: FlashSaleEvent;
}

export const EventHeader: React.FC<EventHeaderProps> = ({ event }) => {
  const now = new Date().toISOString();
  const isOnSale = event.saleStartTime <= now && now <= event.saleEndTime;

  return (
    <div className="relative rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl">
      {/* Banner Backdrop */}
      <div className="relative h-64 sm:h-80 bg-slate-950 overflow-hidden">
        {event.imageUrl ? (
        <img
          src={event.imageUrl || undefined}
          alt={event.title}
          className="w-full h-full object-cover opacity-60"
        />
        ) : <div aria-hidden="true" className="h-full w-full bg-gradient-to-br from-indigo-900 via-slate-900 to-rose-900 flex items-center justify-center"><Calendar className="w-20 h-20 text-indigo-300/30"/></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />

        {/* Top badges */}
        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
          {isOnSale ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/90 text-white text-xs font-black shadow-lg">
              <Flame className="w-3.5 h-3.5 fill-white animate-pulse" />
              {vi.sale}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/90 text-slate-950 text-xs font-black shadow-lg">
              <Clock className="w-3.5 h-3.5" />
              {vi.soon}
            </span>
          )}

          {event.waitingRoomEnabled && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/90 text-white text-xs font-bold shadow-lg">
              <Users className="w-3.5 h-3.5" />
              {vi.queueBadge}
            </span>
          )}
        </div>

        {/* Bottom Details */}
        <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              {event.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-400" />
                {formatDateTime(event.startTime)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-rose-400" />
                {event.venueName} • {event.venueAddress}
              </span>
            </div>
          </div>

          {!isOnSale && (
            <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
              <CountdownTimer targetDate={event.saleStartTime} label={vi.saleCountdown} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
