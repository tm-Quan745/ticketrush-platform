import React, { useState, useEffect } from 'react';
import { Event, WaitingRoomStatus } from '../types';
import { api } from '../api/client';
import { X, Users, Activity, CheckCircle, ArrowRight, ShieldCheck, Clock, Zap, AlertTriangle, Sparkles } from 'lucide-react';

interface WaitingRoomModalProps {
  event: Event;
  onAdmitted: (token: string) => void;
  onClose: () => void;
}

export const WaitingRoomModal: React.FC<WaitingRoomModalProps> = ({ event, onAdmitted, onClose }) => {
  const [status, setStatus] = useState<WaitingRoomStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pulseCount, setPulseCount] = useState<number>(0);

  // Poll waiting room queue
  useEffect(() => {
    let intervalId: any = null;

    const joinQueue = async () => {
      try {
        const initial = await api.joinWaitingRoom(event.id);
        setStatus(initial);
        setLoading(false);

        if (initial.state === 'ADMITTED' && initial.token) {
          onAdmitted(initial.token);
          return;
        }

        intervalId = setInterval(async () => {
          try {
            const updated = await api.getWaitingRoomStatus(event.id);
            setStatus(updated);
            setPulseCount((c) => c + 1);
            if (updated.state === 'ADMITTED' && updated.token) {
              clearInterval(intervalId);
            }
          } catch (err: any) {
            console.error('Polling queue error:', err);
          }
        }, 2000);
      } catch (err: any) {
        setError(err.message || 'Không thể tham gia hàng đợi');
        setLoading(false);
      }
    };

    joinQueue();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [event.id]);

  const handleLeave = async () => {
    try {
      await api.leaveWaitingRoom(event.id);
    } catch {
      // ignore
    }
    onClose();
  };

  const isAdmitted = status?.state === 'ADMITTED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center">
        {/* Close / Leave button */}
        <button
          onClick={handleLeave}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white transition"
          title="Rời khỏi phòng chờ"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Radar / Hologram Pulse Circle */}
        <div className="relative my-4 flex items-center justify-center">
          {isAdmitted ? (
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-2xl shadow-emerald-500/30 animate-bounce">
                <CheckCircle className="w-12 h-12" />
              </div>
              <Sparkles className="w-6 h-6 text-amber-400 absolute -top-2 -right-2 animate-spin" />
            </div>
          ) : (
            <div className="relative flex items-center justify-center">
              {/* Pulsing radar waves */}
              <div className="absolute w-28 h-28 rounded-full bg-rose-500/10 animate-ping opacity-60 pointer-events-none" />
              <div className="absolute w-20 h-20 rounded-full bg-rose-500/20 animate-pulse pointer-events-none" />
              <div className="relative w-20 h-20 rounded-full bg-gradient-to-tr from-rose-600 to-amber-600 border border-rose-400/50 flex items-center justify-center text-white shadow-xl shadow-rose-600/30">
                <Users className="w-9 h-9" />
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" />
            {isAdmitted ? 'Đã được mở cổng truy cập' : 'Phòng Chờ Ảo (Virtual Queue)'}
          </div>
          <h3 className="text-2xl font-black text-white tracking-tight">
            {isAdmitted ? 'Chúc Mừng! Đến Lượt Của Bạn' : 'Đang Điều Tiết Lưu Lượng'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Sự kiện: <strong className="text-slate-200">{event.title}</strong>
          </p>
        </div>

        {/* Queue Metrics */}
        {loading ? (
          <div className="my-8 text-sm text-slate-400 flex items-center gap-2">
            <Activity className="w-4 h-4 animate-spin text-rose-500" />
            Đang phân bổ vị trí lượt chờ...
          </div>
        ) : isAdmitted ? (
          <div className="my-6 w-full space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-950/50 border border-emerald-800/80 text-left">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1">
                <ShieldCheck className="w-4 h-4" />
                Mã Ủy Quyền (Admission Token) Hợp Lệ
              </div>
              <p className="text-xs text-emerald-300 font-mono break-all bg-emerald-950/80 p-2 rounded-lg border border-emerald-800/50">
                {status?.token}
              </p>
              <div className="mt-2.5 text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Mã này cho phép bạn vượt qua Redis Gate để giữ chỗ vé trong 10 phút.
              </div>
            </div>

            <button
              onClick={() => status?.token && onAdmitted(status.token)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-extrabold text-sm py-4 px-6 rounded-2xl transition shadow-xl shadow-emerald-600/25 active:scale-[0.98]"
            >
              <span>Vào Chọn Hạng Vé & Giữ Chỗ Ngay</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="my-6 w-full space-y-4">
            {/* Live Queue Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Số Thứ Tự Của Bạn
                </span>
                <p className="text-3xl font-black text-white mt-1 font-mono">
                  #{status?.position || 1}
                </p>
                <span className="text-[10px] text-slate-500">Người trong hàng đợi</span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Thời Gian Chờ Ước Tính
                </span>
                <p className="text-3xl font-black text-amber-400 mt-1 font-mono">
                  ~{status?.estimatedWaitSeconds ?? 10}s
                </p>
                <span className="text-[10px] text-slate-500">Tốc độ: {event.waitingRoomRate || 10} người/đợt</span>
              </div>
            </div>

            {/* Live Queue progress bar */}
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>Trạng thái hàng đợi</span>
                <span className="text-rose-400 font-bold">Đang tiến dần về vị trí #1</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500 rounded-full animate-pulse"
                  style={{ width: `${Math.min(100, Math.max(15, 100 - (status?.position || 1) * 8))}%` }}
                />
              </div>
            </div>

            {/* Architectural explanation */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-left text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Activity className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span>Cơ chế bảo vệ quá tải (Token Bucket Rate Limiter)</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Phòng chờ tự động điều tiết các lượt truy cập vào hệ thống theo từng đợt để bảo vệ database khỏi tình trạng khóa dòng (row-level deadlocks) và bảo đảm tính công bằng tuyệt đối. Vui lòng không làm mới trình duyệt.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500 font-mono">
              <span>Heartbeat: Đồng bộ #{pulseCount}</span>
              <button
                onClick={handleLeave}
                className="text-slate-400 hover:text-rose-400 transition underline font-sans"
              >
                Hủy và rời hàng đợi
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
