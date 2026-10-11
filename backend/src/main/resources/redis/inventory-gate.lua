-- KEYS: available, revision, pending, attempt, generation. ARGV: qty, attemptId, retentionMs, leaseMs.
-- Returns OK/INSUFFICIENT/MISSING/FINISHED. Deduction and attempt registration are atomic.
local old = redis.call('HGET', KEYS[4], 'state')
if old then
  if old == 'OK' or old == 'MISSING' then return old end
  return 'FINISHED'
end
local qty = tonumber(ARGV[1])
if qty < 1 then return redis.error_reply('quantity must be positive') end
local available = redis.call('GET', KEYS[1])
if available and tonumber(available) < qty then return 'INSUFFICIENT' end
local state = 'MISSING'
if available then redis.call('DECRBY', KEYS[1], qty); state = 'OK' end
local now = redis.call('TIME')
local millis = now[1] * 1000 + math.floor(now[2] / 1000)
redis.call('ZADD', KEYS[3], millis + tonumber(ARGV[4]), ARGV[2])
redis.call('HSET', KEYS[4], 'state', state, 'qty', qty, 'generation', redis.call('GET', KEYS[5]) or '')
redis.call('INCR', KEYS[2])
for i=2,4 do redis.call('PEXPIRE', KEYS[i], ARGV[3]) end
return state
