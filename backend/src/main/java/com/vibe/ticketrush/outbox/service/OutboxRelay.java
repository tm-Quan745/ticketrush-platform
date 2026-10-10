package com.vibe.ticketrush.outbox.service;

import com.fasterxml.jackson.databind.*;
import com.vibe.ticketrush.common.events.EventEnvelope;
import com.vibe.ticketrush.outbox.domain.OutboxEvent;
import com.vibe.ticketrush.outbox.repository.OutboxRepository;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.util.*;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class OutboxRelay {
    private final OutboxRepository repository; private final RabbitTemplate rabbit; private final ObjectMapper json;
    private final OutboxProperties properties; private final Clock clock; private final TransactionTemplate tx; private final Counter published; private final Counter failed;
    public OutboxRelay(OutboxRepository repository,RabbitTemplate rabbit,ObjectMapper json,OutboxProperties properties,Clock clock,org.springframework.transaction.PlatformTransactionManager manager,MeterRegistry meters) {
        this.repository=repository;this.rabbit=rabbit;this.json=json;this.properties=properties;this.clock=clock;this.tx=new TransactionTemplate(manager);
        published=meters.counter("outbox_publish_total","result","published"); failed=meters.counter("outbox_publish_total","result","failed");
        Gauge.builder("outbox_pending_count",repository,OutboxRepository::pendingCount).register(meters);
        Gauge.builder("outbox_oldest_pending_age_seconds",repository,r -> { Long age=r.oldestPendingAgeSeconds(clock.instant()); return age==null?0:age; }).register(meters);
    }
    @Scheduled(fixedDelayString="${ticketrush.outbox.relay-interval:1s}") public void relay() { tx.executeWithoutResult(s -> repository.lockReady(clock.instant(),properties.batchSize()).forEach(this::publish)); }
    @Scheduled(fixedDelayString="${ticketrush.outbox.cleanup-interval:24h}") public void cleanup() { tx.executeWithoutResult(s -> repository.cleanup(clock.instant().minus(Duration.ofDays(properties.retentionDays())))); }
    private void publish(OutboxEvent event) {
        try {
            JsonNode headers=json.readTree(event.headers());
            EventEnvelope envelope=new EventEnvelope(event.id(),event.eventType(),event.schemaVersion(),event.aggregateType(),event.aggregateId(),event.createdAt(),headers.path("correlation_id").asText(),json.readTree(event.payload()));
            byte[] body=json.writeValueAsBytes(envelope); MessageProperties props=new MessageProperties();
            props.setMessageId(event.id().toString()); props.setContentType(MessageProperties.CONTENT_TYPE_JSON); props.setDeliveryMode(org.springframework.amqp.core.MessageDeliveryMode.PERSISTENT);
            CorrelationData correlation=new CorrelationData(event.id().toString());
            rabbit.invoke(ops -> {
                ops.send("ticketrush.events",event.eventType(),new Message(body,props),correlation);
                ops.waitForConfirmsOrDie(properties.confirmTimeout().toMillis());
                return null;
            });
            if (correlation.getReturned()!=null) throw new IllegalStateException("RabbitMQ returned unroutable event "+event.id());
            repository.published(event.id(),clock.instant()); published.increment();
        } catch (Exception error) {
            int attempts=event.attempts()+1; boolean terminal=attempts>=properties.maxAttempts();
            long cap=Math.min(properties.maxBackoff().toMillis(),properties.initialBackoff().toMillis()*(1L<<Math.min(20,attempts-1)));
            long jitter=cap == 0 ? 0 : java.util.concurrent.ThreadLocalRandom.current().nextLong(Math.max(1,cap/4));
            repository.failedAttempt(event.id(),attempts,clock.instant().plusMillis(cap+jitter),error.toString(),terminal); failed.increment();
        }
    }
}
