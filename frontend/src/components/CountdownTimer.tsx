import React, { useState, useEffect } from 'react';
import { Clock, Zap, AlertTriangle } from 'lucide-react';

interface CountdownTimerProps {
  targetDate: string;
  label?: string;
  onExpire?: () => void;
  showMilliseconds?: boolean;
  urgent?: boolean;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({
  targetDate,
  label = 'Mở bán sau',
  onExpire,
  showMilliseconds = true,
  urgent = false,
}) => {
  const calculateTimeLeft = () => {
    const diff = new Date(targetDate).getTime() - Date.now();
    if (diff <= 0) {
      return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0, ms: 0 };
    }
    return {
      total: diff,
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / 1000 / 60) % 60),
      seconds: Math.floor((diff / 1000) % 60),
      ms: Math.floor((diff % 1000) / 10), // 2-digit ms (00-99)
    };
  };

  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft());

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);
      if (remaining.total <= 0) {
        clearInterval(interval);
        onExpire?.();
      }
    }, showMilliseconds ? 33 : 1000); // ~30fps for smooth ms display

    return () => clearInterval(interval);
  }, [targetDate, showMilliseconds]);

  if (timeLeft.total <= 0) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono text-xs font-bold animate-pulse">
        <Zap className="w-3.5 h-3.5" />
        <span>ĐANG MỞ BÁN NGAY BÂY GIỜ</span>
      </div>
    );
  }

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className={`flex flex-col items-center sm:items-start ${urgent ? 'text-amber-400' : 'text-slate-200'}`}>
      {label && (
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
          <Clock className="w-3 h-3 text-indigo-400" />
          {label}
        </span>
      )}
      <div className="flex items-center gap-1.5 font-mono">
        {timeLeft.days > 0 && (
          <>
            <div className="flex flex-col items-center bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-xl shadow-inner min-w-[42px]">
              <span className="text-lg font-black text-white">{pad(timeLeft.days)}</span>
              <span className="text-[9px] text-slate-500 uppercase">Ngày</span>
            </div>
            <span className="text-slate-600 font-bold">:</span>
          </>
        )}

        <div className="flex flex-col items-center bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-xl shadow-inner min-w-[42px]">
          <span className="text-lg font-black text-white">{pad(timeLeft.hours)}</span>
          <span className="text-[9px] text-slate-500 uppercase">Giờ</span>
        </div>
        <span className="text-slate-600 font-bold">:</span>

        <div className="flex flex-col items-center bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-xl shadow-inner min-w-[42px]">
          <span className="text-lg font-black text-white">{pad(timeLeft.minutes)}</span>
          <span className="text-[9px] text-slate-500 uppercase">Phút</span>
        </div>
        <span className="text-slate-600 font-bold">:</span>

        <div className="flex flex-col items-center bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-xl shadow-inner min-w-[42px]">
          <span className="text-lg font-black text-amber-400">{pad(timeLeft.seconds)}</span>
          <span className="text-[9px] text-slate-500 uppercase">Giây</span>
        </div>

        {showMilliseconds && (
          <>
            <span className="text-slate-600 font-bold">:</span>
            <div className="flex flex-col items-center bg-rose-950/60 border border-rose-800/80 px-2 py-1.5 rounded-xl shadow-inner min-w-[36px]">
              <span className="text-base font-black text-rose-400">{pad(timeLeft.ms)}</span>
              <span className="text-[9px] text-rose-500/80 uppercase font-mono">ms</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
