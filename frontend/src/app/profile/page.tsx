import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { formatCurrency } from '../../lib/utils';
import {
  User,
  Shield,
  CreditCard,
  Zap,
  Key,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Plus,
  Trash2,
  Save,
  Laptop,
  LogOut,
  Bell,
  Sparkles,
  Ticket,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Clock,
  Radio,
  FileText,
  BadgeCheck,
  Eye,
  EyeOff,
  Copy,
  Check,
  RefreshCw,
  Award,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface ProfilePageProps {
  onNavigateToTickets?: () => void;
  onNavigateToEvents?: () => void;
}

export const ProfilePage: React.FC<ProfilePageProps> = ({
  onNavigateToTickets,
  onNavigateToEvents,
}) => {
  const { user } = useAuth();
  const { addNotification } = useNotifications();
  const { theme, resolvedTheme, setTheme } = useTheme();

  // Active Tab: 'identity' | 'payment' | 'speed_buy' | 'security' | 'orders' | 'notifications' | 'appearance'
  const [activeTab, setActiveTab] = useState<
    'identity' | 'payment' | 'speed_buy' | 'security' | 'orders' | 'notifications' | 'appearance'
  >('identity');

  // Personal Profile & KYC Information
  const [profileData, setProfileData] = useState({
    fullName: 'Trần Minh Quân',
    phone: '+84 988 123 456',
    email: user?.email || 'quan.tran@ticketrush.dev',
    idNumber: '001202008912', // CCCD 12 số
    dob: '1996-08-15',
    nationality: 'Việt Nam',
    address: '29 Liễu Giai, Phường Ngọc Khánh, Quận Ba Đình, Hà Nội',
  });

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Saved Cards
  const [cards, setCards] = useState([
    {
      id: 'c1',
      brand: 'VISA',
      last4: '4242',
      holder: 'TRAN MINH QUAN',
      exp: '12/28',
      isDefault: true,
      bank: 'Vietcombank Visa Signature',
      color: 'from-blue-600 via-indigo-700 to-slate-900',
    },
    {
      id: 'c2',
      brand: 'MASTERCARD',
      last4: '8819',
      holder: 'TRAN MINH QUAN',
      exp: '08/29',
      isDefault: false,
      bank: 'Techcombank World Debit',
      color: 'from-amber-600 via-rose-700 to-slate-950',
    },
    {
      id: 'c3',
      brand: 'MOMO',
      last4: '0988***456',
      holder: 'Ví điện tử MoMo Pay',
      exp: 'Đã liên kết',
      isDefault: false,
      bank: 'MoMo E-Wallet Fast Checkout',
      color: 'from-pink-600 via-rose-600 to-purple-900',
    },
  ]);

  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [newCard, setNewCard] = useState({
    cardNumber: '',
    holder: '',
    exp: '',
    cvv: '',
    brand: 'VISA',
  });

  // Speed-Buy Flash Sale Optimizations
  const [speedSettings, setSpeedSettings] = useState({
    autoFillBuyer: true,
    oneTapReserve: true,
    soundAlerts: true,
    browserPush: true,
    preheatSocket: true,
  });

  // Security & 2FA State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [pingLatency, setPingLatency] = useState<number | null>(18);
  const [isTestingPing, setIsTestingPing] = useState(false);

  // Sessions list
  const [sessions, setSessions] = useState([
    {
      id: 's1',
      device: 'MacBook Pro 16" (macOS Sequoia)',
      browser: 'Chrome 128.0.0',
      location: 'Hà Nội, Việt Nam (IP: 118.70.12.84)',
      current: true,
      lastActive: 'Đang hoạt động',
    },
    {
      id: 's2',
      device: 'iPhone 15 Pro Max (iOS 18.1)',
      browser: 'TicketRush Native WebApp',
      location: 'TP. Hồ Chí Minh, Việt Nam (IP: 14.161.40.10)',
      current: false,
      lastActive: '45 phút trước',
    },
  ]);

  // Handle Save Profile
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setTimeout(() => {
      setIsSavingProfile(false);
      setSaveSuccessMsg(true);
      addNotification({
        title: 'Cập nhật hồ sơ thành công',
        message: 'Thông tin cá nhân & định danh vé chính chủ đã được mã hóa an toàn.',
        category: 'SECURITY',
      });
      setTimeout(() => setSaveSuccessMsg(false), 3500);
    }, 600);
  };

  // Handle Add Card
  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCard.cardNumber || newCard.cardNumber.length < 15) return;

    const brand = newCard.cardNumber.startsWith('4')
      ? 'VISA'
      : newCard.cardNumber.startsWith('5')
      ? 'MASTERCARD'
      : 'JCB';

    const cardObj = {
      id: 'c_' + Date.now(),
      brand,
      last4: newCard.cardNumber.slice(-4),
      holder: newCard.holder.toUpperCase() || 'TRAN MINH QUAN',
      exp: newCard.exp || '12/29',
      isDefault: cards.length === 0,
      bank: `${brand} Priority International`,
      color:
        brand === 'VISA'
          ? 'from-blue-600 via-indigo-700 to-slate-900'
          : 'from-amber-600 via-rose-700 to-slate-950',
    };

    setCards([...cards, cardObj]);
    setShowAddCardModal(false);
    setNewCard({ cardNumber: '', holder: '', exp: '', cvv: '', brand: 'VISA' });
    addNotification({
      title: 'Đã thêm phương thức thanh toán',
      message: `Thẻ ${brand} đuôi •••• ${cardObj.last4} đã sẵn sàng cho flash-sale.`,
      category: 'ORDER',
    });
  };

  // Handle Remove Card
  const handleRemoveCard = (id: string) => {
    setCards(cards.filter((c) => c.id !== id));
    addNotification({
      title: 'Đã gỡ thẻ thanh toán',
      message: 'Phương thức thanh toán đã được loại bỏ khỏi danh sách.',
      category: 'SECURITY',
    });
  };

  // Set Default Card
  const handleSetDefault = (id: string) => {
    setCards(cards.map((c) => ({ ...c, isDefault: c.id === id })));
    addNotification({
      title: 'Đã thay đổi thẻ mặc định',
      message: 'Thẻ này sẽ được ưu tiên tự động trừ tiền khi mua vé tốc độ cao.',
      category: 'ORDER',
    });
  };

  // Ping test
  const handleTestPing = () => {
    setIsTestingPing(true);
    setTimeout(() => {
      const ms = Math.floor(Math.random() * 12) + 12; // 12-24ms
      setPingLatency(ms);
      setIsTestingPing(false);
    }, 700);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 animate-in fade-in duration-300">
      {/* Top Breadcrumb & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-1">
            <button
              onClick={onNavigateToEvents}
              className="hover:text-indigo-400 transition"
            >
              Trang Chủ
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-bold">Hồ Sơ & Cài Đặt Tài Khoản</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
            Trung Tâm Tài Khoản & Định Danh
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <BadgeCheck className="w-3.5 h-3.5" />
              KYC ĐÃ XÁC THỰC
            </span>
          </h1>
        </div>

        {/* Quick Links */}
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateToTickets}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500 text-xs font-bold text-slate-200 hover:text-white transition shadow-sm"
          >
            <Ticket className="w-4 h-4 text-emerald-400" />
            <span>Ví Vé Của Tôi</span>
          </button>
          <button
            onClick={onNavigateToEvents}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition shadow-lg shadow-indigo-600/20"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>Săn Vé Sự Kiện</span>
          </button>
        </div>
      </div>

      {/* Profile Hero Overview Card */}
      <div className="mt-6 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800/90 shadow-2xl relative overflow-hidden">
        {/* Glow background accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-5">
            <div className="relative shrink-0">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-amber-500 via-rose-600 to-indigo-600 p-1 shadow-xl shadow-rose-600/20">
                <div className="w-full h-full bg-slate-950 rounded-[22px] flex items-center justify-center text-white font-black text-2xl sm:text-3xl">
                  {profileData.fullName.charAt(0)}
                </div>
              </div>
              <span className="absolute -bottom-1 -right-1 p-1 rounded-full bg-emerald-500 text-slate-950 border-2 border-slate-950" title="Đã xác thực CCCD">
                <ShieldCheck className="w-4 h-4" />
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-white">{profileData.fullName}</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-black flex items-center gap-1 font-mono">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  VIP DIAMOND
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-1 flex items-center gap-2">
                <span>{profileData.email}</span>
                <span className="text-slate-600">•</span>
                <span>{profileData.phone}</span>
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="font-medium">Chính sách vé danh định: Hợp lệ check-in tại cổng điện tử QR</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 shrink-0">
            <div className="text-center px-2">
              <div className="text-lg font-black text-white font-mono">12</div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Vé Đã Mua</div>
            </div>
            <div className="text-center px-2 border-l border-slate-800">
              <div className="text-lg font-black text-emerald-400 font-mono">2</div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Sắp Diễn Ra</div>
            </div>
            <div className="text-center px-2 border-l border-slate-800">
              <div className="text-lg font-black text-amber-400 font-mono">1,450</div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Rush Points</div>
            </div>
            <div className="text-center px-2 border-l border-slate-800">
              <div className="text-lg font-black text-indigo-400 font-mono">94%</div>
              <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Tỷ Lệ Giữ Chỗ</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout: Left Tab Sidebar + Right Tab Content */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start w-full">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-2 bg-slate-900/60 p-3 rounded-3xl border border-slate-800/80 sticky top-28">
          <div className="px-3 py-2 text-[11px] font-mono text-slate-500 uppercase tracking-wider font-bold">
            Mục Quản Lý
          </div>

          <button
            onClick={() => setActiveTab('identity')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
              activeTab === 'identity'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-indigo-300" />
              <span>Hồ Sơ & Định Danh KYC</span>
            </div>
            <BadgeCheck className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            onClick={() => setActiveTab('payment')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
              activeTab === 'payment'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <CreditCard className="w-4 h-4 text-amber-300" />
              <span>Phương Thức Thanh Toán</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {cards.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('speed_buy')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
              activeTab === 'speed_buy'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-rose-400" />
              <span>Tối Ưu Tốc Độ Flash-Sale</span>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
              activeTab === 'security'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-emerald-300" />
              <span>Bảo Mật & Phiên Đăng Nhập</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
              2FA ON
            </span>
          </button>

          <button
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
              activeTab === 'orders'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>Lịch Sử Đơn Hàng & VAT</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
              activeTab === 'notifications'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-purple-400" />
              <span>Cài Đặt Nhận Tin & Chuông</span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold transition ${
              activeTab === 'appearance'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <Sun className="w-4 h-4 text-amber-400" />
              <span>Giao Diện Sáng & Tối</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {theme === 'light' ? 'Sáng' : theme === 'dark' ? 'Tối' : 'Auto'}
            </span>
          </button>

          {/* Gate Latency Indicator */}
          <div className="mt-4 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-400 font-medium">Gateway Latency:</span>
              <span className="text-emerald-400 font-mono font-black flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                {pingLatency} ms
              </span>
            </div>
            <button
              onClick={handleTestPing}
              disabled={isTestingPing}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-[11px] font-bold transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingPing ? 'animate-spin' : ''}`} />
              <span>Kiểm Tra Độ Trễ Săn Vé</span>
            </button>
          </div>
        </div>

        {/* Tab Content Area */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6 min-w-0">
          {/* TAB 1: IDENTITY & KYC */}
          {activeTab === 'identity' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-sm shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    Thông Tin Cá Nhân & Định Danh (Nominal KYC)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Vé flash-sale concert tại TicketRush được liên kết với số định danh (CCCD) để ngăn chặn đầu cơ vé và bảo vệ người hâm mộ thực thụ.
                  </p>
                </div>
                {saveSuccessMsg && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4" />
                    Đã lưu thành công!
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveProfile} className="mt-6 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-400 mb-2">
                      Họ và Tên (Theo CCCD / Hộ chiếu) *
                    </label>
                    <input
                      type="text"
                      value={profileData.fullName}
                      onChange={(e) =>
                        setProfileData({ ...profileData, fullName: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-indigo-500 focus:outline-none transition font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-400 mb-2">
                      Số Căn Cước Công Dân / Hộ Chiếu (Nominal ID) *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={profileData.idNumber}
                        onChange={(e) =>
                          setProfileData({ ...profileData, idNumber: e.target.value })
                        }
                        className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-emerald-400 text-sm font-mono focus:border-indigo-500 focus:outline-none transition"
                        required
                      />
                      <span className="absolute right-3.5 top-3.5 text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        VERIFIED
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-400 mb-2">
                      Số Điện Thoại (Nhận mã vé OTP) *
                    </label>
                    <input
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) =>
                        setProfileData({ ...profileData, phone: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:border-indigo-500 focus:outline-none transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-400 mb-2">
                      Địa Chỉ Email (Nhận vé điện tử PDF) *
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) =>
                        setProfileData({ ...profileData, email: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-indigo-500 focus:outline-none transition"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-400 mb-2">
                      Ngày Sinh (Độ tuổi hợp lệ xem show)
                    </label>
                    <input
                      type="date"
                      value={profileData.dob}
                      onChange={(e) =>
                        setProfileData({ ...profileData, dob: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-indigo-500 focus:outline-none transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-slate-400 mb-2">
                      Quốc Tịch
                    </label>
                    <input
                      type="text"
                      value={profileData.nationality}
                      onChange={(e) =>
                        setProfileData({ ...profileData, nationality: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-indigo-500 focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-slate-400 mb-2">
                    Địa Chỉ Gửi Quà Lưu Niệm & Vé Cứng (Vật phẩm Merch VIP)
                  </label>
                  <input
                    type="text"
                    value={profileData.address}
                    onChange={(e) =>
                      setProfileData({ ...profileData, address: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white text-sm focus:border-indigo-500 focus:outline-none transition"
                  />
                </div>

                <div className="pt-4 flex items-center justify-between border-t border-slate-800">
                  <p className="text-xs text-slate-500">
                    Dữ liệu cá nhân được mã hóa AES-256 tuân thủ chuẩn an toàn dữ liệu ISO 27001.
                  </p>
                  <button
                    type="submit"
                    disabled={isSavingProfile}
                    className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isSavingProfile ? 'Đang Lưu...' : 'Lưu Thay Đổi'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: PAYMENT METHODS & WALLET */}
          {activeTab === 'payment' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-sm shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    Phương Thức Thanh Toán Đã Lưu
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Liên kết sẵn thẻ thanh toán quốc tế và ví điện tử giúp bạn hoàn tất giao dịch trong vòng 1-click trước khi vé hết hạn giữ chỗ (5 phút).
                  </p>
                </div>
                <button
                  onClick={() => setShowAddCardModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>Thêm Thẻ Mới</span>
                </button>
              </div>

              {/* Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    className={`p-6 rounded-3xl bg-gradient-to-br ${card.color} border ${
                      card.isDefault ? 'border-amber-400/80 shadow-lg shadow-amber-500/10' : 'border-slate-800'
                    } relative text-white flex flex-col justify-between h-52 transition-transform hover:-translate-y-1`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[11px] font-mono uppercase tracking-wider text-slate-300 font-bold">
                          {card.bank}
                        </span>
                        <div className="text-lg font-black tracking-widest mt-1">
                          {card.brand}
                        </div>
                      </div>
                      {card.isDefault ? (
                        <span className="px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow">
                          Mặc định Flash-sale
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetDefault(card.id)}
                          className="text-[11px] font-bold text-slate-300 hover:text-white underline decoration-slate-400"
                        >
                          Đặt làm mặc định
                        </button>
                      )}
                    </div>

                    <div className="font-mono text-xl tracking-widest text-slate-100">
                      •••• •••• •••• {card.last4}
                    </div>

                    <div className="flex items-end justify-between text-xs">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-300 block">Chủ thẻ</span>
                        <span className="font-mono font-bold">{card.holder}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider text-slate-300 block">Hết hạn</span>
                        <span className="font-mono font-bold">{card.exp}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveCard(card.id)}
                        className="p-2 rounded-xl bg-slate-950/40 hover:bg-rose-500/80 text-slate-300 hover:text-white transition"
                        title="Xóa phương thức thanh toán"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Security info banner */}
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3 text-xs text-slate-400">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  TicketRush không lưu mã CVV/CVC. Mọi thông tin thẻ được token hóa theo tiêu chuẩn bảo mật thanh toán{' '}
                  <strong className="text-slate-200">PCI-DSS Cấp Độ 1</strong> và hỗ trợ xác thực sinh trắc học 3D-Secure 2.0.
                </span>
              </div>

              {/* Add card modal dialog */}
              {showAddCardModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
                  <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                      <h4 className="font-black text-white text-base">Thêm Thẻ Thanh Toán Mới</h4>
                      <button
                        onClick={() => setShowAddCardModal(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>

                    <form onSubmit={handleAddCard} className="space-y-4 text-xs">
                      <div>
                        <label className="block text-slate-400 mb-1 font-mono uppercase">Số Thẻ (16 số) *</label>
                        <input
                          type="text"
                          maxLength={19}
                          placeholder="4242 •••• •••• 4242"
                          value={newCard.cardNumber}
                          onChange={(e) => setNewCard({ ...newCard, cardNumber: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1 font-mono uppercase">Tên In Trên Thẻ *</label>
                        <input
                          type="text"
                          placeholder="TRAN MINH QUAN"
                          value={newCard.holder}
                          onChange={(e) => setNewCard({ ...newCard, holder: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-400 mb-1 font-mono uppercase">Hết Hạn (MM/YY) *</label>
                          <input
                            type="text"
                            maxLength={5}
                            placeholder="12/28"
                            value={newCard.exp}
                            onChange={(e) => setNewCard({ ...newCard, exp: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-slate-400 mb-1 font-mono uppercase">CVV/CVC *</label>
                          <input
                            type="password"
                            maxLength={4}
                            placeholder="•••"
                            value={newCard.cvv}
                            onChange={(e) => setNewCard({ ...newCard, cvv: e.target.value })}
                            className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                            required
                          />
                        </div>
                      </div>

                      <div className="pt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddCardModal(false)}
                          className="px-4 py-2 rounded-xl text-slate-400 hover:bg-slate-800 font-bold"
                        >
                          Hủy
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow"
                        >
                          Lưu Thẻ
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SPEED BUY OPTIMIZATION */}
          {activeTab === 'speed_buy' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-sm shadow-xl space-y-6">
              <div className="pb-6 border-b border-slate-800">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />
                  Cấu Hình Tối Ưu Tốc Độ Săn Vé Flash-Sale (Speed-Buy)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Khi mở bán concert với hàng chục nghìn lượt truy cập/giây, từng 100 mili-giây đều quyết định. Hãy kích hoạt các tùy chọn sau để giành vé ngay khi cổng phòng chờ mở.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm">Tự Động Điền Thông Tin Người Đặt (Auto-fill)</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Tự động điền Họ tên, CCCD, Email, SĐT vào form giữ chỗ mà không cần gõ bàn phím.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={speedSettings.autoFillBuyer}
                      onChange={(e) =>
                        setSpeedSettings({ ...speedSettings, autoFillBuyer: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm">Chế Độ Giữ Chỗ 1 Chạm (1-Tap Fast Reserve)</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Bỏ qua màn hình xem trước để gửi ngay lệnh giữ chỗ có Idempotency-Key tới hệ thống trong 150ms.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={speedSettings.oneTapReserve}
                      onChange={(e) =>
                        setSpeedSettings({ ...speedSettings, oneTapReserve: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm">Âm Thanh Báo Động & Haptic Feedback Khi Vào Lượt</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Phát âm thanh chuông lớn và rung máy ngay khi vị trí phòng chờ của bạn đạt #1 để bạn không bỏ lỡ.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={speedSettings.soundAlerts}
                      onChange={(e) =>
                        setSpeedSettings({ ...speedSettings, soundAlerts: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>

                <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm">Giữ Ấm Kết Nối WebSocket & Redis Cache</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Duy trì kết nối Heartbeat liên tục trước giờ mở bán 5 phút để tránh nghẽn bắt tay TLS handshake.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={speedSettings.preheatSocket}
                      onChange={(e) =>
                        setSpeedSettings({ ...speedSettings, preheatSocket: e.target.checked })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SECURITY & SESSIONS */}
          {activeTab === 'security' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-sm shadow-xl space-y-6">
              <div className="pb-6 border-b border-slate-800">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Bảo Mật Tài Khoản & Quản Lý Phiên Đăng Nhập
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Đảm bảo chỉ có bạn mới có quyền đặt vé và truy cập mã QR check-in tại cổng sự kiện.
                </p>
              </div>

              {/* 2FA Section */}
              <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-white text-sm">Xác Thực Hai Yếu Tố (2FA Authenticator)</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-bold">
                      ĐANG BẬT
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Bảo vệ chống chiếm quyền tài khoản khi tài khoản có vé VIP giá trị cao.
                  </p>
                </div>

                <button
                  onClick={() => setShowTwoFactorSetup(!showTwoFactorSetup)}
                  className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs font-bold text-slate-200 transition"
                >
                  {showTwoFactorSetup ? 'Đóng cấu hình' : 'Xem mã khóa bí mật'}
                </button>
              </div>

              {showTwoFactorSetup && (
                <div className="p-5 rounded-2xl bg-slate-950 border border-indigo-500/30 text-xs space-y-3 animate-in fade-in">
                  <p className="text-slate-300">
                    Quét mã QR bằng ứng dụng Google Authenticator hoặc nhập khóa thủ công:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-amber-300 font-mono text-sm tracking-wider">
                      JBSW Y3DP EHPK 3PXP
                    </code>
                    <button
                      onClick={() => {
                        setCopiedKey(true);
                        setTimeout(() => setCopiedKey(false), 2000);
                      }}
                      className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                    >
                      {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Active Sessions */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-mono uppercase text-slate-400 font-bold">
                  Thiết Bị Đang Đăng Nhập
                </h4>
                {sessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-slate-300">
                        {sess.device.includes('iPhone') ? (
                          <Smartphone className="w-5 h-5 text-indigo-400" />
                        ) : (
                          <Laptop className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs truncate">{sess.device}</span>
                          {sess.current && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold shrink-0">
                              Thiết bị này
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                          {sess.browser} • {sess.location} • {sess.lastActive}
                        </p>
                      </div>
                    </div>

                    {!sess.current && (
                      <button
                        onClick={() => {
                          setSessions(sessions.filter((s) => s.id !== sess.id));
                          addNotification({
                            title: 'Đã thu hồi phiên',
                            message: `Đã đăng xuất thiết bị ${sess.device}`,
                            category: 'SECURITY',
                          });
                        }}
                        className="p-2 rounded-xl text-rose-400 hover:text-white hover:bg-rose-500/20 transition text-xs font-bold"
                        title="Đăng xuất thiết bị này"
                      >
                        Đăng xuất
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: ORDERS & VAT INVOICES */}
          {activeTab === 'orders' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-sm shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-800 gap-4">
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    Lịch Sử Giao Dịch & Hóa Đơn Điện Tử VAT
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Xem lại toàn bộ các giao dịch đã thanh toán, tải hóa đơn GTGT điện tử và theo dõi trạng thái bảo hành vé.
                  </p>
                </div>
                <button
                  onClick={onNavigateToTickets}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white transition shadow"
                >
                  <Ticket className="w-4 h-4 text-amber-300" />
                  <span>Mở Ví Vé Đã Mua</span>
                </button>
              </div>

              {/* Orders Mini Table */}
              <div className="space-y-3">
                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-xs">
                        ORD-2026-881920
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        ĐÃ THANH TOÁN
                      </span>
                    </div>
                    <h5 className="font-black text-white text-sm mt-1">
                      Taylor Swift | The Eras Tour Stadium Live
                    </h5>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      2x VIP Diamond Floor • Khán Đài A • Hàng F Ghế 12, 14
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-black text-emerald-400 font-mono">
                        {formatCurrency(9600000)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">18/10/2026 10:04</div>
                    </div>
                    <button
                      onClick={onNavigateToTickets}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs text-slate-200 font-bold"
                    >
                      Xem Vé
                    </button>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-xs">
                        ORD-2026-773412
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        ĐÃ THANH TOÁN
                      </span>
                    </div>
                    <h5 className="font-black text-white text-sm mt-1">
                      League of Legends World Finals 2026
                    </h5>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      1x Standard Tier • Khán Đài C • Hàng C Ghế 08
                    </p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-black text-emerald-400 font-mono">
                        {formatCurrency(1200000)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">12/09/2026 19:22</div>
                    </div>
                    <button
                      onClick={onNavigateToTickets}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-slate-600 text-xs text-slate-200 font-bold"
                    >
                      Xem Vé
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-sm shadow-xl space-y-6">
              <div className="pb-6 border-b border-slate-800">
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Bell className="w-5 h-5 text-purple-400" />
                  Cài Đặt Kênh Nhận Tin & Thông Báo Flash-Sale
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Nhận tin nhắn sớm trước khi đợt mở bán bắt đầu để chuẩn bị sẵn vị trí trong hàng đợi.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm">Tin Nhắn SMS Nhắc Giờ Mở Bán (Flash-sale Alert)</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Gửi SMS trước 15 phút khi sự kiện ca sĩ bạn yêu thích mở bán.
                    </p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-5 h-5 accent-indigo-600" />
                </div>

                <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm">Email Xác Nhận Giao Dịch & Vé QR</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Tự động đính kèm file PDF vé check-in ngay sau khi thanh toán thành công.
                    </p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-5 h-5 accent-indigo-600" />
                </div>

                <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-bold text-white text-sm">Cảnh Báo Đăng Nhập Từ Thiết Bị Mới</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Thông báo ngay lập tức nếu có ai đăng nhập tài khoản từ vị trí hoặc địa chỉ IP lạ.
                    </p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-5 h-5 accent-indigo-600" />
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: APPEARANCE (GIAO DIỆN SÁNG & TỐI) */}
          {activeTab === 'appearance' && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-sm shadow-xl space-y-8 animate-in fade-in duration-150">
              <div className="pb-6 border-b border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                      <Sun className="w-5 h-5 text-amber-400" />
                      Tùy Biến Giao Diện Sáng & Giao Diện Tối
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Chọn phong cách hiển thị phù hợp với điều kiện ánh sáng và sở thích cá nhân khi săn vé flash-sale.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-xs font-mono text-indigo-300">
                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                    <span>Đang áp dụng: {resolvedTheme === 'dark' ? '🌙 Chế độ Tối' : '☀️ Chế độ Sáng'}</span>
                  </div>
                </div>
              </div>

              {/* Theme Mode Selector Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Dark Mode Card */}
                <button
                  type="button"
                  onClick={() => {
                    setTheme('dark');
                    addNotification({
                      title: 'Đã chuyển sang Giao Diện Tối',
                      message: 'Chế độ nền tối chuẩn Cyberpunk đã được áp dụng.',
                      category: 'SYSTEM',
                    });
                  }}
                  className={`text-left p-5 rounded-2xl border transition relative flex flex-col justify-between group ${
                    theme === 'dark'
                      ? 'bg-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-2 ring-indigo-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/40'
                  }`}
                >
                  <div>
                    {/* Visual Card Preview */}
                    <div className="w-full h-24 rounded-xl bg-slate-950 border border-slate-800 p-2.5 flex flex-col justify-between mb-4 overflow-hidden shadow-inner">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        </div>
                        <span className="text-[9px] font-mono text-indigo-400 bg-indigo-950/80 px-1.5 py-0.5 rounded border border-indigo-800/40">
                          Dark UI
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 w-2/3 bg-slate-800 rounded"></div>
                        <div className="h-2 w-1/2 bg-indigo-950 rounded"></div>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-slate-850">
                        <div className="h-2 w-8 bg-indigo-600 rounded"></div>
                        <div className="h-2 w-12 bg-slate-800 rounded"></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-black text-white text-sm flex items-center gap-2">
                        <Moon className="w-4 h-4 text-indigo-400" />
                        Giao Diện Tối
                      </span>
                      {theme === 'dark' && (
                        <Check className="w-4 h-4 text-indigo-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Nền đen sâu tối ưu OLED, độ tương phản sắc nét, giảm mỏi mắt khi tham gia các phiên săn vé đêm muộn.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] font-mono text-slate-500 flex items-center justify-between">
                    <span>Mặc định TicketRush</span>
                    <span className="text-indigo-400 font-bold group-hover:translate-x-0.5 transition-transform">
                      {theme === 'dark' ? '✓ Đang kích hoạt' : 'Chọn ngay →'}
                    </span>
                  </div>
                </button>

                {/* Light Mode Card */}
                <button
                  type="button"
                  onClick={() => {
                    setTheme('light');
                    addNotification({
                      title: 'Đã chuyển sang Giao Diện Sáng',
                      message: 'Chế độ nền sáng sạch sẽ, tối ưu đọc ban ngày đã được kích hoạt.',
                      category: 'SYSTEM',
                    });
                  }}
                  className={`text-left p-5 rounded-2xl border transition relative flex flex-col justify-between group ${
                    theme === 'light'
                      ? 'bg-slate-900 border-amber-500 shadow-xl shadow-amber-500/10 ring-2 ring-amber-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/40'
                  }`}
                >
                  <div>
                    {/* Visual Card Preview */}
                    <div className="w-full h-24 rounded-xl bg-slate-100 border border-slate-300 p-2.5 flex flex-col justify-between mb-4 overflow-hidden shadow-inner text-slate-900">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                          <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        </div>
                        <span className="text-[9px] font-mono text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                          Light UI
                        </span>
                      </div>
                      <div className="space-y-1">
                        <div className="h-2 w-2/3 bg-slate-300 rounded"></div>
                        <div className="h-2 w-1/2 bg-amber-200 rounded"></div>
                      </div>
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200">
                        <div className="h-2 w-8 bg-indigo-600 rounded"></div>
                        <div className="h-2 w-12 bg-slate-300 rounded"></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-black text-white text-sm flex items-center gap-2">
                        <Sun className="w-4 h-4 text-amber-400" />
                        Giao Diện Sáng
                      </span>
                      {theme === 'light' && (
                        <Check className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Nền trắng xám ngọc hiện đại, tối ưu độ sáng tự nhiên và đọc thông tin ghế ngồi rõ nét vào ban ngày.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] font-mono text-slate-500 flex items-center justify-between">
                    <span>Đọc báo & công sở</span>
                    <span className="text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform">
                      {theme === 'light' ? '✓ Đang kích hoạt' : 'Chọn ngay →'}
                    </span>
                  </div>
                </button>

                {/* System Mode Card */}
                <button
                  type="button"
                  onClick={() => {
                    setTheme('system');
                    addNotification({
                      title: 'Đã kích hoạt chế độ Tự Động',
                      message: 'Giao diện sẽ tự động chuyển đổi theo cài đặt hệ điều hành máy tính/điện thoại.',
                      category: 'SYSTEM',
                    });
                  }}
                  className={`text-left p-5 rounded-2xl border transition relative flex flex-col justify-between group ${
                    theme === 'system'
                      ? 'bg-slate-900 border-sky-500 shadow-xl shadow-sky-500/10 ring-2 ring-sky-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/40'
                  }`}
                >
                  <div>
                    {/* Visual Card Preview */}
                    <div className="w-full h-24 rounded-xl bg-gradient-to-r from-slate-950 to-slate-100 border border-slate-700 p-2.5 flex flex-col justify-between mb-4 overflow-hidden shadow-inner">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                          <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                        </div>
                        <span className="text-[9px] font-mono text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/40">
                          Auto OS
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 px-2">
                        <span>🌙 Tối</span>
                        <span>☀️ Sáng</span>
                      </div>
                      <div className="flex justify-center items-center">
                        <Laptop className="w-4 h-4 text-sky-400" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-black text-white text-sm flex items-center gap-2">
                        <Laptop className="w-4 h-4 text-sky-400" />
                        Theo Hệ Thống
                      </span>
                      {theme === 'system' && (
                        <Check className="w-4 h-4 text-sky-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Tự động chuyển đổi mượt mà theo Dark/Light Mode của hệ điều hành macOS, Windows, iOS hoặc Android.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] font-mono text-slate-500 flex items-center justify-between">
                    <span>Đồng bộ OS</span>
                    <span className="text-sky-400 font-bold group-hover:translate-x-0.5 transition-transform">
                      {theme === 'system' ? '✓ Đang kích hoạt' : 'Chọn ngay →'}
                    </span>
                  </div>
                </button>
              </div>

              {/* Real-time Theme Demonstration Panel */}
              <div className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h4 className="font-bold text-white text-sm">Xem Trước Các Phần Tử Giao Diện Thời Gian Thực</h4>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Chế độ: <strong className="text-white">{resolvedTheme.toUpperCase()}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                      Thẻ Sự Kiện Mở Bán
                    </div>
                    <div className="font-black text-white text-sm">Taylor Swift | The Eras Tour</div>
                    <div className="text-xs text-emerald-400 font-mono mt-1">9.900 ₫ · Còn 150 vé</div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                      Nút Tác Vụ Chính
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold"
                      >
                        Giữ Chỗ Ngay
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold"
                      >
                        Phòng Chờ
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-[11px] text-slate-400 uppercase font-bold tracking-wider mb-1">
                      Huy Hiệu & Trạng Thái
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                        ĐÃ XÁC THỰC
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                        VÉ VIP 01
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
