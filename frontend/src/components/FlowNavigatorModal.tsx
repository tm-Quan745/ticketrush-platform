import React, { useState } from 'react';
import {
  X,
  GitBranch,
  Ticket,
  ShieldCheck,
  QrCode,
  Cpu,
  ArrowRight,
  CheckCircle2,
  Users,
  Eye,
  Lock,
  Layers,
  Sparkles,
  Zap,
  Clock,
  Radio,
  FileCheck,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface FlowNavigatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: 'user_events' | 'event_detail' | 'waiting_room' | 'tickets' | 'profile' | 'admin') => void;
  onOpenGateScanner: () => void;
  onOpenArchitecture: () => void;
  onOpenConcurrency: () => void;
  onOpenHealth: () => void;
}

export const FlowNavigatorModal: React.FC<FlowNavigatorModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenGateScanner,
  onOpenArchitecture,
  onOpenConcurrency,
  onOpenHealth,
}) => {
  const { loginAsAdmin, loginAsUser, isAdmin } = useAuth();
  const [selectedTrack, setSelectedTrack] = useState<'buyer' | 'admin' | 'gate' | 'engineering'>('buyer');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400">
              <GitBranch className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">Sơ Đồ Phân Luồng Nghiệp Vụ TicketRush</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  4 Luồng Độc Lập
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Khám phá và trực tiếp tham gia vào các luồng vận hành của nền tảng bán vé chịu tải cao
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Track Selector Segmented Tabs */}
        <div className="flex items-center gap-2 px-6 pt-4 border-b border-slate-800/60 overflow-x-auto scrollbar-none bg-slate-900/60">
          <button
            onClick={() => setSelectedTrack('buyer')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              selectedTrack === 'buyer'
                ? 'border-indigo-500 text-indigo-400 bg-indigo-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Ticket className="w-4 h-4 text-amber-400" />
            <span>1. Luồng Khán Giả Mua Vé</span>
          </button>

          <button
            onClick={() => setSelectedTrack('admin')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              selectedTrack === 'admin'
                ? 'border-rose-500 text-rose-400 bg-rose-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-rose-400" />
            <span>2. Luồng Ban Tổ Chức & Admin</span>
          </button>

          <button
            onClick={() => setSelectedTrack('gate')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              selectedTrack === 'gate'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <QrCode className="w-4 h-4 text-emerald-400" />
            <span>3. Luồng Soát Vé Check-in Cổng</span>
          </button>

          <button
            onClick={() => setSelectedTrack('engineering')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition whitespace-nowrap ${
              selectedTrack === 'engineering'
                ? 'border-amber-500 text-amber-400 bg-amber-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4 text-amber-400" />
            <span>4. Luồng Thử Tải & Kỹ Thuật</span>
          </button>
        </div>

        {/* Modal Body: Active Track Details */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {selectedTrack === 'buyer' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                    Hành trình Khách hàng: Từ Khám Phá đến Check-in Tại Cổng
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Trải nghiệm mượt mà được bảo vệ bởi hàng đợi công bằng (Virtual Waiting Room), giữ chỗ nguyên tử (Atomic Hold) và mã QR động.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onNavigate('event_detail');
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition"
                  >
                    <span>Tham Gia Ngay</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Step Flow Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                      BƯỚC 01
                    </span>
                    <Eye className="w-4 h-4 text-slate-500" />
                  </div>
                  <h5 className="text-sm font-bold text-white">Khám Phá & Chọn Khán Đài</h5>
                  <p className="text-xs text-slate-400">
                    Xem mô phỏng sân vận động 3D, chọn khán đài CAT 1/VIP, theo dõi số lượng vé khả dụng thời gian thực.
                  </p>
                  <button
                    onClick={() => {
                      onNavigate('event_detail');
                      onClose();
                    }}
                    className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                  >
                    <span>Mở Sơ Đồ 3D</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
                      BƯỚC 02
                    </span>
                    <Users className="w-4 h-4 text-slate-500" />
                  </div>
                  <h5 className="text-sm font-bold text-white">Phòng Chờ Ảo Khi Flash-Sale</h5>
                  <p className="text-xs text-slate-400">
                    Khi lưu lượng vượt ngưỡng, hệ thống tự động đưa khán giả vào hàng đợi xếp số FIFO/Lottery công bằng.
                  </p>
                  <button
                    onClick={() => {
                      onNavigate('waiting_room');
                      onClose();
                    }}
                    className="mt-2 text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1"
                  >
                    <span>Vào Phòng Chờ Ảo</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                      BƯỚC 03
                    </span>
                    <Lock className="w-4 h-4 text-slate-500" />
                  </div>
                  <h5 className="text-sm font-bold text-white">Giữ Chỗ TTL & Thanh Toán</h5>
                  <p className="text-xs text-slate-400">
                    Khoá vé 10 phút, tự động hoàn trả kho nếu quá hạn. Thanh toán kèm mã Idempotency-Key chống trừ tiền kép.
                  </p>
                  <div className="text-[11px] text-slate-500 pt-1">
                    Bảo đảm Zero-Overselling
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                      BƯỚC 04
                    </span>
                    <Ticket className="w-4 h-4 text-slate-500" />
                  </div>
                  <h5 className="text-sm font-bold text-white">Ví Vé & QR Check-in</h5>
                  <p className="text-xs text-slate-400">
                    Nhận vé điện tử có mã QR bảo mật mã hoá kèm định danh CCCD chính chủ chống chụp màn hình bán lại.
                  </p>
                  <button
                    onClick={() => {
                      onNavigate('tickets');
                      onClose();
                    }}
                    className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1"
                  >
                    <span>Mở Ví Vé Của Bạn</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 relative">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                      BƯỚC 05
                    </span>
                    <QrCode className="w-4 h-4 text-slate-500" />
                  </div>
                  <h5 className="text-sm font-bold text-white">Quét QR Vào Cổng Sân</h5>
                  <p className="text-xs text-slate-400">
                    Cán bộ an ninh cổng quét mã QR, xác thực tức thì trong 15ms và ghi nhận trạng thái vé đã sử dụng.
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenGateScanner();
                    }}
                    className="mt-2 text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                  >
                    <span>Thử Quét Cổng Soát Vé</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {selectedTrack === 'admin' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    Luồng Vận Hành: Ban Tổ Chức & Quản Trị Hệ Thống
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Toàn quyền kiểm soát cấu hình sự kiện, hạng vé, tốc độ xả hàng phòng chờ và kiểm toán bất biến dữ liệu.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      if (!isAdmin) await loginAsAdmin();
                      onNavigate('admin');
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition"
                  >
                    <span>Mở Bảng Quản Trị</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <h5 className="text-sm font-bold text-white">Quản Lý Sự Kiện & Hạng Vé</h5>
                  <p className="text-xs text-slate-400">
                    Tạo mới show diễn, phân chia khán đài CAT 1, CAT 2, Standing VIP, thiết lập giới hạn vé mỗi đơn hàng (Max Per Order).
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <h5 className="text-sm font-bold text-white">Điều Tiết Phòng Chờ Ảo</h5>
                  <p className="text-xs text-slate-400">
                    Chủ động kích hoạt Waiting Room, điều chỉnh tốc độ xả vé (Drain Rate) từ 10 vé/phút đến 500 vé/phút tránh nghẽn Gateway.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <h5 className="text-sm font-bold text-white">Đối Soát Kho Vé (Reconcile)</h5>
                  <p className="text-xs text-slate-400">
                    Kiểm toán thời gian thực công thức: Available + Held + Sold == Total Capacity. Báo động ngay lập tức nếu phát hiện sai lệch.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedTrack === 'gate' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Luồng Cổng Soát Vé: Xác Thực QR & Kiểm Soát Vào Cửa
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Công cụ chuyên dụng cho cán bộ soát vé tại sân vận động. Quét mã QR, xác thực vé thật, đánh dấu đã dùng và chống quay đầu vé.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenGateScanner();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition"
                  >
                    <span>Mở Máy Quét Cổng</span>
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Xác Thực Tức Thời (&lt;15ms)</span>
                  </div>
                  <h5 className="text-sm font-bold text-white">Kiểm Tra Chữ Ký & Hợp Lệ</h5>
                  <p className="text-xs text-slate-400">
                    Xác nhận vé tồn tại trong hệ thống, thuộc sự kiện đang mở cửa và có trạng thái VALID.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-rose-400 text-xs font-bold">
                    <Lock className="w-4 h-4" />
                    <span>Chống Gian Lận Quay Đầu</span>
                  </div>
                  <h5 className="text-sm font-bold text-white">Đổi Trạng Thái Sang USED</h5>
                  <p className="text-xs text-slate-400">
                    Ngay khi quét thành công, vé được đánh dấu ĐÃ SỬ DỤNG. Mọi lần quét tiếp theo sẽ bị từ chối kèm thời gian vi phạm.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                    <Layers className="w-4 h-4" />
                    <span>Ghi Nhận Outbox Event</span>
                  </div>
                  <h5 className="text-sm font-bold text-white">Đồng Bộ Cửa Soát Vé</h5>
                  <p className="text-xs text-slate-400">
                    Mỗi lượt check-in được ghi nhận vào Outbox sự kiện để thống kê số lượng khán giả đã vào sân theo thời gian thực.
                  </p>
                </div>
              </div>
            </div>
          )}

          {selectedTrack === 'engineering' && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    Luồng Thử Nghiệm Tải Cao & Kiểm Chứng Kiến Trúc
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    Công cụ chứng minh các cam kết bất biến dưới tải lớn: Không bao giờ bán khống, TTL chuẩn xác, thanh toán idempotent.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onClose();
                      onOpenConcurrency();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-600/30 transition"
                  >
                    <span>Mở Bộ Thử Tải 50 Luồng</span>
                    <Cpu className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenArchitecture();
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
                  >
                    <span>5 Bất Biến</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <h5 className="text-sm font-bold text-white flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-amber-400" />
                    <span>Thử Nghiệm Xung Đột Đồng Thời (Concurrency)</span>
                  </h5>
                  <p className="text-xs text-slate-400">
                    Bắn đồng thời 50 yêu cầu giữ chỗ cho hạng vé chỉ còn 10 chỗ khả dụng. Kiểm chứng hệ thống chỉ chấp nhận đúng 10 lượt, 40 lượt còn lại bị từ chối 409 SOLD_OUT.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                  <h5 className="text-sm font-bold text-white flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Giám Sát Spring Boot Actuator</span>
                  </h5>
                  <p className="text-xs text-slate-400">
                    Theo dõi trực tiếp trạng thái Database, Redis Cache, JVM Heap memory và các chỉ số micrometer Prometheus.
                  </p>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenHealth();
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 pt-1"
                  >
                    <span>Xem Actuator Health</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Bottom */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/70 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Trạng thái phân luồng: Tất cả các luồng sẵn sàng hoạt động</span>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
