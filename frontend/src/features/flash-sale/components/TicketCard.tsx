import { vi } from '../../../i18n/vi';
import React from 'react';
import { FlashSaleTier } from '../types/flashSale.types';
import { formatCurrency, cn } from '../../../lib/utils';
import { CheckCircle2, Flame } from 'lucide-react';

interface TicketCardProps {
  tier: FlashSaleTier;
  selected: boolean;
  onSelect: () => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({ tier, selected, onSelect }) => {
  const isSoldOut = tier.availability === 'SOLD_OUT';
  const isLowStock = tier.availability === 'LOW';

  return (
    <div
      role="button" tabIndex={isSoldOut ? -1 : 0} aria-label={`${vi.choose} ${tier.name}`} aria-pressed={selected} aria-disabled={isSoldOut}
      onKeyDown={e => { if (!isSoldOut && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(); } }}
      onClick={() => !isSoldOut && onSelect()}
      className={cn(
        'p-5 rounded-3xl border transition-all duration-200 select-none cursor-pointer',
        isSoldOut
          ? 'bg-slate-100 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800/80 opacity-50 cursor-not-allowed'
          : selected
            ? 'bg-indigo-50/90 dark:bg-gradient-to-b dark:from-indigo-950/60 dark:to-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/15 ring-1 ring-indigo-500 scale-[1.01]'
            : 'bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-black text-slate-900 dark:text-white text-base tracking-tight">{tier.name}</h4>
            {isSoldOut ? (
              <span className="text-[10px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full">
                {vi.SOLD_OUT}
              </span>
            ) : isLowStock ? (
              <span className="text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                {vi.LOW}
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                {vi.AVAILABLE}
              </span>
            )}
          </div>
          {tier.description && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">{tier.description}</p>
          )}
        </div>

        <div className="text-right">
          <span className="text-lg font-black text-slate-900 dark:text-white font-mono block">
            {formatCurrency(tier.price, tier.currency)}
          </span>
          <span className="text-[10px] text-slate-500 uppercase font-mono">{vi.price}</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{vi[tier.availability || 'AVAILABLE']}</p>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>{vi.max(tier.maxPerOrder || 6)}</span>
        {selected && !isSoldOut && (
          <span className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {vi.selectedTier}
          </span>
        )}
      </div>
    </div>
  );
};
