# ADR 0026: Token bucket and explicit proxy trust

## Context
The Week 1 login fixed window covers neither reservations nor polling and allows
boundary bursts. Client clocks and spoofable forwarded IPs break distributed limits.

## Options
Fixed windows, exact sliding logs, approximate sliding counters, or token buckets.

## Decision
Lua token buckets use Redis TIME, hash state, and a TTL of two refill periods.
Capacity allows a bounded burst and tokens refill continuously. A security filter
selects declarative policy configuration and user/IP identities. Login uses both IP
and normalized email buckets. Payment webhook is always excluded. Trust forwarding
only from configured IP/CIDR peers; traverse X-Forwarded-For right-to-left.

## Consequences
Constant state per identity and predictable refill; no sliding-log memory growth.
Tokens may be spent in one login bucket before another bucket rejects, an intentional
conservative limit. Username attacks can cause short denial, but no long-lived
account lockout. Outage local buckets are stricter for login and bounded in memory.
Trusted proxies must append the actual source address; broad proxy allowlists are
unsafe. Retry-After is time until one token, reset is time until full capacity.
