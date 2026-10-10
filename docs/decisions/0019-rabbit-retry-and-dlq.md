# 0019 RabbitMQ retry and DLQ

## Context

SMTP/network failures are transient while malformed events and unknown users are
not.

## Options

Infinite requeue, application sleeps, TTL delay queues, or a delayed-message
plugin.

## Decision

Retryable failures are republished to durable TTL queues (10 seconds, 1 minute,
10 minutes) then return to the event exchange. After configurable retries, and
immediately for malformed/unknown-user events, the message goes to the email DLQ.

## Consequences

There are no hot loops or broker plugin dependency. Operators inspect/re-drive
the DLQ deliberately.
