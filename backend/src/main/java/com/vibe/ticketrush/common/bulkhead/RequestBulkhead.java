package com.vibe.ticketrush.common.bulkhead;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.Semaphore;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@EnableConfigurationProperties(BulkheadProperties.class)
public class RequestBulkhead {
    private static final Logger LOG = LoggerFactory.getLogger(RequestBulkhead.class);
    private final BulkheadProperties properties;
    private final Semaphore permits;

    public RequestBulkhead(BulkheadProperties properties, @Value("${WAITING_ROOM_RATE:20}") int admissionRate,
            MeterRegistry metrics) {
        this.properties = properties;
        int capacity = properties.maxConcurrent() == 0
            ? (int) Math.ceil(admissionRate * properties.assumedHoldSeconds() * properties.safetyFactor())
            : properties.maxConcurrent();
        this.permits = new Semaphore(capacity, true);
        metrics.gauge("request_bulkhead_available", permits, Semaphore::availablePermits);
        metrics.counter("request_bulkhead_rejected_total", "endpoint", "reservations");
        metrics.counter("request_bulkhead_rejected_total", "endpoint", "orders");
    }

    public boolean tryAcquire(String endpoint) {
        if (!properties.enabled() || permits.tryAcquire()) return true;
        LOG.warn("request_bulkhead_rejected endpoint={} correlation_id={}", endpoint,
            com.vibe.ticketrush.common.service.CorrelationId.current());
        return false;
    }

    public void release() {
        if (properties.enabled()) permits.release();
    }
}
