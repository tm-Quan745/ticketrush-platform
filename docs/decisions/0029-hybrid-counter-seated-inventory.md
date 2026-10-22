# 0029: Hybrid COUNTER / SEATED inventory

Status: PROPOSED — awaiting review; no migration or implementation in this step.
Date: 2026-10-19. Supersedes the zone-only UI decision in 0028 for reserved sections.

## Context

The old SPA contains a five-zone stadium map, a synthetic seat grid, local
Auto-Pick, a tier/quantity hold flow and a wallet. COUNTER inventory is already
implemented and tested; seats currently have no server identity or ownership.
VIP Pit must remain GA, while Stand A/B/C and Upper support assigned seats.
Correctness and measured evidence take precedence over retaining demo behavior.

## Alternatives

1. COUNTER everywhere: retains existing performance but cannot guarantee a unique
   assigned seat; local grid status would mislead users.
2. SEATED everywhere including GA: creates thousands of meaningless seat rows
   and replaces a proven COUNTER path unnecessarily.
3. Hybrid per tier: existing COUNTER path unchanged, separate SEATED acquisition
   and lifecycle implementations behind reservation/inventory service contracts.
4. Redis as seat ownership authority: fast but complicates durable handoff, crash
   recovery and reconciliation. Rejected; Redis only caches reads for this mode.

## Decision

Choose 3. ticket_tiers.inventory_mode defaults COUNTER; existing data stays COUNTER
and existing strategies (including Redis counter admission) run unchanged. SEATED
never calls the counter decrement gate or updates hot aggregate counter rows.
Counts come from indexed event_seats aggregates, cached only for reads. Module
boundaries remain services/domain events, never another module's repository.

One reservation remains one tier/event; multiple sections mapped to that tier may
be selected. Cross-tier/cross-event IDs fail 422. This preserves reservations.tier_id
and existing order pricing shape. Server derives tier and quantity from seat IDs,
enforces tier.max_per_order, defaults NEW seated tiers to 6, checks sale/admission
and computes price from that tier. The body cannot supply price, owner or status.

API seatIds are globally unique event_seats.id values. seats.id identifies the
physical venue template seat; tickets.seat_id references that physical ID and
is unique with event_id for live tickets. Do not reuse a UI label as an identity.

## Model and publication

New Flyway migrations only. Add venues (versioned immutable templates), sections,
seats, event_tier_sections, event_seats and reservation_seats; add venue_id to events,
inventory_mode to tiers and nullable seat_id plus a label snapshot to tickets.
Existing COUNTER rows require no backfill of seat data. See seating-data-model.md.

JSON stadium template matches the old 640-ish-coordinate SVG: VIP Pit GA with its
existing central polygon; A front lower bowl, B west, C east, Upper rear bowl.
Example fixture: A 20x40=800, B 20x30=600, C 20x30=600, Upper 30x40=1200; total 3200
reserved seats. GA capacity is separate. Accessible seats occupy configured runs
in each seated section and are explicitly marked, never inferred from coordinates.

Store polygon vertices, render path, section color and stage-facing edge. Generate
seat x/y by interpolating row/column fractions inside each quadrilateral with
padding. row_rank increases away from the stage (configured per section, not
alphabetical or global y order). Seat labels A..Z, AA.. and numeric seat indices
are stable. Validate uniqueness, finite coordinates, bounds, polygon containment
and accessibility markers before accepting the template. Geometry is data; no
arbitrary SVG markup/script or HTML. 3D-style view remains a schematic preview,
not a claim of surveyed visibility.

Each section belongs to exactly one tier PER EVENT; many sections may share a
tier, but a tier cannot mix GA/SEATED. Freeze template version, mapping and mode
at publication. Publishing an event locks the event, validates all mappings and
bulk-inserts event_seats in ONE transaction before PUBLISHED becomes visible;
unique(event_id,seat_id) prevents duplicate generation on replay. COUNTER-only
events without venue_id continue to publish through the existing path.

## Hold algorithm: atomic, inventory locks do not wait

