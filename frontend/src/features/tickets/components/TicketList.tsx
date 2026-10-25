import React, { useState } from 'react';
import { UserTicket } from '../types/ticket.types';
import { QRCodeModal } from './QRCodeModal';
import { PrintableTicketModal } from '../../../components/user/PrintableTicketModal';
import { TransferTicketModal } from '../../../components/user/TransferTicketModal';
import {
  Ticket as TicketIcon,
  QrCode,
  CheckCircle,
  Calendar,
  Sparkles,
  Printer,
  Send,
  Download,
  Eye,
} from 'lucide-react';

interface TicketListProps {
  tickets: UserTicket[];
}

export const TicketList: React.FC<TicketListProps> = ({ tickets }) => {
  const [selectedTicket, setSelectedTicket] = useState<UserTicket | null>(null);
  const [printableTicket, setPrintableTicket] = useState<UserTicket | null>(null);
  const [transferTicket, setTransferTicket] = useState<UserTicket | null>(null);
  const [hiddenTicketIds, setHiddenTicketIds] = useState<string[]>([]);

  const activeTickets = tickets.filter((t) => !hiddenTicketIds.includes(t.id));

  if (activeTickets.length === 0) {
    return (
      <div className="p-16 text-center rounded-3xl bg-slate-900/40 border border-slate-800 border-dashed space-y-3">
        <TicketIcon className="w-14 h-14 text-slate-600 mx-auto" />
        <h4 className="text-lg font-bold text-white">Bạn Chưa Có Vé Nào Trong Ví</h4>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Chọn sự kiện và thực hiện giữ chỗ trong thời gian mở bán để nhận vé điện tử check-in.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeTickets.map((ticket) => (
          <div
            key={ticket.id}
            className="group relative bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-800 hover:border-indigo-500/60 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 flex flex-col justify-between"
          >
            {/* Ticket notch cutouts */}
            <div className="absolute -left-3.5 top-1/2 -mt-3.5 w-7 h-7 rounded-full bg-slate-950 border border-slate-800 shadow-inner z-10" />
            <div className="absolute -right-3.5 top-1/2 -mt-3.5 w-7 h-7 rounded-full bg-slate-950 border border-slate-800 shadow-inner z-10" />

            <div className="p-6 pb-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> VÉ HỢP LỆ
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {new Date(ticket.issuedAt).toLocaleDateString('vi-VN')}
                </span>
              </div>

              <h4 className="text-xl font-black text-white mt-4 tracking-tight group-hover:text-indigo-400 transition-colors">
                {ticket.tierName}
              </h4>

              <div className="mt-2.5 p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-indigo-400 flex items-center justify-between">
                <span className="text-slate-500 text-[10px]">MÃ CHECK-IN:</span>
                <span className="font-bold text-sm tracking-wider">{ticket.ticketCode}</span>
              </div>
            </div>

            <div className="px-6 py-2 border-y border-dashed border-slate-800 flex items-center justify-between text-[11px] text-slate-400 font-mono bg-slate-950/20">
              <span>CỔNG A / CHECK-IN</span>
              <span>1 NGƯỜI / LẦN VÀO</span>
            </div>

            {/* Quick Action Button Bar */}
            <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 flex items-center justify-between gap-2">
              <button
                onClick={() => setSelectedTicket(ticket)}
                className="flex-1 py-2 px-2.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Xem QR</span>
              </button>

              <button
                onClick={() => setPrintableTicket(ticket)}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                title="In vé bản cứng / Lưu PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>In Vé</span>
              </button>

              <button
                onClick={() => setTransferTicket(ticket)}
                className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition"
                title="Chuyển nhượng cho bạn bè"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Tặng Vé</span>
              </button>
            </div>

            <div
              className="p-6 pt-3 flex items-center justify-between bg-slate-950/50 cursor-pointer"
              onClick={() => setSelectedTicket(ticket)}
            >
              <div>
                <p className="text-[10px] text-slate-500 font-mono uppercase">ID GIAO DỊCH VÉ</p>
                <p className="text-xs font-mono text-slate-300 truncate max-w-[150px]">{ticket.id}</p>
                <p className="text-[11px] text-emerald-400 font-semibold pt-1">Bấm để phóng to mã QR</p>
              </div>

              <div className="p-2.5 rounded-2xl bg-white text-slate-950 shadow-xl group-hover:scale-105 transition-transform">
                <QrCode className="w-8 h-8" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedTicket && (
        <QRCodeModal ticket={selectedTicket} onClose={() => setSelectedTicket(null)} />
      )}

      {printableTicket && (
        <PrintableTicketModal
          ticket={printableTicket}
          onClose={() => setPrintableTicket(null)}
        />
      )}

      {transferTicket && (
        <TransferTicketModal
          ticket={transferTicket}
          onClose={() => setTransferTicket(null)}
          onTransferSuccess={(id) => {
            setHiddenTicketIds((prev) => [...prev, id]);
          }}
        />
      )}
    </>
  );
};
