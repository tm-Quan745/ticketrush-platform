package com.vibe.ticketrush.common.ratelimit;

import com.vibe.ticketrush.common.redis.*;
import com.vibe.ticketrush.auth.service.TokenService;
import io.micrometer.core.instrument.MeterRegistry;
import java.util.*;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Service;

@Service
@EnableConfigurationProperties(RateLimitProperties.class)
public class RedisRateLimiter {
    public record Decision(boolean allowed,int limit,long remaining,long retrySeconds,long resetEpochSeconds) {}
    private record Bucket(double tokens,long at,long expires) {}
    private final Map<String,Bucket> local=new HashMap<>();
    private final StringRedisTemplate redis;
    private final RedisScript<String> script;
    private final RedisProperties keys;
    private final RedisGuard guard;
    private final MeterRegistry metrics;
    public RedisRateLimiter(StringRedisTemplate redis,RedisScript<String> tokenBucketScript,RedisProperties keys,RedisGuard guard,MeterRegistry metrics) {
        this.redis=redis; this.script=tokenBucketScript; this.keys=keys; this.guard=guard; this.metrics=metrics;
    }
    public Decision check(String policy,String identity,RateLimitProperties.Policy config) {
        String key=keys.key("rate-limit",TokenService.hash(identity),policy);
        Decision decision=guard.call("rate-limit",() -> {
            metrics.counter("rate_limit_redis_commands_total","policy",policy).increment();
            String raw=redis.execute(script,List.of(key),Integer.toString(config.capacity()),Long.toString(config.period().toMillis()),Long.toString(config.period().toMillis()*2));
            String[] values=Objects.requireNonNull(raw).split("\\|");
            return new Decision("1".equals(values[0]),config.capacity(),Long.parseLong(values[1]),
                (Long.parseLong(values[2])+999)/1000,(Long.parseLong(values[3])+999)/1000);
        },() -> fallback(key,config));
        if (!decision.allowed()) metrics.counter("rate_limit_rejected_total","policy",policy).increment();
        return decision;
    }
    private synchronized Decision fallback(String key,RateLimitProperties.Policy config) {
        int capacity=config.localCapacity();
        long epoch=System.currentTimeMillis()/1000;
        if (config.failure()==RateLimitProperties.Failure.OPEN) return new Decision(true,capacity,capacity,0,epoch);
        if (config.failure()==RateLimitProperties.Failure.CLOSED) return new Decision(false,capacity,0,1,epoch+1);
        long now=System.nanoTime();
        Bucket old=local.get(key);
        if (old==null && local.size()>=10000) {
            local.entrySet().removeIf(e -> now>=e.getValue().expires());
            if (local.size()>=10000) return new Decision(false,capacity,0,1,epoch+1);
        }
        double tokens=old==null ? capacity:Math.min(capacity,old.tokens()+(now-old.at())*(double)capacity/config.period().toNanos());
        boolean allowed=tokens>=1;
        if (allowed) tokens--;
        local.put(key,new Bucket(tokens,now,now+config.period().toNanos()*2));
        long retry=Math.max(1,(long)Math.ceil((1-tokens)*config.period().toMillis()/capacity/1000));
        return new Decision(allowed,capacity,(long)tokens,allowed ? 0:retry,epoch+(long)Math.ceil((capacity-tokens)*config.period().toMillis()/capacity/1000));
    }
}
