import type { Order, Reservation } from '../../types';
import { stateLabel } from '../../i18n/vi';

export interface OrderNotification {id:string;orderId?:string;reservationId?:string;title:string;message:string;href:string}
export function orderNotifications(orders:Order[],userId:string):OrderNotification[] {
 return orders.filter(order=>order.userId===userId).map(order=>({
  id:`${order.id}:${order.status}:${Boolean(order.manualReview)}`,
  orderId:order.id,
  title:order.manualReview?'Đơn hàng cần kiểm tra':order.status==='EXPIRED'?'Hết thời gian giữ vé':stateLabel(order.status),
  message:order.manualReview?'Đơn hàng đang được kiểm tra. Mở chi tiết để theo dõi.':
    order.status==='PAID'?'Thanh toán thành công. Bạn có thể xem vé trong chi tiết đơn hàng.':
    order.status==='PENDING_PAYMENT'?'Đơn hàng đang chờ thanh toán. Kiểm tra thời hạn trong chi tiết đơn.':
    order.status==='EXPIRED'?'Thời gian giữ vé đã hết. Vé đã được trả về kho. Bạn có thể chọn vé và đặt lại.':
    `Trạng thái đơn hàng: ${stateLabel(order.status)}.`,
  href:`/orders/${encodeURIComponent(order.id)}`,
 }));
}
export function bookingNotifications(orders:Order[],reservations:Reservation[],userId:string):OrderNotification[] {
 const ownedOrders=orders.filter(order=>order.userId===userId);
 const orderedReservations=new Set(ownedOrders.map(order=>order.reservationId));
 const expired=reservations.filter(reservation=>reservation.userId===userId&&reservation.status==='EXPIRED'&&!orderedReservations.has(reservation.id));
 return [
  ...expired.map(reservation=>({
   id:`reservation:${reservation.id}:EXPIRED`,reservationId:reservation.id,
   title:'Hết thời gian giữ vé',
   message:`Thời gian giữ ${reservation.quantity} vé${reservation.tierName?` hạng ${reservation.tierName}`:''} đã hết. Vé đã được trả về kho. Bạn có thể chọn vé và đặt lại.`,
   href:`/events/${encodeURIComponent(reservation.eventId)}`,
  })),
  ...orderNotifications(ownedOrders,userId),
 ];
}
export const notificationReadKey=(userId:string)=>`ticketrush:notification-read:${userId}`;
export function parseReadNotifications(raw:string|null):string[] {
 try {const value:unknown=JSON.parse(raw||'[]');return Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&item.length<200).slice(-500):[];} catch{return [];}
}
