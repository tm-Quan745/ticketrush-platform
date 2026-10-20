import React, { useState } from 'react';
import { Ticket as TicketType } from '../../types';
import { useNotifications } from '../../context/NotificationContext';
import {
  X,
  Send,
  Mail,
  User,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface TransferTicketModalProps {
  ticket: TicketType | null;
  onClose: () => void;
  onTransferSuccess?: (ticketId: string) => void;
}

export const TransferTicketModal: React.FC<TransferTicketModalProps> = ({
  ticket,
  onClose,
  onTransferSuccess,
}) => {
  const { addNotification } = useNotifications();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTransferred, setIsTransferred] = useState(false);

  if (!ticket) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      setIsTransferred(true);

      addNotification({
        title: 'Chuyển Nhượng Vé Thành Công',
        message: `Đã chuyển vé ${ticket.ticketCode} sang tài khoản ${recipientEmail}. Quyền check-in của bạn đã bị thu hồi.`,
        category: 'ORDER',
        linkAction: 'tickets',
      });

      onTransferSuccess?.(ticket.id);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-12 flex items-center justify-center animate-in fade-in duration-200">
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-white text-base">Chuyển Nhượng Vé Cho Bạn Bè</h3>
              <p className="text-xs text-slate-400 font-mono">Vé: {ticket.ticketCode}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {isTransferred ? (
            <div className="text-center py-6 space-y-4 animate-in fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-black text-white">Chuyển Vé Thành Công!</h4>
                <p className="text-xs text-slate-300 max-w-xs mx-auto mt-1 leading-relaxed">
                  Vé <strong>{ticket.tierName}</strong> đã được chuyển giao an toàn tới{' '}
                  <span className="text-indigo-400 font-mono">{recipientEmail}</span>.
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 text-left space-y-1">
                <div className="flex justify-between">
                  <span>Người nhận:</span>
                  <strong className="text-white">{recipientName}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Mã giao dịch chuyển nhượng:</span>
                  <span className="font-mono text-indigo-400">TX-{Date.now().toString().slice(-6)}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition"
              >
                Hoàn Tất & Đóng
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  <strong>Lưu ý quan trọng:</strong> Sau khi chuyển nhượng, vé của bạn sẽ bị vô hiệu hóa
                  vĩnh viễn và cấp mã mới cho người nhận. Thao tác không thể hoàn tác!
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-indigo-400" />
                  Email tài khoản người nhận (TicketRush)
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="friend@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  Họ và tên người nhận (Theo CCCD để check-in)
                </label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Lời nhắn gửi kèm (Tùy chọn)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Gửi tặng bạn vé xem concert cuối tuần này nhé!"
                  rows={2}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  Mã xác thực bảo mật (Nhập 6 số bất kỳ để xác nhận)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-center tracking-widest text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-1/2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !recipientEmail || !recipientName || otp.length < 6}
                  className="w-1/2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    'Đang chuyển...'
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Xác Nhận Chuyển Vé
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
