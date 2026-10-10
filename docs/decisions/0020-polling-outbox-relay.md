# 0020 Polling outbox relay

## Context

The initial portfolio deployment is a modular monolith on PostgreSQL.

## Options

Polling with `SKIP LOCKED`, CDC through Debezium, or PostgreSQL `LISTEN/NOTIFY`.

## Decision

Use bounded polling and `SELECT ... FOR UPDATE SKIP LOCKED`.

## Consequences

Several application instances can safely split ready rows. There is small relay
latency and database polling load, both configurable. CDC may be appropriate at
larger scale; `LISTEN/NOTIFY` alone does not provide durable relay progress.
