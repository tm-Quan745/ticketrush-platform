import React, { useState } from 'react';
import { api } from '../../api/client';
import { X, Calendar, MapPin, Image, Ticket, Plus, Check } from 'lucide-react';

interface CreateEventModalProps {
  onClose: () => void;
  onEventCreated: () => void;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({ onClose, onEventCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venueName, setVenueName] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [imageUrl, setImageUrl] = useState(
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1000&q=80'
  );
  const [startTime, setStartTime] = useState(
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [endTime, setEndTime] = useState(
    new Date(Date.now() + 30 * 24 * 3600 * 1000 + 4 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [saleStartTime, setSaleStartTime] = useState(new Date().toISOString().slice(0, 16));
  const [saleEndTime, setSaleEndTime] = useState(
    new Date(Date.now() + 29 * 24 * 3600 * 1000).toISOString().slice(0, 16)
  );
  const [tierName, setTierName] = useState('Vé Phổ Thông (Standard)');
  const [tierPrice, setTierPrice] = useState(250000); // 250,000 VND
  const [tierQuantity, setTierQuantity] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // 1. Create event in DRAFT
      const created = await api.createEvent({
        title,
        description,
        venueName,
        venueAddress,
        imageUrl,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        saleStartTime: new Date(saleStartTime).toISOString(),
        saleEndTime: new Date(saleEndTime).toISOString(),
      });

      // 2. Automatically create initial ticket tier
      await api.request(`/admin/events/${created.id}/tiers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${api.getToken()}`,
        },
        body: JSON.stringify({
          name: tierName,
          description: 'Hạng vé mở bán đợt đầu',
          price: tierPrice,
          currency: 'VND',
          totalQuantity: tierQuantity,
          maxPerOrder: 6,
        }),
      });

      // 3. Publish event immediately so customers can see it
      await api.publishEvent(created.id);

      onEventCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tạo sự kiện');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider font-mono">
              Bảng Quản Trị • Ban Tổ Chức
            </span>
            <h3 className="text-xl font-black text-white mt-0.5">Tạo Sự Kiện Flash-Sale Mới</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="font-bold text-slate-300">Tên Sự Kiện / Concert *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Anh Trai Say Hi Concert 2026..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-300">Mô Tả Sự Kiện</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Đêm nhạc quy tụ những nghệ sĩ hàng đầu cùng hiệu ứng sân khấu bùng nổ..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-300">Tên Địa Điểm / Sân Vận Động *</label>
              <input
                type="text"
                required
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="SVĐ Mỹ Đình..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-300">Địa Chỉ Chi Tiết</label>
              <input
                type="text"
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                placeholder="Đường Lê Đức Thọ, Nam Từ Liêm, Hà Nội"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-bold text-slate-300">Link Ảnh Poster Banner</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-300">Thời Gian Bắt Đầu Sự Kiện</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="font-bold text-slate-300">Thời Gian Kết Thúc Sự Kiện</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono"
              />
            </div>
          </div>

          {/* Initial Ticket Tier Config */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <h4 className="font-bold text-white flex items-center gap-1.5 text-xs text-indigo-400">
              <Ticket className="w-4 h-4" />
              Thiết Lập Hạng Vé Mở Bán Đầu Tiên
            </h4>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Tên Hạng Vé</label>
                <input
                  type="text"
                  value={tierName}
                  onChange={(e) => setTierName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Giá Vé (VND)</label>
                <input
                  type="number"
                  value={tierPrice}
                  onChange={(e) => setTierPrice(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Số Lượng Vé Khởi Tạo</label>
                <input
                  type="number"
                  value={tierQuantity}
                  onChange={(e) => setTierQuantity(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-6 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 hover:from-rose-500 hover:to-indigo-500 text-white font-black shadow-lg shadow-rose-600/20 disabled:opacity-50 transition"
            >
              <Check className="w-4 h-4" />
              {submitting ? 'Đang Tạo & Xuất Bản...' : 'Tạo & Mở Bán Sự Kiện'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
