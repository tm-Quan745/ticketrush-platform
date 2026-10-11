# ADR 0022: Lua instead of distributed locks

## Context
Checking and decrementing a counter, consuming a rate token, and popping a queue
member while creating admission must each be indivisible.

## Options
Client GET/SET, WATCH/MULTI retries, distributed locks including Redlock, or Lua.

## Decision
Use small RedisScript beans backed by versioned Lua resources. EVALSHA executes
read/check/mutate as one server operation. Use SET NX leases only for optional
cache rebuilding and warm-up, with owner-checked release and publication CAS.

## Consequences
No lock renewal or fencing protocol is needed for atomic Redis-only operations.
Lua does not make SQL and Redis one transaction. Scripts block the Redis event loop;
queue cleanup/lottery cost grows with the live cohort and must be measured before
large deployment. This single-primary key layout is not Redis Cluster compatible.
Replacing DECRBY with GET then SET *inside one Lua script remains atomic*; a useful
mutation must move those operations into separate client commands.
