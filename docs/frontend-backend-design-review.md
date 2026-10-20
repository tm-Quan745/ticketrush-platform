# Existing SPA and hybrid inventory — design review

Status: PROPOSED, awaiting user review. Date: 2026-10-19.
This step changes documentation only. No backend implementation, migration,
frontend merge, deletion, seed execution, or load experiment is authorized here.
The supplied reserved-seating prompt replaces the earlier removal of the stadium
map, seat grid and Auto-Pick. Keep their appearance, replace simulated behavior.

## Review package

- [Proposed OpenAPI](api/reserved-seating-proposed.openapi.json): changed/new
  operations only, not a replacement for the complete running Spring specification.
- [ADR 0029](decisions/0029-hybrid-counter-seated-inventory.md).
- [Data model and transaction diagram](seating-data-model.md).
- [Actual baseline verification](design-review-verification.md).

## 1. Which application is real?

| Concern | `frontend/src` — old UI | Root `src` — active shell |
| --- | --- | --- |
| Entry | Has main.tsx but no frontend/package.json or own Vite config; root index.html does not point here | index.html imports /src/main.tsx; root package.json/Vite builds this |
| Framework | React/TypeScript/Tailwind, SPA despite app/.../page.tsx names | Same; no Next.js migration |
| Navigation | App.tsx uses currentView state; starts at a hardcoded demo event; global modals | App.tsx uses access/routes.ts, History API and role guards; public/buyer/staff/admin URL layouts |
| Pages | UserPortal catalog, EventFlashSalePage, WaitingRoomPage, TicketsPage, ProfilePage, AuthPage, AdminPortal | pages/BuyerPages.tsx (auth/catalog/detail/zone/queue/checkout/order/account), AdminPages.tsx (admin/event/tier/operations/gate), ResultsPage.tsx |
| Components | Rich stadium/map/grid, ticket cards/wallet, checkout and gate modals, header/footer, admin portal, UI primitives | Same legacy components still present but mostly inactive; active shell imports EventCard, ThemeToggle, Button and new page wrappers |
| Auth | LocalStorage access/refresh/user; startup silent demo login; failed refresh falls back to demo login; USER/ADMIN only; logout only clears local state | Memory tokens; normal login then /auth/me; STAFF recognized; shared refresh promise and one retry; server logout; permissions shared by guards/menu |
| API client | api/client.ts fetch client plus lib/axios.ts and feature clients; expectations inherited from an earlier mock | api/generated.ts from docs/api/openapi.json plus api/client.ts transport; new pages call typed operations; older compatibility adapters retained |
| Spring connection | Relative /api/v1 paths would reach proxy if mounted, but mismatched DTOs/nonexistent paths and demo credentials prevent reliable operation | server.ts proxies to BACKEND_URL without mock fallback; actual Spring auth, queue, reservations, orders and gate paths |
| Tests | No separate test suite targeting frontend/src found | tests/api.test.ts, proxy.test.ts, permissions.test.ts, transport.test.ts; smoke.ts; Playwright access.spec.ts authored; browser suite has not yet been verified |
| Known evidence | Visual source exists, no validated seating/backend contract | Prior 35 Node tests passed; prior targeted 18 backend tests passed; current baseline results are recorded separately, not inferred from those runs |

The active shell is the canonical app proposal, **not a recommendation to replace
the old visual design with the new plain page wrappers**. Adopt its entry, routes,
permissions, transport and tests; restore the old UI presentation inside it.

## 2. UI → calls → current Spring → required change

All paths below have `/api/v1` prefix unless explicitly stated. Source means the
old UI unless marked active. “Exists” refers to checked-in Spring source and the
previous captured OpenAPI; Docker was initially stopped during this audit.

