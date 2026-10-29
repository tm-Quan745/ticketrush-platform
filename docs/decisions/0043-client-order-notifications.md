# ADR 0043: Client notifications from owned order snapshots

## Context

The client needs a notification entry point. Existing notification backend APIs
manage email delivery for administrators; they do not expose a user inbox.
The unused legacy notification context contains demo messages and must not be
mounted as the production notification source. The profile API currently exposes
only account ID, email, and roles, with no profile update endpoint.

## Options

1. Introduce a persistent inbox, delivery events, read-state endpoints, and push.
2. Present current owned-order statuses using the existing authenticated API.

## Decision

Use option 2 for this frontend task. The header notification center is mounted
only for customers and keyed by authenticated user ID. Fetch the 50 newest orders
from `/orders/me`, and additionally filter by owner before rendering. Show the
current order status and navigate to the existing protected order details page.
Do not invent event timestamps or advertise a complete notification history.

Refresh every 60 seconds while visible, on reopening the center, and when the tab
becomes visible. Avoid overlapping polls, respect Retry-After on errors, and ignore
responses after unmount. Read IDs include order ID, status, and manual-review state
so a changed status becomes unread. Store only bounded read IDs in localStorage,
under a per-account key; do not store notification content or authentication tokens.

Use a native modal dialog for focus containment, Escape dismissal, and focus
restoration. Show loading, empty, and failed-fetch states explicitly.

The redesigned profile displays actual account data and theme preferences. It does
not offer unsupported personal-detail edits or claim identity verification.

## Consequences

- Notifications reflect real current order data without backend changes.
- Read state is browser-local, not synchronized across devices.
- Only the latest 50 orders are represented. Intermediate changes between polls
  are not historical events, and orders outside this window are not monitored.
- Marketing alerts, event announcements, durable notification history, and push
  delivery require a separate backend inbox design.
- Browser checks use API fixtures; backend authorization and business workflows
  remain enforced by the existing endpoints.
