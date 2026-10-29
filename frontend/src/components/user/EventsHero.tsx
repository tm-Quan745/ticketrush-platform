import React from 'react';
import { ArrowUpRight, Search, Ticket, Sparkles } from 'lucide-react';

export function EventsHero({ keyword, onKeyword, onSearch }: {
  keyword: string; onKeyword: (value: string) => void; onSearch: () => void;
}) {
  return <section className="discovery-hero" aria-labelledby="discover-title">
    <div className="discovery-copy">
      <p className="client-eyebrow"><span /> SỰ KIỆN & TRẢI NGHIỆM</p>
      <h1 id="discover-title">Có những khoảnh khắc<br /><em>phải ở đó mới cảm nhận.</em></h1>
      <p className="discovery-description">Tìm sự kiện bạn yêu thích. Chọn chỗ ngồi của riêng mình.<br className="hidden sm:block" /> Và sẵn sàng cho một trải nghiệm đáng nhớ.</p>
      <form className="discovery-search" role="search" onSubmit={event => { event.preventDefault(); onSearch(); }}>
        <Search size={21} aria-hidden="true" />
        <label htmlFor="discover-search" className="sr-only">Tìm kiếm sự kiện</label>
        <input id="discover-search" value={keyword} onChange={event => onKeyword(event.target.value)} placeholder="Bạn muốn tham gia sự kiện nào?" maxLength={150}/>
        <button type="submit">Tìm kiếm <ArrowUpRight size={18} aria-hidden="true" /></button>
      </form>
      <p className="discovery-note"><Ticket size={15} aria-hidden="true" /> Chọn vé trực tuyến · Lưu vé trong tài khoản</p>
    </div>
    <div className="discovery-art" aria-hidden="true">
      <div className="discovery-orbit"/><div className="discovery-orbit orbit-two"/>
      <div className="discovery-ticket ticket-back"/>
      <div className="discovery-ticket ticket-front">
        <div className="art-ticket-top"><span>TICKETRUSH</span><ArrowUpRight size={26}/></div>
        <div className="art-ticket-main"><Sparkles size={24}/><p>HẸN BẠN<br />Ở HÀNG GHẾ<br /><em>trải nghiệm.</em></p></div>
        <div className="art-ticket-stub"><span>YOUR NEXT<br /><strong>GREAT MOMENT</strong></span><div className="art-barcode"/></div>
      </div>
      <span className="art-caption">MỘT TẤM VÉ. MỘT KỶ NIỆM.</span>
    </div>
  </section>;
}
