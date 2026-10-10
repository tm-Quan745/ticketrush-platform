# 0018 Idempotent email consumer

## Context

RabbitMQ can redeliver any message and SMTP has no transactional commit shared
with PostgreSQL.

## Options

Deduplicate in memory, deduplicate via a database unique key, or claim exactly
once delivery.

## Decision

`processed_messages(consumer_name,message_id)` and
`email_notifications(event_id,type)` are unique constraints. The consumer inserts
the processed row and notification state in its transaction, then sends and marks
SENT before acknowledging.

## Consequences

There is one unavoidable gap: a crash after SMTP accepts the message and before
the DB transaction commits can cause a duplicate email on redelivery. We prefer
this visible at-least-once behaviour over silently losing an email; emails contain
stable order/ticket identifiers and are safe to repeat.
