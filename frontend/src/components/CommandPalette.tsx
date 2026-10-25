import React, { useState, useEffect } from 'react';
import {
  Search,
  Zap,
  Ticket,
  ShieldCheck,
  Users,
  Eye,
  Activity,
  Layers,
  ArrowRight,
  Clock,
  Sparkles,
  User,
  Sun,
  Moon,
  Laptop,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: any, eventId?: string) => void;
  onOpenHealth: () => void;
  onOpenFlowNavigator?: () => void;
  onOpenGateScanner?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenHealth,
  onOpenFlowNavigator,
  onOpenGateScanner,
}) => {
  const { loginAsAdmin, loginAsUser, isAdmin } = useAuth();
  const { setTheme, resolvedTheme } = useTheme();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // Toggle will be handled in parent or here
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const quickActions = [
    {
      id: 'goto-flow-navigator',
      title: 'Sơ Đồ Phân Luồng Hệ Thống (Flow Navigator)',
      subtitle: 'Xem và chuyển đổi giữa 4 luồng nghiệp vụ: Khán giả, Quản trị, Soát vé cổng, Thử tải',
      icon: <Layers className="w-4 h-4 text-indigo-400" />,
      action: () => {
        onClose();
        if (onOpenFlowNavigator) onOpenFlowNavigator();
      },
      tag: 'Phân luồng',
    },
    {
      id: 'goto-gate-scanner',
      title: 'Cổng Soát Vé Scanner Tại Sân Vận Động',
      subtitle: 'Quét mã QR soát vé vào cổng, phát hiện vé giả hoặc vé đã check-in',
      icon: <Ticket className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onClose();
        if (onOpenGateScanner) onOpenGateScanner();
      },
      tag: 'Soát vé',
    },
    {
      id: 'goto-seats',
      title: 'Sơ Đồ Khán Đài & Ghế 3D',
      subtitle: 'Xem mô phỏng sân vận động, chọn khu vực & ghế ngồi thời gian thực',
      icon: <Eye className="w-4 h-4 text-amber-400" />,
      action: () => {
        onNavigate('event_detail');
        onClose();
      },
      tag: 'Trực quan',
    },
    {
      id: 'goto-profile',
      title: 'Hồ Sơ Cá Nhân & Cài Đặt (User Profile)',
      subtitle: 'Xác thực định danh CCCD KYC, quản lý thẻ thanh toán & bảo mật 2FA',
      icon: <User className="w-4 h-4 text-indigo-400" />,
      action: () => {
        onNavigate('profile');
        onClose();
      },
      tag: 'Tài khoản',
    },
    {
      id: 'goto-events',
      title: 'Danh Mục Toàn Bộ Sự Kiện',
      subtitle: 'Khám phá tất cả các concert, festival & đại nhạc hội đang mở bán',
      icon: <Zap className="w-4 h-4 text-rose-400" />,
      action: () => {
        onNavigate('user_events');
        onClose();
      },
      tag: 'Khách hàng',
    },
    {
      id: 'goto-queue',
      title: 'Phòng Chờ Ảo (Waiting Room)',
      subtitle: 'Xếp hàng theo cơ chế FIFO/Token để tránh nghẽn flash-sale',
      icon: <Users className="w-4 h-4 text-cyan-400" />,
      action: () => {
        onNavigate('waiting_room');
        onClose();
      },
      tag: 'Tải cao',
    },
    {
      id: 'goto-wallet',
      title: 'Ví Vé & Mã QR Check-in',
      subtitle: 'Xem toàn bộ vé điện tử đã thanh toán & lấy mã quét vào cổng',
      icon: <Ticket className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onNavigate('tickets');
        onClose();
      },
      tag: 'Cá nhân',
    },
    {
      id: 'goto-admin',
      title: 'Cổng Quản Trị Hệ Thống (Admin)',
      subtitle: 'Quản lý tồn kho, đối soát không bán khống, điều tiết lưu lượng',
      icon: <ShieldCheck className="w-4 h-4 text-rose-400" />,
      action: () => {
        if (!isAdmin) loginAsAdmin();
        onNavigate('admin');
        onClose();
      },
      tag: 'Quản trị',
    },
    {
      id: 'actuator-health',
      title: 'Kiểm Tra Actuator Health & Microservices',
      subtitle: 'Xem trạng thái kết nối Redis, Invariant Equation & Outbox Relay',
      icon: <Activity className="w-4 h-4 text-emerald-400" />,
      action: () => {
        onClose();
        onOpenHealth();
      },
      tag: 'System',
    },
    {
      id: 'theme-light',
      title: 'Chuyển Sang Giao Diện Sáng (Light Mode)',
      subtitle: 'Chế độ nền sáng dịu mắt, tối ưu quan sát ban ngày',
      icon: <Sun className="w-4 h-4 text-amber-500" />,
      action: () => {
        setTheme('light');
        onClose();
      },
      tag: 'Giao diện',
    },
    {
      id: 'theme-dark',
      title: 'Chuyển Sang Giao Diện Tối (Dark Mode)',
      subtitle: 'Chế độ nền tối tương phản cao chuẩn TicketRush Flash-Sale',
      icon: <Moon className="w-4 h-4 text-indigo-400" />,
      action: () => {
        setTheme('dark');
        onClose();
      },
      tag: 'Giao diện',
    },
    {
      id: 'theme-system',
      title: 'Giao Diện Theo Hệ Thống (Auto / System)',
      subtitle: 'Tự động đồng bộ giao diện theo cài đặt hệ điều hành',
      icon: <Laptop className="w-4 h-4 text-slate-400" />,
      action: () => {
        setTheme('system');
        onClose();
      },
      tag: 'Giao diện',
    },
  ];

  const popularEvents = [
    {
      id: 'e1000000-0000-0000-0000-000000000001',
      title: 'Taylor Swift | The Eras Tour Stadium Live',
      venue: 'Sân Vận Động SoFi Stadium',
      price: 'Từ 9.900 ₫',
    },
    {
      id: 'e1000000-0000-0000-0000-000000000002',
      title: 'Cyberpunk 2077 Symphony & EDM Night',
      venue: 'Trung Tâm Triển Lãm & Biểu Diễn SECC',
      price: 'Từ 4.900 ₫',
    },
    {
      id: 'e1000000-0000-0000-0000-000000000003',
      title: 'Premier League: Hanoi Invitational Cup',
      venue: 'Sân Vận Động Quốc Gia Mỹ Đình',
      price: 'Từ 3.500 ₫',
    },
  ];

  const filteredActions = quickActions.filter(
    (a) =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.subtitle.toLowerCase().includes(query.toLowerCase())
  );

  const filteredEvents = popularEvents.filter(
    (e) =>
      e.title.toLowerCase().includes(query.toLowerCase()) ||
      e.venue.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20 flex items-start justify-center animate-in fade-in duration-150">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <Search className="w-5 h-5 text-indigo-400 shrink-0 mr-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm kiếm sự kiện, khán đài, vé, đơn hàng hoặc phím tắt..."
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
            autoFocus
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400 border border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Results Container */}
        <div className="max-h-96 overflow-y-auto p-3 space-y-4">
          {/* Section: Pages & Navigation */}
          <div>
            <div className="px-3 py-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              Điều Hướng Nhanh & Chức Năng
            </div>
            <div className="mt-1 space-y-1">
              {filteredActions.map((item) => (
                <button
                  key={item.id}
                  onClick={item.action}
                  className="w-full text-left p-3 rounded-2xl hover:bg-slate-800/80 transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 group-hover:border-indigo-500/50 transition">
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-indigo-400 transition flex items-center gap-2">
                        {item.title}
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                          {item.tag}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{item.subtitle}</div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition group-hover:translate-x-1" />
                </button>
              ))}
            </div>
          </div>

          {/* Section: Events */}
          <div>
            <div className="px-3 py-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">
              Sự Kiện Flash-Sale Trực Quan
            </div>
            <div className="mt-1 space-y-1">
              {filteredEvents.map((evt) => (
                <button
                  key={evt.id}
                  onClick={() => {
                    onNavigate('event_detail', evt.id);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-2xl hover:bg-slate-800/80 transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white group-hover:text-rose-400 transition">
                        {evt.title}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {evt.venue} • <span className="text-emerald-400 font-mono">{evt.price}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-indigo-400 group-hover:underline">
                    Xem Khán Đài &rarr;
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>Sử dụng phím mũi tên & Enter để chọn</span>
          <span className="text-indigo-400 font-bold">TicketRush Command v2.0</span>
        </div>
      </div>
    </div>
  );
};
