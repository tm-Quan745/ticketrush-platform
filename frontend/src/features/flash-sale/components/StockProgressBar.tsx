import React from 'react';
import { Ticket, Flame } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface StockProgressBarProps {
  available: number;
  total: number;
  className?: string;
}

export const StockProgressBar: React.FC<StockProgressBarProps> = ({ available, total, className }) => {
  const isSoldOut = available <= 0;
  const remainingPercent = total > 0 ? Math.max(0, Math.min(100, Math.round((available / total) * 100))) : 0;
  const isLowStock = !isSoldOut && remainingPercent <= 20;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-slate-400 flex items-center gap-1">
          <Ticket className="w-3.5 h-3.5 text-indigo-400" />
          Tiến độ bán vé:
        </span>
        <span
          className={cn(
            'font-bold',
            isSoldOut ? 'text-rose-400' : isLowStock ? 'text-amber-400' : 'text-emerald-400'
          )}
        >
          {isSoldOut ? 'HẾT VÉ (0%)' : isLowStock ? `SẮP CHÁY VÉ (${remainingPercent}%)` : `CÒN ${remainingPercent}%`}
        </span>
      </div>

      <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-700 rounded-full',
            isSoldOut
              ? 'w-0'
              : isLowStock
              ? 'bg-gradient-to-r from-amber-500 to-rose-500 animate-pulse'
              : 'bg-gradient-to-r from-emerald-500 to-teal-400'
          )}
          style={{ width: `${remainingPercent}%` }}
        />
      </div>
    </div>
  );
};
