package com.vibe.ticketrush.common.redis;

import org.springframework.context.annotation.*;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.core.script.*;

@Configuration
@EnableConfigurationProperties(RedisProperties.class)
public class RedisConfig {
    private RedisScript<String> script(String name) {
        var script = new DefaultRedisScript<String>();
        script.setLocation(new ClassPathResource("redis/" + name + ".lua"));
        script.setResultType(String.class);
        return script;
    }
    @Bean RedisScript<String> inventoryGateScript() { return script("inventory-gate"); }
    @Bean RedisScript<String> inventoryFinishScript() { return script("inventory-finish"); }
    @Bean RedisScript<String> inventorySyncScript() { return script("inventory-sync"); }
    @Bean RedisScript<String> tokenBucketScript() { return script("token-bucket"); }
    @Bean RedisScript<String> waitingRoomScript() { return script("waiting-room"); }
    @Bean RedisScript<String> cacheScript() { return script("cache"); }
}
