import React, { useState } from 'react';
import { useEventDetails } from '../../../features/flash-sale/hooks/useEventDetails';
import { useReserveTicket } from '../../../features/flash-sale/hooks/useReserveTicket';
import { EventHeader } from '../../../features/flash-sale/components/EventHeader';
import { TicketCard } from '../../../features/flash-sale/components/TicketCard';
import { StadiumSeatingMap } from '../../../features/flash-sale/components/StadiumSeatingMap';
import { ReservationModal } from '../../../features/flash-sale/components/ReservationModal';
import { TicketReservation } from '../../../features/flash-sale/types/flashSale.types';
import { Button } from '../../../components/ui/Button';
import { formatCurrency } from '../../../lib/utils';
import { Ticket, ShieldCheck, Clock, Users, ArrowRight, Zap, AlertCircle } from 'lucide-react';

interface EventFlashSalePageProps {
  eventId: string;
  admissionToken?: string;
  onNavigateToQueue?: () => void;
  onOrderPaid?: (order: any, tickets: any[]) => void;
}

export const EventFlashSalePage: React.FC<EventFlashSalePageProps> = ({
  eventId,
  admissionToken,
  onNavigateToQueue,
  onOrderPaid,
}) => {
  const { data, isLoading, error } = useEventDetails(eventId);
  const reserveMutation = useReserveTicket();

  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [activeReservation, setActiveReservation] = useState<TicketReservation | null>(null);
  const [reserveError, setReserveError] = useState<string | null>(null);

  const event = data?.event;
  const tiers = data?.tiers || [];

  // Default select first available tier if none selected
  const activeTierId = selectedTierId || tiers.find((t) => t.availableQuantity > 0)?.id || tiers[0]?.id || '';
  const activeTier = tiers.find((t) => t.id === activeTierId);

  const handleToggleSeat = (seatId: string, seatInfo: { row: string; number: number; tierId: string }) => {
    setSelectedTierId(seatInfo.tierId);
    setSelectedSeats((prev) => {
      if (prev.includes(seatId)) {
        const next = prev.filter((id) => id !== seatId);
        setQuantity(Math.max(1, next.length));
        return next;
      } else {
        if (activeTier && prev.length >= activeTier.maxPerOrder) {
          alert(`Giới hạn tối đa ${activeTier.maxPerOrder} vé trên một đơn hàng!`);
          return prev;
        }
        const next = [...prev, seatId];
        setQuantity(next.length);
        return next;
      }
    });
  };

  const handleReserve = async () => {
    if (!activeTier) return;
    setReserveError(null);

    try {
      const reservation = await reserveMutation.mutateAsync({
        tierId: activeTier.id,
        quantity,
        admissionToken,
      });
      setActiveReservation(reservation);
    } catch (err: any) {
      if (err.data?.code === 'WAITING_ROOM_REQUIRED') {
        setReserveError('Sự kiện đang áp dụng phòng chờ ảo. Bạn cần vào hàng đợi để lấy mã ủy quyền trước.');
      } else if (err.data?.code === 'SOLD_OUT') {
        setReserveError('Hạng vé này vừa bán hết hoặc số lượng yêu cầu vượt quá kho còn lại.');
      } else {
        setReserveError(err.message || 'Lỗi khi giữ chỗ vé.');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="py-32 text-center text-slate-500 font-mono text-sm animate-pulse">
        Đang nạp sơ đồ khán đài và tình trạng kho vé thời gian thực...
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="p-8 text-center text-rose-400 bg-rose-950/20 rounded-3xl border border-rose-800">
        Không tìm thấy thông tin sự kiện hoặc kết nối bị gián đoạn.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10 animate-in fade-in duration-300">
      {/* Event Hero Header */}
      <EventHeader event={event} />

      {/* Admission Token Notice */}
      {admissionToken && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>
            <strong>Đã vượt qua phòng chờ ảo:</strong> Bạn có quyền ưu tiên giữ chỗ vé trong 10 phút. Vui lòng chọn ghế và hoàn tất đơn hàng.
          </span>
        </div>
      )}

      {reserveError && (
        <div className="p-4 rounded-2xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <p className="font-bold">Yêu cầu giữ chỗ bị từ chối</p>
            <p>{reserveError}</p>
            {event.waitingRoomEnabled && !admissionToken && onNavigateToQueue && (
              <button
                onClick={onNavigateToQueue}
                className="text-xs font-bold text-amber-300 underline block pt-1 hover:text-white"
              >
                Vào hàng đợi phòng chờ ảo ngay &rarr;
              </button>
            )}
          </div>
        </div>
      )}

      {/* CORE SHOWPIECE: INTERACTIVE STADIUM & SEATING MAP */}
      <StadiumSeatingMap
        tiers={tiers}
        selectedTierId={activeTierId}
        onSelectTier={(id) => {
          setSelectedTierId(id);
          setSelectedSeats([]);
          setQuantity(1);
        }}
        selectedSeats={selectedSeats}
        onToggleSeat={handleToggleSeat}
      />

      {/* TICKET TIERS SELECTION & ACTION BAR */}
      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Tier Cards List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Ticket className="w-5 h-5 text-indigo-400" />
              Bảng Giá & Danh Sách Hạng Vé
            </h3>
            <span className="text-xs text-slate-400 font-mono">Bảo đảm giá gốc</span>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {tiers.map((tier) => (
              <TicketCard
                key={tier.id}
                tier={tier}
                selected={activeTierId === tier.id}
                onSelect={() => {
                  setSelectedTierId(tier.id);
                  setSelectedSeats([]);
                  setQuantity(1);
                }}
              />
            ))}
          </div>
        </div>

        {/* Quick Checkout & Hold Summary Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 sticky top-28">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h4 className="font-bold text-white text-base">Tổng Quan Giữ Vé</h4>
            <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full font-bold">
              10M TTL HOLD
            </span>
          </div>

          {activeTier ? (
            <div className="space-y-4 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Hạng vé đang chọn:</span>
                <span className="font-bold text-white">{activeTier.name}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Đơn giá từng vé:</span>
                <span className="font-mono font-bold text-white">
                  {formatCurrency(activeTier.price, activeTier.currency)}
                </span>
              </div>

              {selectedSeats.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Ghế đã chọn:</span>
                  <span className="font-mono font-bold text-indigo-400">
                    {selectedSeats.map((s) => s.split('-').slice(2).join('')).join(', ')}
                  </span>
                </div>
              )}

              {/* Quantity incrementor (if seats not individually picked) */}
              {selectedSeats.length === 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-slate-300 font-bold">Số lượng vé:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700"
                      disabled={quantity <= 1}
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-white font-mono">{quantity}</span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(activeTier.maxPerOrder, q + 1))}
                      className="w-8 h-8 rounded-lg bg-slate-800 text-white font-bold flex items-center justify-center hover:bg-slate-700"
                      disabled={quantity >= activeTier.maxPerOrder}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-sm">
                <span className="font-bold text-slate-300">Tổng thanh toán:</span>
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {formatCurrency(activeTier.price * quantity, activeTier.currency)}
                </span>
              </div>

              <Button
                onClick={handleReserve}
                disabled={activeTier.availableQuantity <= 0 || reserveMutation.isPending}
                isLoading={reserveMutation.isPending}
                className="w-full py-4 text-sm font-black"
              >
                <Zap className="w-4 h-4 mr-1.5" />
                Giữ Chỗ Ngay (Khóa Vé 10 Phút)
              </Button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Vui lòng chọn một hạng vé từ danh sách.</p>
          )}

          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-2">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Vé sẽ tự động hoàn trả kho nếu không thanh toán trước khi hết giờ.</span>
          </div>
        </div>
      </div>

      {/* Reservation & Checkout TTL Modal */}
      {activeReservation && (
        <ReservationModal
          reservation={activeReservation}
          onClose={() => setActiveReservation(null)}
          onOrderPaid={(order, tickets) => {
            setActiveReservation(null);
            onOrderPaid?.(order, tickets);
          }}
          onCancelHold={() => setActiveReservation(null)}
        />
      )}
    </div>
  );
};
