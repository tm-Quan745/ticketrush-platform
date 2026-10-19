# ADR 0028: Correctness is a performance acceptance condition

## Context
HTTP latency alone cannot detect overselling, duplicate effects, lost outbox events or expiry leaks.
Checking only nonnegative inventory is insufficient: counter drift can remain nonnegative.

## Options
Use HTTP checks only; query a final database snapshot; or combine HTTP, database and cache reconciliation.

## Decision
The runner invokes a read-only REPEATABLE READ SQL snapshot after every scenario, including failed k6
runs. It waits for pending orders/holds and asynchronous delivery to drain, then checks all tiers,
ticket quantities, payment/ticket duplicates, bijection between successful order keys and order IDs,
paid/confirmed consistency, outbox, sent confirmations and deadlines. It writes actual counts and
per-tier rows. Admin reconciliation checks the service-level invariant independently. Redis is inspected
before reconciliation and again afterward; missing, busy and mismatching counters fail the final check.
The verifier is tested against crafted good and bad data on real PostgreSQL and Redis containers.

The deliberate broken image removes the conditional UPDATE guard. PostgreSQL's nonnegative CHECK is
a second independent defense, so the isolated mutation run also temporarily removes that constraint.
The normal source and Flyway files are never edited. Cleanup restores the normal image, dataset and
constraint. Without removing the CHECK, the expected failure is a constraint violation, not overselling.

## Consequences
Performance results are invalid as correctness claims when any invariant fails. SQL email rows establish
one committed notification record, not exactly-once SMTP delivery across a crash after sending and
before commit. That limitation is explicit. The verifier intentionally fails on unresolved PENDING/FAILED
outbox rows instead of treating broker acceptance or HTTP 201 as end-to-end completion.
Reset requires the isolated database/profile/Redis namespace and stops workers before clearing data.
