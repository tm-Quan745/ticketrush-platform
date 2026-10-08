# ADR 0001: Stateless access JWTs and transactional refresh rotation

## Context

Week 1 needs registration, authentication, USER/ADMIN authorization, refresh,
and logout without building future booking features.

## Options

1. Server-side sessions: simple immediate revocation, but require session lookup.
2. Long-lived JWTs: simple, but stolen tokens remain useful too long.
3. Short-lived access JWTs plus opaque persisted refresh tokens.

## Decision

Use option 3. Access JWTs last 15 minutes; refresh tokens last 7 days from each
issuance. Use 32 random bytes for refresh tokens and store only their SHA-256 hash.
High entropy makes a fast hash appropriate; human passwords instead use BCrypt
cost 12. Reject passwords exceeding BCrypt's 72-byte UTF-8 limit.

Rotate refresh tokens using a PostgreSQL pessimistic row lock in one transaction.
The old token is revoked and its successor inserted atomically. Reject replay
with 401. Logout revokes the supplied refresh token and is idempotent, including
unknown tokens. Token possession authorizes refresh/logout; an access JWT is not
required for these endpoints.

Registration always grants USER. ADMIN assignment is an explicit trusted database
operation in Week 1; there is no public role-assignment endpoint or default admin.

## Consequences

Concurrent refresh requests have exactly one winner. Row locking is easier to
reason about than an optimistic retry loop for this low-contention operation.
The transaction must cover both revocation and successor insertion; otherwise a
crash could lose a session or create multiple active successors.

Logout does not revoke already-issued access JWTs. Role changes are also delayed
until a new token is issued (or the old token expires). Immediate revocation would
require server-side token/session checks. Family-wide revocation on replay and an
absolute session lifetime are deferred; replay is rejected but does not revoke a
successor. Rotation slides the 7-day expiry. Clients must serialize refresh calls
and persist the successor before retrying; a lost refresh response requires login.

Key rotation, refresh-token cleanup, email verification, and password reset are
outside Week 1. Use a secret manager and TLS before any production deployment.
