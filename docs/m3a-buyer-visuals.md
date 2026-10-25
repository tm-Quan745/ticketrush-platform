# M3a — Buyer visuals on the canonical SPA

## Scope and lineage

M2/M2b was merged into main with `--no-ff` at `742f0f4` (second parent `b78fc56`).
M3a lives on `codex/m3a-buyer-visuals`; it is not merged into main. No push and no
remote creation were performed. `perf-v1` remains at
`b1260e2ffe9b7e6ba8dcf1b786517109d6b63aca`.
The requested pre-push rule is in AGENTS.md on this branch.
No backend, migration, endpoint or OpenAPI contract changed. The accepted 188/188
backend result is prior evidence, not a backend suite rerun in this milestone.

## Implementation

| UI | Real API / behavior |
| --- | --- |
| Catalogue / event detail | Generated GET events/detail operations; original EventCard, EventHeader and TicketCard; only public availability buckets |
| Stadium | Server section polygons/colours and tier mappings; VIP Pit quantity, reserved sections open the grid |
| Open section | Immutable geometry by version; compact status A/H/S/B in fixed order, ETag/304; 2.5–2.875 s positive jitter, Retry-After floor, hidden/unmounted cancellation |
| Own seats | Owned HELD, unexpired reservation seatIds only; no mine field or identity query on status |
| Auto-Pick | Generated suggestion operation replaces selection atomically; NO_ADJACENT_SEATS message; never creates a hold |
| Reservation | Generated COUNTER or seatIds POST, admission token, single-tier/max limits; 409 removes conflicting IDs and refreshes status |
| Queue | Real join/status, Retry-After and jitter, terminal sold-out stop |
| Checkout | Existing Modal primitive and old panel styling; expiry derived from server expires_at; stable order Idempotency-Key |
| Payment / ticket | Existing gateway triggers signed backend webhook; UI only creates/polls orders, with backoff; local QR and server seat snapshot |
| Language / auth | One Vietnamese catalogue, canonical permissions and transport, memory-only tokens, no silent login |

Currency amounts use the currency's minor-unit scale: VND 1250 displays as VND
1250; USD 1250 as USD 12.50. Reservation/order totals remain server-authoritative.

## Correctness tradeoffs

A cached AVAILABLE is advisory: PostgreSQL can reject a stale selection with 409.
The browser removes only the conflict IDs, refetches the open section and keeps
uncontested choices. Client locking would not protect against another browser.
Only the visible section is polled, and immutable geometry is reused rather than
transferred every time. This accepts bounded staleness to reduce read work.
Idempotency keys survive retry in sessionStorage; bearer tokens never do. Expiry
is recalculated from the timestamp, not restarted at 600 seconds on navigation.
Refresh-cookie limitations remain documented in frontend-access.md.

## Verification

Final gate results and environment are recorded in [the gate summary](../results/m3a-frontend-gates.json).
The final real-stack run passed 9/9 in 36.2 seconds. Raw output is saved beside
the summary as m3a-lint/unit/build/playwright-output.txt.

| Gate | Count |
| --- | ---: |
| TypeScript lint (`npm run lint`) | PASS |
| api.test.ts | 8/8 |
| permissions.test.ts (20 matrix cases + 2 route/redirect cases) | 22/22 |
| transport.test.ts | 4/4 |
| proxy.test.ts | 1/1 |
| seating.test.ts | 14/14 |
| Total unit/component/transport | 49/49 |
| Production Vite build | PASS |
| Playwright access.spec.ts | 5/5 |
| Playwright seating.spec.ts | 4/4 |

Seating tests cover selection cap, mine, conflict recovery, timestamp expiry,
compact ordering, jitter, visibility/unmount abort, terminal stop, Retry-After,
ETag/304 and rendered stadium geometry. Playwright uses real Spring/PostgreSQL/
Redis/RabbitMQ and the existing payment gateway. It covers manual and suggested
purchase, two independent authenticated browser contexts racing one seat (201
and 409), visible recovery, owner-only mine display and expired checkout.
The expiry fixture shortens reservation and auxiliary event-seat expiry together
in one local database transaction. It does not change the backend clock or code.

An initial E2E run found a real browser `Illegal invocation` during polling cleanup:
calling native clearTimeout as an object method bound the wrong receiver. The
adapter now invokes it through an arrow. A later test locator incorrectly followed
the next AVAILABLE seat after selection; it now asserts the same event-seat ID.
A Docker Hub TLS timeout blocked one rebuild; a subsequent rebuild succeeded.
After an interruption Docker stopped: one rerun failed in setup with ECONNREFUSED,
not in a test. Final results must be read from the recorded completed rerun.

E2E teardown cancels BOTH created events through the ADMIN API and asserts public
404 before deleting its ignored credential journal. No test event is left published.
Cancelled audit rows and randomly generated local test accounts remain in the test DB.

Production grep checks executable JS for simulatePayment, ConcurrencySimulator,
Speed Buy, token storage writes, DEMO_MODE, demo/orders, /reseed, axios, CCCD and
broadcast. No matches. This is a targeted bundle check, not a full-history security
scan and does not complete the pre-push security gate.

## Screenshots and comparison with the old UI

