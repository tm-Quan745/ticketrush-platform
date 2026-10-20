import { apiClient } from '../../../lib/axios';
import { UserTicket, UserOrder } from '../types/ticket.types';

export const ticketApi = {
  getMyOrders: async (): Promise<UserOrder[]> => {
    const { data } = await apiClient.get<{ content: UserOrder[] }>('/orders/me');
    return data.content || [];
  },

  getOrderTickets: async (orderId: string): Promise<UserTicket[]> => {
    const { data } = await apiClient.get<UserTicket[]>(`/orders/${orderId}/tickets`);
    return data || [];
  },

  getAllUserTickets: async (): Promise<UserTicket[]> => {
    const orders = await ticketApi.getMyOrders();
    const paidOrders = orders.filter((o) => o.status === 'PAID');
    const allTickets: UserTicket[] = [];

    await Promise.all(
      paidOrders.map(async (order) => {
        try {
          const tickets = await ticketApi.getOrderTickets(order.id);
          allTickets.push(...tickets);
        } catch {
          // ignore
        }
      })
    );

    return allTickets;
  },
};
