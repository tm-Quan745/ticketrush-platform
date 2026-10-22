import React, { useState, useEffect } from 'react';
import { Event, TicketTier, InventoryViolation } from '../types';
import { api } from '../api/client';
import { ShieldCheck, RefreshCw, AlertTriangle, CheckCircle, Database, Plus, Users, Sliders, Check } from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [tiers, setTiers] = useState<TicketTier[]>([]);
  const [violations, setViolations] = useState<InventoryViolation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [newTotalQuantity, setNewTotalQuantity] = useState<number>(0);
  const [wrEnabled, setWrEnabled] = useState(false);
  const [wrRate, setWrRate] = useState(10);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const data = await api.getEvents();
      setEvents(data.content);
      if (data.content.length > 0 && !selectedEventId) {
        setSelectedEventId(data.content[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchInventory = async (eventId: string) => {
    try {
      const [inv, eventDetail] = await Promise.all([
        api.getAdminInventory(eventId),
        api.getEventDetail(eventId),
      ]);
      setTiers(inv);
      setWrEnabled(Boolean(eventDetail.event.waitingRoomEnabled));
      setWrRate(eventDetail.event.waitingRoomRate || 10);
      setViolations(null);
      setReconcileResult(null);
    } catch (err) {
      console.error('Failed to load event inventory:', err);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      fetchInventory(selectedEventId);
    }
  }, [selectedEventId]);

  // Run Invariant Reconciliation Audit
  const handleReconcile = async () => {
    if (!selectedEventId) return;
    setReconciling(true);
    setReconcileResult(null);
    try {
      const results = await api.reconcileInventory(selectedEventId);
      setViolations(results);
      if (results.length === 0) {
        setReconcileResult('Audit Passed: Perfect Invariant Consistency. All tier counters match: Available + Held + Sold == Total.');
      } else {
        setReconcileResult(`Discrepancy Detected: ${results.length} tier(s) violate invariant.`);
      }
    } catch (err: any) {
      setReconcileResult(err.message || 'Reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  // Update Tier Capacity
  const handleUpdateCapacity = async (tierId: string) => {
    try {
      await api.updateTierCapacity(tierId, newTotalQuantity);
      setEditingTierId(null);
      fetchInventory(selectedEventId);
      setActionNotice('Tier capacity updated successfully.');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Capacity update rejected by server.');
    }
  };

  // Toggle Waiting Room
  const handleToggleWaitingRoom = async () => {
    if (!selectedEventId) return;
    const nextState = !wrEnabled;
    try {
      await api.configureWaitingRoom(selectedEventId, nextState, wrRate, 'fifo');
      setWrEnabled(nextState);
      setActionNotice(`Waiting room ${nextState ? 'enabled' : 'disabled'} for this event.`);
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update waiting room configuration');
    }
  };

  // Reseed Database
  const handleReseed = async () => {
    if (confirm('Reseed database back to clean development fixtures?')) {
      try {
        await api.reseed();
        fetchEvents();
        if (selectedEventId) fetchInventory(selectedEventId);
        setActionNotice('Database reseeded to fresh initial state.');
        setTimeout(() => setActionNotice(null), 3000);
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const selectedEvent = events.find((e) => e.id === selectedEventId);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded">
              Operator Control Center
            </span>
          </div>
          <h2 className="text-3xl font-black text-white mt-1">Admin Inventory & Invariant Audit</h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time multi-tier stock monitoring, waiting room rate limits, and zero-oversell mathematical auditing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleReseed}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700"
          >
            <Database className="w-3.5 h-3.5 text-indigo-400" />
            Reseed Data
          </button>
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white transition shadow-lg shadow-rose-600/20 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin' : ''}`} />
            {reconciling ? 'Auditing Invariants...' : 'Run Invariant Audit'}
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Select Event selector */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
          <Sliders className="w-4 h-4 text-rose-400" />
          Target Event:
        </label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="flex-1 max-w-md bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
        >
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} ({e.status})
            </option>
          ))}
        </select>

        {/* Waiting Room Switch */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-indigo-400" />
            Waiting Room:
          </span>
          <button
            onClick={handleToggleWaitingRoom}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              wrEnabled
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {wrEnabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>

      {/* Reconciliation Result Banner */}
      {reconcileResult && (
        <div
          className={`p-5 rounded-2xl border flex items-start gap-3 transition-all ${
            violations && violations.length > 0
              ? 'bg-rose-950/60 border-rose-800 text-rose-200'
              : 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
          }`}
        >
          {violations && violations.length > 0 ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div>
            <h4 className="font-bold text-sm">
              {violations && violations.length > 0
                ? 'Invariant Discrepancy Found'
                : 'Invariant Integrity Verified (Week 3/6 Audit)'}
            </h4>
            <p className="text-xs mt-0.5 opacity-90">{reconcileResult}</p>
          </div>
        </div>
      )}

      {/* Tier Inventory Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Tier Inventory Breakdown</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Invariant Requirement: Available + Held + Sold == Total Capacity
            </p>
          </div>
          <span className="text-xs font-mono text-indigo-400 bg-indigo-950/50 px-2.5 py-1 rounded-lg border border-indigo-800/40">
            {tiers.length} Active Tiers
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider font-mono border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Tier Name</th>
                <th className="px-6 py-4">Unit Price</th>
                <th className="px-6 py-4 text-emerald-400">Available</th>
                <th className="px-6 py-4 text-amber-400">Held (TTL)</th>
                <th className="px-6 py-4 text-indigo-400">Sold (Paid)</th>
                <th className="px-6 py-4 text-white">Total Capacity</th>
                <th className="px-6 py-4">Status / Equation</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {tiers.map((tier) => {
                const calculatedSum = tier.availableQuantity + tier.heldQuantity + tier.soldQuantity;
                const isConsistent = calculatedSum === tier.totalQuantity;

                return (
                  <tr key={tier.id} className="hover:bg-slate-800/30 transition">
                    <td className="px-6 py-4 font-sans font-bold text-white">
                      {tier.name}
                      <p className="text-[10px] text-slate-500 font-mono">{tier.id}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-300">
                      ${(tier.price / 100).toFixed(2)} {tier.currency}
                    </td>
                    <td className="px-6 py-4 font-bold text-emerald-400 text-sm">
                      {tier.availableQuantity}
                    </td>
                    <td className="px-6 py-4 font-bold text-amber-400 text-sm">
                      {tier.heldQuantity}
                    </td>
                    <td className="px-6 py-4 font-bold text-indigo-400 text-sm">
                      {tier.soldQuantity}
                    </td>
                    <td className="px-6 py-4 font-black text-white text-sm">
                      {editingTierId === tier.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={newTotalQuantity}
                            onChange={(e) => setNewTotalQuantity(parseInt(e.target.value) || 0)}
                            className="w-20 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                          />
                          <button
                            onClick={() => handleUpdateCapacity(tier.id)}
                            className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span>{tier.totalQuantity}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-sans">
                      {isConsistent ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/40 border border-emerald-800/60 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          Consistent ({calculatedSum} = {tier.totalQuantity})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-950/40 border border-rose-800/60 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" />
                          Drift ({calculatedSum} != {tier.totalQuantity})
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {editingTierId === tier.id ? (
                        <button
                          onClick={() => setEditingTierId(null)}
                          className="text-[11px] text-slate-400 hover:text-white underline"
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingTierId(tier.id);
                            setNewTotalQuantity(tier.totalQuantity);
                          }}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-sans font-semibold underline"
                        >
                          Edit Capacity
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
