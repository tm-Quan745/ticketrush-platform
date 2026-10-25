import React from 'react';
import { UserTicket } from '../types/ticket.types';
import { Modal } from '../../../components/ui/Modal';
import { QrCode, CheckCircle, Ticket, Download, Share2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface QRCodeModalProps {
  ticket: UserTicket | null;
  onClose: () => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ ticket, onClose }) => {
  if (!ticket) return null;

  return (
    <Modal isOpen={Boolean(ticket)} onClose={onClose} maxWidth="md">
      <div className="text-center space-y-6">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-0.5 rounded-full font-mono">
            <CheckCircle className="w-3 h-3" /> SẴN SÀNG QUÉT TẠI CỔNG
          </span>
          <h3 className="text-2xl font-black text-white tracking-tight mt-2">{ticket.tierName}</h3>
          <p className="text-xs text-slate-400 font-mono">Mã Vé: {ticket.ticketCode}</p>
        </div>

        {/* QR Code Container */}
        <div className="p-8 rounded-3xl bg-white text-slate-950 inline-block shadow-2xl ring-4 ring-indigo-500/30">
          <QrCode className="w-48 h-48 sm:w-56 sm:h-56 mx-auto" />
        </div>

        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400 space-y-1 text-left">
          <div className="flex justify-between">
            <span>Ticket UUID:</span>
            <span className="text-slate-300 truncate max-w-[200px]">{ticket.id}</span>
          </div>
          <div className="flex justify-between">
            <span>Ngày cấp vé:</span>
            <span className="text-slate-300">{new Date(ticket.issuedAt).toLocaleString('vi-VN')}</span>
          </div>
          <div className="flex justify-between">
            <span>Trạng thái:</span>
            <span className="text-emerald-400 font-bold">CHƯA SỬ DỤNG (VALID)</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1 py-3">
            Đóng
          </Button>
          <Button
            onClick={() => alert('Đã lưu mã QR vào thư viện ảnh thiết bị của bạn!')}
            className="flex-1 py-3"
          >
            <Download className="w-4 h-4 mr-1.5" /> Lưu Ảnh Vé
          </Button>
        </div>
      </div>
    </Modal>
  );
};
