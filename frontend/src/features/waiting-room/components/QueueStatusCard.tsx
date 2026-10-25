import React from 'react';
import { QueueStatus } from '../hooks/useQueueSocket';
import { Users, Activity, CheckCircle, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '../../../components/ui/Button';

interface QueueStatusCardProps {
  status: QueueStatus | null;
  onAdmitted: () => void;
  onLeave: () => void;
  eventTitle: string;
}

export const QueueStatusCard: React.FC<QueueStatusCardProps> = ({
  status,
  onAdmitted,
  onLeave,
  eventTitle,
}) => {
  const isAdmitted = status?.state === 'ADMITTED';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center max-w-lg mx-auto space-y-6 shadow-2xl">
      <div className="relative flex justify-center">
        {isAdmitted ? (
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 animate-bounce">
            <CheckCircle className="w-10 h-10" />
          </div>
        ) : (
          <div className="relative flex items-center justify-center">
            <div className="absolute w-28 h-28 rounded-full bg-rose-500/10 animate-ping opacity-60" />
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-rose-600 to-amber-600 flex items-center justify-center text-white shadow-xl shadow-rose-600/30">
              <Users className="w-9 h-9" />
            </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-2xl font-black text-white">
          {isAdmitted ? 'Bạn Đã Được Mở Cổng!' : 'Phòng Chờ Ảo Đang Xếp Hàng'}
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Sự kiện: <strong className="text-slate-200">{eventTitle}</strong>
        </p>
      </div>

      {isAdmitted ? (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800 text-left">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-1">
              <ShieldCheck className="w-4 h-4" />
              Mã Ủy Quyền Hợp Lệ
            </div>
            <p className="text-xs text-emerald-300 font-mono break-all">{status?.token}</p>
          </div>
          <Button onClick={onAdmitted} variant="success" className="w-full py-3.5">
            Tiến Vào Chọn Vé & Giữ Chỗ
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Vị trí của bạn</span>
              <p className="text-3xl font-black text-white mt-1 font-mono">#{status?.position || 1}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400">Thời gian chờ</span>
              <p className="text-3xl font-black text-amber-400 mt-1 font-mono">
                ~{status?.estimatedWaitSeconds || 10}s
              </p>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 text-left bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            Hệ thống điều tiết lượt vào để bảo vệ database khỏi khóa dòng. Vui lòng không tải lại trang.
          </p>

          <button onClick={onLeave} className="text-xs text-slate-500 hover:text-rose-400 underline">
            Rời khỏi phòng chờ
          </button>
        </div>
      )}
    </div>
  );
};
