-- KEYS: available, revision, pending, generation, warmLock.
-- ARGV: operation(snapshot/heal/delta/lock/unlock), value, revision, generation, ttlMs.
-- CAS refuses healing if a gate is pending or revision changed since the DB snapshot began.
local op = ARGV[1]
if op == 'lock' then return redis.call('SET', KEYS[5], ARGV[4], 'NX', 'PX', 5000) or 'BUSY' end
if op == 'unlock' then
  if redis.call('GET', KEYS[5]) == ARGV[4] then redis.call('DEL', KEYS[5]) end
  return 'OK'
end
if op == 'delta' then
  if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('INCRBY', KEYS[1], ARGV[2]) end
  redis.call('INCR', KEYS[2]); redis.call('PEXPIRE', KEYS[2], ARGV[5]); return 'OK'
end
local now = redis.call('TIME')
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now[1]*1000+math.floor(now[2]/1000))
if redis.call('ZCARD', KEYS[3]) > 0 then return 'BUSY' end
local rev = redis.call('GET', KEYS[2]) or '0'
if op == 'snapshot' then return rev .. ':' .. (redis.call('GET', KEYS[1]) or 'MISSING') end
if rev ~= ARGV[3] then return 'CHANGED' end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[5])
redis.call('SET', KEYS[4], ARGV[4], 'PX', ARGV[5])
redis.call('INCR', KEYS[2]); redis.call('PEXPIRE', KEYS[2], ARGV[5])
return 'HEALED'
