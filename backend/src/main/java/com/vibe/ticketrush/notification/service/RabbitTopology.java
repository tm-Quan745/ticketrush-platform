package com.vibe.ticketrush.notification.service;

import java.util.Map;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.config.SimpleRabbitListenerContainerFactory;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.context.annotation.*;

@Configuration
public class RabbitTopology {
    public static final String EVENTS="ticketrush.events", DLX="ticketrush.dlx", EMAIL_QUEUE="notification.email";
    @Bean TopicExchange eventsExchange() { return new TopicExchange(EVENTS,true,false); }
    @Bean DirectExchange deadLetterExchange() { return new DirectExchange(DLX,true,false); }
    @Bean TopicExchange retry10Exchange() { return new TopicExchange("ticketrush.retry.10s",true,false); }
    @Bean TopicExchange retry1mExchange() { return new TopicExchange("ticketrush.retry.1m",true,false); }
    @Bean TopicExchange retry10mExchange() { return new TopicExchange("ticketrush.retry.10m",true,false); }
    @Bean Queue emailQueue() { return QueueBuilder.durable(EMAIL_QUEUE).withArguments(Map.of("x-dead-letter-exchange",DLX,"x-dead-letter-routing-key",EMAIL_QUEUE)).build(); }
    @Bean Queue emailDlq() { return QueueBuilder.durable(EMAIL_QUEUE+".dlq").build(); }
    @Bean Binding emailDlqBinding() { return BindingBuilder.bind(emailDlq()).to(deadLetterExchange()).with(EMAIL_QUEUE); }
    @Bean Binding paidBinding() { return BindingBuilder.bind(emailQueue()).to(eventsExchange()).with("order.paid"); }
    @Bean Binding failedBinding() { return BindingBuilder.bind(emailQueue()).to(eventsExchange()).with("order.payment_failed"); }
    @Bean Binding refundedBinding() { return BindingBuilder.bind(emailQueue()).to(eventsExchange()).with("order.refunded"); }
    @Bean Binding expiredBinding() { return BindingBuilder.bind(emailQueue()).to(eventsExchange()).with("order.expired"); }
    @Bean Queue retry10Queue() { return retryQueue("notification.email.retry.10s",10_000); }
    @Bean Queue retry1mQueue() { return retryQueue("notification.email.retry.1m",60_000); }
    @Bean Queue retry10mQueue() { return retryQueue("notification.email.retry.10m",600_000); }
    private static Queue retryQueue(String name,int ttl) { return QueueBuilder.durable(name).withArguments(Map.of("x-message-ttl",ttl,"x-dead-letter-exchange",EVENTS)).build(); }
    @Bean Binding retry10Binding() { return BindingBuilder.bind(retry10Queue()).to(retry10Exchange()).with("#"); }
    @Bean Binding retry1mBinding() { return BindingBuilder.bind(retry1mQueue()).to(retry1mExchange()).with("#"); }
    @Bean Binding retry10mBinding() { return BindingBuilder.bind(retry10mQueue()).to(retry10mExchange()).with("#"); }
    @Bean SimpleRabbitListenerContainerFactory manualRabbitListenerContainerFactory(ConnectionFactory connectionFactory,NotificationProperties properties) {
        var factory=new SimpleRabbitListenerContainerFactory(); factory.setConnectionFactory(connectionFactory); factory.setAcknowledgeMode(AcknowledgeMode.MANUAL);
        factory.setConcurrentConsumers(properties.concurrency()); factory.setMaxConcurrentConsumers(properties.concurrency()); factory.setPrefetchCount(properties.prefetch()); factory.setDefaultRequeueRejected(false); return factory;
    }
    @Bean RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) { var template=new RabbitTemplate(connectionFactory); template.setMandatory(true); return template; }
}
