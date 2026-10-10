# 0014: Server totals and immutable order item prices

## Context
Clients can tamper with amounts. Tier names and prices can change after purchase.

## Options
Trusting client totals is insecure. Looking up the current price for old orders changes their financial history. Snapshotting at order creation preserves the agreed amount.

## Decision
Accept only reservationId as a business input. Resolve the locked owned HELD reservation, load tier price/currency through the inventory service boundary, compute total with Math.multiplyExact in minor units, and snapshot tier ID/name, event ID, unit price and quantity in order_items. Extra client amount fields are ignored. Webhooks must match the stored order total and currency.

## Consequences
Historical prices are stable and require no floating point rounding. Integer overflow aborts the transaction. One reservation currently contains one tier, so one item per order is sufficient; there is no speculative cart abstraction.

Interview trap: checking a client amount against a client-supplied price still trusts the client.
