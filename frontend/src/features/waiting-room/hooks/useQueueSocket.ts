import { useState, useEffect } from 'react';
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

export function useQueueSocket(eventId: string, active = true) {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId || !active) return;
    let timer: any = null;

    const joinAndPoll = async () => {
      try {
        const { data: initial } = await apiClient.post<QueueStatus>(`/events/${eventId}/waiting-room/join`);
        setStatus(initial);
        setLoading(false);

        if (initial.state === 'ADMITTED') return;

        timer = setInterval(async () => {
          try {
            const { data: updated } = await apiClient.get<QueueStatus>(`/events/${eventId}/waiting-room/status`);
            setStatus(updated);
            if (updated.state === 'ADMITTED') {
              clearInterval(timer);
            }
          } catch {
            // ignore
          }
        }, 2000);
      } catch {
        setLoading(false);
      }
    };

    joinAndPoll();

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [eventId, active]);

  const leaveQueue = async () => {
    try {
      await apiClient.delete(`/events/${eventId}/waiting-room/leave`);
    } catch {
      // ignore
    }
  };

  return { status, loading, leaveQueue };
}
