# M3a-2 visual polish

## Scope and lineage

Security gate merged into main with `--no-ff` as `67f79c6`. The security branch
descended from the old M3a branch, so this merge necessarily includes that baseline;
the new polish is still developed and tested on `codex/m3a-buyer-visuals` before its
own no-fast-forward merge. No remote added and no push. Credentials were NOT
rotated by the agent; the operator will rotate JWT_SECRET and LOADTEST_PASSWORD
and reset the loadtest stack.

The user separately approved the additive static geometry adjacencySegment field.
Backend `mvn -B -ntp -f backend/pom.xml verify`: 188 passed, zero failures/errors/
skips, 04:43. The geometry response test compares each segment with PostgreSQL.
Immutable geometry hashes change with the new payload; compact status is unchanged.

## Visual changes

- Full-width SVG frame with old 16:10 / 16:9 ratio, dotted background, runway and
  catwalk; original section polygons and palette. Selected border is white, text
  has a dark outline for readability over bright sections.
- Map plus price/bucket chips; tier cards are omitted for singly mapped tiers.
- Seats are 36px, 44px on coarse pointers. Sticky row labels, horizontal grid-only
  scrolling, no row cap; aisle gaps follow server adjacencySegment, not heuristics.
- Sticky selection summary, ordered seat labels, server prices and hold action.
- Checkout includes event/section, sorted row/seat labels, white-on-#4338ca primary
  button (7.90:1) and a distinct dashed disabled state.
- The dev-seated event has waiting room disabled by default. A server
  WAITING_ROOM_DISABLED response now takes the buyer to selection; admission is
  still enforced by Spring when the waiting room is enabled.

The old screenshot has no recorded DOM disabled state. HELD/10:00 is visible but
does not prove button state at capture time; it may capture a loading transition.
New screenshot evidence explicitly records disabled and computed colors.

## Verification and screenshot provenance

Initial Node tests failed to spawn inside sandbox. Outside sandbox, the proxy
test first failed its startup readiness assertion (root cause not established).
On a rerun with HOST=127.0.0.1,
51/51 tests passed. Build and lint passed. Browser results are recorded after the
real-stack run; no pass is inferred from compilation.

`infrastructure/compose.visual-review.yml` is used with a private generated env
file and project `ticketrush-visual-review`, independent volumes, no measurement
database. Generic dev seeding is disabled; the existing dev-only seeder creates
one tagged `[dev-seated-v1]` published event. Accounts used by captures are created
through registration only. E2E screenshots go to ignored `.tmp/e2e-screenshots`.
`scripts/capture-visual-review.ts` refuses other database project names or a catalog
containing anything other than that one event. Outputs live in
`docs/screenshots/m3a-2/`, with a DOM-state evidence JSON.

No files were deleted. No new unreferenced components: old candidate list remains
in `docs/m3a-buyer-visuals.md`; reuse is reconsidered in M3b.


Final gates: lint PASS, 51/51 Node tests, production build PASS. The initial browser
run passed 9/10; expiry fixture failed because E2E_DB_NAME was unset. Its default
now matches setup (ticketrush); no assertions were changed. A full rerun is recorded
in results/m3a-2-verification.json. The captured checkout button is enabled at both
viewports, computed white on #4338ca; page overflow is zero. During the first new
capture, disabled-to-enabled CSS color interpolation reproduced a dim button while
DOM disabled=false. Checkout color transitions are now disabled for stable contrast.

Run browser gates with E2E_BASE_URL=http://127.0.0.1:31901,
E2E_DB_CONTAINER=ticketrush-m3-e2e-postgres-1, E2E_DB_NAME=ticketrush.
The E2E project uses separate volumes from ticketrush-visual-review. Teardown cancels
created events through the admin API and checks that public detail returns 404.
Production JS scan found no simulatePayment, ConcurrencySimulator, Speed Buy,
DEMO_MODE, demo/orders, /reseed, axios, CCCD or broadcast matches.
