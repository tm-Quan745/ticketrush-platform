# Database — migration V1

PostgreSQL 17; UUID application identifiers; UTC timestamps stored as TIMESTAMPTZ.
Flyway owns schema changes; Hibernate uses `ddl-auto=validate`.

```mermaid
erDiagram
    users ||--o{ user_roles : has
    roles ||--o{ user_roles : grants
    users ||--o{ refresh_tokens : owns
    events ||--o{ ticket_tiers : offers
    users {
        UUID id PK
        VARCHAR email UK
        VARCHAR password_hash
        TIMESTAMPTZ created_at
    }
    roles {
        SMALLINT id PK
        VARCHAR name UK
    }
    user_roles {
        UUID user_id PK,FK
        SMALLINT role_id PK,FK
    }
    refresh_tokens {
        UUID id PK
        UUID user_id FK
        VARCHAR token_hash UK
        TIMESTAMPTZ expires_at
        TIMESTAMPTZ revoked_at
        TIMESTAMPTZ created_at
    }
    events {
        UUID id PK
        VARCHAR name
        TEXT description
        TIMESTAMPTZ starts_at
        TIMESTAMPTZ created_at
    }
    ticket_tiers {
        UUID id PK
        UUID event_id FK
        VARCHAR name
        NUMERIC price
        INTEGER total_quantity
        INTEGER available_quantity
        BIGINT version
    }
```

## Constraints and indexes

- `users.email` is unique and must equal `lower(trim(email))`; the application
  validates syntax and length. `password_hash` stores BCrypt, never plaintext.
- Roles are seeded as USER (1) and ADMIN (2). Registration cannot select a role.
- `user_roles` uses `(user_id, role_id)` as its primary key and indexes `role_id`.
- `refresh_tokens.token_hash` has a unique index for token lookup and row locking.
  Indexes on `user_id` and `expires_at` support session lookup and future cleanup.
  Expiry must follow creation. Revoked rows are retained; scheduled cleanup is
  deferred, so operators must plan retention before production use.
- `events.starts_at` supports chronological lookup.
- `ticket_tiers` enforces nonnegative price, total quantity, available quantity,
  and version, plus `available_quantity <= total_quantity`.
  Unique `(event_id, name)` also indexes the event foreign key (leftmost prefix).
- Deleting a user cascades to role assignments and refresh tokens. Event deletion
  is restricted while ticket tiers exist.

## Transaction behavior

Registration inserts the user and USER assignment in one transaction. The unique
email index handles concurrent registration; one transaction wins, others get 409.

Refresh performs `SELECT ... FOR UPDATE` on the hash, validates expiry/revocation,
revokes the old row, and inserts the next token in one transaction. A concurrent
loser sees the committed revocation and receives 401. Logout locks the same row.
No booking concurrency behavior is implemented by V1 alone.
