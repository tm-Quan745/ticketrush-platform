-- KEYS: bucket hash. ARGV: capacity, refill-period-ms (full bucket), ttl-ms.
-- Returns allowed|remaining|retry-ms|reset-epoch-ms. Redis TIME prevents client clock skew.
-- Read/refill/consume/write/expire is one atomic operation.
local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
local capacity=tonumber(ARGV[1]); local period=tonumber(ARGV[2])
local previous=tonumber(redis.call('HGET',KEYS[1],'at') or now)
local tokens=tonumber(redis.call('HGET',KEYS[1],'tokens') or capacity)
tokens=math.min(capacity,tokens+math.max(0,now-previous)*capacity/period)
local allowed=0
if tokens>=1 then tokens=tokens-1; allowed=1 end
local retry=math.max(0,math.ceil((1-tokens)*period/capacity))
local reset=now+math.ceil((capacity-tokens)*period/capacity)
redis.call('HSET',KEYS[1],'tokens',tokens,'at',now)
redis.call('PEXPIRE',KEYS[1],ARGV[3])
return allowed..'|'..math.floor(tokens)..'|'..retry..'|'..reset