| UI page/component | Current calls / expected behavior | Exists in Spring? | Proposed change |
| --- | --- | --- | --- |
| AuthPage, AuthContext, Header role shortcuts | POST auth/login `{email,password}` → tokens plus embedded `user.role`; GET auth/me → scalar role; POST auth/refresh → same shape | Login/refresh return tokens only; me returns `{id,email,roles[]}`; STAFF now exists | Add embedded user to token response; keep roles[] canonical; adapter derives display role. Remove all silent logins. Explicit Customer/Staff/Admin demo buttons only |
| UserPortal, EventCard, CommandPalette | GET events `?keyword=&onSale=` → `{content:Event[]}` | Yes, paginated PUBLISHED events | Retain paging/filter semantics; no fabricated default event IDs or tier stock |
| EventFlashSalePage, EventDetailModal, EventHeader, TicketCard, StockProgressBar | GET events/{id} → `{event,tiers}`; tiers incorrectly assumed to include exact available/held/sold | Yes; public tiers expose availability bucket, price, currency, maxPerOrder | Add inventoryMode and section IDs. COUNTER keeps coarse public availability. SEATED sections expose anonymous seat states/counts; labels distinguish exact snapshot from bucket |
| StadiumSeatingMap overview / seat grid | No seating API today; five zones hardcoded by tier-array index; A–E × 12 seats generated locally; hash determines HELD/SOLD | No seating model/API | GET events/{id}/seatmap and sections/{sectionId}/seats; use geometry, independent sectionId, real UUIDs and statuses. Preserve SVG styling and grid; BLOCKED added; SELECTED remains local |
| StadiumSeatingMap Auto-Pick | Local first-N AVAILABLE selection, not actually adjacent/best | No | POST events/{id}/seats/suggest; deterministic adjacent run; suggestion is not a hold; replace selection atomically instead of toggling stale selections |
| EventFlashSalePage/useReserveTicket | POST reservations `{tierId,quantity}`, X-Admission-Token; selectedSeats never sent | COUNTER only | Preserve COUNTER shape; SEATED sends `{seatIds:[eventSeatId...]}`; reject mixed tier/event, duplicates, incorrect mode; 409 lists unavailable event-seat IDs |
| WaitingRoomPage, useQueueSocket/useWaitingQueue, WaitingRoomView/Modal | POST events/{id}/waiting-room/join; GET status; DELETE leave | Yes, HTTP polling (not a socket) | Keep token rules and Retry-After+jitter; no caller decides admission; cancel polling on leave/unmount/sold-out |
| ReservationModal, CheckoutModal/CheckoutTTLModal | TTL plus tierName/unitPrice/currency/selectedSeats; DELETE reservations/{id} | TTL/status/quantity only in current View; cancellation exists | Add owner-safe display context and server seat snapshots, retain expires_at/seconds_remaining. No fabricated 600-second reset |
| Checkout payment screen | POST orders `{reservationId}` + Idempotency-Key; POST payments/simulate `{orderId}` expected `{status,order,tickets}` | Orders exists; simulate does not | Normal orders unchanged. Demo scenario chosen before order creation through proposed demo/orders; existing gateway sends signed webhook. Poll GET orders/{id}, then tickets. No mark-paid endpoint |
| TicketWallet/MyTicketsModal/TicketsPage/TicketList | GET reservations/me, orders/me, orders/{id}/tickets; wallet expects orderId/tierName/seatInfo | Yes; tickets lack presentation context and seat info | Add ticket orderId/tierName/event/seat snapshot fields; adapter formats seatInfo. Fetch every relevant page; surface failed requests instead of silently dropping tickets |
| QRCodeModal / PrintableTicketModal / OrderInvoiceModal | Passed ticket/order props; QR and invoice rendering | No separate endpoint required | Reuse local real QR encoder from active shell; encode ticketCode; show immutable seat/price snapshot; no external QR service or invented invoice dates |
| GateScannerModal | GET tickets/verify/{code}; POST tickets/{code}/check-in; GET tickets/all; wrapper booleans/message/event/venue | Those legacy paths absent. Current POST gate/tickets/verify and check-in exist, STAFF-only; no ticket list | Adapter targets current POST paths (code in body), wraps DTO. Extend response with event/seat labels and admission eligibility; remove all-tickets/batch-admit controls, no list endpoint |
| AdminPortal/AdminDashboard inventory | GET admin/events/{id}/inventory and inventory/reconcile | Yes; reconcile returns violations only | Add per-mode inventory facts and per-section reconciliation; do not treat empty violations list as zero stock |
| Admin tier capacity form | PUT admin/tiers/{id} with only `{totalQuantity}` | Path exists but requires full WriteTier payload | Dedicated versioned capacity PATCH for COUNTER; SEATED total derived from mapped enabled seats, change via block/unblock only. Do not relax full PUT validation |
| CreateEventModal/admin info | POST admin/events then publish; expects event fields; old tier creation behavior varies by copied component | Yes event create/update/publish and tier create | Add venueId on create, template selector, section-tier mapping. Publish bulk-creates event_seats atomically. Preserve no-venue COUNTER events |
| Admin waiting room | PUT admin/events/{id}/waiting-room `{enabled,rate,mode}` | Yes; no settings GET | Retain write; label new settings rather than pretend they were read. Optional GET is a later gap, not silently added here |
| Admin orders/refund | GET admin/orders; POST admin/orders/{id}/refund (active shell; older portal mostly local presentation) | Yes | Reuse real operations; seated refund releases only after signed confirmation. Reject refund request if any ticket USED; serialize with gate check-in |
| HealthModal | GET /actuator/health | Yes | Keep appearance, title System Health, no fabricated service health |
| Admin reseed/reset | POST dev/seed | No API; existing DevDataSeeder seeds events/tiers at boot in dev only | Proposed ADMIN-only POST dev/seed in demo/loadtest and !prod. Reset only tagged demo event; never wipe unrelated data or accounts. Contract below |
| ProfilePage/UserProfileModal | Local KYC/cards/security/session controls | No backing APIs | Preserve profile visual shell; unsupported actions hidden/coming soon. No backend scope expansion |
| TransferTicketModal | Local simulated transfer | No | Hide/coming soon; no backend work |
| NotificationDrawer/Context, admin broadcast | Local simulated notifications | No customer center/broadcast API | Hide unsupported actions. Operational failed delivery API already exists and is distinct |
| Operations (active shell) | GET admin/outbox, admin/notifications; POST retry/resend | Yes | Retain real operations under old admin styling |
| ConcurrencySimulatorModal | Browser reservations / inventory and presentation claims | Existing business APIs, not measured benchmark evidence | Keep earlier Results decision; replace launcher with read-only docs/performance evidence, no fake numbers |
| ThemeToggle, UI Badge/Button/Card/Modal, CountdownTimer, Navbar/Footer, ArchitectureModal/FlowNavigatorModal | Rendering/local navigation | Not applicable | Reuse visuals; route through canonical navigation/permissions; informational diagrams must describe actual modular monolith |

