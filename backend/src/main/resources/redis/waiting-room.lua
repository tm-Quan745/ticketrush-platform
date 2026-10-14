-- KEYS: queue ZSET, heartbeat ZSET, sequence, opened, budget, user key prefix, admitted LIST.
-- ARGV: op,user,open,mode,rate,intervalMs,heartbeatMs,tokenMs,retentionMs,token candidates...
-- Redis TIME governs liveness and one shared admission budget. Pop + bound token are atomic.
local op,user=ARGV[1],ARGV[2]
local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000)
local retention=tonumber(ARGV[9]); local prefix=KEYS[6]
local admission=prefix..user..':admission'; local seen=prefix..user..':seen'
local stale=redis.call('ZRANGEBYSCORE',KEYS[2],'-inf',now-tonumber(ARGV[7]))
for _,id in ipairs(stale) do redis.call('ZREM',KEYS[1],id); redis.call('ZREM',KEYS[2],id) end
local function touch()
  for i=1,7 do redis.call('PEXPIRE',KEYS[i],retention) end
end
if ARGV[3]=='1' and redis.call('EXISTS',KEYS[4])==0 then
  if ARGV[4]=='lottery' then
    local ids=redis.call('ZRANGE',KEYS[1],0,-1)
    for i=#ids,2,-1 do local j=math.random(i); ids[i],ids[j]=ids[j],ids[i] end
    for i,id in ipairs(ids) do redis.call('ZADD',KEYS[1],i,id) end
    redis.call('SET',KEYS[3],#ids)
  end
  redis.call('SET',KEYS[4],'1','PX',retention)
end
if op=='leave' then
  redis.call('ZREM',KEYS[1],user); redis.call('ZREM',KEYS[2],user); redis.call('DEL',admission,seen)
  return '{}'
end
if op=='validate' then
  local raw=redis.call('GET',admission)
  if not raw then return 'INVALID' end
  if cjson.decode(raw).token==ARGV[10] then return 'VALID' end
  return 'INVALID'
end
if op=='admit' then
  if ARGV[3]~='1' then touch(); return '[]' end
  local last=tonumber(redis.call('GET',KEYS[5]) or '0')
  if now-last<tonumber(ARGV[6]) then touch(); return '[]' end
  redis.call('SET',KEYS[5],now,'PX',retention)
  local result={}
  local ids=redis.call('ZRANGE',KEYS[1],0,tonumber(ARGV[5])-1)
  for i,id in ipairs(ids) do
    local joined=tonumber(redis.call('GET',prefix..id..':seen') or now)
    local value=cjson.encode({token=ARGV[9+i],expiresAt=now+tonumber(ARGV[8])})
    redis.call('SET',prefix..id..':admission',value,'PX',ARGV[8])
    if ARGV[#ARGV]=='1' then
      redis.call('RPUSH',KEYS[7],cjson.encode({user=id,token=ARGV[9+i],expiresAt=now+tonumber(ARGV[8])}))
    end
    redis.call('PEXPIRE',prefix..id..':seen',retention)
    redis.call('ZREM',KEYS[1],id); redis.call('ZREM',KEYS[2],id)
    table.insert(result,math.max(0,now-joined))
  end
  touch(); return cjson.encode(result)
end
local raw=redis.call('GET',admission)
if raw then
  local value=cjson.decode(raw); value.state='ADMITTED'; value.position=0; value.queueLength=redis.call('ZCARD',KEYS[1])
  return cjson.encode(value)
end
if op=='join' and not redis.call('ZSCORE',KEYS[1],user) then
  redis.call('ZADD',KEYS[1],redis.call('INCR',KEYS[3]),user)
  redis.call('SET',seen,now,'PX',retention)
end
local rank=redis.call('ZRANK',KEYS[1],user)
if rank then
  redis.call('ZADD',KEYS[2],now,user); redis.call('PEXPIRE',seen,retention); touch()
  return cjson.encode({state='WAITING',position=rank+1,queueLength=redis.call('ZCARD',KEYS[1])})
end
if redis.call('EXISTS',seen)==1 then return cjson.encode({state='EXPIRED',position=0,queueLength=redis.call('ZCARD',KEYS[1])}) end
return cjson.encode({state='NOT_IN_QUEUE',position=0,queueLength=redis.call('ZCARD',KEYS[1])})
