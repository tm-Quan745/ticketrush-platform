# Bounded sell-out evidence

## Context
Staircase initialization interrupted Docker twice before meaningful checkout measurements.
The finish task needs one finite 5,000-entry FIFO queue and a 20-users/s sell-out, not another calibration.

## Options and decision
Use an ADMIN-only, loadtest-profile endpoint to join a supplied ordered cohort through the existing
waiting-room service while sales are closed. Keep the production join/admission implementation.
Capture a token-free append-only admission audit inside the existing Lua transaction, only when
loadtest capture is enabled. This preserves admission order independently of concurrent feed readers.
Use shared sorted user records and binary search in the sell-out client; do not materialize all
token-bearing records separately in each VU. Little's law estimates 20/s x 3s = 60 VUs; allocate
100, cap at 150, abort above 85% aggregate Docker memory. No automatic sell-out retries.

## Consequences
The seed and audit add test-only work. HTTP joins are excluded from this measurement, and the
5,000 entries are a cohort, not simultaneous purchases. Cross-user token probes add one rejected
request per admitted user and must be disclosed. SOLD_OUT is observed as a reservation error or
the queue status soldOut flag; queue state itself remains WAITING/ADMITTED. Kernel logs after a
Docker restart cannot disprove an earlier OOM. Calibration above 20 users/s remains unproven.
