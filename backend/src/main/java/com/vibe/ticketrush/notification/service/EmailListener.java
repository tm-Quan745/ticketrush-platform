package com.vibe.ticketrush.notification.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.Channel;
import com.vibe.ticketrush.common.events.EventEnvelope;
import io.micrometer.core.instrument.MeterRegistry;
import java.io.IOException;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
public class EmailListener {
    private final ObjectMapper json; private final EmailNotificationService notifications; private final RabbitTemplate rabbit; private final NotificationProperties properties;
    private final io.micrometer.core.instrument.Counter processed,duplicate,deadLetter;
    public EmailListener(ObjectMapper json,EmailNotificationService notifications,RabbitTemplate rabbit,NotificationProperties properties,MeterRegistry meters) { this.json=json;this.notifications=notifications;this.rabbit=rabbit;this.properties=properties; processed=meters.counter("consumer_processed_total","result","processed");duplicate=meters.counter("consumer_processed_total","result","duplicate");deadLetter=meters.counter("consumer_processed_total","result","dlq"); }
    @RabbitListener(queues=RabbitTopology.EMAIL_QUEUE,containerFactory="manualRabbitListenerContainerFactory")
    public void onMessage(Message message,Channel channel) throws IOException {
        long tag=message.getMessageProperties().getDeliveryTag();
        EventEnvelope event=null;
        try {
            event=json.readValue(message.getBody(),EventEnvelope.class);
            if (event.schemaVersion()>1) { processed.increment(); channel.basicAck(tag,false); return; }
            if (notifications.process(event)) processed.increment(); else duplicate.increment();
            channel.basicAck(tag,false);
        } catch (NonRetryableNotificationException | com.fasterxml.jackson.core.JsonProcessingException error) { sendDlq(message); deadLetter.increment(); channel.basicAck(tag,false); }
        catch (RetryableNotificationException error) { if(event!=null) notifications.recordFailure(event,error); retryOrDeadLetter(message); channel.basicAck(tag,false); }
        catch (RuntimeException error) { if(event!=null) notifications.recordFailure(event,error); retryOrDeadLetter(message); channel.basicAck(tag,false); }
    }
    private void retryOrDeadLetter(Message message) { int tries=retryCount(message); if (tries>=properties.maxRetries()) { sendDlq(message); deadLetter.increment(); return; } String exchange=tries==0?"ticketrush.retry.10s":tries==1?"ticketrush.retry.1m":"ticketrush.retry.10m"; Message next=MessageBuilder.fromMessage(message).setHeader("x-ticketrush-retry",tries+1).build(); publish(exchange,message.getMessageProperties().getReceivedRoutingKey(),next); }
    private void sendDlq(Message message) { publish(RabbitTopology.DLX,RabbitTopology.EMAIL_QUEUE,message); }
    private void publish(String exchange,String key,Message message) { rabbit.invoke(ops -> { ops.send(exchange,key,message); ops.waitForConfirmsOrDie(5000); return null; }); }
    private static int retryCount(Message message) { Object value=message.getMessageProperties().getHeaders().get("x-ticketrush-retry"); return value instanceof Number n?n.intValue():0; }
}
