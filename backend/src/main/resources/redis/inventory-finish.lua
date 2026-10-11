-- Same KEYS as gate. ARGV: attemptId, committed (1/0), ttlMs.
-- Returns REFUNDED/DONE/IGNORED. Exactly one refund within attempt TTL and generation.
local state = redis.call('HGET', KEYS[4], 'state')
if not state or state == 'DONE' or state == 'REFUNDED' then return 'IGNORED' end
local result = 'DONE'
if ARGV[2] == '0' and state == 'OK' and redis.call('EXISTS', KEYS[1]) == 1
    and redis.call('HGET', KEYS[4], 'generation') == redis.call('GET', KEYS[5]) then
  redis.call('INCRBY', KEYS[1], redis.call('HGET', KEYS[4], 'qty'))
  result = 'REFUNDED'
elseif ARGV[2] == '1' and state == 'MISSING' and redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('DECRBY', KEYS[1], redis.call('HGET', KEYS[4], 'qty'))
end
redis.call('HSET', KEYS[4], 'state', result)
redis.call('PEXPIRE', KEYS[4], ARGV[3])
redis.call('ZREM', KEYS[3], ARGV[1])
redis.call('INCR', KEYS[2]); redis.call('PEXPIRE', KEYS[2], ARGV[3])
return result
