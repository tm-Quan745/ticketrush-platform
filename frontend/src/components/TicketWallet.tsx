import React, { useState, useEffect } from 'react';
import { Ticket, Reservation, Order } from '../types';
import { api } from '../api/client';
import { Ticket as TicketIcon, Clock, CheckCircle, QrCode, AlertCircle, Trash2, ArrowRight, Download, Share2, Sparkles } from 'lucide-react';

interface TicketWalletProps {
  onResumeReservation: (reservation: Reservation) => void;
}

export const TicketWallet: React.FC<TicketWalletProps> = ({ onResumeReservation }) => {
  const [activeTab, setActiveTab] = useState<'tickets' | 'holds' | 'orders'>('tickets');
  const [ticketsList, setTicketsList] = useState<Ticket[]>([]);
  const [reservationsList, setReservationsList] = useState<Reservation[]>([]);
  const [ordersList, setOrdersList] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resData, ordersData] = await Promise.all([
        api.getMyReservations(),
        api.getMyOrders(),
      ]);

      const validReservations = resData?.content || [];
      const validOrders = ordersData?.content || [];

      setReservationsList(validReservations);
      setOrdersList(validOrders);

      // Aggregate tickets from all paid orders
      const allTickets: Ticket[] = [];
      for (const order of validOrders) {
        if (order.status === 'PAID') {
          try {
            const t = await api.getOrderTickets(order.id);
            if (Array.isArray(t)) {
              allTickets.push(...t);
            }
          } catch {
            // ignore individual ticket fetch failure
          }
        }
      }
      setTicketsList(allTickets);
    } catch (err: any) {
      console.warn('Ví vé: đang thử kết nối lại với phiên người dùng...', err?.message || err);
      try {
        const refreshed = await api.refreshSession();
        if (refreshed) {
          const [resData, ordersData] = await Promise.all([
            api.getMyReservations(),
            api.getMyOrders(),
          ]);
          setReservationsList(resData?.content || []);
          setOrdersList(ordersData?.content || []);
        }
      } catch {
        // gracefully handled
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCancelHold = async (id: string) => {
    try {
      await api.cancelReservation(id);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Hủy giữ chỗ thất bại');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Ví Vé Điện Tử (Digital Ticket Wallet)
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">Vé Đã Đặt & Lịch Sử Giao Dịch</h2>
          <p className="text-xs text-slate-400 mt-1">
            Quản lý mã vé QR check-in sự kiện, các suất giữ chỗ đang đếm ngược và đơn hàng.
          </p>
        </div>

        {/* Tab switch pills */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-2xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'tickets'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TicketIcon className="w-3.5 h-3.5" />
            Vé Của Tôi ({ticketsList.length})
          </button>
          <button
            onClick={() => setActiveTab('holds')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'holds'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Đang Giữ Chỗ ({reservationsList.filter((r) => r.status === 'HELD').length})
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition ${
              activeTab === 'orders'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Đơn Hàng ({ordersList.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-slate-500 font-mono text-sm animate-pulse">
          Đang đồng bộ dữ liệu ví vé từ máy chủ...
        </div>
      ) : (
        <>
          {/* TAB 1: TICKETS WALLET */}
          {activeTab === 'tickets' && (
            <div>
              {ticketsList.length === 0 ? (
                <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800 border-dashed space-y-3">
                  <TicketIcon className="w-14 h-14 text-slate-600 mx-auto" />
                  <h4 className="text-lg font-bold text-white">Bạn Chưa Có Vé Nào Trong Ví</h4>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    Hãy duyệt danh sách sự kiện đang mở bán, tham gia phòng chờ hoặc chọn hạng vé để tiến hành đặt vé ngay.
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {ticketsList.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="group relative bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:via-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-800 hover:border-indigo-500 rounded-3xl overflow-hidden shadow-md dark:shadow-2xl transition-all duration-300 flex flex-col justify-between"
                    >
                      {/* Ticket notch cutouts */}
                      <div className="absolute -left-3.5 top-1/2 -mt-3.5 w-7 h-7 rounded-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-inner z-10" />
                      <div className="absolute -right-3.5 top-1/2 -mt-3.5 w-7 h-7 rounded-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-inner z-10" />

                      {/* Header of Ticket */}
                      <div className="p-6 pb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            VÉ HỢP LỆ (VALID)
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                            {new Date(ticket.issuedAt).toLocaleDateString()}
                          </span>
                        </div>

                        <h4 className="text-xl font-black text-slate-900 dark:text-white mt-4 tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {ticket.tierName}
                        </h4>

                        <div className="mt-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 font-mono text-xs text-indigo-600 dark:text-indigo-400 flex items-center justify-between">
                          <span className="text-slate-500 text-[10px]">MÃ CHECK-IN:</span>
                          <span className="font-bold text-sm tracking-wider">{ticket.ticketCode}</span>
                        </div>
                      </div>

                      {/* Dashed Tear-off line */}
                      <div className="px-6 py-2 border-y border-dashed border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-950/20">
                        <span>CỔNG A / CHECK-IN</span>
                        <span>1 NGƯỜI / LẦN VÀO</span>
                      </div>

                      {/* Footer with High-Res QR Code */}
                      <div className="p-6 pt-4 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/50">
                        <div className="space-y-0.5">
                          <p className="text-[10px] text-slate-500 font-mono uppercase">ID GIAO DỊCH VÉ</p>
                          <p className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                            {ticket.id}
                          </p>
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold pt-1">
                            Sẵn sàng quét tại cổng
                          </p>
                        </div>

                        <div className="p-2.5 rounded-2xl bg-white text-slate-950 shadow-md ring-1 ring-slate-200 dark:ring-slate-800 group-hover:scale-105 transition-transform">
                          <QrCode className="w-10 h-10" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVE HOLDS */}
          {activeTab === 'holds' && (
            <div className="space-y-4">
              {reservationsList.filter((r) => r.status === 'HELD').length === 0 ? (
                <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800 border-dashed space-y-2">
                  <Clock className="w-12 h-12 text-slate-600 mx-auto" />
                  <h4 className="text-base font-bold text-white">Không Có Suất Giữ Chỗ Nào Đang Chờ</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Khi bạn nhấn &quot;Giữ vé&quot;, vé sẽ được khóa riêng cho bạn trong 10 phút để hoàn tất thủ tục thanh toán.
                  </p>
                </div>
              ) : (
                reservationsList
                  .filter((r) => r.status === 'HELD')
                  .map((res) => (
                    <div
                      key={res.id}
                      className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 to-indigo-950/30 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-white">{res.tierName || 'Hạng vé giữ chỗ'}</span>
                          <span className="text-[11px] font-mono bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full font-bold">
                            Số lượng: {res.quantity} vé
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                          <span className="flex items-center gap-1.5 text-amber-400 font-mono font-bold">
                            <Clock className="w-4 h-4" />
                            Còn {res.seconds_remaining} giây giữ chỗ
                          </span>
                          <span>Hết hạn lúc: {new Date(res.expires_at).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 self-end sm:self-auto">
                        <button
                          onClick={() => handleCancelHold(res.id)}
                          className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 text-xs font-semibold transition border border-slate-700"
                        >
                          Hủy Giữ Chỗ
                        </button>
                        <button
                          onClick={() => onResumeReservation(res)}
                          className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-extrabold text-xs py-2.5 px-5 rounded-xl transition shadow-lg shadow-indigo-600/20"
                        >
                          <span>Tiếp Tục Thanh Toán</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* TAB 3: ORDERS */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {ordersList.length === 0 ? (
                <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800 border-dashed">
                  <h4 className="text-base font-bold text-white">Chưa Có Giao Dịch Nào Được Thực Hiện</h4>
                </div>
              ) : (
                ordersList.map((order) => (
                  <div
                    key={order.id}
                    className="p-6 rounded-3xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white font-mono">{order.paymentReference}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full font-mono ${
                            order.status === 'PAID'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : order.status === 'PENDING'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {order.status === 'PAID' ? 'ĐÃ THANH TOÁN' : order.status}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs text-slate-400">
                        {order.items.map((i) => `${i.tierName} (${i.quantity} vé)`).join(', ')}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-lg font-black text-white font-mono">
                        ${(order.totalAmount / 100).toFixed(2)}
                      </span>
                      <p className="text-[11px] text-slate-500 font-mono">
                        {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
