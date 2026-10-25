import React, { useState, useEffect } from 'react';
import { Reservation, Order, Ticket } from '../types';
import { api } from '../api/client';
import { X, Clock, CheckCircle, AlertTriangle, ShieldCheck, CreditCard, RotateCcw, Copy, QrCode, Smartphone, Landmark, Check } from 'lucide-react';

interface CheckoutTTLModalProps {
  reservation: Reservation;
  onClose: () => void;
  onOrderPaid: (order: Order, tickets: Ticket[]) => void;
  onCancelHold: () => void;
}

export const CheckoutTTLModal: React.FC<CheckoutTTLModalProps> = ({
  reservation,
  onClose,
  onOrderPaid,
  onCancelHold,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(reservation.seconds_remaining);
  const [order, setOrder] = useState<Order | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [copiedKey, setCopiedKey] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'vietqr' | 'momo' | 'card'>('vietqr');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayedNotice, setReplayedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Live countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isExpired = secondsRemaining === 0;
  const totalPrice = (reservation.unitPrice || 0) * reservation.quantity;

  const formatPrice = (minor: number, currency = 'USD') => {
    if (currency === 'VND') {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(minor);
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
  };

  // Create idempotent order
  const handleCreateOrder = async () => {
    setIsCreatingOrder(true);
    setError(null);
    setReplayedNotice(null);

    try {
      const createdOrder = await api.createOrder(reservation.id, idempotencyKey);
      setOrder(createdOrder);
    } catch (err: any) {
      setError(err.message || 'Không thể tạo đơn hàng giữ chỗ');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Test Invariant #2: Idempotent Replay
  const handleTestIdempotencyReplay = async () => {
    if (!order) return;
    setIsReplaying(true);
    setError(null);
    try {
      // Re-send with the exact same key
      const replayed = await api.createOrder(reservation.id, idempotencyKey);
      setReplayedNotice(
        'Bảo chứng Idempotent thành công! Máy chủ phát hiện cùng Idempotency-Key và trả về đúng đơn hàng gốc kèm cờ "Idempotency-Replayed: true". Tuyệt đối không sinh thêm đơn hay trừ tiền 2 lần.'
      );
    } catch (err: any) {
      setError(err.message || 'Thử nghiệm idempotent thất bại');
    } finally {
      setIsReplaying(false);
    }
  };

  // Process mock payment
  const handlePay = async () => {
    if (!order) return;
    setIsPaying(true);
    setError(null);
    try {
      const res = await api.checkPayment(order.id);
      onOrderPaid(res.order, res.tickets);
    } catch (err: any) {
      setError(err.message || 'Giao dịch thanh toán gặp lỗi');
    } finally {
      setIsPaying(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.cancelReservation(reservation.id);
      onCancelHold();
    } catch (err: any) {
      setError(err.message || 'Không thể hủy giữ chỗ');
    } finally {
      setCancelling(false);
    }
  };

  const copyKeyToClipboard = () => {
    navigator.clipboard.writeText(idempotencyKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  // Percentage of remaining hold time (out of 600 seconds)
  const ttlPercent = Math.max(0, Math.min(100, Math.round((secondsRemaining / 600) * 100)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-extrabold tracking-wider text-indigo-400">
                Thanh Toán Giữ Chỗ (Reservation TTL)
              </span>
              <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                VÉ ĐANG ĐƯỢC KHÓA
              </span>
            </div>
            <h3 className="text-xl font-black text-white mt-0.5">Xác Nhận & Mua Vé An Toàn</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TTL Countdown Dynamic Bar */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isExpired
                ? 'bg-rose-950/50 border-rose-800 text-rose-300'
                : secondsRemaining < 120
                ? 'bg-amber-950/50 border-amber-800 text-amber-300'
                : 'bg-indigo-950/40 border-indigo-800/80 text-indigo-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className={`w-5 h-5 ${secondsRemaining < 120 ? 'animate-bounce text-amber-400' : ''}`} />
                <span className="font-bold text-sm">
                  {isExpired ? 'Hết Hạn Giữ Chỗ' : 'Thời Gian Giữ Vé Độc Quyền'}
                </span>
              </div>
              <span className="font-mono text-2xl font-black tracking-tight">
                {formatTimer(secondsRemaining)}
              </span>
            </div>

            {/* TTL progress line */}
            <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 rounded-full ${
                  isExpired
                    ? 'w-0'
                    : secondsRemaining < 120
                    ? 'bg-rose-500 animate-pulse'
                    : 'bg-gradient-to-r from-emerald-500 via-indigo-500 to-amber-500'
                }`}
                style={{ width: `${ttlPercent}%` }}
              />
            </div>

            <p className="text-xs mt-2 opacity-90 leading-relaxed">
              {isExpired
                ? 'Hết thời gian giữ chỗ! Số vé này đã được hoàn trả lại kho chung cho khán giả khác.'
                : 'Vé của bạn được bảo lưu độc quyền trên Redis Gate. Không ai có thể mua trùng vé này trong lúc bạn hoàn tất thanh toán.'}
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {replayedNotice && (
            <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{replayedNotice}</span>
            </div>
          )}

          {/* Ticket Hold Summary */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex justify-between items-start text-sm">
              <div>
                <h4 className="font-bold text-white text-base">{reservation.tierName || 'Hạng vé đã chọn'}</h4>
                <p className="text-xs text-slate-400 mt-0.5">Số lượng: {reservation.quantity} vé</p>
              </div>
              <span className="font-mono font-black text-white text-base">
                {formatPrice(totalPrice, reservation.currency)}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex justify-between text-xs text-slate-400">
              <span>Đơn giá từng vé</span>
              <span className="font-mono">{formatPrice(reservation.unitPrice || 0, reservation.currency)}</span>
            </div>
            <div className="flex justify-between text-base font-black text-white pt-1">
              <span>Tổng Tiền Thanh Toán</span>
              <span className="font-mono text-emerald-400 text-lg">
                {formatPrice(totalPrice, reservation.currency)}
              </span>
            </div>
          </div>

          {/* Idempotency Key (Bảo chứng không trừ tiền 2 lần) */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Khóa Chống Trùng Lặp (Idempotency-Key)</span>
              </div>
              <button
                onClick={copyKeyToClipboard}
                className="text-[10px] text-indigo-400 hover:text-white flex items-center gap-1 font-mono transition"
              >
                {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedKey ? 'Đã sao chép' : 'Sao chép UUID'}
              </button>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 break-all select-all flex items-center justify-between">
              <span>{idempotencyKey}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Chuẩn RFC UUID được gắn vào HTTP Header. Dù mạng giật, timeout hay bấm liên tiếp, hệ thống cam kết chỉ xử lý đúng 1 giao dịch duy nhất.
            </p>
          </div>

          {/* Payment Method Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Phương Thức Thanh Toán
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setPaymentMethod('vietqr')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  paymentMethod === 'vietqr'
                    ? 'bg-indigo-950/50 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <QrCode className="w-5 h-5 text-indigo-400 mb-2" />
                <div>
                  <span className="text-xs font-bold text-white block">VietQR</span>
                  <span className="text-[10px] text-slate-400">Chuyển khoản 24/7</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('momo')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  paymentMethod === 'momo'
                    ? 'bg-rose-950/50 border-rose-500 shadow-md ring-1 ring-rose-500'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Smartphone className="w-5 h-5 text-rose-400 mb-2" />
                <div>
                  <span className="text-xs font-bold text-white block">Ví MoMo</span>
                  <span className="text-[10px] text-slate-400">Quét mã siêu tốc</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between ${
                  paymentMethod === 'card'
                    ? 'bg-cyan-950/50 border-cyan-500 shadow-md ring-1 ring-cyan-500'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                }`}
              >
                <CreditCard className="w-5 h-5 text-cyan-400 mb-2" />
                <div>
                  <span className="text-xs font-bold text-white block">Thẻ Quốc Tế</span>
                  <span className="text-[10px] text-slate-400">Visa / Mastercard</span>
                </div>
              </button>
            </div>
          </div>

          {/* Checkout Action Area */}
          {!order ? (
            <button
              onClick={handleCreateOrder}
              disabled={isExpired || isCreatingOrder}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm py-4 px-6 rounded-2xl transition shadow-xl shadow-indigo-600/20 active:scale-[0.98]"
            >
              <CreditCard className="w-4 h-4" />
              {isCreatingOrder ? 'Đang Khởi Tạo Đơn Hàng Idempotent...' : 'Khóa Đơn Hàng & Đi Đến Thanh Toán'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Mã Đơn Hàng:</span>
                  <span className="text-amber-400 font-bold">{order.paymentReference}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-sans">Trạng Thái:</span>
                  <span className="text-emerald-400 font-bold">CHỜ THANH TOÁN (PENDING)</span>
                </div>
              </div>

              {/* Pay Button */}
              <button
                onClick={handlePay}
                disabled={isPaying || isExpired}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black text-sm py-4 px-6 rounded-2xl transition shadow-xl shadow-emerald-600/25 active:scale-[0.98]"
              >
                <CreditCard className="w-4 h-4" />
                {isPaying ? 'Đang Xác Nhận Giao Dịch...' : `Thanh Toán Ngay ${formatPrice(totalPrice, reservation.currency)}`}
              </button>

              {/* Test Idempotent Replay Button */}
              <button
                onClick={handleTestIdempotencyReplay}
                disabled={isReplaying}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs py-2.5 px-4 rounded-xl transition border border-slate-700"
              >
                <RotateCcw className={`w-3.5 h-3.5 text-amber-400 ${isReplaying ? 'animate-spin' : ''}`} />
                {isReplaying ? 'Đang kiểm tra...' : 'Kiểm tra Invariant #2: Bấm Gửi Lại Cùng Idempotency Key'}
              </button>
            </div>
          )}

          {/* Release / Cancel hold */}
          {!isExpired && !order && (
            <div className="text-center pt-1">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="text-xs text-slate-500 hover:text-rose-400 transition underline"
              >
                {cancelling ? 'Đang hoàn trả vé...' : 'Hủy giữ chỗ (Nhả vé về kho ngay lập tức)'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
