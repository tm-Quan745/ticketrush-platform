import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Search,
  Ticket,
  Clock,
  Sparkles,
  MapPin,
  Calendar,
  Lock,
} from 'lucide-react';
import { api } from '../api/client';
import { Ticket as TicketType } from '../types';

interface GateScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GateScannerModal: React.FC<GateScannerModalProps> = ({ isOpen, onClose }) => {
  const [ticketCodeInput, setTicketCodeInput] = useState('');
  const [availableTickets, setAvailableTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{
    status: 'IDLE' | 'SUCCESS' | 'REJECTED' | 'INVALID';
    message: string;
    ticket?: TicketType;
    eventTitle?: string;
    venue?: string;
    checkedInAt?: string;
  }>({
    status: 'IDLE',
    message: 'Sẵn sàng quét mã QR vé tại cổng sự kiện.',
  });

  const [stats, setStats] = useState({
    totalScanned: 0,
    validPassed: 0,
    rejected: 0,
  });

  useEffect(() => {
    if (isOpen) {
      loadTickets();
    }
  }, [isOpen]);

  const loadTickets = async () => {
    try {
      const tickets = await api.getAllTickets();
      setAvailableTickets(tickets || []);
      if (tickets && tickets.length > 0 && !ticketCodeInput) {
        setTicketCodeInput(tickets[0].ticketCode);
      }
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  const handleVerifyOnly = async () => {
    if (!ticketCodeInput.trim()) return;
    setLoading(true);
    try {
      const res = await api.verifyTicket(ticketCodeInput.trim());
      if (res.valid) {
        setScanResult({
          status: 'SUCCESS',
          message: 'Vé hợp lệ - Đủ điều kiện qua cổng soát vé!',
          ticket: res.ticket,
          eventTitle: res.eventTitle,
          venue: res.venue,
        });
      } else if (res.status === 'USED') {
        setScanResult({
          status: 'REJECTED',
          message: res.message || 'Vé này đã được check-in trước đó. Cảnh báo vé quay đầu!',
          ticket: res.ticket,
          eventTitle: res.eventTitle,
          venue: res.venue,
        });
      } else {
        setScanResult({
          status: 'INVALID',
          message: res.message || 'Mã vé không tồn tại hoặc đã bị hủy.',
        });
      }
    } catch (err: any) {
      setScanResult({
        status: 'INVALID',
        message: err.message || 'Lỗi kết nối kiểm tra mã vé.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckInNow = async (codeToUse?: string) => {
    const code = codeToUse || ticketCodeInput.trim();
    if (!code) return;
    setLoading(true);
    try {
      const res = await api.checkInTicket(code);
      setStats((prev) => ({
        totalScanned: prev.totalScanned + 1,
        validPassed: prev.validPassed + 1,
        rejected: prev.rejected,
      }));
      setScanResult({
        status: 'SUCCESS',
        message: 'CHECK-IN THÀNH CÔNG! Mời khán giả qua cổng.',
        ticket: res.ticket,
        eventTitle: res.eventTitle,
        venue: res.venue,
        checkedInAt: (res.ticket as any)?.checkedInAt || new Date().toISOString(),
      });
      loadTickets();
    } catch (err: any) {
      setStats((prev) => ({
        totalScanned: prev.totalScanned + 1,
        validPassed: prev.validPassed,
        rejected: prev.rejected + 1,
      }));
      setScanResult({
        status: 'REJECTED',
        message: err.message || 'Check-in thất bại: Vé đã sử dụng hoặc không hợp lệ.',
      });
      loadTickets();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-600/10 border border-emerald-500/30 text-emerald-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Cổng Soát Vé Điện Tử (Gate Scanner)</h3>
                <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                  Online
                </span>
              </div>
              <p className="text-xs text-slate-400">Xác thực mã QR vé vào cổng & chống gian lận quay đầu</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Realtime Stats Bar */}
        <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-950/40 divide-x divide-slate-800 text-center py-2.5 text-xs font-mono">
          <div>
            <span className="text-slate-400 block text-[10px]">TỔNG QUÉT</span>
            <span className="font-bold text-white text-base">{stats.totalScanned}</span>
          </div>
          <div>
            <span className="text-emerald-400 block text-[10px]">HỢP LỆ VÀO CỔNG</span>
            <span className="font-bold text-emerald-400 text-base">{stats.validPassed}</span>
          </div>
          <div>
            <span className="text-rose-400 block text-[10px]">TỪ CHỐI / ĐÃ DÙNG</span>
            <span className="font-bold text-rose-400 text-base">{stats.rejected}</span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Simulated Scanner Viewfinder */}
          <div className="relative rounded-2xl bg-slate-950 border-2 border-dashed border-slate-800 p-6 flex flex-col items-center justify-center min-h-[160px] overflow-hidden">
            {/* Animated Laser Scanning Beam */}
            <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#34d399] animate-bounce" />

            <QrCode className="w-16 h-16 text-slate-700 mb-2" />
            <p className="text-xs text-slate-400 font-mono text-center">
              Hướng camera vào mã QR trên ứng dụng ví vé của khán giả
            </p>
          </div>

          {/* Code Input & Actions */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-300">
              Nhập mã vé hoặc chọn vé mẫu trong hệ thống:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ticketCodeInput}
                onChange={(e) => setTicketCodeInput(e.target.value)}
                placeholder="VD: TR-VIP-582910"
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 uppercase"
              />
              <button
                onClick={handleVerifyOnly}
                disabled={loading || !ticketCodeInput}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition disabled:opacity-50"
              >
                Kiểm Tra
              </button>
              <button
                onClick={() => handleCheckInNow()}
                disabled={loading || !ticketCodeInput}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition disabled:opacity-50 shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Quét Check-in</span>
              </button>
            </div>
          </div>

          {/* Quick Select Ticket from System */}
          {availableTickets.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                <span>Vé phát hành sẵn có trên hệ thống ({availableTickets.length}):</span>
                <span className="text-[10px] text-slate-500">Nhấn để điền nhanh</span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {availableTickets.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTicketCodeInput(t.ticketCode);
                      handleCheckInNow(t.ticketCode);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono transition border flex items-center gap-1.5 ${
                      t.status === 'USED'
                        ? 'bg-rose-950/40 text-rose-300 border-rose-800/40 line-through'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-emerald-500 hover:text-white'
                    }`}
                  >
                    <span>{t.ticketCode}</span>
                    <span className="text-[10px] font-sans opacity-70">({t.tierName})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Scan Result Feedback Card */}
          {scanResult.status !== 'IDLE' && (
            <div
              className={`p-4 rounded-2xl border transition-all ${
                scanResult.status === 'SUCCESS'
                  ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-200'
                  : scanResult.status === 'REJECTED'
                  ? 'bg-rose-950/40 border-rose-700/50 text-rose-200'
                  : 'bg-amber-950/40 border-amber-700/50 text-amber-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {scanResult.status === 'SUCCESS' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <h4 className="text-sm font-black">{scanResult.message}</h4>
                  {scanResult.ticket && (
                    <div className="text-xs space-y-0.5 font-mono text-slate-300 pt-1">
                      <div>Mã vé: <strong className="text-white">{scanResult.ticket.ticketCode}</strong></div>
                      <div>Hạng vé: <strong className="text-white">{scanResult.ticket.tierName}</strong></div>
                      {scanResult.eventTitle && (
                        <div>Sự kiện: <span className="text-slate-300">{scanResult.eventTitle}</span></div>
                      )}
                      {scanResult.checkedInAt && (
                        <div>Thời gian check-in: <span className="text-emerald-400">{new Date(scanResult.checkedInAt).toLocaleTimeString()}</span></div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-xs text-slate-400">
          <span>Chế độ an ninh: Bật xác thực chữ ký số HMAC-SHA256</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition"
          >
            Đóng Cổng Soát Vé
          </button>
        </div>
      </div>
    </div>
  );
};
