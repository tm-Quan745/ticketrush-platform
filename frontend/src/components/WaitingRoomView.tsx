import React, { useState, useEffect } from 'react';
import { Event, WaitingRoomStatus } from '../types';
import { api } from '../api/client';
import { X, Users, Activity, CheckCircle, ArrowRight, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';

interface WaitingRoomViewProps {
  event: Event;
  onAdmitted: (token: string) => void;
  onClose: () => void;
}

export const WaitingRoomView: React.FC<WaitingRoomViewProps> = ({ event, onAdmitted, onClose }) => {
  const [status, setStatus] = useState<WaitingRoomStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Join queue on mount
  useEffect(() => {
    let intervalId: any = null;

    const enterQueue = async () => {
      try {
        const initial = await api.joinWaitingRoom(event.id);
        setStatus(initial);
        setLoading(false);

        if (initial.state === 'ADMITTED' && initial.token) {
          onAdmitted(initial.token);
          return;
        }

        // Poll queue status every 2 seconds
        intervalId = setInterval(async () => {
          try {
            const updated = await api.getWaitingRoomStatus(event.id);
            setStatus(updated);
            if (updated.state === 'ADMITTED' && updated.token) {
              clearInterval(intervalId);
            }
          } catch (err: any) {
            console.error('Waiting room polling error:', err);
          }
        }, 2000);
      } catch (err: any) {
        setError(err.message || 'Failed to join waiting room');
        setLoading(false);
      }
    };

    enterQueue();

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center">
        {/* Close */}
        <button
          onClick={handleLeave}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-slate-400 hover:text-white transition"
          title="Leave Queue"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Status Icon */}
        <div className="relative mb-6">
          {isAdmitted ? (
            <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/20 animate-bounce">
              <CheckCircle className="w-10 h-10" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-3xl bg-rose-500/20 border-2 border-rose-500/80 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-500/20">
              <Users className="w-10 h-10" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500"></span>
              </span>
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="text-2xl font-black text-white">
          {isAdmitted ? "You're In! Access Granted" : 'TicketRush Waiting Room'}
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Event: <strong className="text-slate-200">{event.title}</strong>
        </p>

        {/* Queue Metrics */}
        {loading ? (
          <div className="my-8 text-sm text-slate-400 flex items-center gap-2">
            <Activity className="w-4 h-4 animate-spin text-rose-500" />
            Assigning queue rank...
          </div>
        ) : isAdmitted ? (
          <div className="my-6 w-full space-y-4">
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/50 text-left">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-1">
                <ShieldCheck className="w-4 h-4" />
                Admission Token Verified
              </div>
              <p className="text-xs text-emerald-300/80 font-mono break-all">
                {status?.token}
              </p>
              <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                Token valid for 10 minutes. Proceed to hold your tickets now.
              </div>
            </div>

            <button
              onClick={() => status?.token && onAdmitted(status.token)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white font-bold text-sm py-3.5 px-6 rounded-xl transition shadow-lg shadow-emerald-600/20 active:scale-[0.98]"
            >
              <span>Continue to Ticket Selection</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="my-6 w-full space-y-4">
            {/* Live Queue Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Your Queue Position
                </span>
                <p className="text-3xl font-black text-white mt-1">
                  #{status?.position || 1}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Est. Wait Time
                </span>
                <p className="text-3xl font-black text-rose-400 mt-1">
                  ~{status?.estimatedWaitSeconds ?? 10}s
                </p>
              </div>
            </div>

            {/* Waiting Room explanation */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 text-left text-xs text-slate-400 space-y-1.5">
              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Activity className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                <span>Live Redis Admission Rate Controller</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                The waiting room regulates inbound traffic to prevent database locks and race conditions during ticket drop spikes. Do not refresh; heartbeats are automatically synchronized.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-slate-500 font-mono">Heartbeat: Active (2s interval)</span>
              <button
                onClick={handleLeave}
                className="text-xs text-slate-400 hover:text-rose-400 transition underline"
              >
                Leave Waiting Room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
