package com.vibe.ticketrush.notification.service;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Broker outage is represented as -1 rather than making application health DOWN. */
@Component
@ConditionalOnProperty(name="ticketrush.messaging.enabled",havingValue="true",matchIfMissing=true)
public class DlqMetrics {
    private final RabbitTemplate rabbit;
    public DlqMetrics(RabbitTemplate rabbit,MeterRegistry meters) {
        this.rabbit=rabbit;
        Gauge.builder("rabbitmq_dlq_message_count",this,DlqMetrics::count).register(meters);
    }
    double count() {
        try { return rabbit.execute(channel -> channel.queueDeclarePassive(RabbitTopology.EMAIL_QUEUE+".dlq").getMessageCount()); }
        catch (RuntimeException error) { return -1; }
    }
}
