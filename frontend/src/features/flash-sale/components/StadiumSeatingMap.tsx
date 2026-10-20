import React, { useState } from 'react';
import { FlashSaleTier, StadiumZone } from '../types/flashSale.types';
import { formatCurrency, cn } from '../../../lib/utils';
import {
  Sparkles,
  MapPin,
  Eye,
  CheckCircle2,
  Ticket,
  Users,
  ZoomIn,
  ArrowLeft,
  Camera,
  Compass,
  Volume2,
  X,
  Zap,
  RotateCcw,
} from 'lucide-react';

interface SeatItem {
  id: string;
  row: string;
  number: number;
  status: 'AVAILABLE' | 'HELD' | 'SOLD';
}

interface StadiumSeatingMapProps {
  tiers: FlashSaleTier[];
  selectedTierId: string;
  onSelectTier: (tierId: string) => void;
  selectedSeats: string[]; // seat IDs (e.g. "A-12")
  onToggleSeat: (seatId: string, seatInfo: { row: string; number: number; tierId: string }) => void;
}

export const StadiumSeatingMap: React.FC<StadiumSeatingMapProps> = ({
  tiers,
  selectedTierId,
  onSelectTier,
  selectedSeats,
  onToggleSeat,
}) => {
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'MAP' | 'SEATS'>('MAP');
  const [previewZone, setPreviewZone] = useState<StadiumZone | null>(null);

  // Define Stadium Grandstand Zones mapped to available tiers
  const zones: StadiumZone[] = [
    {
      id: 'zone-vip-pit',
      name: 'VIP Diamond Floor (Pit Trung Tâm)',
      tierId: tiers[0]?.id || 'tier-1',
      tierName: tiers[0]?.name || 'VIP Diamond Floor',
      price: tiers[0]?.price || 49900,
      color: '#f59e0b', // amber-500
      shapePath: 'M 260 210 L 380 210 L 380 290 L 260 290 Z',
      viewAngleDescription: 'Sát sân khấu chính & Catwalk runway, cự ly chỉ 5m tới nghệ sĩ',
      category: 'VIP_PIT',
      totalSeats: 150,
      availableSeats: Math.min(150, tiers[0]?.availableQuantity || 45),
    },
    {
      id: 'zone-stand-a',
      name: 'Khán Đài A (Chính Diện Tầng 1)',
      tierId: tiers[1]?.id || tiers[0]?.id || 'tier-2',
      tierName: tiers[1]?.name || 'Khán Đài A',
      price: tiers[1]?.price || 24900,
      color: '#6366f1', // indigo-500
      shapePath: 'M 220 310 L 420 310 L 440 390 L 200 390 Z',
      viewAngleDescription: 'Góc nhìn 100% trực diện sân khấu, âm thanh vòm hoàn hảo, cự ly 35m',
      category: 'LOWER_BOWL',
      totalSeats: 300,
      availableSeats: Math.min(300, tiers[1]?.availableQuantity || 120),
    },
    {
      id: 'zone-stand-b',
      name: 'Khán Đài B (Cánh Tây - West Wing)',
      tierId: tiers[1]?.id || tiers[0]?.id || 'tier-2',
      tierName: tiers[1]?.name || 'Khán Đài B',
      price: tiers[1]?.price || 24900,
      color: '#06b6d4', // cyan-500
      shapePath: 'M 110 180 L 190 200 L 170 380 L 90 350 Z',
      viewAngleDescription: 'Khán đài cánh Tây, bao quát toàn cảnh hiệu ứng ánh sáng laser, cự ly 45m',
      category: 'LOWER_BOWL',
      totalSeats: 250,
      availableSeats: 90,
    },
    {
      id: 'zone-stand-c',
      name: 'Khán Đài C (Cánh Đông - East Wing)',
      tierId: tiers[1]?.id || tiers[0]?.id || 'tier-2',
      tierName: tiers[1]?.name || 'Khán Đài C',
      price: tiers[1]?.price || 24900,
      color: '#ec4899', // pink-500
      shapePath: 'M 450 200 L 530 180 L 550 350 L 470 380 Z',
      viewAngleDescription: 'Khán đài cánh Đông, góc nhìn cận cảnh các màn pháo hoa & visual LED',
      category: 'LOWER_BOWL',
      totalSeats: 250,
      availableSeats: 95,
    },
    {
      id: 'zone-upper-bowl',
      name: 'Khán Đài Thượng (General Admission)',
      tierId: tiers[2]?.id || tiers[tiers.length - 1]?.id || 'tier-3',
      tierName: tiers[2]?.name || 'Vé Phổ Thông',
      price: tiers[2]?.price || 9900,
      color: '#10b981', // emerald-500
      shapePath: 'M 160 410 L 480 410 L 510 470 L 130 470 Z',
      viewAngleDescription: 'Tầng cao toàn cảnh sân vận động 360 độ, không khí cuồng nhiệt đại dương lightstick',
      category: 'UPPER_BOWL',
      totalSeats: 800,
      availableSeats: Math.min(800, tiers[2]?.availableQuantity || 350),
    },
  ];

  const activeZone = zones.find((z) => z.tierId === selectedTierId) || zones[0];

  // Generate simulated seat grid for the focused zone
  const rows = ['A', 'B', 'C', 'D', 'E'];
  const seatsPerRow = 12;

  const getSeatStatus = (row: string, num: number): 'AVAILABLE' | 'HELD' | 'SOLD' => {
    const hash = (row.charCodeAt(0) * 17 + num * 31) % 10;
    if (hash === 1 || hash === 4) return 'SOLD';
    if (hash === 7) return 'HELD';
    return 'AVAILABLE';
  };

  // Smart Auto-pick best available seats
  const handleAutoPickBestSeats = (count = 2) => {
    const availableList: Array<{ row: string; num: number; id: string }> = [];
    for (const r of rows) {
      for (let n = 1; n <= seatsPerRow; n++) {
        if (getSeatStatus(r, n) === 'AVAILABLE') {
          availableList.push({
            row: r,
            num: n,
            id: `${activeZone.id}-${r}-${n}`,
          });
        }
      }
    }

    // Pick central seats in top rows
    const picked = availableList.slice(0, count);
    picked.forEach((p) => {
      if (!selectedSeats.includes(p.id)) {
        onToggleSeat(p.id, {
          row: p.row,
          number: p.num,
          tierId: activeZone.tierId,
        });
      }
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
      {/* Map Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1">
              <Eye className="w-3.5 h-3.5 text-amber-300" />
              SƠ ĐỒ KHÁN ĐÀI 3D & CHỌN CHỖ
            </span>
            <span className="text-xs text-slate-400 font-mono">SoFi Stadium Live Layout</span>
          </div>
          <h3 className="text-xl font-black text-white mt-1">Chọn Khu Vực Khán Đài & Ghế Ngồi</h3>
        </div>

        {/* View Mode Switcher & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPreviewZone(activeZone)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition border border-slate-700"
            title="Xem góc nhìn thực tế 3D từ khán đài này"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Mô Phỏng Tầm Nhìn 3D</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setViewMode('MAP')}
              className={cn(
                'px-3.5 py-1.5 rounded-xl text-xs font-bold transition',
                viewMode === 'MAP' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              )}
            >
              Sơ Đồ Tổng Thể
            </button>
            <button
              onClick={() => setViewMode('SEATS')}
              className={cn(
                'px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1',
                viewMode === 'SEATS' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              )}
            >
              <ZoomIn className="w-3.5 h-3.5" />
              Lưới Ghế ({activeZone?.name.split(' ')[0]})
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: STADIUM OVERHEAD MAP (SVG INTERACTIVE) */}
      {/* ========================================================================= */}
      {viewMode === 'MAP' && (
        <div className="space-y-4">
          <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] max-h-[420px] bg-slate-100 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800/80 overflow-hidden flex items-center justify-center p-4">
            {/* Background grid lines */}
            <div className="absolute inset-0 opacity-15 dark:opacity-10 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]" />

            <svg viewBox="0 0 640 500" className="w-full h-full max-w-2xl select-none">
              {/* STADIUM OUTER RIM */}
              <ellipse cx="320" cy="270" rx="300" ry="210" fill="none" strokeWidth="2" strokeDasharray="4 4" className="stroke-slate-300 dark:stroke-slate-700" />

              {/* CONCERT STAGE (SÂN KHẤU TRUNG TÂM) */}
              <g className="filter drop-shadow-[0_0_15px_rgba(99,102,241,0.25)]">
                {/* Main Stage */}
                <rect x="220" y="80" width="200" height="70" rx="12" strokeWidth="3" className="fill-indigo-100 dark:fill-[#1e1b4b] stroke-indigo-500 dark:stroke-[#818cf8]" />
                {/* Runway / Catwalk */}
                <polygon points="300,150 340,150 330,195 310,195" strokeWidth="2" className="fill-indigo-200 dark:fill-[#312e81] stroke-indigo-400 dark:stroke-[#a5b4fc]" />
                <circle cx="320" cy="195" r="14" strokeWidth="2" className="fill-indigo-300 dark:fill-[#4338ca] stroke-indigo-500 dark:stroke-[#c7d2fe]" />
                {/* Stage Text */}
                <text x="320" y="115" fontSize="13" fontWeight="900" textAnchor="middle" letterSpacing="2" className="fill-indigo-950 dark:fill-white">
                  MAIN STAGE • SÂN KHẤU
                </text>
                <text x="320" y="135" fontSize="9" fontWeight="bold" textAnchor="middle" className="fill-indigo-600 dark:fill-[#a5b4fc]">
                  RUNWAY & CATWALK
                </text>
              </g>

              {/* GRANDSTAND ZONES */}
              {zones.map((zone) => {
                const isSelected = selectedTierId === zone.tierId;
                const isHovered = hoveredZoneId === zone.id;

                return (
                  <g
                    key={zone.id}
                    onClick={() => onSelectTier(zone.tierId)}
                    onMouseEnter={() => setHoveredZoneId(zone.id)}
                    onMouseLeave={() => setHoveredZoneId(null)}
                    className="cursor-pointer transition-all duration-300"
                  >
                    <path
                      d={zone.shapePath}
                      fill={zone.color}
                      fillOpacity={isSelected ? 0.85 : isHovered ? 0.65 : 0.35}
                      stroke={zone.color}
                      strokeWidth={isSelected ? 3.5 : isHovered ? 2.5 : 1.5}
                      className="transition-all duration-200"
                    />
                    {/* Zone labels */}
                    {zone.id === 'zone-vip-pit' && (
                      <text x="320" y="255" fontSize="11" fontWeight="bold" textAnchor="middle" className="fill-slate-900 dark:fill-white font-black">
                        VIP PIT
                      </text>
                    )}
                    {zone.id === 'zone-stand-a' && (
                      <text x="320" y="355" fontSize="11" fontWeight="bold" textAnchor="middle" className="fill-slate-900 dark:fill-white font-black">
                        KHÁN ĐÀI A
                      </text>
                    )}
                    {zone.id === 'zone-stand-b' && (
                      <text x="135" y="280" fontSize="11" fontWeight="bold" textAnchor="middle" className="fill-slate-900 dark:fill-white font-black">
                        KHÁN ĐÀI B
                      </text>
                    )}
                    {zone.id === 'zone-stand-c' && (
                      <text x="505" y="280" fontSize="11" fontWeight="bold" textAnchor="middle" className="fill-slate-900 dark:fill-white font-black">
                        KHÁN ĐÀI C
                      </text>
                    )}
                    {zone.id === 'zone-upper-bowl' && (
                      <text x="320" y="445" fontSize="11" fontWeight="bold" textAnchor="middle" className="fill-slate-900 dark:fill-white font-black">
                        KHÁN ĐÀI THƯỢNG (GA)
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredZoneId && (
              <div className="absolute top-4 left-4 bg-slate-900/95 border border-slate-700/80 p-3.5 rounded-2xl shadow-2xl backdrop-blur-md max-w-xs pointer-events-none animate-in fade-in duration-150">
                {(() => {
                  const z = zones.find((item) => item.id === hoveredZoneId)!;
                  return (
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: z.color }} />
                        <h5 className="font-bold text-white text-xs">{z.name}</h5>
                      </div>
                      <p className="text-[11px] text-slate-300 font-mono font-bold">
                        {formatCurrency(z.price, 'VND')}
                      </p>
                      <p className="text-[10px] text-slate-400 leading-tight">{z.viewAngleDescription}</p>
                      <span className="text-[10px] text-emerald-400 font-mono font-bold block pt-0.5">
                        Còn {z.availableSeats} / {z.totalSeats} ghế
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Zones Selector Carousel Cards */}
          <div className="grid sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {zones.map((zone) => {
              const isSelected = selectedTierId === zone.tierId;
              return (
                <div
                  key={zone.id}
                  onClick={() => onSelectTier(zone.tierId)}
                  className={cn(
                    'p-3 rounded-2xl border transition cursor-pointer flex flex-col justify-between text-left',
                    isSelected
                      ? 'bg-slate-950 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  )}
                >
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: zone.color }} />
                      <span className="text-xs font-bold text-white truncate">{zone.name}</span>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-200">
                      {formatCurrency(zone.price, 'VND')}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono pt-1">
                    Còn {zone.availableSeats} ghế
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: SEAT MATRIX PICKER (CHỌN TỪNG SỐ GHẾ) */}
      {/* ========================================================================= */}
      {viewMode === 'SEATS' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              onClick={() => setViewMode('MAP')}
              className="flex items-center gap-1 text-xs text-indigo-400 hover:text-white transition font-bold"
            >
              <ArrowLeft className="w-4 h-4" /> Quay lại sơ đồ toàn sân
            </button>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400">
              <button
                onClick={() => handleAutoPickBestSeats(2)}
                className="px-3 py-1 rounded-xl bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-300 hover:text-white font-bold text-[11px] flex items-center gap-1 transition"
              >
                <Zap className="w-3 h-3 text-amber-300" />
                <span>Auto-Pick 2 Ghế Đẹp Nhất</span>
              </button>

              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-emerald-500" /> Trống
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-indigo-500 ring-2 ring-white" /> Đang chọn
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-amber-500/80" /> Có người giữ
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-slate-700 opacity-60" /> Đã bán
              </span>
            </div>
          </div>

          {/* Seat Grid Frame */}
          <div className="p-6 rounded-3xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col items-center">
            {/* Stage Indicator Bar */}
            <div className="w-full max-w-md py-2 rounded-full bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-700/60 text-center text-xs font-bold font-mono text-indigo-700 dark:text-indigo-300 mb-8 shadow-sm">
              &uarr; HƯỚNG VỀ SÂN KHẤU CHÍNH (MAIN STAGE) &uarr;
            </div>

            {/* Seat Rows */}
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row} className="flex items-center gap-2 sm:gap-3">
                  <span className="w-6 text-center font-bold text-xs text-slate-500 dark:text-slate-400 font-mono">
                    Hàng {row}
                  </span>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    {Array.from({ length: seatsPerRow }, (_, i) => i + 1).map((num) => {
                      const seatId = `${activeZone.id}-${row}-${num}`;
                      const status = getSeatStatus(row, num);
                      const isSelected = selectedSeats.includes(seatId);

                      return (
                        <button
                          key={num}
                          type="button"
                          disabled={status === 'SOLD' || status === 'HELD'}
                          onClick={() =>
                            onToggleSeat(seatId, {
                              row,
                              number: num,
                              tierId: activeZone.tierId,
                            })
                          }
                          className={cn(
                            'w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-[10px] font-mono font-bold transition flex items-center justify-center',
                            isSelected
                              ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 dark:ring-white shadow-lg shadow-indigo-600/50 scale-110 z-10'
                              : status === 'SOLD'
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                              : status === 'HELD'
                              ? 'bg-amber-50 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/50 cursor-not-allowed'
                              : 'bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 hover:bg-emerald-600 hover:text-white'
                          )}
                          title={`Hàng ${row} • Ghế ${num} (${status})`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                  <span className="w-6 text-center font-bold text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {row}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Selected Seats Bottom Summary */}
      {selectedSeats.length > 0 && (
        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-bottom">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                Đã chọn {selectedSeats.length} ghế tại {activeZone.name}:
              </span>
              <p className="text-xs text-slate-900 dark:text-white font-mono font-bold mt-0.5">
                {selectedSeats.map((id) => id.split('-').slice(2).join('')).join(', ')}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-slate-400 font-mono">Tổng tiền vé:</span>
            <p className="text-lg font-black text-emerald-400 font-mono">
              {formatCurrency(activeZone.price * selectedSeats.length, 'VND')}
            </p>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3D VIEW FROM SEAT PREVIEW MODAL */}
      {/* ========================================================================= */}
      {previewZone && (
        <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-12 flex items-center justify-center animate-in fade-in duration-200">
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" onClick={() => setPreviewZone(null)} />

          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-white text-base">
                    Mô Phỏng Tầm Nhìn 3D: {previewZone.name}
                  </h4>
                  <p className="text-xs text-slate-400">Góc nhìn thực tế từ khán đài hướng về sân khấu</p>
                </div>
              </div>

              <button
                onClick={() => setPreviewZone(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stage View Simulation Canvas */}
            <div className="relative aspect-[16/9] w-full bg-slate-950 overflow-hidden flex items-end justify-center">
              {/* Laser beam light cones */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-indigo-950/40 to-slate-950" />
              <div className="absolute top-0 left-1/4 w-32 h-full bg-gradient-to-b from-indigo-500/30 to-transparent rotate-12 blur-xl" />
              <div className="absolute top-0 right-1/4 w-32 h-full bg-gradient-to-b from-rose-500/30 to-transparent -rotate-12 blur-xl" />

              {/* Stage Visual */}
              <div
                className="relative z-10 flex flex-col items-center mb-8 transition-transform duration-500"
                style={{
                  transform:
                    previewZone.category === 'VIP_PIT'
                      ? 'scale(1.4)'
                      : previewZone.category === 'LOWER_BOWL'
                      ? 'scale(1.0)'
                      : 'scale(0.65)',
                }}
              >
                {/* Giant LED screen */}
                <div className="w-72 h-36 rounded-2xl border-2 border-indigo-400/80 bg-gradient-to-tr from-rose-900 via-indigo-900 to-amber-700 shadow-[0_0_50px_rgba(99,102,241,0.6)] flex items-center justify-center text-center p-3 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pulse" />
                  <span className="font-black text-white text-base tracking-widest drop-shadow-lg">
                    THE ERAS TOUR LIVE
                  </span>
                </div>
                {/* Stage platform */}
                <div className="w-96 h-8 bg-slate-800 border-t-2 border-indigo-400 rounded-t-lg shadow-2xl flex items-center justify-center text-[10px] text-slate-400 font-mono">
                  SÂN KHẤU CHÍNH & DÀN ÁNH SÁNG
                </div>
              </div>

              {/* Spectator silhouettes */}
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-950 to-transparent flex items-end justify-around px-4 opacity-70">
                {Array.from({ length: 18 }).map((_, i) => (
                  <div
                    key={i}
                    className="w-5 h-8 bg-slate-900 rounded-t-full mx-1 opacity-80"
                    style={{ height: `${24 + (i % 5) * 6}px` }}
                  />
                ))}
              </div>
            </div>

            {/* Zone Specs breakdown */}
            <div className="p-5 space-y-4 bg-slate-900/90 text-xs">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">Khoảng Cách Sân Khấu</span>
                  <span className="text-base font-black text-amber-300 font-mono">
                    {previewZone.category === 'VIP_PIT'
                      ? '5 - 10m'
                      : previewZone.category === 'LOWER_BOWL'
                      ? '25 - 40m'
                      : '70 - 90m'}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">Chất Lượng Âm Thanh</span>
                  <span className="text-base font-black text-emerald-400 font-mono">
                    {previewZone.category === 'VIP_PIT' ? '100% Studio' : '95% Dolby Atmos'}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block">Đơn Giá Vé</span>
                  <span className="text-base font-black text-indigo-400 font-mono">
                    {formatCurrency(previewZone.price, 'VND')}
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                {previewZone.viewAngleDescription}
              </p>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onSelectTier(previewZone.tierId);
                    setViewMode('SEATS');
                    setPreviewZone(null);
                  }}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-lg transition"
                >
                  Chọn Khán Đài Này & Chuyển Sang Lưới Ghế &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
