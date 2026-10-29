import React from 'react';
import { ArrowRight, ShieldCheck, Ticket, Zap } from 'lucide-react';
import { can, type Role } from '../access/permissions';
import { Link } from '../pages/shared';
import { ThemeToggle } from './ThemeToggle';

export function Footer({ role }: { role: Role }) {
  return (
    <footer className="mt-10 border-t border-slate-800 bg-slate-950 text-sm text-slate-400">
      <div className="border-b border-slate-800 bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-bold text-lg text-slate-100">Trải nghiệm sự kiện cùng TicketRush</p>
            <p className="mt-1">Khám phá sự kiện, chọn vé và theo dõi đơn hàng của bạn.</p>
          </div>
          <Link href="/events" className="inline-flex items-center gap-2 font-semibold shrink-0">
            Khám phá sự kiện <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="space-y-4 lg:col-span-2">
          <Link href="/events" className="inline-flex items-center gap-3 text-2xl font-black">
            <span className="rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 p-2.5">
              <Zap className="w-5 h-5 text-white" aria-hidden="true" />
            </span>
            TicketRush
          </Link>
          <p className="max-w-md leading-relaxed">Nền tảng đặt vé sự kiện. Tìm chương trình yêu thích và lưu giữ những khoảnh khắc đáng nhớ.</p>
          <p className="flex items-center gap-2 text-xs"><Ticket className="w-4 h-4 shrink-0" aria-hidden="true" /> Vé điện tử và mã QR check-in</p>
        </div>
        <nav aria-label="Khám phá và tài khoản" className="space-y-4">
          <h2 className="font-bold text-slate-100">Dành cho khán giả</h2>
          <ul className="space-y-3">
            <li><Link href="/events">Danh mục sự kiện</Link></li>
            {can(role, 'account') && <>
              <li><Link href="/account/tickets">Ví vé của tôi</Link></li>
              <li><Link href="/account/orders">Lịch sử đơn hàng</Link></li>
              <li><Link href="/account/profile">Hồ sơ cá nhân</Link></li>
            </>}
            {role === 'PUBLIC' && <>
              <li><Link href="/login">Đăng nhập tài khoản</Link></li>
              <li><Link href="/register">Tạo tài khoản</Link></li>
            </>}
          </ul>
        </nav>
        {can(role, 'gate') ? <nav aria-label="Vận hành TicketRush" className="space-y-4">
          <h2 className="font-bold text-slate-100 flex items-center gap-2"><ShieldCheck className="w-4 h-4" aria-hidden="true" /> Dành cho ban tổ chức</h2>
          <ul className="space-y-3">
            <li><Link href="/gate">Cổng soát vé QR</Link></li>
            {can(role, 'admin') && <>
              <li><Link href="/admin">Bảng điều khiển quản trị</Link></li>
              <li><Link href="/admin/events">Quản lý sự kiện</Link></li>
              <li><Link href="/admin/orders">Quản lý đơn hàng</Link></li>
              <li><Link href="/admin/operations">Tình trạng hệ thống</Link></li>
              <li><Link href="/admin/results">Kết quả hiệu năng</Link></li>
            </>}
          </ul>
        </nav> : <div className="space-y-4">
          <h2 className="font-bold text-slate-100">Sẵn sàng cho sự kiện</h2>
          <p className="leading-relaxed">Đăng nhập để đặt vé. Sau khi thanh toán, mở ví vé để xem mã QR dùng tại cổng soát vé.</p>
        </div>}
      </div>
      <div className="border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs">© {new Date().getFullYear()} TicketRush · Đặt vé sự kiện</p>
          <ThemeToggle showDropdown />
        </div>
      </div>
    </footer>
  );
}