### Exact DTO mismatches and adapter boundary

Old `User`: `{id,email,role:'USER'|'ADMIN'}`. Proposed wire identity retains
`roles:['USER'|'STAFF'|'ADMIN']`; adapter derives role for rendering, never grants it.
Old password default is 11 characters and violates the existing minimum 12; remove
it, seed configurable demo credentials meeting normal validation.

Old `TicketReservation` expects `{id,userId,tierId,eventId,tierName?,unitPrice?,currency?,
quantity,status,expires_at,seconds_remaining,selectedSeats?:[{row,number,zoneName}]}`.
Current Spring only returns `{id,status,quantity,expires_at,seconds_remaining}`.
The proposed response supplies this display context and `seats[]`; adapter maps
`selectedSeats`, without treating browser-selected labels as authoritative.

Old `UserOrder` uses `PENDING`; Spring uses `PENDING_PAYMENT` plus PAYMENT_FAILED
and EXPIRED. Preserve the wire enum; update display mapping to handle all terminal
states. Old required createdAt/updatedAt are not currently returned; propose those
real stored timestamps, never `Date.now()` fallbacks.

Old `UserTicket` requires `{id,orderId,eventId,tierId,tierName,ticketCode,status,issuedAt,
seatInfo?}`. Spring currently returns `{id,eventId,tierId,ticketCode,status,issuedAt}`.
Proposed ticket adds context plus `seat:null|SeatAssignment`; adapter formats
`sectionName / rowLabel / number`. Price remains integer minor units and currency
comes from Spring, never hardcoded VND in checkout.

Old `StadiumZone`: `{id,name,tierId,tierName,price,color,shapePath,viewAngleDescription,
category,totalSeats,availableSeats}`. The new seatmap has explicit sections and
safe geometry. Zone ID is sectionId, **not tierId**: A/B/C may share one tier.
COUNTER exact availableSeats is intentionally unavailable publicly; render a
bucket in the existing label area. A thin adapter cannot fix internally generated
seat data alone: after approval the map needs small data-prop/callback changes,
not a visual rewrite. Remove hash statuses and fake fallback counts then.

