import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({ className, hoverEffect = false, children, ...props }) => {
  return (
    <div
      className={cn(
        'bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl backdrop-blur-sm',
        hoverEffect && 'hover:border-slate-700 hover:bg-slate-900 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
