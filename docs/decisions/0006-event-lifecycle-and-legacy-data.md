# ADR 0006: Event lifecycle, sale windows and legacy drafts

Status: Accepted

## Context

V1 events have only a name, start time and description. Week 2 adds validated
windows, lifecycle, creator and administrative writes concurrent with publishing.

## Options

- Delete legacy events or fabricate creators: loses data or invents provenance.
- Preserve legacy rows as drafts with a conservative window and unknown creator.
- Allow unrestricted sale-start edits: could bypass the price freeze after sales
  begin. Freeze sale start once published sales start instead.

## Decision

V2 renames name/starts_at, adds required date columns, and backfills legacy rows
with end=start+1 hour, sale start=start-1 day, sale end=start. These remain DRAFT.
created_by is nullable for legacy rows and system seed fixtures; API-created rows
always record the authenticated ADMIN UUID with a foreign key to users.

Only DRAFT -> PUBLISHED and PUBLISHED -> CANCELLED/ENDED are legal. PUT does not
accept status. No automatic end scheduler is introduced. Public visibility means
PUBLISHED, independent of whether its start time has passed. Sales use an inclusive
start and exclusive end. List from/to bounds are inclusive instants on startTime.

Freeze saleStartTime once a PUBLISHED event reaches it. Event and tier admin
operations lock the event row, giving lifecycle and price checks one ordering.
Before sale starts, admins may reschedule the window. Existing cancelled/ended
status does not imply inventory release; that belongs to a later milestone.

## Consequences

Legacy drafts require operator review before publication. Creator cannot be
reconstructed. UTC instants avoid implicit local-time parsing. Administrative
serialization trades some concurrency for understandable correctness.
