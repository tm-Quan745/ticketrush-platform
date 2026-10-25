export interface UserTicket {
  id: string;
  orderId: string;
  eventId: string;
  tierId: string;
  tierName: string;
  ticketCode: string;
  status: 'VALID' | 'USED' | 'CANCELLED';
  issuedAt: string;
  seatInfo?: string;
}

export interface UserOrder {
  id: string;
  userId?: string;
  reservationId?: string;
  paymentReference?: string;
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'REFUNDED' | 'REFUND_PENDING';
  totalAmount: number;
  currency?: string;
  paymentDeadline?: string;
  items: Array<{ tierName: string; quantity: number; unitPrice?: number; tierId?: string }>;
  createdAt: string;
  updatedAt?: string;
}
