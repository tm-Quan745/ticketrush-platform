import React, { createContext, useContext, useState, useEffect } from 'react';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: 'FLASH_SALE' | 'ORDER' | 'SYSTEM' | 'SECURITY';
  timestamp: string;
  read: boolean;
  linkAction?: string; // e.g. 'tickets' | 'event_detail'
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    title: '⚡ Mở bán Flash-Sale đợt 2!',
    message: 'Taylor Swift | The Eras Tour vừa bổ sung 150 vé VIP Diamond Floor. Nhanh tay giữ chỗ!',
    category: 'FLASH_SALE',
    timestamp: '2 phút trước',
    read: false,
    linkAction: 'event_detail',
  },
  {
    id: 'notif-2',
    title: '🔒 Đảm bảo Zero Overselling',
    message: 'Hệ thống đã xác thực tính toàn vẹn kho: 100% không xảy ra tình trạng bán khống.',
    category: 'SYSTEM',
    timestamp: '15 phút trước',
    read: false,
  },
  {
    id: 'notif-3',
    title: '🎟️ Vé điện tử sẵn sàng',
    message: 'Mã QR check-in sự kiện đã được mã hóa bảo mật chống chụp màn hình.',
    category: 'ORDER',
    timestamp: '1 giờ trước',
    read: true,
    linkAction: 'tickets',
  },
  {
    id: 'notif-4',
    title: '🛡️ Xác thực định danh CCCD (KYC)',
    message: 'Hồ sơ của bạn đã được chứng thực chính chủ để kích hoạt tốc độ mua vé nhanh 1-Click.',
    category: 'SECURITY',
    timestamp: '2 giờ trước',
    read: false,
    linkAction: 'profile',
  },
];

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem('tr_notifications');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_NOTIFICATIONS;
  });

  useEffect(() => {
    try {
      localStorage.setItem('tr_notifications', JSON.stringify(notifications));
    } catch {}
  }, [notifications]);

  const addNotification = (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
    const newItem: AppNotification = {
      ...n,
      id: 'notif-' + Date.now(),
      timestamp: 'Vừa xong',
      read: false,
    };
    setNotifications((prev) => [newItem, ...prev]);
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
  };

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};
