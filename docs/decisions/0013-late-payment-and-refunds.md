# 0013: Late payment grace and refunds

## Context
A successful charge can arrive after reservation expiry or cancellation. Inventory may have been sold to another buyer. The task's strict transition list conflicts with its explicit requirement to honor EXPIRED/CANCELLED orders when inventory can be reacquired.

## Options
Always refund is simpler but rejects fulfillable purchases. Always honor risks overselling. Reacquisition within a bounded grace period balances fulfillment with predictable expiry behavior.

## Decision
Treat the explicit late-payment fulfillment rule as the exception: signed SUCCEEDED alone can change PENDING_PAYMENT, EXPIRED, or CANCELLED to PAID after conditional inventory reacquisition. A still-held unexpired reservation confirms without taking inventory twice. An expired HELD reservation is released first. Reacquisition uses the Week 3 conditional inventory UPDATE and checks its row count. Grace defaults to five minutes after reservation.expires_at; after grace, or when inventory is unavailable, transition to REFUND_PENDING and request mock refund after commit. CANCELLED to REFUND_PENDING is also an explicit late-charge exception. Payment failure is terminal; a subsequent contradictory SUCCEEDED for a FAILED payment is recorded but ignored for manual provider investigation.

Admin refund changes PAID to REFUND_PENDING; signed REFUNDED completes the refund, cancels VALID tickets, changes CONFIRMED reservation to CANCELLED, and restores inventory exactly once in one transaction. Late-charge refunds have no confirmed tickets to release.

## Consequences
A cancel response can precede a late successful payment which honors the order if within grace and stock is available. The race's final state may therefore be PAID even when cancellation initially succeeded; this follows the requested late-payment policy. Inventory and ticket invariants hold throughout. REFUND_PENDING retains valid tickets and confirmed capacity until refund confirmation. The mock refund is automatic and retryable; it is not a real financial integration.

Interview trap: expiry winning the first transition does not permit a later payment to reuse already released inventory without reacquisition.
