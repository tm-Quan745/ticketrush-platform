-- KEYS: fresh, stale, lock, generation. ARGV: op, owner, generation, body, ttlMs.
-- Owner-checked publication plus generation CAS prevents an old rebuild undoing invalidation.
local op=ARGV[1]; local version=redis.call('GET',KEYS[4]) or '0'
if op=='read' then
  local raw=redis.call('GET',KEYS[1])
  if raw and string.sub(raw,1,#version+1)==version..'|' then return 'HIT|'..string.sub(raw,#version+2) end
  if redis.call('SET',KEYS[3],ARGV[2],'NX','PX',5000) then return 'BUILD|'..version end
  raw=redis.call('GET',KEYS[2])
  if raw and string.sub(raw,1,#version+1)==version..'|' then return 'HIT|'..string.sub(raw,#version+2) end
  return 'WAIT'
end
if op=='invalidate' then
  redis.call('INCR',KEYS[4]); redis.call('PEXPIRE',KEYS[4],86400000); return 'OK'
end
if redis.call('GET',KEYS[3])~=ARGV[2] then return 'LOST' end
redis.call('DEL',KEYS[3])
if op=='release' then return 'OK' end
if version~=ARGV[3] then return 'CHANGED' end
redis.call('SET',KEYS[1],version..'|'..ARGV[4],'PX',ARGV[5])
redis.call('SET',KEYS[2],version..'|'..ARGV[4],'PX',30000)
return 'OK'
