package com.vibe.ticketrush.reservation;
import org.junit.jupiter.api.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
@Tag("benchmark")
abstract class ReservationBenchmarkSupport extends ReservationTestFixture {
    @org.springframework.beans.factory.annotation.Autowired com.vibe.ticketrush.reservation.service.ReservationProperties properties;
    @Test void roughComparison() throws Exception {
        for(int tierCount:new int[]{1,50}) {
            jdbc.execute("TRUNCATE reservations, ticket_tiers CASCADE");
            List<UUID> tiers=new ArrayList<>();for(int i=0;i<tierCount;i++)tiers.add(addTier(tierCount==1?50:1));
            List<UUID> users=new ArrayList<>();for(int i=0;i<100;i++)users.add(addUser());
            long retries=service.retryCount(),start=System.nanoTime();
            var outcomes=concurrent(100,i -> reserve(users.get(i),tiers.get(i%tierCount),1));
            double duration=(System.nanoTime()-start)/1e9;
            Map<String,Long> counts=new TreeMap<>();outcomes.forEach(s -> counts.merge(s,1L,Long::sum));
            invariant();assertThat(counts.getOrDefault("OK",0L)).isEqualTo(50);
            System.out.printf(java.util.Locale.ROOT,"WEEK3_BENCH strategy=%s tiers=%d threads=100 attempts=100 outcomes=%s retries=%d duration_s=%.3f throughput_attempts_s=%.2f%n",
                properties.strategy(),tierCount,counts,service.retryCount()-retries,duration,100/duration);
        }
    }
}
