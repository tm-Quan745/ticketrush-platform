import React, { useState, useEffect } from 'react';
import { Event, Reservation, Order, Ticket } from '../../types';
import { api } from '../../api/client';
import { EventCard } from '../EventCard';
import { EventDetailModal } from '../EventDetailModal';
import { WaitingRoomModal } from '../WaitingRoomModal';
import { CheckoutTTLModal } from '../CheckoutTTLModal';
import { TicketWallet } from '../TicketWallet';
import { CountdownTimer } from '../CountdownTimer';
import {
  Search,
  Flame,
  Clock,
  Sparkles,
  Zap,
  Ticket as TicketIcon,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Music,
  MapPin,
  Calendar,
  Eye,
  SlidersHorizontal,
  LayoutGrid,
  List,
} from 'lucide-react';

interface UserPortalProps {
  onHoldCountChanged: (count: number) => void;
  initialTab?: 'events' | 'wallet';
  onNavigateToSeating?: (eventId: string, eventTitle: string) => void;
}

export const UserPortal: React.FC<UserPortalProps> = ({
  onHoldCountChanged,
  initialTab = 'events',
  onNavigateToSeating,
}) => {
  const [userTab, setUserTab] = useState<'events' | 'wallet'>(initialTab);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<'ALL' | 'CONCERT' | 'FESTIVAL' | 'SPORTS' | 'ESPORTS'>('ALL');
  const [sortBy, setSortBy] = useState<'HOT' | 'TIME' | 'NAME'>('HOT');
  const [viewLayout, setViewLayout] = useState<'grid' | 'list'>('grid');

  // Modals & Active Flows
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [queueEvent, setQueueEvent] = useState<Event | null>(null);
  const [admissionToken, setAdmissionToken] = useState<string | undefined>(undefined);
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);
  const [successToast, setSuccessToast] = useState<{ message: string; sub?: string } | null>(null);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const data = await api.getEvents(keyword, false);
      let list = data.content;

      if (category === 'CONCERT') {
        list = list.filter((e) => e.title.includes('Taylor') || e.title.includes('Tour'));
      } else if (category === 'FESTIVAL') {
        list = list.filter((e) => e.title.includes('Cyberpunk') || e.title.includes('EDM'));
      } else if (category === 'SPORTS') {
        list = list.filter((e) => e.title.includes('Premier') || e.title.includes('League'));
      }

      if (sortBy === 'NAME') {
        list.sort((a, b) => a.title.localeCompare(b.title));
      } else if (sortBy === 'TIME') {
        list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      }

      setEvents(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const refreshHolds = async () => {
    try {
      const data = await api.getMyReservations();
      const count = data.content.filter((r) => r.status === 'HELD').length;
      onHoldCountChanged(count);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchEvents();
    refreshHolds();
  }, [keyword, category, sortBy]);

  const handleReservationCreated = (reservation: Reservation) => {
    setSelectedEvent(null);
    setActiveReservation(reservation);
    refreshHolds();
  };

  const handleOrderPaid = (order: Order, tickets: Ticket[]) => {
    setActiveReservation(null);
    setSuccessToast({
      message: 'Đặt Vé Thành Công!',
      sub: `Đã phát hành ${tickets.length} vé điện tử. Mã đơn: ${order.paymentReference}`,
    });
    refreshHolds();
    setTimeout(() => setSuccessToast(null), 6000);
    setUserTab('wallet');
  };

  const featuredEvent = events[0];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-6 right-6 z-50 p-5 rounded-3xl bg-emerald-950 border border-emerald-600/80 shadow-2xl flex items-start gap-3.5 max-w-md animate-in slide-in-from-bottom duration-300">
          <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-sm font-black text-white">{successToast.message}</h4>
            {successToast.sub && <p className="text-xs text-emerald-300/90 mt-0.5">{successToast.sub}</p>}
          </div>
        </div>
      )}

      {/* User Portal Sub-Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setUserTab('events')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition ${
              userTab === 'events'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Music className="w-4 h-4" />
            Săn Vé Concert & Sự Kiện
          </button>
          <button
            onClick={() => setUserTab('wallet')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-black transition ${
              userTab === 'wallet'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <TicketIcon className="w-4 h-4" />
            Ví Vé Của Tôi & QR Check-in
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Cam kết: 100% không bán trùng vé (Zero Oversell Invariant)</span>
        </div>
      </div>

      {userTab === 'events' && (
        <div className="space-y-8">
          {/* Hero Flash-Sale Banner */}
          {featuredEvent && (
            <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-indigo-950 via-slate-900 to-rose-950 border border-slate-800 p-8 sm:p-12 shadow-2xl">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-bold uppercase tracking-wider">
                    <Flame className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                    Tâm Điểm Flash-Sale Hot Nhất
                  </div>

                  <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
                    Săn Vé Siêu Tốc. <br />
                    <span className="bg-gradient-to-r from-amber-400 via-rose-400 to-indigo-400 bg-clip-text text-transparent">
                      Sơ Đồ Khán Đài & Ghế 3D.
                    </span>
                  </h1>

                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
                    Hệ thống đặt vé chuẩn chịu tải cao với phòng chờ điều tiết lưu lượng và cơ chế giữ chỗ 10 phút độc quyền.
                  </p>

                  <div className="pt-2 flex flex-wrap gap-3">
                    <button
                      onClick={() => {
                        if (onNavigateToSeating) {
                          onNavigateToSeating(featuredEvent.id, featuredEvent.title);
                        } else {
                          setSelectedEvent(featuredEvent);
                        }
                      }}
                      className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-extrabold text-sm py-3.5 px-6 rounded-2xl transition shadow-xl shadow-rose-600/20 active:scale-[0.98]"
                    >
                      <Eye className="w-4 h-4" />
                      <span>Chọn Ghế Trực Quan 3D</span>
                    </button>

                    {featuredEvent.waitingRoomEnabled ? (
                      <button
                        onClick={() => setQueueEvent(featuredEvent)}
                        className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-800 text-white font-bold text-sm py-3.5 px-6 rounded-2xl transition border border-slate-700"
                      >
                        <span>Vào Phòng Chờ Ảo</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setSelectedEvent(featuredEvent)}
                        className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-800 text-white font-bold text-sm py-3.5 px-6 rounded-2xl transition border border-slate-700"
                      >
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span>Giữ Chỗ Nhanh</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Countdown Card on Hero */}
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-3xl p-6 sm:p-8 backdrop-blur-md space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 font-mono uppercase">Sự kiện nổi bật</span>
                      <h4 className="text-lg font-bold text-white line-clamp-1">{featuredEvent.title}</h4>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono">
                      CÒN VÉ
                    </span>
                  </div>

                  <CountdownTimer
                    targetDate={featuredEvent.saleEndTime}
                    label="Thời gian đợt mở bán còn lại:"
                    showMilliseconds={true}
                  />

                  <div className="pt-2 text-[11px] text-slate-400 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Cam kết bảo vệ kho vé với khóa chống bán khống</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Search, Filter Pills & Sort bar */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm kiếm concert, nghệ sĩ, sân vận động..."
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs text-slate-300 font-bold focus:outline-none"
                >
                  <option value="HOT">Xếp theo: Hot nhất</option>
                  <option value="TIME">Xếp theo: Sắp diễn ra</option>
                  <option value="NAME">Xếp theo: Tên A-Z</option>
                </select>

                <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-2xl">
                  <button
                    onClick={() => setViewLayout('grid')}
                    className={`p-1.5 rounded-xl transition ${
                      viewLayout === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewLayout('list')}
                    className={`p-1.5 rounded-xl transition ${
                      viewLayout === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Category pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { id: 'ALL', label: 'Tất Cả Thể Loại' },
                { id: 'CONCERT', label: 'Concert Sân Vận Động' },
                { id: 'FESTIVAL', label: 'Lễ Hội EDM & Rock' },
                { id: 'SPORTS', label: 'Thể Thao Quốc Tế' },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id as any)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold transition border whitespace-nowrap ${
                    category === c.id
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Events Grid / List */}
          {loading ? (
            <div className="py-24 text-center text-slate-500 font-mono text-sm animate-pulse">
              Đang đồng bộ danh mục sự kiện trực tiếp...
            </div>
          ) : events.length === 0 ? (
            <div className="py-20 text-center rounded-3xl bg-slate-900/40 border border-slate-800 space-y-2">
              <p className="text-slate-300 font-bold">Không tìm thấy sự kiện nào</p>
              <p className="text-xs text-slate-500">Thử tìm kiếm với từ khóa khác</p>
            </div>
          ) : (
            <div
              className={
                viewLayout === 'grid'
                  ? 'grid md:grid-cols-2 lg:grid-cols-3 gap-6'
                  : 'space-y-4'
              }
            >
              {events.map((event) => (
                <div key={event.id} className="relative group">
                  <EventCard
                    event={event}
                    onSelect={(e) => {
                      if (onNavigateToSeating) {
                        onNavigateToSeating(e.id, e.title);
                      } else {
                        setSelectedEvent(e);
                        setAdmissionToken(undefined);
                      }
                    }}
                    onJoinQueue={(e) => setQueueEvent(e)}
                  />

                  {/* Direct Seating Map Button Overlay */}
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => {
                        if (onNavigateToSeating) {
                          onNavigateToSeating(event.id, event.title);
                        } else {
                          setSelectedEvent(event);
                        }
                      }}
                      className="text-[11px] font-bold text-amber-300 hover:text-white flex items-center gap-1 transition font-mono bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl hover:bg-slate-800"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Xem Sơ Đồ Khán Đài & Ghế 3D &rarr;</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY WALLET & PASSES */}
      {userTab === 'wallet' && (
        <TicketWallet onResumeReservation={(res) => setActiveReservation(res)} />
      )}

      {/* Event Detail & Tier Selection Modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          admissionToken={admissionToken}
          onClose={() => {
            setSelectedEvent(null);
            setAdmissionToken(undefined);
          }}
          onReservationCreated={handleReservationCreated}
          onRequestQueue={() => {
            const ev = selectedEvent;
            setSelectedEvent(null);
            setQueueEvent(ev);
          }}
        />
      )}

      {/* Waiting Room Virtual Queue Modal */}
      {queueEvent && (
        <WaitingRoomModal
          event={queueEvent}
          onAdmitted={(token) => {
            setAdmissionToken(token);
            setSelectedEvent(queueEvent);
            setQueueEvent(null);
          }}
          onClose={() => setQueueEvent(null)}
        />
      )}

      {/* Checkout & Reservation TTL Modal */}
      {activeReservation && (
        <CheckoutTTLModal
          reservation={activeReservation}
          onClose={() => setActiveReservation(null)}
          onOrderPaid={handleOrderPaid}
          onCancelHold={() => {
            setActiveReservation(null);
            fetchEvents();
            refreshHolds();
          }}
        />
      )}
    </div>
  );
};
