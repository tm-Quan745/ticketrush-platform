package com.vibe.ticketrush.reservation;

import com.vibe.ticketrush.inventory.service.RedisInventoryGate;
import com.vibe.ticketrush.reservation.service.ReservationProperties;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.*;
import org.springframework.test.context.*;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import javax.sql.DataSource;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.*;

@Tag("benchmark")
@Import(Week6BenchmarkSupport.QueryCounting.class)
abstract class Week6BenchmarkSupport extends ReservationTestFixture {
    @Container static final GenericContainer<?> REDIS=new GenericContainer<>("redis:7.4-alpine").withExposedPorts(6379);
    @DynamicPropertySource static void redisProperties(DynamicPropertyRegistry r) {
        r.add("spring.data.redis.host",REDIS::getHost);r.add("spring.data.redis.port",() -> REDIS.getMappedPort(6379));r.add("spring.data.redis.password",() -> "");
    }
    @Autowired ReservationProperties properties;
    @Autowired RedisInventoryGate gate;
    static final AtomicLong QUERIES=new AtomicLong();
    @TestConfiguration static class QueryCounting {
        @Bean static BeanPostProcessor countSql() {
            return new BeanPostProcessor() {
                public Object postProcessAfterInitialization(Object bean,String name) {
                    if (!(bean instanceof DataSource)) return bean;
                    return proxy(bean,DataSource.class);
                }
            };
        }
        static Object proxy(Object target,Class<?> type) {
            return Proxy.newProxyInstance(type.getClassLoader(),new Class<?>[]{type},(object,method,args) -> {
                try {
                    if (target instanceof java.sql.Statement && method.getName().startsWith("execute")) QUERIES.incrementAndGet();
                    Object result=method.invoke(target,args);
                    if (result instanceof java.sql.Connection) return proxy(result,java.sql.Connection.class);
                    if (result instanceof java.sql.PreparedStatement) return proxy(result,java.sql.PreparedStatement.class);
                    if (result instanceof java.sql.Statement) return proxy(result,java.sql.Statement.class);
                    return result;
                } catch (InvocationTargetException ex) { throw ex.getCause(); }
            });
        }
    }
    @Test void compare() throws Exception {
        for (int scenario=0;scenario<3;scenario++) {
            jdbc.execute("TRUNCATE reservations,ticket_tiers CASCADE");
            int tierCount=scenario==1 ? 50:1;
            List<UUID> tiers=new ArrayList<>();
            for(int i=0;i<tierCount;i++) { UUID id=addTier(scenario==2 ? 0:(scenario==0 ? 50:1));tiers.add(id);if(properties.strategy().equals("redis-gate"))gate.warm(id); }
            List<UUID> users=new ArrayList<>();for(int i=0;i<500;i++)users.add(addUser());
            long[] latencies=new long[500];long queries=QUERIES.get(),db=service.databaseAttempts(),start=System.nanoTime();
            var results=concurrent(500,i -> {
                long begin=System.nanoTime();try{return reserve(users.get(i),tiers.get(i%tierCount),1);}
                finally{latencies[i]=System.nanoTime()-begin;}
            });
            double seconds=(System.nanoTime()-start)/1e9;long issued=QUERIES.get()-queries;
            Map<String,Long> counts=new TreeMap<>();results.forEach(s -> counts.merge(s,1L,Long::sum));
            invariant();assertThat(counts.getOrDefault("OK",0L)).isEqualTo(scenario==2 ? 0:50);
            Arrays.sort(latencies);
            System.out.printf(Locale.ROOT,"WEEK6_BENCH strategy=%s scenario=%s threads=500 outcomes=%s db_attempts=%d sql_statements=%d duration_s=%.3f throughput=%.2f p50_ms=%.3f p95_ms=%.3f p99_ms=%.3f%n",
                properties.strategy(),scenario==0 ? "hot":scenario==1 ? "50-tiers":"sold-out",counts,service.databaseAttempts()-db,issued,seconds,500/seconds,
                latencies[249]/1e6,latencies[474]/1e6,latencies[494]/1e6);
        }
    }
}
