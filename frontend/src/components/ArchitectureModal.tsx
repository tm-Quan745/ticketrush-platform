import React from 'react';
import { ShieldCheck, CheckCircle2, Lock, Cpu, Server, Repeat, Zap, GitCommit, X } from 'lucide-react';

interface ArchitectureModalProps {
  onClose?: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({ onClose }) => {
  const invariants = [
    {
      num: 1,
      title: 'Zero Overselling Guarantee',
      desc: 'Sold + held quantity never exceeds total capacity, even under heavy burst load.',
      impl: 'Implemented using conditional SQL / Redis Gate admission with atomic decrement operations. Holds decrement available stock immediately; requests exceeding available stock fail fast with 409 SOLD_OUT.',
      status: 'VERIFIED',
    },
    {
      num: 2,
      title: 'Idempotent Payment & Order Creation',
      desc: 'The same Idempotency-Key never creates two orders or two charges.',
      impl: 'UUID Idempotency-Key headers are stored with canonical SHA-256 payload hashes. Retries with the exact key return the identical cached payload and Idempotency-Replayed: true header.',
      status: 'VERIFIED',
    },
    {
      num: 3,
      title: 'Atomic Reservation Expiry & Inventory Return',
      desc: 'An expired reservation always returns its tickets to inventory exactly once.',
      impl: 'Reservations carry a 10-minute hold TTL. When TTL lapses, a state machine transition to EXPIRED restores the exact held count to available inventory with version bumping.',
      status: 'VERIFIED',
    },
    {
      num: 4,
      title: 'Transactional Outbox & Event Relay',
      desc: 'Outbox events are committed in the same transaction as the business domain change.',
      impl: 'State transitions and corresponding event envelopes are recorded atomically, eliminating dual-write hazards between database and message brokers.',
      status: 'VERIFIED',
    },
    {
      num: 5,
      title: 'Idempotent Queue & Message Consumers',
      desc: 'Consumer retries or duplicate webhook payloads never cause double state mutation.',
      impl: 'Signed HMAC-SHA256 provider webhooks check paymentReference and idempotency IDs to safely discard out-of-order or duplicate notifications.',
      status: 'VERIFIED',
    },
  ];

  const content = (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded">
              Engineering Specification
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">TicketRush Invariants & High-Load Architecture</h2>
          <p className="text-xs text-slate-400 mt-1">
            Verification principles, modular monolith architecture, and concurrency constraints.
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

      {/* Invariants Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {invariants.map((inv) => (
          <div
            key={inv.num}
            className="p-6 rounded-3xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 font-mono font-bold text-xs flex items-center justify-center border border-indigo-500/30">
                  #{inv.num}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">
                  <CheckCircle2 className="w-3 h-3" />
                  {inv.status}
                </span>
              </div>
              <h3 className="text-base font-bold text-white mt-3">{inv.title}</h3>
              <p className="text-xs font-medium text-slate-300 mt-1 leading-relaxed">{inv.desc}</p>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed bg-slate-950/40 p-3 rounded-xl border">
              <strong className="text-slate-300 block mb-1">Mechanism:</strong>
              {inv.impl}
            </div>
          </div>
        ))}
      </div>

      {/* Stack & Modules */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-indigo-400" />
          Modular Architecture Overview
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          The TicketRush platform separates business concerns into isolated domain modules:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          {[
            'auth (JWT/Rotation)',
            'event (Catalog/Tiers)',
            'inventory (Gate/Locks)',
            'reservation (TTL Holds)',
            'order (Idempotency)',
            'payment (HMAC Webhooks)',
            'queue (Waiting Room)',
            'admin (Reconciliation)',
          ].map((mod) => (
            <div key={mod} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
              {mod}
            </div>
          ))}
        </div>
      </div>
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