1. Validate 1..maxPerOrder distinct UUIDs, single event/tier/mode, on-sale state,
   user authorization and the existing waiting-room admission token. Reject mixed
   payloads (`tierId` plus `seatIds`), missing IDs and GA seat selection.
2. In one transaction create the proposed reservation and read requested
   event_seats in ascending id order with WHERE status='AVAILABLE' and
   FOR UPDATE SKIP LOCKED. Use the database, never the cache, for this decision.
3. If the locked-row count differs, rollback everything (including any outbox and
   reservation row), return 409 SEATS_UNAVAILABLE with IDs that were not acquired.
   Skipped/locked rows are considered unavailable for this attempt even if a
   later snapshot shows AVAILABLE; the response is not a future availability promise.
4. Otherwise update exactly these rows to HELD, reservation_id, expires_at and
   version+1; insert reservation_seats; write the reservation event to outbox in
   the same transaction. Commit once. All seats acquired or none.

Avoid a hidden wait on the existing unique(user_id,tier_id) WHERE status='HELD':
for the new SEATED path use a transaction-scoped PostgreSQL try-advisory lock on
user+tier before insertion (hash collisions may conservatively reject); failing
to acquire returns 409 RESERVATION_IN_PROGRESS. Retain the unique constraint as
last defence. Do not change COUNTER behavior. No mutable tier/section counter lock
is taken on acquisition. A small transaction lock_timeout and statement timeout
bound unrelated database waits; lock timeout returns retryable 503 INVENTORY_BUSY,
not a false claim that a specific seat was sold. SKIP LOCKED is not a guarantee
that connection pool, network or all other SQL operations have zero latency.

The existing one-active-hold-per-user+tier constraint remains. Repeated create
after a lost response returns an existing-hold conflict; the UI reads its owned
reservations to recover. Do not automatically submit another seat set. Order
Idempotency-Key semantics stay unchanged.

## Lifecycle, locks and invariants

Reservation owner transitions are conditional and serialize expiry/payment on
the existing reservation row; order then event-seat rows use a consistent lock
order. Acquisition has no pre-existing reservation to contend on. Lock seat rows
in ascending ID for all lifecycle operations. Expiry batches use SKIP LOCKED.

- Expiry/cancel/payment failure: HELD seats with this exact reservation_id become
  AVAILABLE once, clearing reservation_id/expires_at and increasing version.
- Valid on-time payment: lock reservation/order, verify all expected seats remain
  HELD by the reservation, set SOLD, issue exactly one ticket per seat and write
  outbox in that transaction. Ticket carries immutable section/row/number labels.
- Expiry wins first: late success MUST NOT acquire replacement seats or sell a
  reallocated seat; use the existing late-payment refund/manual-review policy.
- Payment wins first: reservation CONFIRMED; expiry does not release SOLD seats.
- Refund request: reject if any ticket USED, using the same order lock as check-in.
  Release SOLD seats only after valid refund confirmation and cancel tickets in
  the same transaction. Provider unsolicited refund after USED requires manual
  review; never return an already-used seat to sale.
- Gate: existing atomic VALID -> USED remains; a second scan is 409, not a second
  admission. Verify is advisory and exposes no buyer identity. Non-PAID order is
  ineligible even if an old ticket row still says VALID.

Per section: physicalCapacity = AVAILABLE + HELD + SOLD + BLOCKED;
sellableCapacity = physicalCapacity - BLOCKED = AVAILABLE + HELD + SOLD.
BLOCKED never enters a hold. Only AVAILABLE can be blocked; only BLOCKED can be
unblocked. Admin block/unblock is atomic and version-checked, all-or-nothing,
contends safely with holds, and does not move HELD/SOLD seats. No generic numeric
capacity update for SEATED; capacity derives from the published template/mapping
minus blocked seats. COUNTER capacity changes retain held/sold lower bounds.

