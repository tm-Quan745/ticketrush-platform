# Frontend audit before changes — 2026-10-19

Inspected root AGENTS.md, package.json, src/main.tsx, src/App.tsx, API call sites,
server.ts, Spring controllers/security, and the live /v3/api-docs on localhost:18080.
The active application is React 19, Vite, TypeScript, Tailwind; not Next.js.
frontend/src is an inactive imported duplicate. The working tree already contained
uncommitted frontend integration changes; server.ts already proxied real Spring
requests and did not implement any mock endpoints. No mock-only HTTP endpoints
remain in that server. Existing tests and files were preserved where practical.

| Pages/components | API calls (under /api/v1 unless stated) | Spring contract / mismatch |
| --- | --- | --- |
| AuthPage, AuthContext | POST auth/register, login, refresh, logout; GET auth/me | Exist; token pair in JSON, no refresh cookie; roles array rather than role |
| UserPortal, EventCard, EventHeader, EventDetailModal, EventFlashSalePage | GET events, events/{id}; POST reservations | Exist; public tiers have buckets and maxPerOrder, no seat or exact stock |
| WaitingRoomPage/View/Modal, QueueStatusCard, useQueueSocket/useWaitingQueue | POST events/{id}/waiting-room/join; GET status; DELETE leave | Exist; status polling, not WebSocket; Retry-After must be honored; OpenAPI success annotation missing |
| ReservationModal, CheckoutModal, CheckoutTTLModal | POST orders; DELETE reservations/{id}; GET orders/{id}, orders/{id}/tickets | Exist; Idempotency-Key required; mock gateway is a real backend test payment provider, not a browser payment endpoint |
| TicketsPage, TicketList, TicketWallet, MyTicketsModal, QRCodeModal | GET reservations/me, orders/me, orders/{id}/tickets | Exist; ticket lacks orderId/tierName; reservation lacks tierId/eventId/unitPrice; legacy types overpromise fields |
| AdminPortal, AdminDashboard, CreateEventModal | GET events, events/{id}, admin/events/{id}/inventory, inventory/reconcile, admin/orders; POST admin/events, tiers, publish, orders/{id}/refund; PUT admin/tiers/{id}, waiting-room | Exist; public event listing only includes PUBLISHED; no admin draft read/list, no GET waiting-room settings or eventId order filter |
| GateScannerModal | verifyTicket/checkInTicket/getAllTickets methods throw locally | No STAFF role or gate endpoints; implement verify/check-in only |
| HealthModal | GET /actuator/health | Exists; rename Microservices Health to System Health; detailed components may be absent |
| ProfilePage, UserProfileModal, TransferTicketModal, PrintableTicketModal, OrderInvoiceModal | Mostly local state / passed props | No profile editing, cards, KYC, 2FA, sessions, transfer API; do not imply persistence |
| Header, Navbar, Footer, CommandPalette, FlowNavigatorModal | Local state navigation | No URL routing or consistent role guards; gate/admin controls globally exposed |
| NotificationDrawer/Context | Local notification state | Not a server notification center; no broadcast endpoint |
| ConcurrencySimulatorModal | events, admin inventory, reservations | Browser load generator, not reproducible performance evidence; replace with read-only artifact links |
| ArchitectureModal, CountdownTimer, TicketTierCard, Button/Card/Badge/Modal, ThemeToggle | Presentation only | Keep useful presentation primitives; omit unsupported screens from active bundle |

Existing Spring operations not wired to dedicated pages: GET admin/outbox and
admin/notifications, POST outbox/{id}/retry and notifications/{id}/resend,
POST admin/events/{id}/inventory/redis-reconcile. These are operational delivery
records, not the unsupported customer notification center.

The prior SPA stored tokens in localStorage and used an in-memory view name as its
router. Wrong roles were shown login rather than 403. Seat selection and simulated
account settings did not reflect the tier/inventory data model. These mismatches
were reported in chat before any edits.

## Remaining backend gaps (not expanded in this task)

- No admin draft listing/detail read endpoint. A just-created draft response is
  retained in memory for editing; after reload only operations by known ID remain.
- No GET waiting-room configuration. The settings form explicitly sets new values.
- No eventId filter on admin orders. The event orders tab filters tier IDs on each
  paginated result and labels that limitation.
- No httpOnly refresh cookie. Both tokens stay in memory; reload requires login.
- No real payment provider. Purchase E2E uses the existing signed mock gateway.
- No transfer, server notification center, batch-admit, ticket list, saved cards,
  KYC, 2FA, device sessions or assigned-seat endpoint was introduced.
