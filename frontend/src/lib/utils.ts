import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(minorUnits: number, currency = 'VND'): string {
  const format = new Intl.NumberFormat('vi-VN', { style: 'currency', currency });
  const scale = 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2);
  return format.format(minorUnits / scale);
}

export function formatDateTime(isoString: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}
