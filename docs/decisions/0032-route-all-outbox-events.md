# ADR 0032: Give every outbox event a durable route

## Context

Week 7's end-to-end verifier found zero published outbox events and zero confirmation
emails in the baseline despite committed PAID orders and valid tickets. The relay uses
mandatory publishing and preserves aggregate ordering. RabbitTopology binds only four
email-producing order event types. Events such as `order.created` are returned as
unroutable and prevent later `order.paid` publication for the same aggregate.

This is a pre-existing functional defect, distinct from the measured connection-scope
optimization. It is addressed in its own change after the baseline and the first
optimization's three C measurements; no migration or business transaction is changed.

## Options

1. Disable mandatory publishing. Rejected: unroutable messages would be silently lost.
2. Add a new audit queue and consumer. This adds an unnecessary component for this milestone.
3. Bind the existing durable notification queue to all event types. Its consumer already
   records and ACKs supported envelopes that do not require email.

## Decision

Add a `#` binding on `ticketrush.events` for `notification.email`. Keep the existing
specific bindings, mandatory publishes, publisher confirms, retries and aggregate ordering.
The existing consumer's supported-type check determines whether an event sends email.
Future consumers should add their own bindings and idempotency records; this queue does
not replace their business processing.

## Consequences

More events pass through the existing consumer and its `processed_messages` table. This
cost must appear in the subsequent measurements. A published event means RabbitMQ has
accepted the durable route, not that SMTP delivery has completed; the verifier checks both.
There is still no claim of exactly-once external SMTP delivery across arbitrary crashes.

The integration test uses real PostgreSQL, Redis, RabbitMQ and Mailpit. It creates a paid
order, races eight threads on the same actual consumer transaction, drains all four
purchase events through the broker and checks one SENT row and one Mailpit message.
Test outcomes and before/after measurements are recorded in the performance log.
