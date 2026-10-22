import React, { useState, useEffect } from 'react';
import { Ticket, Reservation, Order } from '../types';
import { api } from '../api/client';
import { Ticket as TicketIcon, Clock, CheckCircle, QrCode, AlertCircle, Trash2, ArrowRight } from 'lucide-react';

interface MyTicketsModalProps {
  onResumeReservation: (reservation: Reservation) => void;
}

export const MyTicketsModal: React.FC<MyTicketsModalProps> = ({ onResumeReservation }) => {
  const [activeTab, setActiveTab] = useState<'tickets' | 'holds' | 'orders'>('tickets');
  const [ticketsList, setTicketsList] = useState<Ticket[]>([]);
  const [reservationsList, setReservationsList] = useState<Reservation[]>([]);
  const [ordersList, setOrdersList] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resData, ordersData] = await Promise.all([
        api.getMyReservations(),
        api.getMyOrders(),
      ]);

      setReservationsList(resData.content);
      setOrdersList(ordersData.content);

      // Collect all tickets for user's paid orders
      const allTickets: Ticket[] = [];
      for (const order of ordersData.content) {
        if (order.status === 'PAID') {
          try {
            const t = await api.getOrderTickets(order.id);
            allTickets.push(...t);
          } catch {
            // ignore
          }
        }
      }
      setTicketsList(allTickets);
    } catch (err) {
      console.error('Failed to load tickets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCancelHold = async (id: string) => {
    try {
      await api.cancelReservation(id);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel hold');
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">My Bookings & Passes</h2>
          <p className="text-sm text-slate-400 mt-1">
            Access your issued digital tickets, active reservation holds, and order history.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('tickets')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'tickets'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TicketIcon className="w-3.5 h-3.5" />
            Issued Tickets ({ticketsList.length})
          </button>
          <button
            onClick={() => setActiveTab('holds')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'holds'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Active Holds ({reservationsList.filter((r) => r.status === 'HELD').length})
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
              activeTab === 'orders'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Orders ({ordersList.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-500 text-sm">Loading tickets and reservations...</div>
      ) : (
        <>
          {/* TAB 1: ISSUED TICKETS */}
          {activeTab === 'tickets' && (
            <div>
              {ticketsList.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 border-dashed">
                  <TicketIcon className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h4 className="text-base font-bold text-white">No Tickets Issued Yet</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Select an upcoming concert or festival, hold your tickets, and complete checkout to receive your entry passes.
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {ticketsList.map((ticket) => (
                    <div
                      key={ticket.id}
                      className="group relative bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-3xl overflow-hidden shadow-xl transition-all duration-300"
                    >
                      {/* Ticket Notch decorations */}
                      <div className="absolute -left-3 top-1/2 -mt-3 w-6 h-6 rounded-full bg-slate-950 border border-slate-800" />
                      <div className="absolute -right-3 top-1/2 -mt-3 w-6 h-6 rounded-full bg-slate-950 border border-slate-800" />

                      <div className="p-6 pb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-bold">
                            VALID TICKET
                          </span>
                          <span className="text-xs font-mono text-slate-400">
                            {new Date(ticket.issuedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="text-lg font-black text-white mt-3 leading-snug">
                          {ticket.tierName}
                        </h4>
                        <p className="text-xs font-mono text-indigo-400 mt-1 font-semibold">
                          Code: {ticket.ticketCode}
                        </p>
                      </div>

                      {/* Ticket Divider Barcode line */}
                      <div className="px-6 py-2 border-y border-dashed border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                        <span>GA ADMISSION</span>
                        <span>GATE A</span>
                      </div>

                      {/* Ticket Footer with simulated QR code */}
                      <div className="p-6 pt-4 flex items-center justify-between bg-slate-950/40">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-mono">TICKET ID</p>
                          <p className="text-xs font-mono text-slate-300 truncate max-w-[140px]">
                            {ticket.id}
                          </p>
                        </div>
                        <div className="p-2 rounded-xl bg-white text-slate-950 shadow-md">
                          <QrCode className="w-8 h-8" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVE HOLDS */}
          {activeTab === 'holds' && (
            <div className="space-y-4">
              {reservationsList.filter((r) => r.status === 'HELD').length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 border-dashed">
                  <Clock className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h4 className="text-base font-bold text-white">No Active Ticket Holds</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    When you hold tickets, they remain reserved exclusively for you for 10 minutes before expiring.
                  </p>
                </div>
              ) : (
                reservationsList
                  .filter((r) => r.status === 'HELD')
                  .map((res) => (
                    <div
                      key={res.id}
                      className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{res.tierName || 'Reserved Tier'}</span>
                          <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-semibold">
                            Qty: {res.quantity}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1 text-amber-400 font-mono font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            {res.seconds_remaining}s remaining
                          </span>
                          <span>Expires at: {new Date(res.expires_at).toLocaleTimeString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => handleCancelHold(res.id)}
                          className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 transition"
                          title="Release Hold"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onResumeReservation(res)}
                          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition shadow"
                        >
                          <span>Resume Checkout</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* TAB 3: ORDERS */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {ordersList.length === 0 ? (
                <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800 border-dashed">
                  <h4 className="text-base font-bold text-white">No Past Orders Found</h4>
                </div>
              ) : (
                ordersList.map((order) => (
                  <div
                    key={order.id}
                    className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{order.paymentReference}</span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded font-mono ${
                            order.status === 'PAID'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : order.status === 'PENDING'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {order.items.map((i) => `${i.tierName} x${i.quantity}`).join(', ')}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black text-white font-mono">
                        ${(order.totalAmount / 100).toFixed(2)}
                      </span>
                      <p className="text-[11px] text-slate-500">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
