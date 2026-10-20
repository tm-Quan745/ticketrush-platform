import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import {
  Zap,
  ShieldCheck,
  Ticket,
  UserCheck,
  ShieldAlert,
  Activity,
  ArrowRightLeft,
  Sparkles,
  Search,
  Bell,
  User as UserIcon,
  GitBranch,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  portal: 'user' | 'admin';
  setPortal: (portal: 'user' | 'admin') => void;
  activeHoldCount: number;
  openHealthModal: () => void;
  openSearchModal?: () => void;
  openNotificationsModal?: () => void;
  openProfileModal?: () => void;
  openFlowNavigator?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  portal,
  setPortal,
  activeHoldCount,
  openHealthModal,
  openSearchModal,
  openNotificationsModal,
  openProfileModal,
  openFlowNavigator,
}) => {
  const { user, isAdmin, loginAsUser, loginAsAdmin } = useAuth();
  const { unreadCount } = useNotifications();
  const [latency, setLatency] = useState<number>(14);

  useEffect(() => {
    const timer = setInterval(() => {
      setLatency(Math.floor(10 + Math.random() * 8));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-xl transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-3">
          {/* Logo & Brand */}
          <div
            className="flex items-center gap-3 cursor-pointer group shrink-0"
            onClick={() => setPortal('user')}
          >
            <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/25 group-hover:scale-105 transition-transform duration-300">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white fill-white" />
              <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-xl sm:text-2xl tracking-tight bg-gradient-to-r from-indigo-600 via-slate-900 to-slate-800 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                  TicketRush
                </span>
                <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full">
                  High-Load
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                Sàn Đặt Vé Chịu Tải Cao & Không Bán Khống
              </p>
            </div>
          </div>

          {/* Search Trigger Button (Cmd+K) & Phân Luồng Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={openSearchModal}
              className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 text-xs transition"
            >
              <Search className="w-3.5 h-3.5 text-indigo-400" />
              <span>Tìm sự kiện, khán đài, vé...</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-500 ml-2">
                ⌘K
              </kbd>
            </button>

            {openFlowNavigator && (
              <button
                onClick={openFlowNavigator}
                className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 hover:text-white hover:bg-indigo-900/80 text-xs font-bold transition shadow-sm"
                title="Mở Sơ Đồ Phân Luồng Nghiệp Vụ"
              >
                <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
                <span>Phân Luồng</span>
              </button>
            )}
          </div>

          {/* MAIN DEDICATED PORTAL SWITCHER (CENTER PILL) */}
          <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-2xl shadow-inner">
            <button
              onClick={async () => {
                if (isAdmin) {
                  await loginAsUser();
                }
                setPortal('user');
              }}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${
                portal === 'user'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 scale-[1.02]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Ticket className="w-4 h-4 text-amber-300" />
              <span className="hidden sm:inline">Cổng Khách Hàng</span>
              <span className="sm:hidden">User</span>
              {activeHoldCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-rose-500 text-white font-mono text-[10px] font-black flex items-center justify-center animate-pulse">
                  {activeHoldCount}
                </span>
              )}
            </button>

            <button
              onClick={async () => {
                if (!isAdmin) {
                  await loginAsAdmin();
                }
                setPortal('admin');
              }}
              className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-black transition-all ${
                portal === 'admin'
                  ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/25 scale-[1.02]'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
              <span className="hidden sm:inline">Cổng Quản Trị (Admin)</span>
              <span className="sm:hidden">Admin</span>
            </button>
          </div>

          {/* Right Action: Notifications, Profile, Realtime WS */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Realtime WS & Redis indicator */}
            <button
              onClick={openHealthModal}
              className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 font-mono text-[11px] text-slate-300 transition"
              title="Nhấn để xem báo cáo Actuator & Hệ thống microservices"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-400 font-bold">WS: {latency}ms</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">Redis: ON</span>
            </button>

            {/* Theme Toggle Button */}
            <ThemeToggle />

            {/* Notification Bell */}
            <button
              onClick={openNotificationsModal}
              className="relative p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition"
              title="Thông báo hệ thống & Flash-sale"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-mono font-bold flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* User Profile Avatar */}
            <button
              onClick={openProfileModal}
              className="p-1 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/60 transition flex items-center gap-2"
              title="Cài đặt hồ sơ & Phương thức thanh toán"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center text-white font-black text-xs">
                {user?.role === 'ADMIN' ? 'A' : 'U'}
              </div>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
