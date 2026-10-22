import React, { useState } from 'react';
import { useNotifications, AppNotification } from '../context/NotificationContext';
import {
  X,
  Bell,
  CheckCheck,
  Trash2,
  Zap,
  Ticket,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: any) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const [filter, setFilter] = useState<'ALL' | 'FLASH_SALE' | 'ORDER' | 'SYSTEM'>('ALL');

  if (!isOpen) return null;

  const filtered = notifications.filter((n) => {
    if (filter === 'ALL') return true;
    return n.category === filter;
  });

  const getCategoryIcon = (category: AppNotification['category']) => {
    switch (category) {
      case 'FLASH_SALE':
        return <Zap className="w-4 h-4 text-amber-400" />;
      case 'ORDER':
        return <Ticket className="w-4 h-4 text-emerald-400" />;
      case 'SECURITY':
      case 'SYSTEM':
        return <ShieldCheck className="w-4 h-4 text-indigo-400" />;
      default:
        return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-white text-base flex items-center gap-2">
                  Thông Báo Thời Gian Thực
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-500 text-white">
                      {unreadCount} mới
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">Cập nhật mở bán, đơn hàng & bảo mật</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action pills & Quick Filters */}
          <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <button
                onClick={() => setFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filter === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                Tất cả ({notifications.length})
              </button>
              <button
                onClick={() => setFilter('FLASH_SALE')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filter === 'FLASH_SALE'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                Flash-sale
              </button>
              <button
                onClick={() => setFilter('ORDER')}
                className={`px-2.5 py-1 rounded-lg transition ${
                  filter === 'ORDER'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                Đơn vé
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={markAllAsRead}
                className="text-[11px] text-slate-400 hover:text-indigo-400 transition flex items-center gap-1"
                title="Đã đọc tất cả"
              >
                <CheckCheck className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={clearAll}
                className="text-[11px] text-slate-500 hover:text-rose-400 transition flex items-center gap-1"
                title="Xóa tất cả"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filtered.length === 0 ? (
              <div className="py-24 text-center space-y-2">
                <Bell className="w-10 h-10 text-slate-700 mx-auto" />
                <p className="text-sm font-bold text-slate-400">Không có thông báo mới</p>
                <p className="text-xs text-slate-500">Các cảnh báo đợt vé flash-sale sẽ xuất hiện tại đây.</p>
              </div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    markAsRead(item.id);
                    if (item.linkAction) {
                      onNavigate(item.linkAction);
                      onClose();
                    }
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer relative group ${
                    item.read
                      ? 'bg-slate-950/40 border-slate-800/80 text-slate-400'
                      : 'bg-slate-800/70 border-indigo-500/40 text-slate-200 shadow-lg'
                  }`}
                >
                  {!item.read && (
                    <span className="absolute top-4 right-4 w-2 h-2 rounded-full bg-indigo-500" />
                  )}
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-700/60 shrink-0">
                      {getCategoryIcon(item.category)}
                    </div>
                    <div className="space-y-1 flex-1 pr-4">
                      <h4 className="font-bold text-xs text-white group-hover:text-indigo-300 transition flex items-center gap-1.5">
                        {item.title}
                        {item.linkAction && <ExternalLink className="w-3 h-3 text-slate-500" />}
                      </h4>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{item.message}</p>
                      <span className="text-[10px] text-slate-500 font-mono block pt-1">
                        {item.timestamp}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer note */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 text-center text-[11px] text-slate-500 font-mono">
            <span>WebSocket Live Hub • Zero-Latency Alert Broadcast</span>
          </div>
        </div>
      </div>
    </div>
  );
};