## 3. Demo boundaries and payment design

`DEMO_MODE` is an explicit deployment setting exposed as VITE_DEMO_MODE for the
SPA. Standard production builds reject an enabled flag and omit the entire demo
module; a separate `--mode demo` build can enable it. Backend additionally advertises
non-secret capabilities from a demo/loadtest-only route. Both must agree before
controls appear. No account seeding occurs outside `demo & !prod`; `prod` wins
even if accidentally combined with demo/loadtest. Loadtest creates its own users.
Profile toggles do not delete previously seeded data: never reuse a demo database
for production; deployment checks must reject known seeded fixture identities.

Quick login calls the same POST auth/login as ordinary credentials. Explicitly
configured disposable demo credentials are public to users of a demo deployment,
not production secrets. Backend seed passwords come from environment variables
and are hashed normally; corresponding demo-only client config is omitted from
production artifacts. Never expose JWT/webhook/mock-test secrets. Accounts have
one role each and are seeded only in the demo profile; failed refresh logs out.

Keep the simulated payment panel's appearance. Choose the scenario BEFORE
creating the order. A demo-only POST demo/orders `{reservationId,scenario}` with
USER ownership and Idempotency-Key invokes the existing order service and gateway
scenario internally; no browser X-Mock-Test-Token. It returns PENDING_PAYMENT, not
fabricated success. No re-simulation of an already initiated order: that would
race the default SUCCESS dispatch. A different scenario with the same key is 422.
FAILURE/DELAYED_SUCCESS/DUPLICATE_WEBHOOK/OUT_OF_ORDER/INVALID_SIGNATURE/
AMOUNT_MISMATCH retain existing semantics; invalid-signature is an intentional
negative test of the same HTTP webhook handler. MockPaymentGateway is currently
an unconditional bean: future profile isolation must cover it and its dispatcher,
not only hide the buttons. Without a real provider, production checkout fails
closed as PAYMENT_NOT_CONFIGURED; never silently defaults to mock SUCCESS.

No endpoint writes PAID directly. Signed provider webhook plus existing transaction
rules remain the only path. No payment/seed implementation changes in this step.

## 4. Canonical frontend merge plan — NOT EXECUTED

1. Freeze/reference the old UI at review time; retain screenshots before moving.
   Canonical entry remains root src/main.tsx, Vite config and package.json.
