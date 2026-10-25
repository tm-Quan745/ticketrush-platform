# M3b role visuals verification

## Scope and lineage

Security gate merged into main with `--no-ff`: `67f79c6`.
M3a-2 merged into main with `--no-ff`: `21bb182`.
Frontend and tests: `9326405`.
M3b stays on `codex/m3b-role-visuals`; it is not merged into main.
Approved minimal backend reads and gate snapshots: `71424ed` (ADR 0038).
No remote was added and nothing was pushed. Credentials were **not rotated** by
this work. The owner will rotate `JWT_SECRET`, `LOADTEST_PASSWORD`, and reset the
loadtest stack. `perf-v1` is unchanged.

## Delivered

- Wallet reuses the old rounded/perforated ticket look, shared cards, buttons and
  printable/invoice modals. All order/reservation pages are fetched; later-page
  failures are surfaced. QR encodes the real ticket code locally; section/row/seat,
  status and issue timestamp come from the server. Holds use server expiry.
- Order history retains every server status. Invoice amounts use stored order
  items; missing timestamps are omitted and VAT is not invented.
- Gate uses large textual/icon result states, server snapshot and used timestamp.
  STAFF and ADMIN can verify/check in; counters explicitly cover this browser
  session only. Invalid, cancelled and already-used states are distinct.
- Admin uses the canonical sidebar and existing card/modal styling. Draft and
  cancelled events are visible; creation selects a venue and creates compatible
  tiers/mappings, then publish remains an explicit action. Partial creation links
  to the saved draft rather than creating another event on retry.
- Published seats use server versions for block/unblock; conflict refreshes data.
  Numeric capacity editing is COUNTER-only. Reconcile success means no invariant
  violations, not zero stock. Waiting-room settings load stored configuration.
- Dashboard counts come from complete event/order API lists, not simulated values.
  Operations exposes failed outbox/notifications and retry/resend plus real health.
  Results remains read-only and links curated COUNTER performance evidence.
- No frontend files were deleted. Static import traversal from main.tsx found
  **no newly unreferenced files** compared with main. TicketWallet,
  PrintableTicketModal and OrderInvoiceModal are now reused. Old dormant candidates
  (including AdminPortal/GateScannerModal and simulated feature components) remain
  in the previous M3a candidate list; they are not automatically deletion-approved.

## Validation

Backend command: `mvn -B -ntp -f backend/pom.xml verify`.
Result: **191 tests, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS, 3:58.
The prior 188 tests are preserved; three new integration tests cover authorized
admin reads, seat versions/counts and gate snapshots. ADMIN gate authorization was
intentionally updated to the approved STAFF/ADMIN rule.

| Class | Tests | Failures/errors/skipped |
|---|---:|---|
| AuthIntegrationTest | 6 | 0 / 0 / 0 |
| GlobalExceptionHandlerTest | 1 | 0 / 0 / 0 |
| RedisGuardTest | 3 | 0 / 0 / 0 |
| EventInventoryIntegrationTest | 9 | 0 / 0 / 0 |
| MigrationIntegrationTest | 1 | 0 / 0 / 0 |
| SeatedInventoryIntegrationTest | 76 | 0 / 0 / 0 |
| ObservabilityIntegrationTest | 3 | 0 / 0 / 0 |
| MockGatewayIntegrationTest | 1 | 0 / 0 / 0 |
| OrderPaymentIntegrationTest | 20 | 0 / 0 / 0 |
| ConditionalReservationIntegrationTest | 13 | 0 / 0 / 0 |
| OptimisticReservationIntegrationTest | 13 | 0 / 0 / 0 |
| OrderSmallPoolIntegrationTest | 3 | 0 / 0 / 0 |
| OutboxDeliveryIntegrationTest | 1 | 0 / 0 / 0 |
| OutboxIntegrationTest | 2 | 0 / 0 / 0 |
| PessimisticReservationIntegrationTest | 13 | 0 / 0 / 0 |
| ReservationStatusTest | 1 | 0 / 0 / 0 |
| Week6RedisIntegrationTest | 25 | 0 / 0 / 0 |

