import React from 'react';
import {
  Zap,
  Ticket,
  ShieldCheck,
  Users,
  Eye,
  Activity,
  Layers,
  ArrowRight,
  Sparkles,
  Lock,
  GitBranch,
  QrCode,
  Cpu,
  PhoneCall,
  Mail,
  ExternalLink,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

interface FooterProps {
  onNavigate: (view: 'user_events' | 'event_detail' | 'waiting_room' | 'tickets' | 'profile' | 'admin') => void;
  onOpenFlowNavigator: () => void;
  onOpenGateScanner: () => void;
  onOpenArchitecture: () => void;
  onOpenHealth: () => void;
  onOpenConcurrency: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  onNavigate,
  onOpenFlowNavigator,
  onOpenGateScanner,
  onOpenArchitecture,
  onOpenHealth,
  onOpenConcurrency,
}) => {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800/90 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 text-sm">
      {/* Upper Highlight Banner: Phân Luồng Trải Nghiệm & Cam Kết Chịu Tải */}
      <div className="border-b border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-gradient-to-r dark:from-slate-900/80 dark:via-indigo-950/20 dark:to-slate-900/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-600/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                <GitBranch className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white text-base">Hệ Thống Phân Luồng Nghiệp Vụ</span>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/40 font-bold">
                    4 Tracks Active
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Phân luồng độc lập giữa Khán giả săn vé, Ban tổ chức, Cổng soát vé QR và Kiểm chứng tải cao.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onOpenFlowNavigator}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-md shadow-indigo-600/20"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>Xem Sơ Đồ Phân Luồng</span>
              </button>
              <button
                onClick={onOpenGateScanner}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition shadow-xs"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Cổng Soát Vé Scanner</span>
              </button>
              <button
                onClick={onOpenConcurrency}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition shadow-xs"
              >
                <Cpu className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>Mô Phỏng Tải Cao</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Multi-Column Footer Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-10">
          {/* Brand & Mission column (2 cols wide on desktop) */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
                <Zap className="w-5 h-5 text-white fill-white" />
              </div>
              <div>
                <span className="font-black text-xl tracking-tight text-white">TicketRush</span>
                <p className="text-[11px] text-slate-400 font-medium">Flash-Sale High-Concurrency Ticketing Engine</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Hệ thống bán vé sự kiện âm nhạc & thể thao quy mô lớn với kiến trúc chịu tải phân tán. Đảm bảo triệt để
              bất biến <strong className="text-slate-200">Không Bán Khống (Zero-Overselling)</strong>, giữ chỗ tạm thời
              có thời hạn TTL (10 phút), và thanh toán Idempotent chống trùng lặp giao dịch.
            </p>

            {/* Invariant Micro-Badges */}
            <div className="space-y-1.5 pt-1 text-xs">
              <div className="flex items-center gap-2 text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Sold + Held &le; Capacity (Bất biến khoá nguyên tử)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Lock className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Idempotency-Key Header (Chống double charge)</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Transactional Outbox & Event-Driven Relay</span>
              </div>
            </div>

            {/* Contact & Support Hotline */}
            <div className="pt-2 border-t border-slate-900 flex flex-col sm:flex-row items-start sm:items-center gap-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-3.5 h-3.5 text-rose-400" />
                <span>Hotline Kỹ Thuật: <strong className="text-white font-mono">1900-888-RUSH</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
                <span>ops@ticketrush.dev</span>
              </div>
            </div>
          </div>

          {/* Col 1: Phân luồng Khán Giả */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
              <Ticket className="w-3.5 h-3.5 text-amber-400" />
              <span>Luồng Khán Giả</span>
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('event_detail')}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Sơ Đồ Khán Đài & Ghế 3D</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('user_events')}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Danh Mục Đại Nhạc Hội & Flash-Sale</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('waiting_room')}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Phòng Chờ Ảo (Fair Queueing)</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('tickets')}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Ví Vé & Mã QR Check-in</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('profile')}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Hồ Sơ & Xác Thực CCCD</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Col 2: Phân luồng Ban Tổ Chức & Vận Hành */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ban Tổ Chức & Admin</span>
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('admin')}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Bảng Điều Khiển Quản Trị</span>
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenGateScanner}
                  className="hover:text-white transition flex items-center gap-1.5 text-left text-emerald-400 font-semibold"
                >
                  <QrCode className="w-3 h-3" />
                  <span>Cổng Soát Vé Scanner</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('admin')}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Đối Soát Tồn Kho (Reconcile)</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('admin')}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Điều Tiết Phòng Chờ (Drain Rate)</span>
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenConcurrency}
                  className="hover:text-white transition flex items-center gap-1.5 text-left text-amber-300 font-semibold"
                >
                  <Cpu className="w-3 h-3" />
                  <span>Thử Tải Đồng Thời (Concurrency)</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Kiến Trúc & Giám Sát Kỹ Thuật */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-400" />
              <span>Kiến Trúc & Giám Sát</span>
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={onOpenArchitecture}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>5 Bất Biến Cốt Lõi (Invariants)</span>
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenHealth}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Spring Actuator & Microservices</span>
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenFlowNavigator}
                  className="hover:text-white transition flex items-center gap-1.5 text-left"
                >
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span>Sơ Đồ Phân Luồng Dữ Liệu</span>
                </button>
              </li>
              <li>
                <div className="text-slate-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  <span>PostgreSQL + Redis Cluster</span>
                </div>
              </li>
              <li>
                <div className="text-slate-500 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  <span>RabbitMQ Event Bus</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar: Operational Telemetry & Legal */}
      <div className="border-t border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-950/80 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-3 text-slate-500">
            <span>© 2026 TicketRush High-Load Ticketing Platform</span>
            <span className="hidden md:inline">·</span>
            <span className="hidden md:inline">Modular Monolith Spring Boot 3 + React</span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle showDropdown />
            <button
              onClick={onOpenHealth}
              className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>All Systems Operational</span>
            </button>
            <span className="text-slate-700">|</span>
            <span className="text-slate-500">v2.4-prod</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
