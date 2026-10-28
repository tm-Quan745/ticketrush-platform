# ADR 0042: Operational admin views with shared client styling

## Context

The active admin routes used minimal cards and navigation. The unused legacy
AdminPortal included hardcoded charts, public event reads, and demo controls.
The admin interface needs practical management views while remaining visually
consistent with the customer application.

## Options

1. Mount the legacy AdminPortal and repair its data and action contracts.
2. Improve the existing protected routes using the shared theme and UI components.

## Decision

Keep the existing routes, authorization, API client, and business actions. Add an
active-section sidebar, consistent page headers, event and order tables, and
status badges. Reuse the client palette, rounded surfaces, buttons, and theme.

Keep server pagination for events at 12 rows per page. Display event and order
times in GMT+7 and retain currency-aware minor-unit formatting. Refunds still
require confirmation and are available only for paid orders; backend validation
remains authoritative.

Overview counts come from the existing complete event and order reads. Show
missing values as unavailable rather than zero. Do not add simulated charts,
revenue estimates, or unsupported operational actions.

## Consequences

- Admin and customer screens share styling without replacing the framework.
- Small screens scroll wide tables inside their containers.
- Overview and order-list reads still load all pages. Large datasets will need
  dedicated aggregate endpoints and paginated order browsing in a separate task.
- Component tests cover active navigation, event data, currency formatting, empty
  states, and refund availability. Browser checks with API fixtures validate UI
  behavior and layout; they do not replace integration tests against Spring.
