import { useQuery } from '@tanstack/react-query';
import { ticketApi } from '../api/ticketApi';

export function useUserTickets() {
  const ticketsQuery = useQuery({
    queryKey: ['userTickets'],
    queryFn: () => ticketApi.getAllUserTickets(),
  });

  const ordersQuery = useQuery({
    queryKey: ['userOrders'],
    queryFn: () => ticketApi.getMyOrders(),
  });

  return {
    tickets: ticketsQuery.data || [],
    orders: ordersQuery.data || [],
    isLoading: ticketsQuery.isLoading || ordersQuery.isLoading,
    refetch: () => {
      ticketsQuery.refetch();
      ordersQuery.refetch();
    },
  };
}
