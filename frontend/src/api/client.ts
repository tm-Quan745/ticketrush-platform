import { Event, TicketTier, Reservation, Order, Ticket, WaitingRoomStatus, InventoryViolation, User } from '../types';
import type { Operations } from './generated';
import { endpoints } from './generated';

export function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value); return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
export const pollDelay = (advice: { retryAfterMs?: number }, fallback: number) =>
  Math.max(advice.retryAfterMs ?? 0, fallback) * (1 + Math.random() * 0.15);
export class ApiError extends Error {
  constructor(public status: number, public data: any, public retryAfterMs?: number) {
    super([429, 503].includes(status)
      ? `Hệ thống đang bận. Vui lòng thử lại sau ${Math.ceil((retryAfterMs ?? 1000) / 1000)} giây.`
      : data?.message || `API error ${status}`);
  }
}
const base = import.meta.env?.VITE_API_BASE_URL || '/api/v1';
export class ApiClient {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private user: User | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  constructor() {
    try {
      if (typeof localStorage !== 'undefined') {
        for (const key of ['tr_access_token', 'tr_refresh_token', 'tr_user']) localStorage.removeItem(key);
      }
    } catch { /* Storage can be disabled; authentication remains in memory. */ }
  }
  setAuth(token: string | null, user: User | null, refreshToken?: string | null) {
    this.token = token; this.user = user;
    if (refreshToken !== undefined) this.refreshToken = refreshToken;
  }
  getToken() { return this.token; }
  getUser() { return this.user; }
  getRefreshToken() { return this.refreshToken; }
  private expire() {
    this.setAuth(null, null, null);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:expired'));
  }
  async refreshSession(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    if (!this.refreshToken) return false;
    this.refreshPromise = (async () => {
      try {
        const response = await fetch(base + '/auth/refresh', { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: this.refreshToken }) });
        if (!response.ok) { this.expire(); return false; }
        const data = await response.json(); this.setAuth(data.accessToken, this.user, data.refreshToken); return true;
      } catch { this.expire(); return false; }
    })().finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }
  async request<T>(endpoint: string, options: RequestInit = {}, extraHeaders: Record<string, string> = {}, isRetry = false): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extraHeaders, ...(options.headers as Record<string, string>) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(base + endpoint, { ...options, credentials: 'include', headers });
    const canRefresh = !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(endpoint);
    if (response.status === 401 && canRefresh && !isRetry && await this.refreshSession())
      return this.request<T>(endpoint, options, extraHeaders, true);
    if (!response.ok) {
      const data = await response.json().catch(() => ({ message: response.statusText }));
      if (response.status === 401 && canRefresh) this.expire();
      if (response.status === 403 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:forbidden'));
      throw new ApiError(response.status, data, retryAfter(response.headers.get('Retry-After')));
    }
    if (response.status === 204) return undefined as T;
    const data = await response.json();
    if (data && typeof data === 'object') Object.defineProperty(data, 'retryAfterMs', { value: retryAfter(response.headers.get('Retry-After')), enumerable: false });
    return data;
  }
  call<K extends keyof Operations>(operation: K, input: Operations[K]['input']): Promise<Operations[K]['output']> {
    const endpoint = endpoints[operation];
    let path: string = endpoint.path;
    for (const [name, value] of Object.entries(input.path || {})) path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(input.query || {})) if (value != null) query.set(name, String(value));
    if (query.size) path += `?${query}`;
    return this.request(path.replace(/^\/api\/v1/, ''), { method: endpoint.method,
      body: input.body === undefined ? undefined : JSON.stringify(input.body), headers: input.headers, signal: input.signal });
  }
  async login(email: string, password: string) {
    const tokens = await this.request<{ accessToken: string; refreshToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setAuth(tokens.accessToken, null, tokens.refreshToken);
    try { const user = await this.getMe(); this.setAuth(tokens.accessToken, user, tokens.refreshToken); return { ...tokens, user }; }
    catch (error) { this.expire(); throw error; }
  }
  register(email: string, password: string) { return this.request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }); }
  async getMe(): Promise<User> {
    const data = await this.request<User & { roles?: string[] }>('/auth/me');
    const role = data.roles?.includes('ADMIN') ? 'ADMIN' : data.roles?.includes('STAFF') ? 'STAFF' : 'USER';
    return { id: data.id, email: data.email, role };
  }
  async logout() {
    const refreshToken = this.refreshToken;
    try { if (refreshToken) await this.request('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }); }
    finally { this.expire(); }
  }
  // --- Events ---
  async getEvents(keyword = '', onSale = false): Promise<{ content: Event[] }> {
    const params = new URLSearchParams();
    if (keyword) params.set('keyword', keyword);
    if (onSale) params.set('onSale', 'true');
    return this.request<{ content: Event[] }>(`/events${params.size ? '?' + params : ''}`);
  }

  async getEventDetail(id: string): Promise<{ event: Event; tiers: TicketTier[] }> {
    return this.request<{ event: Event; tiers: TicketTier[] }>(`/events/${id}`);
  }

  // --- Waiting Room ---
  async joinWaitingRoom(eventId: string): Promise<WaitingRoomStatus> {
    return this.request<WaitingRoomStatus>(`/events/${eventId}/waiting-room/join`, {
      method: 'POST',
    });
  }

  async getWaitingRoomStatus(eventId: string): Promise<WaitingRoomStatus> {
    return this.request<WaitingRoomStatus>(`/events/${eventId}/waiting-room/status`);
  }

  async leaveWaitingRoom(eventId: string): Promise<void> {
    return this.request<void>(`/events/${eventId}/waiting-room/leave`, {
      method: 'DELETE',
    });
  }

  // --- Reservations ---
  async createReservation(tierId: string, quantity = 1, admissionToken?: string): Promise<Reservation> {
    const extraHeaders: Record<string, string> = {};
    if (admissionToken) {
      extraHeaders['X-Admission-Token'] = admissionToken;
    }
    return this.request<Reservation>(
      '/reservations',
      {
        method: 'POST',
        body: JSON.stringify({ tierId, quantity }),
      },
      extraHeaders
    );
  }

  async getMyReservations(): Promise<{ content: Reservation[] }> {
    return this.request<{ content: Reservation[] }>('/reservations/me');
  }

  async cancelReservation(id: string): Promise<void> {
    return this.request<void>(`/reservations/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Orders ---
  async createOrder(reservationId: string, idempotencyKey?: string): Promise<Order> {
    const key = idempotencyKey || crypto.randomUUID();
    return this.request<Order>(
      '/orders',
      {
        method: 'POST',
        body: JSON.stringify({ reservationId }),
      },
      { 'Idempotency-Key': key }
    );
  }

  async getMyOrders(): Promise<{ content: Order[] }> {
    return this.request<{ content: Order[] }>('/orders/me');
  }

  async getOrderTickets(orderId: string): Promise<Ticket[]> {
    const [tickets, order] = await Promise.all([
      this.request<Ticket[]>(`/orders/${orderId}/tickets`), this.getOrder(orderId),
    ]);
    return tickets.map(ticket => ({ ...ticket, orderId, tierName: order.items.find(item => item.tierId === ticket.tierId)?.tierName || '' }));
  }

  getOrder(id: string) { return this.request<Order>(`/orders/${id}`); }
  getReservation(id: string) { return this.request<Reservation>(`/reservations/${id}`); }

  // --- Ticket Verification & Gate Check-in ---
  async verifyTicket(code: string): Promise<{
    valid: boolean;
    status: string;
    ticket?: Ticket;
    eventTitle?: string;
    venue?: string;
    message: string;
  }> {
    const ticket = await this.request<Ticket>('/gate/tickets/verify', { method: 'POST', body: JSON.stringify({ ticketCode: code }) });
    return { valid: ticket.status === 'VALID', status: ticket.status, ticket, message: ticket.status };
  }

  async checkInTicket(code: string): Promise<{
    success: boolean;
    code: string;
    message: string;
    ticket?: Ticket;
    eventTitle?: string;
    venue?: string;
  }> {
    const ticket = await this.request<Ticket>('/gate/tickets/check-in', { method: 'POST', body: JSON.stringify({ ticketCode: code }) });
    return { success: true, code, message: ticket.status, ticket };
  }

  async getAllTickets(): Promise<Ticket[]> {
    throw new Error('Ticket listing is not available for gate staff.');
  }

  async cancelOrder(orderId: string): Promise<Order> {
    return this.request<Order>(`/orders/${orderId}/cancel`, {
      method: 'POST',
    });
  }

  // --- Payments ---
  async simulatePayment(orderId: string): Promise<{ status: string; order: Order; tickets: Ticket[] }> {
    return this.checkPayment(orderId);
  }

  async checkPayment(orderId: string) {
    const order = await this.getOrder(orderId);
    if (order.status !== 'PAID') throw new Error(`Payment status: ${order.status}`);
    return { status: order.status, order, tickets: await this.getOrderTickets(orderId) };
  }

  // --- Admin ---
  async getAdminInventory(eventId: string): Promise<TicketTier[]> {
    return this.request<TicketTier[]>(`/admin/events/${eventId}/inventory`);
  }

  async reconcileInventory(eventId: string): Promise<InventoryViolation[]> {
    return this.request<InventoryViolation[]>(`/admin/events/${eventId}/inventory/reconcile`);
  }

  async updateTierCapacity(tierId: string, totalQuantity: number, tier?: Pick<TicketTier, 'name' | 'price' | 'currency' | 'maxPerOrder'>): Promise<TicketTier> {
    if (!tier) throw new Error('Full tier details are required to update capacity.');
    return this.request<TicketTier>(`/admin/tiers/${tierId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: tier.name, price: tier.price, currency: tier.currency, maxPerOrder: tier.maxPerOrder, totalQuantity }),
    });
  }

  async configureWaitingRoom(eventId: string, enabled: boolean, rate: number, mode: 'fifo' | 'lottery'): Promise<any> {
    return this.request(`/admin/events/${eventId}/waiting-room`, {
      method: 'PUT',
      body: JSON.stringify({ enabled, rate, mode }),
    });
  }

  async createEvent(eventData: Partial<Event>): Promise<Event> {
    return this.request<Event>('/admin/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  }

  async publishEvent(eventId: string): Promise<Event> {
    return this.request<Event>(`/admin/events/${eventId}/publish`, {
      method: 'POST',
    });
  }

  async getHealth(): Promise<any> {
    const res = await fetch('/actuator/health');
    return res.json();
  }

  async reseed(): Promise<any> {
    throw new Error('Browser reseeding is not enabled.');
  }
}

export const api = new ApiClient();