Frontend commands: `npm run lint`, `npm test`, `npm run build`,
`npm run api:generate`, `npm run docs:access`. Generated client remains deterministic.
Unit tests: **63/63**, including wallet/gate states, complete pagination and failures,
real hold expiry, invoice data, and empty Spring responses.

Playwright command: `npx playwright test` with
`E2E_BASE_URL=http://127.0.0.1:31901`,
`E2E_DB_CONTAINER=ticketrush-m3-e2e-postgres-1`, `E2E_DB_NAME=ticketrush`.
The real Compose stack exercises role access, GA purchase, manual/Auto-Pick seated
purchase, mobile adjacent selection, two-context 409 recovery, expiry, wallet QR
and snapshot, STAFF check-in/second-scan rejection, ADMIN refund refusal, and admin
create/map/publish/block becoming visible on the buyer grid.
Teardown cancels every journaled event through the admin API and checks public 404.
Cancelled rows remain for audit; no E2E event remains published in the catalog.

Initial browser run: 10/12. Failures identified duplicate navigation locators and
missing explicit accessible select names. The next run exposed a real transport
bug: Spring void endpoints return an empty 200 body. The transport now accepts
empty 200/204, while malformed JSON still fails; a regression test covers both.
The corrected suite passed 12/12; the final run also passed 12/12 in 1.2 minutes. A final label-only polish was revalidated separately
in the machine-readable result. A Docker registry connection reset during the
final rebuild was retried; it was not reported as a successful build.

Production JS is checked for `simulatePayment|ConcurrencySimulator|Speed Buy|DEMO_MODE|demo/orders|/reseed|axios|CCCD|broadcast`.
No matches. This scan is a targeted bundle check, not a replacement for security review.

## Screenshots and visual differences

Images: `docs/screenshots/m3b/`; provenance: `provenance.json`.
Capture command: `npx tsx scripts/capture-role-review.ts`, with
`REVIEW_BASE_URL=http://127.0.0.1:31900`,
`REVIEW_DB_CONTAINER=ticketrush-visual-review-m3b-final-postgres-1`, and
`REVIEW_COMMIT=9326405`. Start the review project with docker-compose.yml plus
infrastructure/compose.visual-review.yml and a private environment file (never
commit it). The script refuses a non-local URL or a non-review database container.
A separate local dev-profile stack has exactly one tagged `[dev-seated-v1]` published
event. Accounts are generated only by the review script, not by a production seed.
It does not use the E2E or measurement database. Payment uses the existing mock
gateway and signed webhook; the browser only polls the order.

Relative to the old UI: rounded slate cards, indigo/rose controls, perforated ticket
cards and modal framing are retained. Wallet removes unsupported transfer/saved
card actions; gate is a routed code-entry screen instead of a camera modal. Admin
uses canonical routes/sidebar and real tables/forms instead of demo charts. Seat
management adds actual aisles, versions and blocked states. M3a-2 mobile/desktop
map and checkout comparisons remain in `m3a-2-visual-polish.md`.

The checkout button in the M3a-2 screenshots was enabled; computed white on #4338ca
has 7.90:1 contrast. Disabled controls are visually distinct. No fake TTL reset.

## Limits and next step

- Existing backend forbids editing SEATED tiers through the numeric capacity update
  endpoint. Their price is chosen at creation; no new price-update API was added.
- Invoice dates are absent when not returned by the API. No invented VAT or totals.
- No camera scanning, transfer, demo-mode scenario controls, new performance claims,
  or later milestones were implemented.
- Stop after M3b. Review screenshots and the role flows before authorizing a merge.

The documentation commit hook initially flagged two copies of a Git hash under
`backendApiCommit` as generic-api-key. The metadata field was renamed to
`backendRevision`; no allowlist or hook bypass was used.