A live seat has at most one active reservation. HELD -> exactly one HELD reservation
and membership row. SOLD -> exactly one non-cancelled ticket (VALID or USED) and
its PAID order. REFUND_PENDING is a named transitional audit state until webhook
settlement; the strict verifier requires a drained run with no pending refunds.
Use the partial unique index on tickets(event_id,seat_id) WHERE seat_id IS NOT NULL
AND status <> 'CANCELLED'. Cancellation releases the uniqueness slot; USED does not.

## Auto-Pick

Read current database availability (not stale cached suggestions). Consider only
the requested SEATED section and its mapped tier. Enumerate contiguous runs of N
AVAILABLE seats with consecutive indices in one row and one adjacency segment
(aisles break segments). Do not treat adjacent labels across aisles as adjacent.
For accessible=false (default), exclude accessible seats. For accessible=true,
require at least one accessible seat in the run, allow adjacent non-accessible
companion seats; never allocate an arbitrary inaccessible run as fallback.
This is a requested preference, not identity/medical eligibility collection.

Rank candidate runs lexicographically by (row_rank ascending, absolute distance
of run midpoint to that row's section centre line ascending, first seat index
ascending, first event-seat UUID ascending). Same snapshot -> same result; no
randomness, pricing bias or persistent mutation. No valid run -> 409
NO_ADJACENT_SEATS. Suggestion returns IDs/labels and observedAt; it is NOT a hold.
The next hold may return 409; refresh that section and let the buyer retry.

## Cache and privacy

Only anonymous base section states/geometry may be cached in Redis (~1 second).
Key by event+section+template version; never cache user IDs, reservation IDs or
the personalized mine bit. After fetching the base, overlay the authenticated
buyer's current HELD seats from ownership-aware data; own changes override stale
base states. Compute ETag AFTER overlay, from the full effective representation,
including state/version/mine, not max(version) or a shared revision alone.
An If-None-Match match returns 304 only after recomputing that caller's view.
Use Cache-Control: private, no-cache and Vary: Authorization. Clear the browser's
ETag/view cache on identity change; never reuse another user's mine representation.
Seat reads require login (USER/STAFF/ADMIN); anonymous gets 401. Public overview
can show section geometry/buckets without personalized seat details. Redis loss
falls back to PostgreSQL reads; acquisition always uses PostgreSQL. Cache must
never authorize a hold. Invalidation after commit reduces staleness but TTL bounds
it if invalidation fails. No reservation ownership is ever exposed publicly.

## Evidence and future acceptance — not yet executed

COUNTER has existing real-thread/Testcontainers suites and earlier sell-out work;
the user cites 5000-ticket evidence. The checked frontdoor 5000 artifact has zero
orders, so it cannot be substituted for that sell-out claim. Locate/link the exact
sell-out artifact before updating README claims. No SEATED correctness or load
evidence exists today. Current baseline results are separate from future targets.

After approval retain every existing backend test; add 200 actual simultaneous
threads with a barrier, disjoint/overlapping 2–6-seat sets, real PostgreSQL/Redis,
bounded futures and test timeouts. Verify no partial reservations, no duplicate
HELD/SOLD, zero deadlocks/hangs; expiry twice, payment/expiry and block/hold races;
unique live-ticket constraint (including USED); same-key order races; deterministic
adjacency/accessibility; ownership, 401/403, ETag privacy and prod route absence.
Pool sizing and finite acquisition timeout must permit all 200 worker attempts to
complete; report contention outcomes, not simply discard timeout failures.

Small SEATED load target: 3200 seats, ~900 buyers admitted at 20/s, each requests
2–4 seats. Report the request-weighted 409 SEATS_UNAVAILABLE / all attempted seated
holds (separately from other errors), client k6 reserve p95 AND server timer p95
with matching tags/time window, double-sale=0, verifier PASS after settlement,
CPU/memory peak and throttling/OOM vs explicit recorded caps. Separate legitimate
409 contention from correctness failures and sold-out. No benchmark is run in
this design step and no existing COUNTER result is relabeled SEATED.

## Consequences / interview points

