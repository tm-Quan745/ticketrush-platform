import React from 'react';
import { Event } from '../types';
import { Calendar, MapPin, Users, Flame, Clock, ArrowRight, Zap } from 'lucide-react';

interface EventCardProps {
  event: Event;
  onSelect: (event: Event) => void;
  onJoinQueue: (event: Event) => void;
}

export const EventCard: React.FC<EventCardProps> = ({ event, onSelect, onJoinQueue }) => {
  const startDate = new Date(event.startTime).toLocaleDateString('vi-VN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const startTime = new Date(event.startTime).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const now = new Date().toISOString();
  const isOnSale = event.saleStartTime <= now && now <= event.saleEndTime;

  return (
    <div className="group bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-slate-700 rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10 flex flex-col justify-between">
      {/* Event Image Banner */}
      <div className="relative h-52 overflow-hidden bg-slate-950">
        <img
          src={event.imageUrl}
          alt={event.title}
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700 opacity-90"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/30 to-transparent" />

        {/* Live Badges */}
        <div className="absolute top-3.5 left-3.5 flex flex-wrap gap-2">
          {isOnSale ? (
            <span className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
              <Flame className="w-3.5 h-3.5 fill-white animate-pulse" />
              ĐANG MỞ BÁN
            </span>
          ) : (
            <span className="flex items-center gap-1.5 bg-amber-500 text-slate-950 text-xs font-black px-3 py-1 rounded-full shadow-lg">
              <Clock className="w-3.5 h-3.5" />
              SẮP MỞ BÁN
            </span>
          )}

          {event.waitingRoomEnabled && (
            <span className="flex items-center gap-1.5 bg-rose-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
              <Users className="w-3.5 h-3.5" />
              PHÒNG CHỜ ẢO
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1 tracking-tight">
            {event.title}
          </h3>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
            {event.description}
          </p>

          <div className="mt-4 space-y-2 text-xs text-slate-700 dark:text-slate-300">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
              <Calendar className="w-4 h-4 text-indigo-500 dark:text-indigo-400 shrink-0" />
              <span>
                {startDate} • {startTime}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <MapPin className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />
              <span className="truncate">{event.venueName} • {event.venueAddress}</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800/80">
          {event.waitingRoomEnabled ? (
            <button
              onClick={() => onJoinQueue(event)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold text-xs sm:text-sm py-3 px-4 rounded-2xl transition shadow-lg shadow-rose-600/20 active:scale-[0.98]"
            >
              <Users className="w-4 h-4" />
              Vào Phòng Chờ Ảo Ngay
            </button>
          ) : (
            <button
              onClick={() => onSelect(event)}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs sm:text-sm py-3 px-4 rounded-2xl transition shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
            >
              <Zap className="w-4 h-4" />
              Chọn Hạng Vé & Giữ Chỗ
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
