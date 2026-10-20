import { apiClient } from '../../../lib/axios';
import { FlashSaleEvent, FlashSaleTier, TicketReservation } from '../types/flashSale.types';

export const flashSaleApi = {
  getEventDetails: async (eventId: string): Promise<{ event: FlashSaleEvent; tiers: FlashSaleTier[] }> => {
    const { data } = await apiClient.get<{ event: FlashSaleEvent; tiers: FlashSaleTier[] }>(`/events/${eventId}`);
    return data;
  },

  reserveTickets: async (params: {
    tierId: string;
    quantity: number;
    admissionToken?: string;
  }): Promise<TicketReservation> => {
    const headers: Record<string, string> = {};
    if (params.admissionToken) {
      headers['X-Admission-Token'] = params.admissionToken;
    }
    const { data } = await apiClient.post<TicketReservation>(
      '/reservations',
      { tierId: params.tierId, quantity: params.quantity },
      { headers }
    );
    return data;
  },

  cancelReservation: async (reservationId: string): Promise<void> => {
    await apiClient.delete(`/reservations/${reservationId}`);
  },

  createIdempotentOrder: async (reservationId: string, idempotencyKey: string): Promise<any> => {
    const { data } = await apiClient.post(
      '/orders',
      { reservationId },
      {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      }
    );
    return data;
  },

  simulatePayment: async (orderId: string): Promise<any> => {
    const { data } = await apiClient.post('/payments/simulate', { orderId });
    return data;
  },
};
