package com.vibe.ticketrush.event.service;

import com.vibe.ticketrush.common.redis.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.locks.LockSupport;
import java.util.function.Supplier;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

@Service
public class PublicEventCache implements EventCacheInvalidation {
    private final StringRedisTemplate redis;
    private final RedisScript<String> script;
    private final RedisProperties keys;
    private final RedisGuard guard;
    private final ObjectMapper json;
    private final MeterRegistry metrics;
    public PublicEventCache(StringRedisTemplate redis,RedisScript<String> cacheScript,RedisProperties keys,RedisGuard guard,ObjectMapper json,MeterRegistry metrics) {
        this.redis=redis;this.script=cacheScript;this.keys=keys;this.guard=guard;this.json=json;this.metrics=metrics;
    }
    private List<String> names(String id) {
        return List.of(keys.key("event",id,"cache"),keys.key("event",id,"stale"),keys.key("event",id,"cache-lock"),keys.key("event","public","generation"));
    }
    private String command(String id,String op,String owner,String version,String body,String ttl) {
        return redis.execute(script,names(id),op,owner,version,body,ttl);
    }
    public <T> T get(String id,Class<T> type,Supplier<T> loader) {
        return guard.call("cache",() -> cached(id,type,loader),loader);
    }
    private <T> T cached(String id,Class<T> type,Supplier<T> loader) {
        String owner=UUID.randomUUID().toString();
        long deadline=System.nanoTime()+java.time.Duration.ofSeconds(2).toNanos();
        while (true) {
            String value=command(id,"read",owner,"","","0");
            if (value.startsWith("HIT|")) {
                try { T result=json.readValue(value.substring(4),type); metrics.counter("cache_hit_total").increment(); return result; }
                catch (com.fasterxml.jackson.core.JsonProcessingException ex) { invalidate(); return loader.get(); }
            }
            if (value.startsWith("BUILD|")) {
                metrics.counter("cache_miss_total").increment();
                try {
                    T result=loader.get();
                    command(id,"write",owner,value.substring(6),json.writeValueAsString(result),Integer.toString(ThreadLocalRandom.current().nextInt(5000,10001)));
                    return result;
                } catch (com.fasterxml.jackson.core.JsonProcessingException ex) { throw new IllegalStateException(ex); }
                finally { command(id,"release",owner,"","","0"); }
            }
            if (System.nanoTime()>deadline || Thread.currentThread().isInterrupted()) return loader.get();
            LockSupport.parkNanos(java.time.Duration.ofMillis(10).toNanos());
        }
    }
    public void invalidate() {
        AfterCommit.run(() -> guard.call("cache",() -> command("public","invalidate","","","","0"),() -> "FALLBACK"));
    }
}
