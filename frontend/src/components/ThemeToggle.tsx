import React, { useState, useRef, useEffect } from 'react';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { Sun, Moon, Laptop, Check } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  showDropdown?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  className = '',
  showDropdown = false,
}) => {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const options: { mode: ThemeMode; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      mode: 'light',
      label: 'Giao diện Sáng',
      icon: <Sun className="w-4 h-4 text-amber-500" />,
      desc: 'Nền sáng nhẹ, tối ưu đọc ban ngày',
    },
    {
      mode: 'dark',
      label: 'Giao diện Tối',
      icon: <Moon className="w-4 h-4 text-indigo-400" />,
      desc: 'Nền tối tương phản cao cho sự kiện',
    },
    {
      mode: 'system',
      label: 'Theo Hệ Thống',
      icon: <Laptop className="w-4 h-4 text-slate-400" />,
      desc: 'Tự động đồng bộ theo OS máy tính',
    },
  ];

  if (!showDropdown) {
    // Elegant quick-toggle button
    return (
      <button
        onClick={toggleTheme}
        className={`relative p-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition flex items-center justify-center group ${className}`}
        title={
          resolvedTheme === 'dark'
            ? 'Chuyển sang Giao diện Sáng (Light Mode)'
            : 'Chuyển sang Giao diện Tối (Dark Mode)'
        }
        aria-label="Chuyển đổi giao diện sáng tối"
      >
        {resolvedTheme === 'dark' ? (
          <Sun className="w-4 h-4 text-amber-400 transition-transform duration-300 group-hover:rotate-45 group-hover:scale-110" />
        ) : (
          <Moon className="w-4 h-4 text-indigo-500 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />
        )}
        <span className="sr-only">
          {resolvedTheme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
        </span>
      </button>
    );
  }

  // Dropdown selector mode
  return (
    <div className={`relative inline-block ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-semibold text-slate-200 transition"
        title="Chọn chế độ giao diện"
      >
        {resolvedTheme === 'dark' ? (
          <Moon className="w-4 h-4 text-indigo-400" />
        ) : (
          <Sun className="w-4 h-4 text-amber-500" />
        )}
        <span className="hidden sm:inline">
          {theme === 'system'
            ? 'Tự động'
            : theme === 'dark'
            ? 'Giao diện Tối'
            : 'Giao diện Sáng'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 mb-1">
            Chế độ hiển thị
          </div>
          {options.map((opt) => (
            <button
              key={opt.mode}
              onClick={() => {
                setTheme(opt.mode);
                setIsOpen(false);
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition text-left ${
                theme === opt.mode
                  ? 'bg-indigo-600/15 text-indigo-400 font-bold'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {opt.icon}
                <div>
                  <div className="text-slate-100 font-medium">{opt.label}</div>
                  <div className="text-[10px] text-slate-400">{opt.desc}</div>
                </div>
              </div>
              {theme === opt.mode && <Check className="w-3.5 h-3.5 text-indigo-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
