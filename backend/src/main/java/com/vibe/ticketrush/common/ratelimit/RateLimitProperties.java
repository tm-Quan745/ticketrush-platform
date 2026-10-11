package com.vibe.ticketrush.common.ratelimit;

import java.time.Duration;
import java.util.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("ticketrush.rate-limit")
public record RateLimitProperties(@DefaultValue("true") boolean enabled,List<String> trustedProxies,Map<String,Policy> policies) {
    public enum Failure { LOCAL, OPEN, CLOSED }
    public record Policy(int capacity,Duration period, int localCapacity,Failure failure) {
        public Policy {
            if (capacity<1 || localCapacity<1 || period==null || period.toMillis()<1 || failure==null)
                throw new IllegalArgumentException("Invalid rate limit policy");
        }
    }
    public RateLimitProperties {
        trustedProxies=trustedProxies==null ? List.of():List.copyOf(trustedProxies);
        policies=policies==null ? Map.of():Map.copyOf(policies);
    }
    public Policy policy(String name,int defaultCapacity,Duration period,int localCapacity) {
        return policies.getOrDefault(name,new Policy(defaultCapacity,period,localCapacity,Failure.LOCAL));
    }
}
