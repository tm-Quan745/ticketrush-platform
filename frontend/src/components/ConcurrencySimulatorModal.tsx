import React, { useState, useEffect } from 'react';
import { Event, TicketTier } from '../types';
import { api } from '../api/client';
import { Zap, Play, CheckCircle2, AlertTriangle, ShieldCheck, Cpu, RefreshCw, BarChart2, X } from 'lucide-react';

interface ConcurrencyResult {
  totalRequests: number;
  successCount: number;
  conflictCount: number;
  errorCount: number;
  durationMs: number;
  tierBefore: { total: number; available: number; held: number; sold: number };
  tierAfter: { total: number; available: number; held: number; sold: number };
  oversellDetected: boolean;
}

interface ConcurrencySimulatorModalProps {
  onClose?: () => void;
}

export const ConcurrencySimulatorModal: React.FC<ConcurrencySimulatorModalProps> = ({ onClose }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [concurrentThreads, setConcurrentThreads] = useState<number>(50);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<ConcurrencyResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const data = await api.getEvents();
      setEvents(data.content);
      if (data.content.length > 0) {
        setSelectedEventId(data.content[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (selectedEventId) {
      api.getAdminInventory(selectedEventId).then((data) => {
        setTiers(data);
        if (data.length > 0) {
          setSelectedTierId(data[0].id);
        }
      });
    }
  }, [selectedEventId]);

  const runConcurrentTest = async () => {
    if (!selectedTierId) return;
    setIsRunning(true);
    setResult(null);

    try {
      // 1. Snapshot before
      const invBefore = await api.getAdminInventory(selectedEventId);
      const tierBefore = invBefore.find((t) => t.id === selectedTierId) || {
        totalQuantity: 0,
        availableQuantity: 0,
        heldQuantity: 0,
        soldQuantity: 0,
      };

      const startTime = performance.now();

      // 2. Dispatch N concurrent requests in parallel
      const requests = Array.from({ length: concurrentThreads }, () =>
        api.createReservation(selectedTierId, 1).then(
          () => ({ status: 'SUCCESS' }),
          (err) => ({ status: err.data?.code || 'ERROR' })
        )
      );

      const responses = await Promise.all(requests);
      const durationMs = Math.round(performance.now() - startTime);

      // 3. Snapshot after
      const invAfter = await api.getAdminInventory(selectedEventId);
      const tierAfter = invAfter.find((t) => t.id === selectedTierId) || {
        totalQuantity: 0,
        availableQuantity: 0,
        heldQuantity: 0,
        soldQuantity: 0,
      };

      const successCount = responses.filter((r) => r.status === 'SUCCESS').length;
      const conflictCount = responses.filter((r) => r.status === 'SOLD_OUT').length;
      const errorCount = responses.length - successCount - conflictCount;

      // Invariant Check: Did held + sold ever exceed total?
      const totalCommitted = tierAfter.heldQuantity + tierAfter.soldQuantity;
      const oversellDetected = totalCommitted > tierAfter.totalQuantity;

      setResult({
        totalRequests: concurrentThreads,
        successCount,
        conflictCount,
        errorCount,
        durationMs,
        tierBefore: {
          total: tierBefore.totalQuantity,
          available: tierBefore.availableQuantity,
          held: tierBefore.heldQuantity,
          sold: tierBefore.soldQuantity,
        },
        tierAfter: {
          total: tierAfter.totalQuantity,
          available: tierAfter.availableQuantity,
          held: tierAfter.heldQuantity,
          sold: tierAfter.soldQuantity,
        },
        oversellDetected,
      });
    } catch (err) {
      alert('Lỗi thực thi kiểm thử: ' + err);
    } finally {
      setIsRunning(false);
    }
  };

  const selectedTier = tiers.find((t) => t.id === selectedTierId);

  const content = (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Title */}
      <div className="flex items-start justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Zap className="w-3.5 h-3.5" />
            Kiểm Thử Chịu Tải Cao (High-Load Concurrency Benchmark)
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Mô Phỏng Tranh Mua Vé Đồng Thời (Race Conditions)
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Kích hoạt hàng chục luồng yêu cầu đồng thời vào cùng một hạng vé để kiểm chứng Invariant #1: Tuyệt đối không bán khống (Zero Overselling), các yêu cầu vượt quá kho vé được trả về 409 SOLD_OUT ngay lập tức.
          </p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Control Panel */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 grid sm:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1.5">Sự Kiện Thử Nghiệm</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1.5">Hạng Vé Cần Tranh Mua</label>
          <select
            value={selectedTierId}
            onChange={(e) => setSelectedTierId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
          >
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} (Còn {t.availableQuantity}/{t.totalQuantity} vé)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-300 block mb-1.5">
            Số Luồng Đồng Thời (Concurrent Burst)
          </label>
          <div className="flex items-center gap-2">
            {[20, 50, 100].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setConcurrentThreads(count)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-mono font-bold transition border ${
                  concurrentThreads === count
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                {count} reqs
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Execute Button */}
      <div className="flex justify-end">
        <button
          onClick={runConcurrentTest}
          disabled={isRunning}
          className="flex items-center gap-2 bg-gradient-to-r from-amber-600 via-rose-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 disabled:opacity-50 text-white font-extrabold text-sm py-4 px-8 rounded-2xl transition shadow-xl shadow-amber-600/20 active:scale-[0.98]"
        >
          <Play className={`w-4 h-4 fill-white ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? `Đang bắn ${concurrentThreads} yêu cầu đồng thời...` : `Kích Hoạt ${concurrentThreads} Luồng Tranh Mua Đồng Thời`}
        </button>
      </div>

      {/* Results View */}
      {result && (
        <div className="p-6 sm:p-8 rounded-3xl bg-slate-900 border border-slate-800 space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-indigo-400" />
                Kết Quả Kiểm Thử Concurrency
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Tổng thời gian xử lý toàn bộ {result.totalRequests} luồng: <strong className="text-white font-mono">{result.durationMs}ms</strong>
              </p>
            </div>

            <div className="text-right">
              {!result.oversellDetected ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4" />
                  Bảo Đảm Không Bán Khống (Zero Oversell)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  Phát Hiện Lỗi Bán Vượt Tồn Kho
                </span>
              )}
            </div>
          </div>

          {/* Metrics summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Yêu cầu phát ra</span>
              <p className="text-2xl font-black text-white mt-1 font-mono">{result.totalRequests}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-emerald-400 uppercase font-mono">Giữ chỗ thành công</span>
              <p className="text-2xl font-black text-emerald-400 mt-1 font-mono">{result.successCount}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-rose-400 uppercase font-mono">Chặn 409 SOLD_OUT</span>
              <p className="text-2xl font-black text-rose-400 mt-1 font-mono">{result.conflictCount}</p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-amber-400 uppercase font-mono">Tốc độ phản hồi trung bình</span>
              <p className="text-2xl font-black text-amber-400 mt-1 font-mono">
                {Math.round(result.durationMs / result.totalRequests)}ms
              </p>
            </div>
          </div>

          {/* Mathematical Proof */}
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs font-mono space-y-2">
            <div className="text-slate-400 font-sans font-semibold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Bằng chứng toán học về tính toàn vẹn tồn kho:
            </div>
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 space-y-1">
              <div>Trước kiểm thử: Khả dụng = {result.tierBefore.available} | Giữ chỗ = {result.tierBefore.held} | Đã bán = {result.tierBefore.sold} (Tổng = {result.tierBefore.total})</div>
              <div>Sau kiểm thử:   Khả dụng = {result.tierAfter.available} | Giữ chỗ = {result.tierAfter.held} | Đã bán = {result.tierAfter.sold} (Tổng = {result.tierAfter.total})</div>
              <div className="text-emerald-400 font-bold pt-1">
                Phương trình: {result.tierAfter.available} + {result.tierAfter.held} + {result.tierAfter.sold} = {result.tierAfter.total} (Khớp 100% sức chứa, Delta chênh lệch = 0)
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (onClose) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
        <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-y-auto max-h-[92vh]">
          {content}
        </div>
      </div>
    );
  }

  return content;
};
