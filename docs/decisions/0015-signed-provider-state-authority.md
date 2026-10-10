# 0015: Signed webhook is payment state authority

## Context
A browser redirect or client claim of success does not prove a charge occurred.

## Options
Client-driven confirmation is forgeable. Synchronous gateway responses cannot represent delayed results reliably. Signed server-to-server events provide authenticated asynchronous confirmation.

## Decision
Only the signed webhook can change payment INITIATED to SUCCEEDED/FAILED and SUCCEEDED to REFUNDED, or order to PAID/PAYMENT_FAILED. Creation inserts INITIATED; admin refund only requests a refund. User cancellation and expiry affect reservation/order state but cannot claim charge success. Mock scenarios require explicit enablement plus a constant-time checked test token. The prod profile rejects scenario headers regardless of configured enablement. HMAC secret validation requires at least 32 characters before signing.

## Consequences
The mock remains behind PaymentGateway, making provider replacement local to the payment integration. API clients poll owned orders and fetch tickets only after PAID. No Redis, RabbitMQ, outbox, or email functionality is introduced in Week 4. Existing authentication Redis usage remains from Week 1.

Interview trap: a public webhook path is safe only when authentication is over the exact raw bytes and includes freshness checking.
