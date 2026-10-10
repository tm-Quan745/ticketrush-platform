# 0017 Event delivery guarantees

## Context

Broker acknowledgement and database marking cannot be one atomic action.

## Options

Attempt distributed transactions, accept at-most-once, or use idempotent
at-least-once handling.

## Decision

TicketRush provides at-least-once delivery and per-aggregate publish order. The
relay skips a later pending event when an older event of the same aggregate is
pending or failed. There is no global ordering and no exactly-once guarantee.

## Consequences

A crash after broker confirm and before `PUBLISHED` can duplicate a message;
consumers must deduplicate by `eventId`.
