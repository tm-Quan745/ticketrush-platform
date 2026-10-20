import React from 'react';
import { FlashSaleTier } from '../types/flashSale.types';
import { StockProgressBar } from './StockProgressBar';
import { formatCurrency, cn } from '../../../lib/utils';
import { CheckCircle2, Flame } from 'lucide-react';

interface TicketCardProps {
  tier: FlashSaleTier;
  selected: boolean;
  onSelect: () => void;
}

export const TicketCard: React.FC<TicketCardProps> = ({ tier, selected, onSelect }) => {
  const isSoldOut = tier.availableQuantity <= 0;
  const isLowStock = !isSoldOut && tier.availableQuantity * 10 < tier.totalQuantity;

  return (
    <div
      onClick={() => !isSoldOut && onSelect()}
      className={cn(
        'p-5 rounded-3xl border transition-all duration-200 select-none cursor-pointer',
        isSoldOut
          ? 'bg-slate-950/40 border-slate-800/80 opacity-50 cursor-not-allowed'
          : selected
          ? 'bg-gradient-to-b from-indigo-950/60 to-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/15 ring-1 ring-indigo-500 scale-[1.01]'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-black text-white text-base tracking-tight">{tier.name}</h4>
            {isSoldOut ? (
              <span className="text-[10px] font-bold uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full">
                Hết vé
              </span>
            ) : isLowStock ? (
              <span className="text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                Sắp hết
              </span>
            ) : (
              <span className="text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                Còn vé
              </span>
            )}
          </div>
          {tier.description && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{tier.description}</p>
          )}
        </div>

        <div className="text-right">
          <span className="text-lg font-black text-white font-mono block">
            {formatCurrency(tier.price, tier.currency)}
          </span>
          <span className="text-[10px] text-slate-500 uppercase font-mono">Đã gồm thuế</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800/80">
        <StockProgressBar available={tier.availableQuantity} total={tier.totalQuantity} />
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
        <span>Tối đa {tier.maxPerOrder} vé / đơn</span>
        {selected && !isSoldOut && (
          <span className="text-indigo-400 font-bold flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Đã chọn hạng vé này
          </span>
        )}
      </div>
    </div>
  );
};
