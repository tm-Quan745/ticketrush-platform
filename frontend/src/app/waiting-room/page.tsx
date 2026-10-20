import React from 'react';
import { useQueueSocket } from '../../features/waiting-room/hooks/useQueueSocket';
import { QueueStatusCard } from '../../features/waiting-room/components/QueueStatusCard';

interface WaitingRoomPageProps {
  eventId: string;
  eventTitle: string;
  onAdmitted: (token: string) => void;
  onLeave: () => void;
}

export const WaitingRoomPage: React.FC<WaitingRoomPageProps> = ({
  eventId,
  eventTitle,
  onAdmitted,
  onLeave,
}) => {
  const { status, leaveQueue } = useQueueSocket(eventId);

  return (
    <div className="max-w-4xl mx-auto px-4 py-16 animate-in fade-in duration-300">
      <QueueStatusCard
        status={status}
        eventTitle={eventTitle}
        onAdmitted={() => {
          if (status?.token) onAdmitted(status.token);
        }}
        onLeave={async () => {
          await leaveQueue();
          onLeave();
        }}
      />
    </div>
  );
};
