import React from 'react';
import { TicketTier } from '../types';
import { Ticket, Users, Flame, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

interface TicketTierCardProps {
  tier: TicketTier;
  selected: boolean;
  onSelect: () => void;
  currency?: string;
}

export const TicketTierCard: React.FC<TicketTierCardProps> = ({
  tier,
  selected,
  onSelect,
}) => {
  const isSoldOut = tier.availableQuantity <= 0;
  const remainingPercent = tier.totalQuantity > 0 
    ? Math.max(0, Math.min(100, Math.round((tier.availableQuantity / tier.totalQuantity) * 100))) 
    : 0;
  
  const isLowStock = !isSoldOut && remainingPercent <= 20;

  const formatCurrency = (minor: number, curr = 'USD') => {
    if (curr === 'VND') {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(minor);
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr }).format(minor / 100);
  };

  return (
    <div
      onClick={() => !isSoldOut && onSelect()}
      className={`relative p-5 rounded-3xl border transition-all duration-200 select-none ${
        isSoldOut
          ? 'bg-slate-100 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80 opacity-60 cursor-not-allowed'
          : selected
          ? 'bg-indigo-50/80 dark:bg-gradient-to-b dark:from-indigo-950/60 dark:to-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-2 ring-indigo-500 cursor-pointer scale-[1.01]'
          : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer'
      }`}
    >
      {/* Top badges */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-slate-900 dark:text-white text-base tracking-tight">{tier.name}</h4>
            {isSoldOut ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-rose-50 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 px-2 py-0.5 rounded-full">
                Cháy vé
              </span>
            ) : isLowStock ? (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                Sắp hết ({remainingPercent}%)
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-2 py-0.5 rounded-full">
                Còn vé ({remainingPercent}%)
              </span>
            )}
          </div>
          {tier.description && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
              {tier.description}
            </p>
          )}
        </div>

        {/* Price Tag */}
        <div className="text-right">
          <span className="text-lg font-black text-slate-900 dark:text-white font-mono block">
            {formatCurrency(tier.price, tier.currency)}
          </span>
          <span className="text-[10px] text-slate-500 uppercase font-mono">Đã gồm thuế/phí</span>
        </div>
      </div>

      {/* Inventory Progress Bar */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400 font-mono mb-1.5">
          <span className="flex items-center gap-1">
            <Ticket className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
            Tình trạng kho vé:
          </span>
          <span className={isSoldOut ? 'text-rose-600 dark:text-rose-400 font-bold' : isLowStock ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-emerald-600 dark:text-emerald-400 font-semibold'}>
            {isSoldOut ? '0 vé khả dụng' : `Còn ${tier.availableQuantity} / ${tier.totalQuantity} vé`}
          </span>
        </div>

        {/* Progress meter */}
        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-950 overflow-hidden border border-slate-200 dark:border-slate-800">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              isSoldOut
                ? 'w-0 bg-slate-400 dark:bg-slate-700'
                : isLowStock
                ? 'bg-gradient-to-r from-amber-500 to-rose-500 animate-pulse'
                : 'bg-gradient-to-r from-emerald-500 to-teal-400'
            }`}
            style={{ width: `${remainingPercent}%` }}
          />
        </div>
      </div>

      {/* Footer info: Order limit */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
        <span>Tối đa {tier.maxPerOrder} vé / đơn</span>
        {selected && !isSoldOut && (
          <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Đã chọn hạng vé này
          </span>
        )}
      </div>
    </div>
  );
};
