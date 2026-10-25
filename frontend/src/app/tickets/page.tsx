import React, { useState } from 'react';
import { useUserTickets } from '../../features/tickets/hooks/useUserTickets';
import { TicketList } from '../../features/tickets/components/TicketList';
import { OrderInvoiceModal } from '../../components/user/OrderInvoiceModal';
import { Order } from '../../types';
import { UserOrder } from '../../features/tickets/types/ticket.types';
import { formatCurrency } from '../../lib/utils';
import {
  Ticket as TicketIcon,
  RefreshCw,
  Receipt,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';

export const TicketsPage: React.FC = () => {
  const { tickets, orders, isLoading, refetch } = useUserTickets();
  const [tab, setTab] = useState<'tickets' | 'orders'>('tickets');
  const [selectedOrder, setSelectedOrder] = useState<UserOrder | Order | null>(null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-mono">
              VÍ VÉ & GIAO DỊCH
            </span>
          </div>
          <h2 className="text-3xl font-black text-white mt-1">Quản Lý Vé & Hóa Đơn</h2>
          <p className="text-xs text-slate-400 mt-1">
            Tra cứu vé điện tử đã mua, mã QR quét tại cổng vào và lịch sử giao dịch thanh toán.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab buttons */}
          <div className="bg-slate-900 border border-slate-800 p-1 rounded-2xl flex items-center">
            <button
              onClick={() => setTab('tickets')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                tab === 'tickets'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TicketIcon className="w-3.5 h-3.5" />
              <span>Vé Của Tôi ({tickets.length})</span>
            </button>

            <button
              onClick={() => setTab('orders')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                tab === 'orders'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>Lịch Sử Đơn ({orders.length})</span>
            </button>
          </div>

          <Button variant="secondary" size="sm" onClick={() => refetch()} isLoading={isLoading}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Làm Mới
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-24 text-center text-slate-500 font-mono text-sm animate-pulse">
          Đang đồng bộ dữ liệu vé và giao dịch từ máy chủ...
        </div>
      ) : tab === 'tickets' ? (
        <TicketList tickets={tickets} />
      ) : (
        /* Orders & Transactions List */
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800 border-dashed space-y-3">
              <Receipt className="w-14 h-14 text-slate-600 mx-auto" />
              <h4 className="text-lg font-bold text-white">Chưa Có Giao Dịch Nào</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Lịch sử thanh toán và biên lai điện tử sẽ tự động lưu lại tại đây sau mỗi đơn hàng thành công.
              </p>
            </div>
          ) : (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-2xl">
              <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs font-bold text-slate-400 font-mono">
                <span>DANH SÁCH ĐƠN HÀNG ĐÃ TẠO</span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Idempotent Transaction Guarantee
                </span>
              </div>

              <div className="divide-y divide-slate-800/80">
                {orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-800/40 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold ${
                            ord.status === 'PAID'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : ord.status === 'REFUNDED'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {ord.status === 'PAID' ? 'ĐÃ THANH TOÁN' : ord.status}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          {new Date(ord.createdAt).toLocaleString('vi-VN')}
                        </span>
                      </div>

                      <div className="font-mono text-xs text-white font-bold flex items-center gap-2">
                        <span>Mã đơn: {ord.id}</span>
                        <span className="text-slate-500">|</span>
                        <span className="text-indigo-400">Ref: {ord.paymentReference || 'TX-ONLINE'}</span>
                      </div>

                      <div className="text-[11px] text-slate-400">
                        {ord.items && ord.items.length > 0 ? (
                          ord.items.map((i) => `${i.tierName} (x${i.quantity})`).join(', ')
                        ) : (
                          <span>Vé tham dự sự kiện flash-sale</span>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2">
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 font-mono block">TỔNG TIỀN</span>
                        <span className="text-lg font-black font-mono text-emerald-400">
                          {formatCurrency(ord.totalAmount, ord.currency || 'USD')}
                        </span>
                      </div>

                      <button
                        onClick={() => setSelectedOrder(ord)}
                        className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 transition"
                      >
                        <Receipt className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Xem Hóa Đơn</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order Invoice & Refund Modal */}
      {selectedOrder && (
        <OrderInvoiceModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onRefundRequested={() => {
            refetch();
            setSelectedOrder(null);
          }}
        />
      )}
    </div>
  );
};
