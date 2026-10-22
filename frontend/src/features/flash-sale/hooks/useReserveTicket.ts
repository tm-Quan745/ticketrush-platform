import { useMutation, useQueryClient } from '@tanstack/react-query';
import { flashSaleApi } from '../api/flashSaleApi';
import { TicketReservation } from '../types/flashSale.types';

export function useReserveTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { tierId: string; quantity: number; admissionToken?: string }) =>
      flashSaleApi.reserveTickets(params),
    onSuccess: (data: TicketReservation) => {
      // Invalidate event inventory queries to reflect newly held tickets immediately
      queryClient.invalidateQueries({ queryKey: ['eventDetails', data.eventId] });
      queryClient.invalidateQueries({ queryKey: ['userReservations'] });
    },
  });
}
