import { vi } from '../i18n/vi';
import { Event, TicketTier, Reservation, Order, Ticket, WaitingRoomStatus, InventoryViolation, User } from '../types';
import type { Operations } from './generated';
import { endpoints } from './generated';
import {allPages,type Page} from './pagination';

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
      ? vi.busy(Math.ceil((retryAfterMs ?? 1000) / 1000))
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
    const headers: Record<string, string> = { ...(options.body instanceof FormData ? {} : {'Content-Type': 'application/json'}), ...extraHeaders, ...(options.headers as Record<string, string>) };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await fetch(base + endpoint, { ...options, credentials: 'include', headers });
    const canRefresh = !['/auth/login', '/auth/google', '/auth/google/config', '/auth/register', '/auth/refresh', '/auth/logout'].includes(endpoint);
    if (response.status === 401 && canRefresh && !isRetry && await this.refreshSession())
      return this.request<T>(endpoint, options, extraHeaders, true);
    if (response.status === 304) return { notModified: true, etag: response.headers.get('ETag'), retryAfterMs: retryAfter(response.headers.get('Retry-After')) } as T;
    if (!response.ok) {
      const data = await response.json().catch(() => ({ message: response.statusText }));
      if (response.status === 401 && canRefresh) this.expire();
      if (response.status === 403 && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:forbidden'));
      throw new ApiError(response.status, data, retryAfter(response.headers.get('Retry-After')));
    }
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    if (!body.trim()) return undefined as T;
    const data = JSON.parse(body);
    if (data && typeof data === 'object') { Object.defineProperty(data, 'retryAfterMs', { value: retryAfter(response.headers.get('Retry-After')), enumerable: false }); Object.defineProperty(data, 'etag', { value: response.headers.get('ETag'), enumerable: false }); }
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
  async uploadEventImage(file: File, signal?: AbortSignal): Promise<string> {
    const body = new FormData(); body.append('file', file);
    const result = await this.request<{imageUrl:string}>('/admin/events/images', {method:'POST',body,signal});
    return result.imageUrl;
  }
  async login(email: string, password: string) {
    const tokens = await this.request<{ accessToken: string; refreshToken: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    this.setAuth(tokens.accessToken, null, tokens.refreshToken);
    try { const user = await this.getMe(); this.setAuth(tokens.accessToken, user, tokens.refreshToken); return { ...tokens, user }; }
    catch (error) { this.expire(); throw error; }
  }
  googleConfig() { return this.request<{clientId: string}>('/auth/google/config'); }
  async loginWithGoogle(credential: string) {
    const tokens = await this.request<{ accessToken: string; refreshToken: string }>('/auth/google', {
      method: 'POST', body: JSON.stringify({ credential }),
    });
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
  async getEvents(keyword = '', onSale = false, page = 0, size = 12): Promise<Page<Event>> {
    return this.call('GET /api/v1/events', { query: {keyword, onSale, page, size} }) as Promise<Page<Event>>;
  }

  async getEventDetail(id: string): Promise<{ event: Event; tiers: TicketTier[] }> {
    return this.call('GET /api/v1/events/{id}', {path:{id}}) as Promise<{event:Event;tiers:TicketTier[]}>;
  }

  seatmap(id: string, signal?: AbortSignal) { return this.call('GET /api/v1/events/{id}/seatmap', {path:{id},signal}); }
  geometry(id: string, sectionId: string, version: string, signal?: AbortSignal) { return this.call('GET /api/v1/events/{id}/sections/{sectionId}/geometry/{version}', {path:{id,sectionId,version},signal}); }
  seatStatus(id: string, sectionId: string, etag?: string, signal?: AbortSignal) {
    return this.call('GET /api/v1/events/{id}/sections/{sectionId}/seats', {path:{id,sectionId},headers:etag?{'If-None-Match':etag}:{},signal}) as Promise<(import('./generated').SeatReadSectionSeats & {etag?: string;retryAfterMs?:number}) | {notModified:true;etag?:string;retryAfterMs?:number}>;
  }
  suggest(id: string, sectionId: string, quantity: number, accessible: boolean, token?: string) { return this.call('POST /api/v1/events/{id}/seats/suggest',{path:{id},body:{sectionId,quantity,accessible},headers:token?{'X-Admission-Token':token}:{}}); }
  holdSeats(seatIds: string[], token?: string) { return this.call('POST /api/v1/reservations',{body:{seatIds},headers:token?{'X-Admission-Token':token}:{}}) as Promise<Reservation>; }
  // --- Waiting Room ---
  async joinWaitingRoom(eventId: string, signal?: AbortSignal): Promise<WaitingRoomStatus> {
    return this.call('POST /api/v1/events/{id}/waiting-room/join', {path:{id:eventId},signal}) as Promise<WaitingRoomStatus>;
  }

  async getWaitingRoomStatus(eventId: string, signal?: AbortSignal): Promise<WaitingRoomStatus> {
    return this.call('GET /api/v1/events/{id}/waiting-room/status',{path:{id:eventId},signal}) as Promise<WaitingRoomStatus>;
  }

  async leaveWaitingRoom(eventId: string): Promise<void> {
    return this.request<void>(`/events/${eventId}/waiting-room/leave`, {
      method: 'DELETE',
    });
  }

  // --- Reservations ---
  async createReservation(tierId: string, quantity = 1, admissionToken?: string): Promise<Reservation> {
    return this.call('POST /api/v1/reservations',{body:{tierId,quantity},headers:admissionToken?{'X-Admission-Token':admissionToken}:{}}) as Promise<Reservation>;
  }

  async getMyReservations(page=0): Promise<Page<Reservation>> {
    return this.call('GET /api/v1/reservations/me',{query:{page,size:50}}) as Promise<Page<Reservation>>;
  }

  async cancelReservation(id: string): Promise<void> {
    return this.request<void>(`/reservations/${id}`, {
      method: 'DELETE',
    });
  }

  // --- Orders ---
  async createOrder(reservationId: string, idempotencyKey?: string): Promise<Order> {
    return this.call('POST /api/v1/orders',{body:{reservationId},headers:{'Idempotency-Key':idempotencyKey||crypto.randomUUID()}}) as Promise<Order>;
  }

  async getMyOrders(page=0): Promise<Page<Order>> {
    return this.call('GET /api/v1/orders/me',{query:{page,size:50}}) as Promise<Page<Order>>;
  }
  allMyOrders(){return allPages(page=>this.getMyOrders(page));}
  allMyReservations(){return allPages(page=>this.getMyReservations(page));}
  getAdminEvents(page = 0, size = 12) {
    return this.call('GET /api/v1/admin/events', {query:{page,size}}) as Promise<Page<Event>>;
  }
  allAdminEvents(){return allPages(page=>this.getAdminEvents(page,50));}
  adminEvent(id:string){return this.call('GET /api/v1/admin/events/{id}',{path:{id}}) as Promise<Event>;}
  adminSections(id:string){return this.call('GET /api/v1/admin/events/{id}/sections',{path:{id}});}
  adminSeats(id:string,sectionId:string){return this.call('GET /api/v1/admin/events/{id}/sections/{sectionId}/seats',{path:{id,sectionId}});}
  allAdminOrders(){return allPages(page=>this.request<Page<Order>>(`/admin/orders?page=${page}&size=50`));}

  async getOrderTickets(orderId: string): Promise<Ticket[]> {
    const [tickets, order] = await Promise.all([
      this.call('GET /api/v1/orders/{id}/tickets',{path:{id:orderId}}) as Promise<Ticket[]>, this.getOrder(orderId),
    ]);
    return tickets.map(ticket => ({ ...ticket, orderId, tierName: order.items.find(item => item.tierId === ticket.tierId)?.tierName || '' }));
  }

  getOrder(id: string, signal?: AbortSignal) { return this.call('GET /api/v1/orders/{id}',{path:{id},signal}) as Promise<Order>; }
  getReservation(id: string) { return this.call('GET /api/v1/reservations/{id}',{path:{id}}) as Promise<Reservation>; }

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
    if(!res.ok)throw new Error(vi.failure);
    return res.json();
  }

}

export const api = new ApiClient();

