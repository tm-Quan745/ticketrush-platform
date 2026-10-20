import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { UserCheck, ShieldAlert, LogOut, CheckCircle2 } from 'lucide-react';

export const AuthPage: React.FC = () => {
  const { user, isAdmin, loginAsUser, loginAsAdmin, logout, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="max-w-md mx-auto px-4 py-16 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div className="text-center space-y-1">
          <span className="text-[10px] uppercase font-bold tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-mono">
            TÀI KHOẢN NGƯỜI DÙNG
          </span>
          <h3 className="text-2xl font-black text-white mt-1">Thông Tin Phiên Đăng Nhập</h3>
        </div>

        {user ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">Email:</span>
                <span className="text-white font-bold">{user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Vai trò:</span>
                <span className={`font-bold ${isAdmin ? 'text-rose-400' : 'text-indigo-400'}`}>
                  {user.role}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">User UUID:</span>
                <span className="text-slate-300 truncate max-w-[180px]">{user.id}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <span className="text-xs font-bold text-slate-400 block">Chuyển đổi vai trò thử nghiệm:</span>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={!isAdmin ? 'primary' : 'secondary'}
                  onClick={loginAsUser}
                  size="sm"
                  isLoading={loading}
                >
                  <UserCheck className="w-3.5 h-3.5 mr-1" /> Người Dùng
                </Button>
                <Button
                  variant={isAdmin ? 'danger' : 'secondary'}
                  onClick={loginAsAdmin}
                  size="sm"
                  isLoading={loading}
                >
                  <ShieldAlert className="w-3.5 h-3.5 mr-1" /> Quản Trị Viên
                </Button>
              </div>
            </div>

            <Button variant="outline" onClick={logout} className="w-full mt-4">
              <LogOut className="w-4 h-4 mr-1.5" /> Đăng Xuất
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button onClick={loginAsUser} className="w-full py-3">
              Đăng Nhập Khách Hàng (user@ticketrush.dev)
            </Button>
            <Button onClick={loginAsAdmin} variant="danger" className="w-full py-3">
              Đăng Nhập Quản Trị (admin@ticketrush.dev)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
