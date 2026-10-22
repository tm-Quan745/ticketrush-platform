import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  User as UserIcon,
  CreditCard,
  Shield,
  Zap,
  CheckCircle2,
  Lock,
  Plus,
  Trash2,
  Smartphone,
  Mail,
  BellRing,
  Sun,
  Moon,
  Laptop,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, isAdmin, loginAsAdmin, loginAsUser } = useAuth();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'profile' | 'payments' | 'speed_checkout' | 'security' | 'appearance'>('profile');

  // Editable Profile fields
  const [fullName, setFullName] = useState('Trần Minh Quân');
  const [phone, setPhone] = useState('+84 988 123 456');
  const [idNumber, setIdNumber] = useState('001202008912'); // CCCD for ticket check-in verification
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Saved Payment cards (Mock local store)
  const [cards, setCards] = useState([
    { id: 'c1', type: 'VISA', last4: '4242', exp: '12/28', isDefault: true },
    { id: 'c2', type: 'MASTERCARD', last4: '8819', exp: '08/29', isDefault: false },
    { id: 'c3', type: 'MOMO', last4: '0988***456', exp: 'Ví điện tử', isDefault: false },
  ]);

  // Flash-sale Speed Checkout Preferences
  const [autoFill, setAutoFill] = useState(true);
  const [skipReview, setSkipReview] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(true);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleDeleteCard = (cardId: string) => {
    setCards((prev) => prev.filter((c) => c.id !== cardId));
  };

  const handleSetDefaultCard = (cardId: string) => {
    setCards((prev) =>
      prev.map((c) => ({
        ...c,
        isDefault: c.id === cardId,
      }))
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-12 flex items-center justify-center animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-rose-600 flex items-center justify-center text-white font-black text-lg shadow-lg">
              {fullName.charAt(0)}
            </div>
            <div>
              <h3 className="font-black text-white text-lg flex items-center gap-2">
                Hồ Sơ & Cài Đặt Tài Khoản
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                  {user?.role === 'ADMIN' ? 'QUẢN TRỊ VIÊN' : 'THÀNH VIÊN VIP'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-mono">{user?.email || 'user@ticketrush.dev'}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 border-b border-slate-800 bg-slate-950/40 flex items-center gap-2 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3.5 px-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Thông Tin Cá Nhân</span>
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`py-3.5 px-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'payments'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Thẻ & Phương Thức Chi Trả</span>
          </button>
          <button
            onClick={() => setActiveTab('speed_checkout')}
            className={`py-3.5 px-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'speed_checkout'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Tối Ưu Săn Vé Flash-Sale</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-3.5 px-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'security'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Bảo Mật & Phân Quyền</span>
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            className={`py-3.5 px-3 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'appearance'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Sun className="w-4 h-4 text-amber-400" />
            <span>Giao Diện</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {savedSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-700/80 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>Dữ liệu hồ sơ đã được lưu trữ an toàn vào hệ thống xác thực.</span>
            </div>
          )}

          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Họ và Tên (In trên vé điện tử)
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Email nhận vé & hóa đơn
                  </label>
                  <input
                    type="email"
                    value={user?.email || 'user@ticketrush.dev'}
                    disabled
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/50 border border-slate-800 text-slate-400 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Số Điện Thoại (Nhận mã OTP)
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Số CCCD / Hộ Chiếu (Đồng bộ định danh vào cửa)
                  </label>
                  <input
                    type="text"
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition"
                >
                  Lưu Thông Tin Cá Nhân
                </button>
              </div>
            </form>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-white">Phương Thức Thanh Toán Lưu Trữ</h4>
                  <p className="text-xs text-slate-400">
                    Sử dụng để thanh toán tức thì trong thời hạn 10 phút giữ vé (TTL)
                  </p>
                </div>
                <button
                  onClick={() => alert('Thêm thẻ mới: Hỗ trợ tích hợp cổng thanh toán 3D-Secure.')}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm Thẻ Mới
                </button>
              </div>

              <div className="space-y-2.5">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-indigo-400 font-mono font-bold text-xs">
                        {c.type}
                      </div>
                      <div>
                        <div className="font-mono font-bold text-xs text-white flex items-center gap-2">
                          •••• •••• •••• {c.last4}
                          {c.isDefault && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                              Mặc Định
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">Hết hạn: {c.exp}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!c.isDefault && (
                        <button
                          onClick={() => handleSetDefaultCard(c.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        >
                          Đặt làm mặc định
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteCard(c.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'speed_checkout' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Cấu Hình Tối Ưu Săn Flash-Sale Tốc Độ Cao
                </h4>
                <p className="text-xs text-slate-400">
                  Rút ngắn thao tác đặt vé xuống còn 1 click duy nhất trong các sự kiện nghẽn mạng
                </p>
              </div>

              <div className="space-y-3">
                <label className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition">
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs text-white block">
                      Tự động điền Idempotency Key & Thông tin người mua
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Tránh trùng lặp đơn hàng và không phải nhập lại form khi mạng chập chờn
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoFill}
                    onChange={(e) => setAutoFill(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                </label>

                <label className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition">
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs text-white block">
                      Bỏ qua bước xác nhận phụ (One-Click Hold)
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Gửi yêu cầu giữ chỗ ngay lập tức khi click vào ghế trên khán đài
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={skipReview}
                    onChange={(e) => setSkipReview(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                </label>

                <label className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between cursor-pointer hover:border-slate-700 transition">
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs text-white block">
                      Âm thanh đếm ngược millisecond & Rung khi mở bán
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      Phát tín hiệu chuông cảnh báo trước 10 giây khi cổng flash-sale mở cửa
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={soundAlerts}
                    onChange={(e) => setSoundAlerts(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-0 bg-slate-900 border-slate-700"
                  />
                </label>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-sm text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Bảo Mật Phiên & Quyền Truy Cập
                </h4>
                <p className="text-xs text-slate-400">
                  Chuyển đổi vai trò người dùng kiểm thử hoặc đăng xuất phiên an toàn
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-bold text-white block">Chế Độ Tài Khoản Thử Nghiệm</span>
                    <span className="text-slate-400 block text-[11px]">
                      Hiện tại bạn đang ở vai trò: {user?.role}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loginAsUser}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        !isAdmin ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Demo User
                    </button>
                    <button
                      onClick={loginAsAdmin}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        isAdmin ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      Admin
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">Thiết Lập Chế Độ Giao Diện (Theme)</h3>
                <p className="text-xs text-slate-400">
                  Lựa chọn giao diện sáng, tối hoặc tự động đồng bộ theo hệ thống thiết bị.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between ${
                    theme === 'dark'
                      ? 'bg-slate-950 border-indigo-500 ring-2 ring-indigo-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <Moon className="w-5 h-5 text-indigo-400" />
                    {theme === 'dark' && <CheckCircle2 className="w-4 h-4 text-indigo-400" />}
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs mb-1">Giao Diện Tối</div>
                    <div className="text-[11px] text-slate-400">Nền tối OLED tương phản cao</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between ${
                    theme === 'light'
                      ? 'bg-slate-950 border-amber-500 ring-2 ring-amber-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <Sun className="w-5 h-5 text-amber-400" />
                    {theme === 'light' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs mb-1">Giao Diện Sáng</div>
                    <div className="text-[11px] text-slate-400">Nền sáng dịu mắt, dễ đọc</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`p-4 rounded-2xl border text-left transition flex flex-col justify-between ${
                    theme === 'system'
                      ? 'bg-slate-950 border-sky-500 ring-2 ring-sky-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <Laptop className="w-5 h-5 text-sky-400" />
                    {theme === 'system' && <CheckCircle2 className="w-4 h-4 text-sky-400" />}
                  </div>
                  <div>
                    <div className="font-bold text-white text-xs mb-1">Theo Hệ Thống</div>
                    <div className="text-[11px] text-slate-400">Tự động đồng bộ với OS</div>
                  </div>
                </button>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs flex items-center justify-between">
                <span className="text-slate-400">Trạng thái hiện thời:</span>
                <span className="font-mono font-bold text-indigo-400">
                  {resolvedTheme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'} ({theme === 'system' ? 'Tự động' : 'Thủ công'})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>Phiên đăng nhập JWT được mã hóa RSA-256</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
          >
            Đóng Cửa Sổ
          </button>
        </div>
      </div>
    </div>
  );
};
