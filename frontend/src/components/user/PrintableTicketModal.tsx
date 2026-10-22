import React from 'react';
import { Ticket as TicketType } from '../../types';
import { X, Printer, Download, Sparkles, MapPin, Calendar, Clock, ShieldCheck, QrCode } from 'lucide-react';

interface PrintableTicketModalProps {
  ticket: TicketType | null;
  onClose: () => void;
}

export const PrintableTicketModal: React.FC<PrintableTicketModalProps> = ({ ticket, onClose }) => {
  if (!ticket) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-12 flex items-center justify-center animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col">
        {/* Top Action Bar (hidden in print) */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-black tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-mono">
              BẢN IN VÉ CHÍNH THỨC
            </span>
            <span className="text-xs text-slate-400 font-mono">Mã: {ticket.ticketCode}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg transition"
            >
              <Printer className="w-3.5 h-3.5" />
              In Bản Vé / Lưu PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Ticket Pass Body */}
        <div className="p-6 sm:p-8 bg-slate-950 print:bg-white print:text-black">
          <div className="rounded-3xl border-2 border-indigo-500/40 print:border-black p-6 sm:p-8 relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/30 print:from-white print:to-white shadow-2xl">
            {/* Hologram Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-amber-400 via-rose-500 via-indigo-500 to-emerald-400" />

            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-dashed border-slate-800 print:border-slate-300">
              <div>
                <div className="flex items-center gap-2 text-rose-400 print:text-red-600 text-xs font-mono font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  Vé Điện Tử Định Danh
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white print:text-black mt-1">
                  The Eras Tour | Stadium Live
                </h2>
                <p className="text-xs text-slate-400 print:text-slate-600 mt-0.5">
                  Taylor Swift World Stadium Tour 2026
                </p>
              </div>

              <div className="sm:text-right">
                <span className="text-[11px] font-mono uppercase bg-amber-500/20 text-amber-300 print:bg-yellow-100 print:text-yellow-900 px-3 py-1 rounded-xl font-black border border-amber-500/30">
                  {ticket.tierName || 'VIP DIAMOND FLOOR'}
                </span>
                <div className="text-xs text-slate-400 print:text-slate-600 font-mono mt-1">
                  Cổng Vào: <strong className="text-white print:text-black">GATE 03</strong>
                </div>
              </div>
            </div>

            {/* Middle Section: Event Logistics & Location */}
            <div className="grid sm:grid-cols-3 gap-4 py-6 border-b border-dashed border-slate-800 print:border-slate-300 text-xs">
              <div className="space-y-1">
                <span className="text-slate-500 print:text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  Thời gian biểu diễn
                </span>
                <div className="font-bold text-white print:text-black flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  19:30, Thứ Bảy 24/10/2026
                </div>
                <div className="text-slate-400 print:text-slate-600 text-[11px] font-mono">
                  Mở cổng lúc 17:00
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 print:text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  Địa điểm & Sân vận động
                </span>
                <div className="font-bold text-white print:text-black flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  Sân Vận Động SoFi Stadium
                </div>
                <div className="text-slate-400 print:text-slate-600 text-[11px]">
                  1001 Stadium Dr, Inglewood, CA
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 print:text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  Khán Đài & Ghế Ngồi
                </span>
                <div className="font-mono font-bold text-indigo-400 print:text-indigo-700 text-base">
                  Khu Vực PIT-A • Ghế 12
                </div>
                <div className="text-slate-400 print:text-slate-600 text-[11px]">
                  Lối đi riêng cho vé VIP
                </div>
              </div>
            </div>

            {/* QR & Barcode Section */}
            <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                {/* Simulated QR Code */}
                <div className="w-28 h-28 bg-white p-2.5 rounded-2xl shadow-lg border border-slate-200 flex flex-col items-center justify-center">
                  <div className="w-full h-full border-2 border-dashed border-slate-950 flex flex-col items-center justify-center text-slate-950 font-mono text-[9px] text-center p-1 font-bold">
                    <QrCode className="w-16 h-16 text-slate-900 mx-auto" />
                    <span>CHECK-IN VALID</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-mono font-bold text-white print:text-black">
                    Mã Vé: <span className="text-indigo-400 print:text-indigo-700">{ticket.ticketCode}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 print:text-slate-600">
                    Phát hành: {new Date(ticket.issuedAt).toLocaleString('vi-VN')}
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-emerald-400 print:text-emerald-700 font-bold">
                    <ShieldCheck className="w-4 h-4" />
                    Bảo mật chống vé giả bằng mật mã RSA
                  </div>
                </div>
              </div>

              {/* Barcode graphic */}
              <div className="text-right space-y-1 font-mono">
                <div className="h-10 w-40 flex items-end justify-between px-1 bg-white p-1 rounded border border-slate-300">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-black h-full"
                      style={{ width: i % 3 === 0 ? '3px' : i % 2 === 0 ? '1.5px' : '1px' }}
                    />
                  ))}
                </div>
                <span className="text-[9px] text-slate-500 tracking-widest block text-center">
                  *TR-{ticket.ticketCode.slice(0, 12)}*
                </span>
              </div>
            </div>

            {/* Terms notice */}
            <div className="mt-6 pt-4 border-t border-slate-800 print:border-slate-300 text-[10px] text-slate-500 print:text-slate-600 leading-relaxed font-mono">
              Vui lòng mang theo vé bản in này hoặc xuất trình mã QR trên điện thoại cùng CCCD/Hộ chiếu tại cổng kiểm soát. Mỗi vé chỉ có hiệu lực quét 1 lần duy nhất tại cửa vào.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