| Screenshot | Preserved | Intentional difference |
| --- | --- | --- |
| [Public](screenshots/public.png), [USER](screenshots/user.png) | Rounded event cards, indigo/rose gradient accents, typography and theme controls | Actual catalogue/search; missing artwork has a neutral gradient placeholder; no fake sales counts |
| [Seat map](screenshots/seat-map.png) | Stadium overview, coloured sections, row grid, Auto-Pick and selection summary | Polygons/rows/seats are backend geometry; Upper is reserved, VIP Pit GA; state icons and accessible labels; no 3D/demo controls |
| [Checkout](screenshots/checkout.png) | Existing Modal, dimmed backdrop, rounded payment summary and TTL panel | Route-addressable checkout, server price/expiry, one real order action; no saved cards or Speed Buy |
| [Issued tickets](screenshots/purchase.png) | Card treatment and local QR | Real issued codes and server seat snapshots on SEATED orders |
| [Wallet](screenshots/wallet.png) | Canonical account navigation | Current paid-order links retained; full old wallet/gate/admin visual migration is M3b |

Strings inside inactive legacy modules remain untouched unless required to keep
TypeScript compiling; they do not enter the canonical runtime. Proper event,
venue, tier and section names are returned by the backend and are not translated.
Screenshots contain generated local test data, not production customers.

## Reproduce

```powershell
npm run docs:access
npm run lint
npm test
npm run build
$env:FRONTEND_PORT='31882'
docker compose --env-file .tmp/m2b-measure/private.env -p ticketrush-m2-read -f docker-compose.yml -f infrastructure/compose.seat-read.yml up -d --no-deps frontend
$env:E2E_BASE_URL='http://127.0.0.1:31882'
$env:E2E_DB_CONTAINER='ticketrush-m2-read-postgres-1'
$env:E2E_DB_NAME='ticketrush_m2_read'
$env:E2E_DB_USER='ticketrush'
npx playwright test
rg -o -i 'simulatePayment|ConcurrencySimulator|Speed Buy|localStorage\.setItem\([^)]*token|DEMO_MODE|demo/orders|/reseed|axios|CCCD|broadcast' frontend/dist/assets -g '*.js'
```

The ignored env file belongs to the existing local stack; never commit it. A new
checkout should configure its own Compose env and E2E connection overrides.
No frontend files were deleted. M3b/M4 and performance measurement are not included.

## Unreferenced files: review candidates, not deletion authorization

A relative-import reachability walk from frontend/src/main.tsx produced the list
below. Many were already inactive before M3a. M3a reuses EventCard, EventHeader,
TicketCard, countdown and UI primitives rather than reactivating their old data
wrappers. Wallet/gate/admin candidates must be reviewed during M3b before any
cleanup; file presence is deliberately preserved.

- `frontend/src/components/AdminDashboard.tsx`
- `frontend/src/components/ArchitectureModal.tsx`
- `frontend/src/components/CheckoutModal.tsx`
- `frontend/src/components/CheckoutTTLModal.tsx`
- `frontend/src/components/CommandPalette.tsx`
- `frontend/src/components/ConcurrencySimulatorModal.tsx`
- `frontend/src/components/CountdownTimer.tsx`
- `frontend/src/components/EventDetailModal.tsx`
- `frontend/src/components/FlowNavigatorModal.tsx`
- `frontend/src/components/Footer.tsx`
- `frontend/src/components/GateScannerModal.tsx`
- `frontend/src/components/Header.tsx`
- `frontend/src/components/HealthModal.tsx`
- `frontend/src/components/MyTicketsModal.tsx`
- `frontend/src/components/Navbar.tsx`
- `frontend/src/components/NotificationDrawer.tsx`
- `frontend/src/components/TicketTierCard.tsx`
- `frontend/src/components/TicketWallet.tsx`
- `frontend/src/components/WaitingRoomModal.tsx`
- `frontend/src/components/WaitingRoomView.tsx`
- `frontend/src/context/NotificationContext.tsx`
- `frontend/src/lib/axios.ts`
- `frontend/src/lib/react-query.ts`
- `frontend/src/features/waiting-room/components/QueueStatusCard.tsx`
- `frontend/src/features/waiting-room/hooks/useQueueSocket.ts`
- `frontend/src/features/tickets/api/ticketApi.ts`
- `frontend/src/features/tickets/components/QRCodeModal.tsx`
- `frontend/src/features/tickets/components/TicketList.tsx`
- `frontend/src/features/tickets/hooks/useUserTickets.ts`
- `frontend/src/features/tickets/types/ticket.types.ts`
- `frontend/src/features/flash-sale/api/flashSaleApi.ts`
- `frontend/src/features/flash-sale/components/ReservationModal.tsx`
- `frontend/src/features/flash-sale/components/StadiumSeatingMap.tsx`
- `frontend/src/features/flash-sale/components/StockProgressBar.tsx`
- `frontend/src/features/flash-sale/hooks/useEventDetails.ts`
- `frontend/src/features/flash-sale/hooks/useReserveTicket.ts`
- `frontend/src/features/flash-sale/hooks/useWaitingQueue.ts`
- `frontend/src/components/admin/AdminPortal.tsx`
- `frontend/src/components/ui/Badge.tsx`
- `frontend/src/components/user/OrderInvoiceModal.tsx`
- `frontend/src/components/user/PrintableTicketModal.tsx`
- `frontend/src/components/user/TransferTicketModal.tsx`
- `frontend/src/components/user/UserPortal.tsx`
- `frontend/src/components/user/UserProfileModal.tsx`
- `frontend/src/app/(auth)/page.tsx`
- `frontend/src/app/profile/page.tsx`
- `frontend/src/app/tickets/page.tsx`
- `frontend/src/app/waiting-room/page.tsx`
- `frontend/src/app/events/[slug]/page.tsx`
