# ADR 0002: Atomic Redis login rate limiting

## Context

Login runs expensive BCrypt verification and needs a shared limit across backend
instances. Requests may arrive concurrently.

## Options

1. In-memory counters: easy, but reset per process and disagree across instances.
2. Separate Redis INCR/EXPIRE calls: shared, but a failure between calls can leave
   a permanent counter.
3. Redis Lua for atomic increment and initial expiry.

## Decision

Use option 3: at most 10 login requests per peer IP in a 60-second window starting
at the first request. Count successful, failed, and malformed login requests. Hash
the peer IP in Redis key names and expire counters. Return 429 with a conservative
Retry-After of one full window; fail closed with 503 if Redis is unavailable.

Do not trust client-supplied X-Forwarded-For. Forwarded-header processing is disabled.
Before deploying behind a reverse proxy, configure a trusted proxy boundary and
review the client-IP strategy. Compose may present multiple callers as one peer.

## Consequences

Lua makes increment/expiry atomic across threads and instances. A fixed window
can allow a burst across adjacent windows; a sliding window/token bucket would
smooth bursts at greater complexity. NAT users share a quota. Per-account limits,
distributed bot protection, registration limits, and an edge gateway are deferred.
Redis failure blocks new logins, while access JWT validation and refresh/logout
continue independently. Redis restart resets the ephemeral quota.

Concurrency tests use real HTTP requests on separate threads against real Redis
and PostgreSQL through Testcontainers. Mocked counters cannot verify atomicity.
