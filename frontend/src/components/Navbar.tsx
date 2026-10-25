import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Zap, ShieldCheck, Ticket, UserCheck, ShieldAlert, Cpu } from 'lucide-react';

interface NavbarProps {
  currentTab: 'events' | 'bookings' | 'admin' | 'architecture';
  setCurrentTab: (tab: 'events' | 'bookings' | 'admin' | 'architecture') => void;
  openHealthModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, setCurrentTab, openHealthModal }) => {
  const { user, isAdmin, loginAsUser, loginAsAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentTab('events')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
              <Zap className="w-6 h-6 text-white fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-indigo-600 via-slate-900 to-slate-800 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
                  TicketRush
                </span>
                <span className="text-[10px] uppercase font-semibold tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/30 px-1.5 py-0.5 rounded">
                  High-Load
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Flash-Sale Ticket Engine</p>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setCurrentTab('events')}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                currentTab === 'events'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              Concerts & Events
            </button>
            <button
              onClick={() => setCurrentTab('bookings')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                currentTab === 'bookings'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Ticket className="w-4 h-4" />
              My Tickets & Holds
            </button>
            <button
              onClick={() => setCurrentTab('admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                currentTab === 'admin'
                  ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Admin & Reconciliation
            </button>
            <button
              onClick={() => setCurrentTab('architecture')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                currentTab === 'architecture'
                  ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <Cpu className="w-4 h-4" />
              Invariants & System
            </button>
          </nav>

          {/* Right Actions: Role switcher & Health */}
          <div className="flex items-center gap-3">
            <button
              onClick={openHealthModal}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium rounded-md bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 hover:bg-emerald-900/60 transition"
              title="View Actuator & Microservice Health"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              ACTUATOR: UP
            </button>

            {/* Quick Role Switcher */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-lg">
              <button
                onClick={loginAsUser}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                  !isAdmin
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Switch to Standard User session"
              >
                <UserCheck className="w-3.5 h-3.5" />
                User
              </button>
              <button
                onClick={loginAsAdmin}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                  isAdmin
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Switch to Admin session with inventory reconciliation privileges"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Admin
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
