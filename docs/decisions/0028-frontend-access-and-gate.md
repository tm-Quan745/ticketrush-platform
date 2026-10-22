# 0028: SPA access boundaries and atomic gate check-in

## Context
The active frontend is React/Vite, with state-based navigation and legacy demo widgets.
Spring exposes USER and ADMIN, JSON refresh tokens, and tier-based inventory.

## Options
Migrate the framework; keep simulated controls; or route the existing SPA against Spring.
Use client locks for scans, or serialize and conditionally update in PostgreSQL.

## Decision
Keep Vite, shared UI primitives, and the existing same-origin Express proxy. Use a
single permissions matrix for route guards and navigation. PUBLIC is anonymous;
USER buys, STAFF scans, ADMIN administers and can view the public catalog. Roles
are not implicitly hierarchical. An ADMIN needs USER separately to purchase at
the backend; the SPA deliberately exposes buyer routes only for USER personas.
No production role impersonation controls are included.

Keep both access and refresh tokens in memory because Spring cannot issue an
httpOnly refresh cookie today. Reload requires login; never persist bearer tokens.
Generate API types/operations from the running Spring OpenAPI document.

Gate belongs to the order module, which owns issued tickets. Check-in locks the
parent order (also used by refunds), checks PAID, and updates VALID to USED with
a conditional SQL update. One concurrent request wins, others receive 409. Record
staff and timestamp in that transaction. Verify is read-only and does not promise
that a subsequent check-in will succeed. No ticket-list or batch-admit API is added.

## Consequences
Refresh improves an active session but does not survive reload. Browser guards
improve navigation; Spring remains the security boundary. Zone drawings describe
tiers, not assigned seats or venue geometry. Availability buckets cannot justify
an exact remaining count. A successful check-in followed by a lost response must
be reconciled by verify (USED), never by admitting a second time.
