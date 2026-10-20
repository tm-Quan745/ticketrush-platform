import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../lib/axios';

export interface QueueStatus {
  state: 'NOT_IN_QUEUE' | 'WAITING' | 'ADMITTED' | 'EXPIRED';
  position: number;
  estimatedWaitSeconds: number;
  pollIntervalSeconds: number;
  soldOut: boolean;
  token?: string;
  expiresAt?: string;
}

export function useWaitingQueue(eventId: string, enabled = true) {
  const statusQuery = useQuery<QueueStatus>({
    queryKey: ['queueStatus', eventId],
    queryFn: async () => {
      const { data } = await apiClient.get<QueueStatus>(`/events/${eventId}/waiting-room/status`);
      return data;
    },
    enabled: Boolean(eventId) && enabled,
    refetchInterval: 2000, // 2s heartbeat
  });

  const joinQueueMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<QueueStatus>(`/events/${eventId}/waiting-room/join`);
      return data;
    },
  });

  const leaveQueueMutation = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/events/${eventId}/waiting-room/leave`);
    },
  });

  return {
    statusQuery,
    joinQueue: joinQueueMutation.mutateAsync,
    leaveQueue: leaveQueueMutation.mutateAsync,
    isJoining: joinQueueMutation.isPending,
  };
}
