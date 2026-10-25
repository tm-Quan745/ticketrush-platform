import React, { useState, useEffect } from 'react';
import { TicketReservation } from '../types/flashSale.types';
import { flashSaleApi } from '../api/flashSaleApi';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { formatCurrency } from '../../../lib/utils';
import { Clock, ShieldCheck, Copy, Check, QrCode, Smartphone, CreditCard, RotateCcw, AlertTriangle } from 'lucide-react';

interface ReservationModalProps {
  reservation: TicketReservation | null;
  onClose: () => void;
  onOrderPaid: (order: any, tickets: any[]) => void;
  onCancelHold: () => void;
}

export const ReservationModal: React.FC<ReservationModalProps> = ({
  reservation,
  onClose,
  onOrderPaid,
  onCancelHold,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => reservation?.seconds_remaining ?? 600);
  const [order, setOrder] = useState<any | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [copiedKey, setCopiedKey] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'vietqr' | 'momo' | 'card'>('vietqr');
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayedNotice, setReplayedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reservation?.seconds_remaining !== undefined) {
      setSecondsRemaining(reservation.seconds_remaining);
    }
  }, [reservation?.seconds_remaining]);

  useEffect(() => {
    if (!reservation) return;
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
  }, [reservation]);

  if (!reservation) return null;

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isExpired = secondsRemaining === 0;
  const totalPrice = (reservation.unitPrice || 0) * reservation.quantity;

  const handleCreateOrder = async () => {
    setIsCreatingOrder(true);
    setError(null);
    setReplayedNotice(null);
    try {
      const createdOrder = await flashSaleApi.createIdempotentOrder(reservation.id, idempotencyKey);
      setOrder(createdOrder);
    } catch (err: any) {
      setError(err.message || 'Không thể tạo đơn hàng giữ chỗ');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleTestReplay = async () => {
    if (!order) return;
    setIsReplaying(true);
    setError(null);
    try {
      await flashSaleApi.createIdempotentOrder(reservation.id, idempotencyKey);
      setReplayedNotice('Idempotency Verified! Máy chủ nhận diện cùng key và trả về đơn gốc mà không tạo trùng.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsReplaying(false);
    }
  };

  const handlePay = async () => {
    if (!order) return;
    setIsPaying(true);
    setError(null);
    try {
      const res = await flashSaleApi.simulatePayment(order.id);
      onOrderPaid(res.order, res.tickets);
    } catch (err: any) {
      setError(err.message || 'Thanh toán thất bại');
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(reservation)}
      onClose={onClose}
      title="Xác Nhận Giữ Chỗ & Thanh Toán"
      subtitle="Số vé được khóa độc quyền cho bạn trên Redis Gate trong 10 phút."
      maxWidth="xl"
    >
      <div className="space-y-5">
        {/* TTL countdown */}
        <div
          className={`p-4 rounded-2xl border transition-all ${
            isExpired
              ? 'bg-rose-950/40 border-rose-800 text-rose-300'
              : secondsRemaining < 120
              ? 'bg-amber-950/40 border-amber-800 text-amber-300'
              : 'bg-indigo-950/40 border-indigo-800/80 text-indigo-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              <span className="font-bold text-sm">
                {isExpired ? 'Hết Hạn Giữ Chỗ' : 'Thời Gian Giữ Vé Độc Quyền'}
              </span>
            </div>
            <span className="font-mono text-2xl font-black">{formatTimer(secondsRemaining)}</span>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {replayedNotice && (
          <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{replayedNotice}</span>
          </div>
        )}

        {/* Hold details */}
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-300 font-bold">{reservation.tierName}</span>
            <span className="font-mono font-bold text-white">{formatCurrency(totalPrice, 'VND')}</span>
          </div>
          <div className="flex justify-between text-xs text-slate-400">
            <span>Số lượng: {reservation.quantity} vé</span>
            <span>Đơn giá: {formatCurrency(reservation.unitPrice || 0, 'VND')}/vé</span>
          </div>
        </div>

        {/* Idempotency key */}
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-300 font-bold">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Khóa Idempotency-Key:
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(idempotencyKey);
                setCopiedKey(true);
                setTimeout(() => setCopiedKey(false), 2000);
              }}
              className="text-[10px] text-indigo-400 hover:text-white font-mono flex items-center gap-1"
            >
              {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedKey ? 'Đã sao chép' : 'Sao chép'}
            </button>
          </div>
          <p className="font-mono text-[11px] text-slate-400 break-all bg-slate-900 p-2 rounded-lg">
            {idempotencyKey}
          </p>
        </div>

        {/* Payment Methods */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300">Phương Thức Thanh Toán</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'vietqr', name: 'VietQR', icon: QrCode, desc: 'Chuyển khoản 24/7' },
              { id: 'momo', name: 'Ví MoMo', icon: Smartphone, desc: 'Quét siêu tốc' },
              { id: 'card', name: 'Thẻ Quốc Tế', icon: CreditCard, desc: 'Visa / Master' },
            ].map((method) => {
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setPaymentMethod(method.id as any)}
                  className={`p-3 rounded-2xl border text-left transition ${
                    paymentMethod === method.id
                      ? 'bg-indigo-950/50 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4 text-indigo-400 mb-1" />
                  <span className="text-xs font-bold text-white block">{method.name}</span>
                  <span className="text-[9px] text-slate-400">{method.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Action button */}
        {!order ? (
          <Button
            onClick={handleCreateOrder}
            disabled={isExpired || isCreatingOrder}
            className="w-full py-4 text-sm font-black"
          >
            {isCreatingOrder ? 'Đang Khởi Tạo Đơn...' : 'Xác Nhận Đơn Hàng & Đi Đến Thanh Toán'}
          </Button>
        ) : (
          <div className="space-y-3">
            <Button
              onClick={handlePay}
              disabled={isPaying || isExpired}
              variant="success"
              className="w-full py-4 text-sm font-black"
            >
              {isPaying ? 'Đang Xác Nhận...' : `Thanh Toán Ngay ${formatCurrency(totalPrice, 'VND')}`}
            </Button>

            <button
              onClick={handleTestReplay}
              disabled={isReplaying}
              className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isReplaying ? 'animate-spin' : ''}`} />
              Kiểm tra Invariant #2: Bấm Gửi Lại Cùng Idempotency Key
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
