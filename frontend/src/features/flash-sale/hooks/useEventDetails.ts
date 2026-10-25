import { useQuery } from '@tanstack/react-query';
import { flashSaleApi } from '../api/flashSaleApi';

export function useEventDetails(eventId: string) {
  return useQuery({
    queryKey: ['eventDetails', eventId],
    queryFn: () => flashSaleApi.getEventDetails(eventId),
    enabled: Boolean(eventId),
    refetchInterval: 5000, // Sync live inventory every 5s
  });
}
