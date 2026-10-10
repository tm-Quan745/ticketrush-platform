# 0016 Transactional outbox

## Context

An order update and a RabbitMQ publish are two independent durable systems.
Publishing before commit can leak an event for a rollback; publishing after commit
can lose an event during a crash.

## Options

Publish inside the transaction, publish after commit, or store an outbox row in
the same PostgreSQL transaction and relay it later.

## Decision

Use an outbox row with a `MANDATORY` `OutboxPublisher`; a scheduler relays it
after commit using publisher confirms.

## Consequences

Delivery is asynchronous and requires retention/monitoring, but removes the
dual-write loss window.
