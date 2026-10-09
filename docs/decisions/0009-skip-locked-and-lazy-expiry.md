# SKIP LOCKED batches and lazy expiry

Status: Accepted

## Context

Multiple application instances must release holds exactly once. Scheduler delay
must not allow a stale reservation to be confirmed.

## Options

One elected worker; unlocked scanning; row-lock batches; lazy checks alone.

## Decision

Use PostgreSQL FOR UPDATE SKIP LOCKED ordered batches plus conditional transitions,
with transition and restore committed together. Each tick handles one bounded batch.
Lazy owner reads, listing, confirm and cancel expire stale rows transactionally.
Create cleans the user's stale holds before checking the active unique index.
Use strict expires_at < now to match the requested expiry predicate.

## Consequences

Workers distribute claims without an external coordinator. A crashed transaction
rolls back and releases locks for another worker. Backlog may take multiple ticks;
lazy checks preserve business correctness during that delay. Reads can write and
therefore use read-write transactions. Confirm returns false after committing lazy
expiry, so raising an HTTP conflict later cannot roll back stock restoration.
Interview focus: SKIP LOCKED is work distribution, not itself an exactly-once guarantee;
transactional conditional transition plus stock restore provides the guarantee.
