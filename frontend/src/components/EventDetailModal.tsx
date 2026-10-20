import React, { useState, useEffect } from 'react';
import { Event, TicketTier, Reservation } from '../types';
import { api } from '../api/client';
import { TicketTierCard } from './TicketTierCard';
import { CountdownTimer } from './CountdownTimer';
import { X, Calendar, MapPin, AlertCircle, CheckCircle, Clock, ShieldCheck, Ticket, Users, Flame } from 'lucide-react';

interface EventDetailModalProps {
  event: Event;
  admissionToken?: string;
  onClose: () => void;
  onReservationCreated: (reservation: Reservation) => void;
  onRequestQueue: () => void;
}

export const EventDetailModal: React.FC<EventDetailModalProps> = ({
  event,
  admissionToken,
  onClose,
  onReservationCreated,
  onRequestQueue,
}) => {
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTiers = async () => {
      setLoading(true);
      try {
        const data = await api.getEventDetail(event.id);
        setTiers(data.tiers);
        const availableTier = data.tiers.find((t) => t.availability !== 'SOLD_OUT');
        if (availableTier) {
          setSelectedTierId(availableTier.id);
        }
      } catch (err: any) {
        setError(err.message || 'Không thể tải danh sách hạng vé');
      } finally {
        setLoading(false);
      }
    };
    fetchTiers();
  }, [event.id]);

  const selectedTier = tiers.find((t) => t.id === selectedTierId);

  const handleReserve = async () => {
    if (!selectedTier) return;
    setError(null);
    setReserving(true);

    try {
      const res = await api.createReservation(selectedTier.id, quantity, admissionToken);
      onReservationCreated(res);
    } catch (err: any) {
      if (err.data?.code === 'WAITING_ROOM_REQUIRED') {
        setError('Sự kiện có lưu lượng cực lớn! Bạn cần tham gia phòng chờ ảo trước để nhận mã ủy quyền vào mua vé.');
      } else if (err.data?.code === 'SOLD_OUT') {
        setError('Hạng vé này vừa được mua hết hoặc số lượng còn lại không đủ số vé bạn yêu cầu.');
      } else {
        setError(err.message || 'Lỗi trong quá trình giữ chỗ vé.');
      }
    } finally {
      setReserving(false);
    }
  };

  const formatPrice = (minor: number, currency = 'USD') => {
    if (currency === 'VND') {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(minor);
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
  };

  const now = new Date().toISOString();
  const isOnSale = event.saleStartTime <= now && now <= event.saleEndTime;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Hero Banner Header */}
        <div className="relative h-56 bg-slate-950 shrink-0">
          <img
            src={event.imageUrl}
            alt={event.title}
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent" />
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-slate-950/70 text-slate-400 hover:text-white border border-slate-800 transition z-10"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Banner Meta Info */}
          <div className="absolute bottom-5 left-6 right-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                {isOnSale ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
                    <Flame className="w-3 h-3" /> Đang Mở Bán
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                    <Clock className="w-3 h-3" /> Sắp Mở Bán
                  </span>
                )}
                {event.waitingRoomEnabled && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold uppercase tracking-wider">
                    <Users className="w-3 h-3" /> Phòng Chờ Bật
                  </span>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight tracking-tight">
                {event.title}
              </h2>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-300">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  {new Date(event.startTime).toLocaleDateString('vi-VN')}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  {event.venueName}
                </span>
              </div>
            </div>

            {/* Countdown widget */}
            {!isOnSale && (
              <div className="bg-slate-950/80 p-2.5 rounded-2xl border border-slate-800">
                <CountdownTimer targetDate={event.saleStartTime} label="Mở bán sau:" />
              </div>
            )}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-bold text-sm">Yêu Cầu Bị Từ Chối</p>
                <p className="opacity-90">{error}</p>
                {event.waitingRoomEnabled && !admissionToken && (
                  <button
                    onClick={onRequestQueue}
                    className="mt-2 text-xs font-bold underline text-amber-300 hover:text-white flex items-center gap-1"
                  >
                    Vào Hàng Đợi Phòng Chờ Ngay &rarr;
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Admission Token Validated Badge */}
          {admissionToken && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>Đã được cấp quyền từ phòng chờ:</strong> Bạn có quyền ưu tiên đặt vé và khóa giữ chỗ trong 10 phút.
              </span>
            </div>
          )}

          {/* Tier Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs uppercase tracking-wider font-extrabold text-slate-400">
                Chọn Hạng Vé & Khu Vực
              </h4>
              <span className="text-[11px] text-slate-500 font-mono">Kho vé realtime</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-500 text-sm font-mono animate-pulse">
                Đang nạp bảng giá và tình trạng ghế...
              </div>
            ) : (
              <div className="grid gap-3">
                {tiers.map((tier) => (
                  <TicketTierCard
                    key={tier.id}
                    tier={tier}
                    selected={selectedTierId === tier.id}
                    onSelect={() => setSelectedTierId(tier.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Quantity Selector */}
          {selectedTier && selectedTier.availableQuantity > 0 && (
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <span className="text-sm font-bold text-white">Số Lượng Vé</span>
                <p className="text-xs text-slate-400">Giới hạn tối đa: {selectedTier.maxPerOrder} vé/lần mua</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-base flex items-center justify-center transition"
                  disabled={quantity <= 1}
                >
                  -
                </button>
                <span className="w-8 text-center font-black text-lg text-white font-mono">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => Math.min(selectedTier.maxPerOrder, q + 1))}
                  className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-base flex items-center justify-center transition"
                  disabled={quantity >= selectedTier.maxPerOrder}
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Reservation TTL Guarantee Note */}
          <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-800/40 text-xs text-indigo-300 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-indigo-200">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>Cam Kết Giữ Chỗ Độc Quyền (10 Phút TTL)</span>
            </div>
            <p className="text-indigo-300/80 leading-relaxed text-[11px]">
              Khi nhấn nút &quot;Giữ vé&quot;, hệ thống sẽ trừ trực tiếp vào kho vé trên Redis Gate và cấp cho bạn 10 phút để thanh toán. Nếu hết 10 phút chưa thanh toán, vé sẽ được tự động hoàn trả lại kho chung.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-mono">Tạm tính:</span>
            <p className="text-xl font-black text-white font-mono">
              {selectedTier
                ? formatPrice(selectedTier.price * quantity, selectedTier.currency)
                : '$0.00'}
            </p>
          </div>

          <button
            onClick={handleReserve}
            disabled={!selectedTier || selectedTier.availableQuantity <= 0 || reserving}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-rose-600 hover:from-indigo-500 hover:to-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm py-3.5 px-8 rounded-2xl transition shadow-xl shadow-indigo-600/25 active:scale-[0.98]"
          >
            <Ticket className="w-4 h-4" />
            {reserving ? 'Đang Khóa Kho Vé...' : 'Giữ Vé & Mua Ngay (10 Phút)'}
          </button>
        </div>
      </div>
    </div>
  );
};
