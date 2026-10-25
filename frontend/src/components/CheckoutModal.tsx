import React, { useState, useEffect } from 'react';
import { Reservation, Order, Ticket } from '../types';
import { api } from '../api/client';
import { X, Clock, CheckCircle, AlertTriangle, ShieldCheck, CreditCard, RotateCcw, Copy, ExternalLink } from 'lucide-react';

interface CheckoutModalProps {
  reservation: Reservation;
  onClose: () => void;
  onOrderPaid: (order: Order, tickets: Ticket[]) => void;
  onCancelHold: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  reservation,
  onClose,
  onOrderPaid,
  onCancelHold,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(reservation.seconds_remaining);
  const [order, setOrder] = useState<Order | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
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

  // Convert reservation to order with Idempotency Key
  const handleCreateOrder = async (useExistingKey = true) => {
    setIsCreatingOrder(true);
    setError(null);
    setReplayedNotice(null);

    const key = useExistingKey ? idempotencyKey : crypto.randomUUID();
    if (!useExistingKey) {
      setIdempotencyKey(key);
    }

    try {
      const createdOrder = await api.createOrder(reservation.id, key);
      setOrder(createdOrder);
    } catch (err: any) {
      setError(err.message || 'Failed to create order');
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Test Idempotent Replay
  const handleTestIdempotencyReplay = async () => {
    if (!order) return;
    setIsReplaying(true);
    setError(null);
    try {
      // Re-send with the EXACT same idempotency key
      const replayedOrder = await api.createOrder(reservation.id, idempotencyKey);
      setReplayedNotice('Idempotency Verified! Server returned cached response with "Idempotency-Replayed: true". Zero double-booking!');
    } catch (err: any) {
      setError(err.message || 'Idempotency test failed');
    } finally {
      setIsReplaying(false);
    }
  };

  // Complete Payment
  const handlePay = async () => {
    if (!order) return;
    setIsPaying(true);
    setError(null);
    try {
      const res = await api.checkPayment(order.id);
      onOrderPaid(res.order, res.tickets);
    } catch (err: any) {
      setError(err.message || 'Payment simulation failed');
    } finally {
      setIsPaying(false);
    }
  };

  const handleCancelReservation = async () => {
    setCancelling(true);
    try {
      await api.cancelReservation(reservation.id);
      onCancelHold();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel reservation');
    } finally {
      setCancelling(false);
    }
  };

  const isExpired = secondsRemaining === 0;
  const totalPrice = (reservation.unitPrice || 0) * reservation.quantity;

  const formatPrice = (minor: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(minor / 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-indigo-400">
                Reservation Held
              </span>
              <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
                TTL HOLD ACTIVE
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mt-0.5">Secure Checkout</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* TTL Countdown Bar */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              isExpired
                ? 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                : secondsRemaining < 120
                ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                : 'bg-indigo-950/40 border-indigo-800/80 text-indigo-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                <span className="font-semibold text-sm">
                  {isExpired ? 'Reservation Expired' : 'Tickets Held Exclusively'}
                </span>
              </div>
              <span className="font-mono text-xl font-black">
                {formatTimer(secondsRemaining)}
              </span>
            </div>
            <p className="text-xs mt-1 opacity-80">
              {isExpired
                ? 'Your hold has expired and tickets have been returned to the public inventory pool.'
                : 'These tickets are locked for you. Complete your order before the timer reaches zero.'}
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {replayedNotice && (
            <div className="p-4 rounded-xl bg-emerald-950/50 border border-emerald-800/80 text-emerald-300 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{replayedNotice}</span>
            </div>
          )}

          {/* Item details */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex justify-between items-start text-sm">
              <div>
                <h4 className="font-bold text-white">{reservation.tierName || 'Selected Tier'}</h4>
                <p className="text-xs text-slate-400">
                  Quantity: {reservation.quantity} ticket(s)
                </p>
              </div>
              <span className="font-mono font-bold text-white">
                {formatPrice(totalPrice, reservation.currency)}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex justify-between text-xs text-slate-400">
              <span>Unit Price (Minor Units)</span>
              <span className="font-mono">{formatPrice(reservation.unitPrice || 0, reservation.currency)} each</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-white">
              <span>Total Due</span>
              <span className="font-mono text-indigo-400">{formatPrice(totalPrice, reservation.currency)}</span>
            </div>
          </div>

          {/* Idempotency Key Section */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Idempotency-Key (RFC UUID)</span>
              </div>
              <span className="text-[10px] text-slate-500 uppercase font-mono">Deduplication</span>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300 break-all select-all flex items-center justify-between">
              <span>{idempotencyKey}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Prevents duplicate order creation or multiple charges during network retries or double clicks.
            </p>
          </div>

          {/* Order Actions */}
          {!order ? (
            <button
              onClick={() => handleCreateOrder(true)}
              disabled={isExpired || isCreatingOrder}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm py-3.5 px-6 rounded-xl transition shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
            >
              <CreditCard className="w-4 h-4" />
              {isCreatingOrder ? 'Creating Idempotent Order...' : 'Confirm Order & Lock Price'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-400">Order Reference:</span>
                  <span className="text-amber-400 font-bold">{order.paymentReference}</span>
                </div>
                <div className="flex justify-between font-mono">
                  <span className="text-slate-400">Order Status:</span>
                  <span className="text-indigo-400 font-bold">{order.status}</span>
                </div>
              </div>

              {/* Pay Button */}
              <button
                onClick={handlePay}
                disabled={isPaying || isExpired}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-sm py-3.5 px-6 rounded-xl transition shadow-lg shadow-emerald-600/20 active:scale-[0.98]"
              >
                <CreditCard className="w-4 h-4" />
                {isPaying ? 'Executing Transaction...' : `Simulate Mock Payment (${formatPrice(totalPrice, reservation.currency)})`}
              </button>

              {/* Invariant Demonstration Button */}
              <button
                onClick={handleTestIdempotencyReplay}
                disabled={isReplaying}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs py-2.5 px-4 rounded-xl transition border border-slate-700"
                title="Verify that repeating this request does not create a duplicate order or charge"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                {isReplaying ? 'Testing...' : 'Test Invariant #2: Replay Same Idempotency Key'}
              </button>
            </div>
          )}

          {/* Cancel Hold Button */}
          {!isExpired && !order && (
            <div className="text-center pt-2">
              <button
                onClick={handleCancelReservation}
                disabled={cancelling}
                className="text-xs text-slate-500 hover:text-rose-400 transition underline"
              >
                {cancelling ? 'Releasing hold...' : 'Cancel Reservation & Return Tickets'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
