# ADR 0049: Client discovery, navigation and bounded ticket wallet

## Context

The client needs a clearer event discovery banner and responsive navigation.
The wallet previously fetched every order and reservation, then fetched tickets
for each paid/refunded order. This scaled with full account history and a refunded
order could reject the order-ticket request and fail the entire wallet.

## Options

1. Slice fully loaded arrays in the browser.
2. Add an owned ticket-page query and use existing order/reservation pagination.

## Decision

Use option 2 within the current Spring/React modular monolith. The authenticated
USER endpoint `GET /api/v1/orders/me/tickets` returns a TicketPage, defaults to nine
items, accepts page >= 0, size 1..50, optional VALID/USED/CANCELLED status and a
query of at most 100 characters. Search event title, historical tier name and order
ID with bound SQL parameters and escaped LIKE wildcards. Scope both count and
content queries by the JWT owner. Return issued tickets regardless of current
order state so cancelled/refunded tickets remain visible with their true status.
Reuse the existing ticket mapper, including seat snapshots and check-in timestamps.
Order by issued_at DESC, id DESC; add a matching user index in Flyway V10.

Each wallet tab loads only its selected page. Filters and page-size changes reset
to page zero; the UI supports 9/18/36 rows and clamps the page after totals shrink.
Errors remain visible with retry; no failure is swallowed. Remove the previous
"clear expired holds" action because cancellation is not deletion and could not
actually remove expired records. Keep hold history with explicit status filters.
Do not generate QR codes for unloaded pages.

Event discovery has an accessible search and the existing onSale API filter.
Its decorative ticket artwork is CSS and implies no fictitious event or metrics.
Event detail separates the real event image from its title, location and time,
and distinguishes upcoming/open/closed sale windows. The role-aware header shows
active routes; mobile uses a disclosure menu with Escape and focus restoration.
The header height still informs sticky admin layouts. Auth restoration is preserved.

## Consequences

- Browser work and response size stay bounded by the current wallet page.
- Offset pagination supports numbered pages; newly issued tickets may shift later
  pages between requests. Cursor pagination is deferred until measurements justify it.
- Count and content are current database snapshots, not a frozen export. Search is
  case-insensitive but does not remove Vietnamese diacritics.
- No frontend framework change, global ticket download, full-text search engine,
  new payment behavior or history deletion is introduced.
- PostgreSQL integration tests cover ownership, role boundaries, filters, limits,
  stable paging and cancelled tickets. Browser fixtures test 47 tickets, page and
  filter changes, mobile navigation and light/dark layouts; they are not load tests.
