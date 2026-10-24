# ADR 0037: Adapt the old buyer visuals to the canonical seat contract

## Context
The old React/Vite views contain valuable styling but also simulated inventory,
legacy request wrappers and unsupported account controls. M2b finalized static
geometry and shared compact status. Changing Spring to match simulated UI would
break payment and reservation authority.

## Options
1. Reactivate old views and their data wrappers: visually cheap but unsafe.
2. Replace the UI/framework: unnecessary and discards the approved design.
3. Reuse visual primitives and adapt data in the existing canonical shell.

## Decision
Choose option 3. Keep route permissions, in-memory auth, refresh-once transport
and generated operations. Reuse EventCard, EventHeader, TicketCard, countdown and
Modal; use a small seating renderer for the final geometry/status contract.
Poll only the open section with ETags, positive jitter and visibility cancellation.
Derive mine solely from owned active reservations. Suggestions do not hold seats;
POST reservations and PostgreSQL decide allocation. On 409 retain uncontested
choices and refresh. Use server expiry and price; persist only order idempotency
keys. Let the existing gateway and signed webhook decide payment success.
Keep unsupported legacy modules on disk but outside the canonical import graph.

## Consequences
The same look can coexist with correct concurrency and payment behavior. A stale
snapshot can cause a visible 409; hiding this with fake availability would be wrong.
A page reload still requires login because refresh cookies are not available.
The seat renderer does not reuse the old component's random grid or Auto-Pick.
Wallet/gate/admin visual migration is explicitly deferred to M3b.

## M3a-2: aisle topology and visual polish

The user approved an additive `adjacencySegment` field in immutable static geometry.
The grid inserts an aisle only when consecutive seats in the same row change segment;
it never guesses from seat number or pixel spacing. Suggestions retain the existing
server rule: one row, one segment, adjacent seat numbers. Geometry versions and ETags
are content hashes, so the additive field produces a new version without mutating
an already cached payload. Dynamic status remains unchanged and identity-free.

The grid uses 36px seats (44px under coarse pointers), sticky row labels, horizontal
scroll inside the grid, and all rows. The selection summary sticks to the viewport
bottom within the picker. Checkout uses white text on #4338ca (7.90:1 contrast),
with a separate disabled surface and dashed border. No historical screenshot's
button state can be reconstructed from pixels alone; new captures record DOM state.