2. Keep root access/*, generated client/transport, AuthProvider, ThemeProvider,
   tests and same-origin proxy. Consolidate axios feature wrappers into that one
   transport; never copy old silent-login/token-storage behavior.
3. Move/adapt old UserPortal, EventFlashSalePage, EventHeader, TicketCard and
   StadiumSeatingMap into route bodies for /events, /events/:id and /select. Retain
   layout/SVG/colors/grid/Auto-Pick, inject server geometry and statuses. Remove
   the new zone-only presentation after the old seated UI passes tests.
4. Mount old queue/checkout/wallet/profile/gate visuals inside root page wrappers.
   Use reservation/order URLs, TTL, server polling and local QR. Preserve one
   modal implementation per purpose; deep-link routes can open those modals.
5. Wrap old AdminPortal and CreateEventModal styling around root admin routes,
   tabs/operations/refunds. Add template/mapping/blocking fields without removing
   existing visual design. Use shared can() for header/sidebar/global shortcuts.
6. Keep shared UI primitives and ThemeToggle once; compare hashes and review visual
   differences before replacing root copies. Old Header/Footer/CommandPalette
   receive navigate callbacks and role-filtered links, never a role override.
7. Only AFTER review and passing integration/browser tests: delete inactive
   frontend/src duplicate; duplicate root app/... pages and unused old page/modal
   copies; redundant lib/axios transport and feature clients; local seat status/
   Auto-Pick generators; obsolete simulator; unreachable transfer/notification
   action implementations. Keep source history in Git. Do not delete server.ts:
   it remains a proxy/static host, not business logic. No deletions in this step.

### Merge acceptance gates

Production: no demo credentials/buttons, mock-only paid/reset routes, transfer,
fake seat data or synthetic performance claims. Verify production JS and server
RequestMapping registrations, including prod+demo and prod+loadtest combinations.
Denied HTTP responses alone do not prove a route is absent.
Keep permission, token refresh, deep-link and full purchase Playwright tests;
add actual seat-selection/409 recovery/wallet QR/gate scenarios. Compare screenshots
against the OLD UI, not the temporary plain wrappers. Do not call an authored
Playwright test “passed” without running it against the real stack.

## 5. Review decisions / assumptions

- One reservation remains one event and one tier (including seats from several
  sections mapped to that tier). Mixed tiers are 422, not silently repriced. This
  preserves the existing reservations.tier_id and order-item contract. Cross-tier
  baskets would need a separate design; this is the simplest proposal for review.
- `seatIds` means event_seats.id; physical template IDs are separate. No client
  eventId is required in a seated hold; the server resolves and validates it.
- Auto-Pick is advisory, never a hidden hold. No adjacent run yields 409 rather
  than scattered seats. Accessibility policy is detailed in ADR 0029.
- New SEATED tiers default maxPerOrder to 6; existing COUNTER defaults/values and
  strategy code paths remain untouched. Generic capacity update is COUNTER-only.
- Seed template: VIP Pit GA; A/B/C/Upper SEATED, 3,200 reserved seats. Geometry
  mirrors the old drawing; the old Upper “General Admission” label must become
  reserved seating according to the user's supplied prompt.
- Reseed deactivates and replaces only the tagged demo event with a new UUID;
  refuse while active holds/payments exist. Keep historic orders/tickets rather
  than truncating tables. Script receives the newly seeded event ID.

Stop here. Implementation requires approval of this package, including the
single-tier hold and event-scoped seat ID decisions. Existing incomplete work
from earlier turns is not represented as completed or reverted by this design.

## Appendix: complete file comparison at design review

Compared normalized text (UTF-8 BOM and CRLF/LF normalized); files in a shared directory are not assumed active imports. All 67 counterparts differ bytewise, so normalized text is more useful here.

Old tree: 67 files; same normalized content: 37; changed content: 30; root-only: 9. No old-only files.

| Relative file | Comparison |
| --- | --- |
| `App.tsx` | Different; compare old visuals and root behavior fixes |
| `api/client.ts` | Different; compare old visuals and root behavior fixes |
| `app/(auth)/page.tsx` | Different; compare old visuals and root behavior fixes |
| `app/events/[slug]/page.tsx` | Different; compare old visuals and root behavior fixes |
| `app/profile/page.tsx` | Same content; consolidate after import review |
| `app/tickets/page.tsx` | Different; compare old visuals and root behavior fixes |
| `app/waiting-room/page.tsx` | Different; compare old visuals and root behavior fixes |
| `components/AdminDashboard.tsx` | Different; compare old visuals and root behavior fixes |
| `components/ArchitectureModal.tsx` | Same content; consolidate after import review |
| `components/CheckoutModal.tsx` | Different; compare old visuals and root behavior fixes |
| `components/CheckoutTTLModal.tsx` | Different; compare old visuals and root behavior fixes |
| `components/CommandPalette.tsx` | Same content; consolidate after import review |
| `components/ConcurrencySimulatorModal.tsx` | Same content; consolidate after import review |
| `components/CountdownTimer.tsx` | Same content; consolidate after import review |
| `components/EventCard.tsx` | Same content; consolidate after import review |
| `components/EventDetailModal.tsx` | Different; compare old visuals and root behavior fixes |
| `components/FlowNavigatorModal.tsx` | Same content; consolidate after import review |
| `components/Footer.tsx` | Same content; consolidate after import review |
| `components/GateScannerModal.tsx` | Same content; consolidate after import review |
| `components/Header.tsx` | Different; compare old visuals and root behavior fixes |
| `components/HealthModal.tsx` | Different; compare old visuals and root behavior fixes |
| `components/MyTicketsModal.tsx` | Different; compare old visuals and root behavior fixes |
| `components/Navbar.tsx` | Same content; consolidate after import review |
| `components/NotificationDrawer.tsx` | Same content; consolidate after import review |
| `components/ThemeToggle.tsx` | Same content; consolidate after import review |
| `components/TicketTierCard.tsx` | Different; compare old visuals and root behavior fixes |
| `components/TicketWallet.tsx` | Different; compare old visuals and root behavior fixes |
| `components/WaitingRoomModal.tsx` | Same content; consolidate after import review |
| `components/WaitingRoomView.tsx` | Same content; consolidate after import review |
| `components/admin/AdminPortal.tsx` | Different; compare old visuals and root behavior fixes |
| `components/admin/CreateEventModal.tsx` | Different; compare old visuals and root behavior fixes |
| `components/ui/Badge.tsx` | Same content; consolidate after import review |
| `components/ui/Button.tsx` | Same content; consolidate after import review |
| `components/ui/Card.tsx` | Same content; consolidate after import review |
| `components/ui/Modal.tsx` | Same content; consolidate after import review |
| `components/user/OrderInvoiceModal.tsx` | Same content; consolidate after import review |
| `components/user/PrintableTicketModal.tsx` | Same content; consolidate after import review |
| `components/user/TransferTicketModal.tsx` | Different; compare old visuals and root behavior fixes |
| `components/user/UserPortal.tsx` | Different; compare old visuals and root behavior fixes |
| `components/user/UserProfileModal.tsx` | Same content; consolidate after import review |
| `context/AuthContext.tsx` | Different; compare old visuals and root behavior fixes |
| `context/NotificationContext.tsx` | Same content; consolidate after import review |
| `context/ThemeContext.tsx` | Same content; consolidate after import review |
| `features/flash-sale/api/flashSaleApi.ts` | Different; compare old visuals and root behavior fixes |
| `features/flash-sale/components/CountdownTimer.tsx` | Same content; consolidate after import review |
| `features/flash-sale/components/EventHeader.tsx` | Same content; consolidate after import review |
| `features/flash-sale/components/ReservationModal.tsx` | Different; compare old visuals and root behavior fixes |
| `features/flash-sale/components/StadiumSeatingMap.tsx` | Same content; consolidate after import review |
| `features/flash-sale/components/StockProgressBar.tsx` | Same content; consolidate after import review |
| `features/flash-sale/components/TicketCard.tsx` | Different; compare old visuals and root behavior fixes |
| `features/flash-sale/hooks/useEventDetails.ts` | Same content; consolidate after import review |
| `features/flash-sale/hooks/useReserveTicket.ts` | Different; compare old visuals and root behavior fixes |
| `features/flash-sale/hooks/useWaitingQueue.ts` | Same content; consolidate after import review |
| `features/flash-sale/types/flashSale.types.ts` | Same content; consolidate after import review |
| `features/tickets/api/ticketApi.ts` | Different; compare old visuals and root behavior fixes |
| `features/tickets/components/QRCodeModal.tsx` | Same content; consolidate after import review |
| `features/tickets/components/TicketList.tsx` | Same content; consolidate after import review |
| `features/tickets/hooks/useUserTickets.ts` | Same content; consolidate after import review |
| `features/tickets/types/ticket.types.ts` | Different; compare old visuals and root behavior fixes |
| `features/waiting-room/components/QueueStatusCard.tsx` | Same content; consolidate after import review |
| `features/waiting-room/hooks/useQueueSocket.ts` | Different; compare old visuals and root behavior fixes |
| `index.css` | Different; compare old visuals and root behavior fixes |
| `lib/axios.ts` | Different; compare old visuals and root behavior fixes |
| `lib/react-query.ts` | Same content; consolidate after import review |
| `lib/utils.ts` | Same content; consolidate after import review |
| `main.tsx` | Same content; consolidate after import review |
| `types/index.ts` | Different; compare old visuals and root behavior fixes |
| `access/navigation.ts` | Root only; canonical infrastructure or temporary route presentation |
| `access/permissions.ts` | Root only; canonical infrastructure or temporary route presentation |
| `access/routes.ts` | Root only; canonical infrastructure or temporary route presentation |
| `api/generated.ts` | Root only; canonical infrastructure or temporary route presentation |
| `pages/AdminPages.tsx` | Root only; canonical infrastructure or temporary route presentation |
| `pages/BuyerPages.tsx` | Root only; canonical infrastructure or temporary route presentation |
| `pages/ResultsPage.tsx` | Root only; canonical infrastructure or temporary route presentation |
| `pages/shared.tsx` | Root only; canonical infrastructure or temporary route presentation |
| `vite-env.d.ts` | Root only; canonical infrastructure or temporary route presentation |
