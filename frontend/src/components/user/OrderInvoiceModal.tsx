import React, { useState } from 'react';
import { Order, Ticket } from '../../types';
import { UserOrder } from '../../features/tickets/types/ticket.types';
import { formatCurrency } from '../../lib/utils';
import {
  X,
  FileText,
  Download,
  ShieldCheck,
  RotateCcw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Printer,
  Copy,
  Check,
} from 'lucide-react';

interface OrderInvoiceModalProps {
  order: (Order | UserOrder) | null;
  tickets?: Ticket[];
  onClose: () => void;
  onRefundRequested?: (orderId: string) => void;
}

export const OrderInvoiceModal: React.FC<OrderInvoiceModalProps> = ({
  order,
  tickets = [],
  onClose,
  onRefundRequested,
}) => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [refundConfirm, setRefundConfirm] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [refundSuccess, setRefundSuccess] = useState(false);

  if (!order) return null;

  const handleCopyKey = () => {
    if (order.id) {
      navigator.clipboard.writeText(order.id);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleExecuteRefund = () => {
    setRefundLoading(true);
    setTimeout(() => {
      setRefundLoading(false);
      setRefundSuccess(true);
      onRefundRequested?.(order.id);
    }, 1200);
  };

  const subtotal = order.totalAmount;
  const vat = Math.round(subtotal * 0.08); // 8% VAT
  const grandTotal = subtotal + vat;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-12 flex items-center justify-center animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-white text-base flex items-center gap-2">
                Hóa Đơn Điện Tử & Chi Tiết Giao Dịch
                <span
                  className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold ${
                    order.status === 'PAID'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : order.status === 'REFUNDED'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {order.status}
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-mono">Mã đơn: {order.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="In hóa đơn"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Body */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {refundSuccess ? (
            <div className="p-6 rounded-2xl bg-rose-950/40 border border-rose-800 text-center space-y-3">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h4 className="font-black text-white text-base">Yêu Cầu Hoàn Tiền Đã Được Xử Lý</h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                Số tiền {formatCurrency(order.totalAmount, order.currency)} đang được hoàn trả lại phương thức thanh toán ban đầu. Toàn bộ vé trong đơn hàng đã được hoàn về kho khả dụng theo nguyên tắc Zero Overselling.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs"
              >
                Đóng
              </button>
            </div>
          ) : (
            <>
              {/* Idempotency Key & Proof Card */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-400 font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Idempotency-Key (Bảo Mật Chống Trùng Lặp)
                  </span>
                  <button
                    onClick={handleCopyKey}
                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-mono transition"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? 'Đã sao chép' : 'Sao chép Key'}</span>
                  </button>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 font-mono text-[11px] text-slate-300 break-all">
                  {order.id}
                </div>
                <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                  <span>Mã tham chiếu thanh toán:</span>
                  <strong className="text-white">{order.paymentReference || 'TX-ONLINE-SETTLED'}</strong>
                </div>
              </div>

              {/* Items Breakdown Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                  Danh Mục Hạng Vé & Chi Tiết
                </h4>
                <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-mono">
                        <th className="p-3">Hạng Vé</th>
                        <th className="p-3 text-center">SL</th>
                        <th className="p-3 text-right">Đơn Giá</th>
                        <th className="p-3 text-right">Thành Tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {order.items && order.items.length > 0 ? (
                        order.items.map((item, idx) => {
                          const unitPrice = item.unitPrice || Math.round(order.totalAmount / (item.quantity || 1));
                          const currency = order.currency || 'VND';
                          return (
                            <tr key={idx} className="hover:bg-slate-900/40">
                              <td className="p-3 font-bold text-white">{item.tierName}</td>
                              <td className="p-3 text-center text-slate-300">{item.quantity}</td>
                              <td className="p-3 text-right text-slate-400">
                                {formatCurrency(unitPrice, currency)}
                              </td>
                              <td className="p-3 text-right text-emerald-400 font-bold">
                                {formatCurrency(unitPrice * item.quantity, currency)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td className="p-3 font-bold text-white">Vé Tham Dự Flash-Sale</td>
                          <td className="p-3 text-center text-slate-300">1</td>
                          <td className="p-3 text-right text-slate-400">
                            {formatCurrency(order.totalAmount, order.currency || 'VND')}
                          </td>
                          <td className="p-3 text-right text-emerald-400 font-bold">
                            {formatCurrency(order.totalAmount, order.currency || 'VND')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Price Calculation Summary */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Tiền vé thuần:</span>
                  <span>{formatCurrency(subtotal, order.currency || 'VND')}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Thuế VAT (8%) & Phí cổng thanh toán:</span>
                  <span>{formatCurrency(vat, order.currency || 'VND')}</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-bold">
                  <span className="text-white">Tổng tiền đã thanh toán:</span>
                  <span className="text-emerald-400 text-lg">
                    {formatCurrency(grandTotal, order.currency || 'VND')}
                  </span>
                </div>
              </div>

              {/* Refund / Cancellation Flow */}
              {order.status === 'PAID' && (
                <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-800/60 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="font-bold text-xs text-rose-300 flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5" />
                        Chính Sách Hoàn Hủy Vé Có Điều Kiện
                      </span>
                      <span className="text-[11px] text-slate-400 block leading-relaxed">
                        Bạn có thể yêu cầu hoàn vé trước thời điểm diễn ra sự kiện 48 giờ. Vé sau khi hoàn sẽ được mở lại cho hàng đợi phòng chờ ảo.
                      </span>
                    </div>

                    {!refundConfirm ? (
                      <button
                        onClick={() => setRefundConfirm(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 text-rose-300 hover:text-white font-bold text-xs transition shrink-0"
                      >
                        Yêu Cầu Hoàn Tiền
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={handleExecuteRefund}
                          disabled={refundLoading}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg transition"
                        >
                          {refundLoading ? 'Đang xử lý...' : 'Xác Nhận Hoàn'}
                        </button>
                        <button
                          onClick={() => setRefundConfirm(false)}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
                        >
                          Hủy
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>Hóa đơn hợp lệ theo quy định thanh toán trực tuyến</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
