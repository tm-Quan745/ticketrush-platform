# ADR 0023: Detect and heal inventory drift with revision CAS

## Context
After-commit Redis updates can be lost, delayed or repeated by application crashes.
Blind SET from a database snapshot would overwrite valid in-flight deductions.

## Options
Always overwrite, require two matching samples, gate all writes with distributed
locks, or track gate attempts and compare Redis revisions.

## Decision
Use a pending-attempt sorted set plus revision CAS. Read the Redis revision before
the SQL aggregate and heal only if no pending attempt exists and the revision is
unchanged. Every gate/completion/delta changes revision. Counter generations prevent
old refunds from affecting a counter rebuilt after loss. Pending leases default to
1 minute, configurable above the request deadline; refund records remain for 24 h.
These durations are intentionally separate: a failed completion during outage must
not prevent healing for a whole day. Report drift before healing.

## Consequences
Active gate attempts within their lease cannot be overwritten. Abandoned attempts
delay healing until lease expiry. Requests that outlive their lease, PostgreSQL-only
outage transactions and delayed after-commit
deltas remain outside this atomic boundary; they can recreate drift and need a
later quiescent pass. There is no claim of linearizable cross-store inventory.
SQL's available-quantity guard and transaction constraints remain the proof against
overselling. See docs/redis.md for precise failure windows.
