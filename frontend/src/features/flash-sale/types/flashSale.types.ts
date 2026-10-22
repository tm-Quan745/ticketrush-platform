export interface StadiumSeat {
  id: string;
  zoneId: string;
  row: string; // e.g. "A", "B", "C"
  number: number; // e.g. 1, 2, 3...
  tierId: string;
  price: number;
  status: 'AVAILABLE' | 'HELD' | 'SOLD' | 'SELECTED';
}

export interface StadiumZone {
  id: string;
  name: string;
  tierId: string;
  tierName: string;
  price: number;
  color: string;
  shapePath: string;
  viewAngleDescription: string;
  category: 'VIP_PIT' | 'LOWER_BOWL' | 'UPPER_BOWL' | 'GENERAL_ADMISSION';
  totalSeats: number;
  availableSeats: number;
}

export interface FlashSaleTier {
  id: string;
  eventId: string;
  name: string;
  description?: string;
  price: number; // minor units (VND or USD cents)
  currency: string;
  totalQuantity: number;
  availableQuantity: number;
  heldQuantity: number;
  soldQuantity: number;
  maxPerOrder: number;
  version: number;
  availability?: 'AVAILABLE' | 'LOW' | 'SOLD_OUT';
}

export interface FlashSaleEvent {
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
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED' | 'ENDED';
  waitingRoomEnabled?: boolean;
  waitingRoomRate?: number;
  waitingRoomMode?: 'fifo' | 'lottery';
}

export interface TicketReservation {
  id: string;
  userId: string;
  tierId: string;
  eventId: string;
  tierName?: string;
  unitPrice?: number;
  currency?: string;
  quantity: number;
  status: 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  expires_at: string;
  seconds_remaining: number;
  selectedSeats?: Array<{ row: string; number: number; zoneName: string }>;
}