SKIP LOCKED favors fail-fast over fairness: even AVAILABLE-but-locked seats can
produce 409. An advisory suggestion cannot guarantee a later hold. Cache staleness
is a UX cost, never a correctness exception. Per-seat writes and read aggregation
cost more than counters; capacity is constrained by actual seat topology.
Partial unique constraints are a last defence, not a replacement for transaction
design. Price/seat labels must be server snapshots. Counting only VALID tickets
would falsely report drift after check-in: USED remains a sold ticket.

## M1 implementation details (2026-10-21)

V8 adds `event_seats.section_id` as deliberate denormalization. Composite foreign
keys bind a physical seat to its section and the event/section to its tier. Venue
ownership and section-type/mode compatibility are validated under the event lock;
publication requires the complete mapping. The current-claim FK is deferred until
commit, so inserting membership and setting the claim is atomic despite the cycle.
One combined state CHECK also rejects unknown seat states. SQL triggers freeze
published venue geometry/seats and issued ticket snapshots.

The server-owned stadium JSON contains 3,200 reserved seats (A 800, B 600, C 600,
Upper 1,200), with VIP Pit remaining GA. Bilinear interpolation uses each section's
stage-facing edge; ten-seat adjacency segments reserve aisle boundaries. First-row
edge seats carry accessibility flags. Suggestion scoring and accessible-seat
filtering remain M2; no suggestion endpoint was added in M1.

SEATED holds use a transaction-scoped `pg_try_advisory_xact_lock` for user+tier,
then sorted `FOR UPDATE SKIP LOCKED` seat acquisition. This avoids a hidden wait on
the existing active-reservation unique index. Advisory hash collisions can cause a
conservative 503 retry but cannot oversell. A 100 ms lock timeout and 5 s statement
timeout bound incidental database contention. A missing/locked seat produces 409
with unavailable IDs and rolls back the reservation, membership and outbox together.

`reservations.expires_at` is the sole expiry clock. The existing reservation job
releases current seat claims in the same transaction; auxiliary seat expiry is
checked by the verifier. Late success reacquires only the original seats within
the existing grace period; otherwise the existing gateway refund path applies.
Refund and check-in serialize on the same order row, and any USED ticket refuses
refund. Cancelled ticket history remains while the partial unique index allows a
new live ticket on a legitimately refunded seat.

COUNTER capacity/strategy/Redis behavior remains intact. COUNTER still requires an
explicit max-per-order; only SEATED creation defaults to six. Tier mode is immutable
through the update API (create another draft tier to change it). SEATED counts are
computed from rows, never the counter columns. Numeric capacity PATCH is COUNTER
only and checks expected version plus held/sold stock.

The shared SQL verifier runs under a repeatable-read snapshot in Spring and in the
loadtest tooling. Its strict SOLD -> PAID check can report REFUND_PENDING as a
transitional violation; terminal-run verification should drain payment processing.
The 200-thread test is correctness evidence, not throughput or latency evidence.
Existing performance evidence continues to apply to COUNTER only.

## M2 read and suggestion implementation

The public map exposes sanitized numeric polygons and hex colours. COUNTER stock
remains bucketed. Section rows require USER/STAFF/ADMIN; suggestions require USER
and the existing admission rule. No user/reservation identity leaves the backend.

Suggestions enumerate available contiguous number runs within one row and one
adjacency segment. Lexicographic score: row_rank (stage first), absolute distance
between run midpoint and physical row midpoint, lowest first seat number, then UUID
for a stable final tie. Accessibility false excludes accessible seats; true requires
at least one accessible seat and permits companions. No run returns 409
NO_ADJACENT_SEATS, never scattered seats. Suggestions do not reserve inventory.

Identity-free section snapshots use Redis single-flight and a 1s fresh TTL, with
no stale fallback entry. The staleness bound is rebuild duration plus 1s; writes
need not invalidate because PostgreSQL holds remain authoritative. Mine is overlaid
from the caller's current unexpired HELD reservation, then included in the ETag.
Private no-cache / Vary Authorization prevents shared response reuse across users.
Redis failure falls back to gated PostgreSQL reads (8 concurrent, 1s bounded
admission wait); exhausted gate or rebuild wait returns 503 and Retry-After.
