import React, { useEffect, useState } from 'react';
import { FlashSaleEvent } from '../types/flashSale.types';
import { CountdownTimer } from './CountdownTimer';
import { Calendar, MapPin, Ticket, Users, ArrowLeft } from 'lucide-react';
import { formatDateTime } from '../../../lib/utils';
import { Link } from '../../../pages/shared';

export function salePhase(event: Pick<FlashSaleEvent, 'saleStartTime' | 'saleEndTime'>, now: number) {
  if (now < Date.parse(event.saleStartTime)) return 'upcoming';
  return now <= Date.parse(event.saleEndTime) ? 'open' : 'closed';
}
export const EventHeader: React.FC<{event: FlashSaleEvent}> = ({ event }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const phase = salePhase(event, now);
  return <section className="event-banner" aria-labelledby="event-title">
    <div className="event-banner-image">
      {event.imageUrl ? <img src={event.imageUrl} alt="" /> : <div className="event-banner-placeholder"><Ticket size={72} strokeWidth={1}/><span>TICKETRUSH / LIVE EXPERIENCES</span></div>}
      <Link href="/events" className="event-back"><ArrowLeft size={16}/> Tất cả sự kiện</Link>
    </div>
    <div className="event-banner-copy">
      <div className="event-banner-badges"><span data-phase={phase} className="sale-status"><span/>{phase === 'open' ? 'Đang mở bán' : phase === 'upcoming' ? 'Sắp mở bán' : 'Đã kết thúc mở bán'}</span>{event.waitingRoomEnabled && <span className="queue-status"><Users size={14}/> Có phòng chờ</span>}</div>
      <p className="client-eyebrow">TRẢI NGHIỆM CÙNG TICKETRUSH</p><h1 id="event-title">{event.title}</h1>
      <div className="event-banner-meta"><Calendar size={20}/><div><span>Thời gian diễn ra</span><strong>{formatDateTime(event.startTime)}</strong></div></div>
      <div className="event-banner-meta"><MapPin size={20}/><div><span>Địa điểm</span><strong>{event.venueName}</strong><p>{event.venueAddress}</p></div></div>
      {phase === 'upcoming' ? <div className="event-countdown"><CountdownTimer targetDate={event.saleStartTime} label="Mở bán sau" /></div> : <p className="event-sale-note">{phase === 'open' ? 'Khám phá các hạng vé và chọn trải nghiệm dành cho bạn bên dưới.' : 'Đợt mở bán này đã kết thúc. Khám phá thêm các sự kiện khác.'}</p>}
    </div>
  </section>;
};
