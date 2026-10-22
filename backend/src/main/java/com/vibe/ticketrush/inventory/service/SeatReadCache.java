package com.vibe.ticketrush.inventory.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibe.ticketrush.common.redis.RedisGuard;
import com.vibe.ticketrush.common.redis.RedisProperties;
import com.vibe.ticketrush.common.service.ApiException;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Semaphore;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Supplier;

/** Shared identity-free snapshots; a lost lock owner cannot publish late data. */
@Service
public class SeatReadCache {
    private final StringRedisTemplate redis;
    private final RedisGuard guard;
    private final RedisProperties keys;
    private final ObjectMapper json;
    private final MeterRegistry metrics;
    private final Semaphore databaseReads=new Semaphore(8);
    private static final RedisScript<String> SCRIPT=RedisScript.of("""
        if ARGV[1]=='read' then
          local data=redis.call('GET',KEYS[1])
          if data then return 'HIT|'..data end
          if redis.call('SET',KEYS[2],ARGV[2],'NX','PX',5000) then return 'BUILD' end
          return 'WAIT'
        end
        if ARGV[1]=='refresh' then
          if redis.call('SET',KEYS[2],ARGV[2],'NX','PX',5000) then return 'BUILD' end
          return 'WAIT'
        end
        if redis.call('GET',KEYS[2])~=ARGV[2] then return 'LOST' end
        if ARGV[1]=='write' then redis.call('SET',KEYS[1],ARGV[3],'PX',ARGV[4]) end
        redis.call('DEL',KEYS[2]);return 'OK'
        """,String.class);
    public SeatReadCache(StringRedisTemplate redis,RedisGuard guard,RedisProperties keys,ObjectMapper json,MeterRegistry metrics) {
        this.redis=redis;this.guard=guard;this.keys=keys;this.json=json;this.metrics=metrics;
    }
    public <T> T database(Supplier<T> operation) {
        boolean acquired;
        try {acquired=databaseReads.tryAcquire(1,java.util.concurrent.TimeUnit.SECONDS);}
        catch(InterruptedException ex){Thread.currentThread().interrupt();throw busy();}
        if (!acquired) { metrics.counter("seat_read_overload_total").increment();throw busy(); }
        try { return operation.get(); } finally {databaseReads.release();}
    }
    private record Key(UUID event,UUID section) {}
    private static final class Active {
        final Runnable refresh;
        volatile long requested=System.nanoTime();
        volatile long refreshed;
        Active(Runnable refresh){this.refresh=refresh;}
    }
    private final java.util.concurrent.ConcurrentHashMap<Key,Active> active=new java.util.concurrent.ConcurrentHashMap<>();
    @org.springframework.scheduling.annotation.Scheduled(fixedDelay=250)
    public void refreshActive() {
        long now=System.nanoTime();
        active.forEach((key,entry)->{
            if(now-entry.requested>Duration.ofSeconds(30).toNanos()){active.remove(key,entry);return;}
            if(now-entry.refreshed<Duration.ofMillis(750).toNanos())return;
            entry.refreshed=now;
            try{entry.refresh.run();}catch(RuntimeException ex){metrics.counter("seat_read_refresh_failures_total").increment();}
        });
    }
    public <T> T get(UUID event,UUID section,Class<T> type,Supplier<T> loader) {
        active.computeIfAbsent(new Key(event,section),key->new Active(()->refresh(event,section,loader))).requested=System.nanoTime();
        return guard.call("seat-read",()->cached(event,section,type,loader),()->fresh(loader));
    }
    private <T> T fresh(Supplier<T> loader) {
        long started=System.nanoTime();T value=database(loader);
        if(System.nanoTime()-started>=Duration.ofSeconds(1).toNanos())throw busy();
        return value;
    }
    private <T> T cached(UUID event,UUID section,Class<T> type,Supplier<T> loader) {
        var names=List.of(keys.key("seat-read-v2",event,section.toString()),keys.key("seat-read-v2-lock",event,section.toString()));
        String owner=UUID.randomUUID().toString();long deadline=System.nanoTime()+Duration.ofSeconds(2).toNanos();
        while (true) {
            String value=redis.execute(SCRIPT,names,"read",owner,"");
            if (value!=null && value.startsWith("HIT|")) {
                metrics.counter("seat_read_cache_total","result","hit").increment();
                try {return json.readValue(value.substring(4),type);} catch (java.io.IOException ex) {throw new IllegalStateException(ex);}
            }
            if ("BUILD".equals(value)) {
                metrics.counter("seat_read_cache_total","result","rebuild").increment();
                try {
                    long started=System.nanoTime();
                    T result=database(loader);
                    long remaining=1000-Duration.ofNanos(System.nanoTime()-started).toMillis();
                    if(remaining<=0)throw busy();
                    redis.execute(SCRIPT,names,"write",owner,json.writeValueAsString(result),Long.toString(remaining));
                    return result;
                } catch (java.io.IOException ex) {throw new IllegalStateException(ex);}
                finally {redis.execute(SCRIPT,names,"release",owner,"");}
            }
            if (System.nanoTime()>=deadline || Thread.currentThread().isInterrupted()) throw busy();
            LockSupport.parkNanos(Duration.ofMillis(5).toNanos());
        }
    }
    private <T> void refresh(UUID event,UUID section,Supplier<T> loader) {
        guard.call("seat-read-refresh",()->{
            var names=List.of(keys.key("seat-read-v2",event,section.toString()),keys.key("seat-read-v2-lock",event,section.toString()));
            String owner=UUID.randomUUID().toString();
            if(!"BUILD".equals(redis.execute(SCRIPT,names,"refresh",owner,"")))return false;
            try {
                long started=System.nanoTime();T result=database(loader);
                long remaining=1000-Duration.ofNanos(System.nanoTime()-started).toMillis();
                if(remaining>0)redis.execute(SCRIPT,names,"write",owner,json.writeValueAsString(result),Long.toString(remaining));
                metrics.counter("seat_read_refresh_total").increment();return true;
            }catch(java.io.IOException ex){throw new IllegalStateException(ex);}
            finally{redis.execute(SCRIPT,names,"release",owner,"");}
        },()->false);
    }
    private static ApiException busy() {return new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"SEAT_READ_BUSY","Seat availability is busy; retry shortly");}
}
