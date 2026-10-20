export type EventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'ENDED';

export type AvailabilityStatus = 'AVAILABLE' | 'LOW' | 'SOLD_OUT';

export interface TicketTier {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  price: number; // minor units (e.g. 1250 = $12.50)
  currency: string;
  totalQuantity: number;
  availableQuantity: number;
  heldQuantity: number;
  soldQuantity: number;
  maxPerOrder: number;
  version: number;
  availability?: AvailabilityStatus;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  venueName: string;
  venueAddress: string;
  imageUrl: string;
  startTime: string;
  endTime: string;
  saleStartTime: string;
  saleEndTime: string;
  status: EventStatus;
  waitingRoomEnabled?: boolean;
  waitingRoomRate?: number;
  waitingRoomMode?: 'fifo' | 'lottery';
  createdAt: string;
  updatedAt: string;
}

export type ReservationStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface Reservation {
  id: string;
  userId: string;
  tierId: string;
  eventId: string;
  tierName?: string;
  unitPrice?: number;
  currency?: string;
  quantity: number;
  status: ReservationStatus;
  createdAt: string;
  expires_at: string;
  seconds_remaining: number;
}

export type OrderStatus = 'PENDING' | 'PENDING_PAYMENT' | 'PAYMENT_FAILED' | 'EXPIRED' | 'PAID' | 'CANCELLED' | 'REFUNDED' | 'REFUND_PENDING';

export interface OrderItem {
  tierId: string;
  tierName: string;
  unitPrice: number;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  reservationId: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  paymentDeadline: string;
  paymentReference?: string;
  manualReview?: boolean;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Ticket {
  id: string;
  orderId: string;
  eventId: string;
  tierId: string;
  tierName: string;
  ticketCode: string;
  status: 'VALID' | 'USED' | 'CANCELLED';
  issuedAt: string;
}

export interface WaitingRoomStatus {
  state: 'NOT_IN_QUEUE' | 'WAITING' | 'ADMITTED' | 'EXPIRED';
  position: number;
  estimatedWaitSeconds: number;
  pollIntervalSeconds: number;
  soldOut: boolean;
  token?: string;
  expiresAt?: string;
}

export interface User {
  id: string;
  email: string;
  role: 'USER' | 'STAFF' | 'ADMIN';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface InventoryViolation {
  tierId: string;
  tierName: string;
  available: number;
  held: number;
  confirmed: number;
  sold: number;
  total: number;
  calculatedSum: number;
  discrepancy: number;
  validTickets: number;
}
