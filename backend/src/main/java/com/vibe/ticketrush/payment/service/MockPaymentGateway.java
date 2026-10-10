package com.vibe.ticketrush.payment.service;

import com.vibe.ticketrush.payment.domain.PaymentScenario;
import com.vibe.ticketrush.payment.dto.PaymentEvent;
import com.vibe.ticketrush.payment.dto.PaymentEvent.Type;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.slf4j.*;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.*;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.UUID;
import java.util.concurrent.*;

@Component
public class MockPaymentGateway implements PaymentGateway {
    private static final Logger LOG=LoggerFactory.getLogger(MockPaymentGateway.class);
    private final ScheduledExecutorService workers=Executors.newScheduledThreadPool(8);
    private final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final PaymentProperties properties;
    private final WebhookSignature signature;
    private final ObjectMapper json;
    private final Clock clock;
    private volatile String url;
    public MockPaymentGateway(PaymentProperties properties,WebhookSignature signature,ObjectMapper json,Clock clock) {
        this.properties=properties; this.signature=signature; this.json=json; this.clock=clock; this.url=properties.webhookUrl();
    }
    @EventListener public void port(WebServerInitializedEvent event) {
        // Resolve the embedded server's random test port without bypassing HTTP.
        if (url.contains(":0/")) url=url.replace(":0/",":"+event.getWebServer().getPort()+"/");
    }
    public String createPayment(UUID orderId,long amount,String currency,PaymentScenario scenario) {
        String reference="mock_"+orderId;
        Runnable dispatch=() -> {
            long delay=(scenario==PaymentScenario.DELAYED_SUCCESS?properties.delayedSuccessDelay():properties.delay()).toMillis();
            Type type=scenario==PaymentScenario.FAILURE?Type.FAILED:Type.SUCCEEDED;
            long sentAmount=scenario==PaymentScenario.AMOUNT_MISMATCH?Math.addExact(amount,1):amount;
            var event=new PaymentEvent(reference+"_"+type,reference,type,sentAmount,currency);
            int copies=scenario==PaymentScenario.DUPLICATE_WEBHOOK?properties.duplicateCount():1;
            for(int i=0;i<copies;i++) workers.schedule(() -> deliver(event,scenario==PaymentScenario.INVALID_SIGNATURE,0),delay,TimeUnit.MILLISECONDS);
            if (scenario==PaymentScenario.OUT_OF_ORDER) workers.schedule(() ->
                deliver(new PaymentEvent(reference+"_FAILED",reference,Type.FAILED,amount,currency),false,0),delay+1000,TimeUnit.MILLISECONDS);
        };
        afterCommit(dispatch);
        return reference;
    }
    public void refund(String reference,long amount,String currency) {
        afterCommit(() -> workers.schedule(() -> deliver(new PaymentEvent(reference+"_REFUNDED",reference,Type.REFUNDED,amount,currency),false,0),properties.delay().toMillis(),TimeUnit.MILLISECONDS));
    }
    private void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { action.run(); }
        });
        else action.run();
    }
    private void deliver(PaymentEvent event,boolean invalid,int attempt) {
        try {
            byte[] body=json.writeValueAsBytes(event);
            String timestamp=Long.toString(clock.instant().getEpochSecond());
            var request=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                .header("Content-Type","application/json").header("X-Payment-Timestamp",timestamp)
                .header("X-Payment-Signature",invalid?"00".repeat(32):signature.sign(timestamp,body))
                .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
            int status=client.send(request,HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status>=500) retry(event,invalid,attempt);
            else if (status>=400) LOG.warn("Mock webhook rejected: event={} status={}",event.providerEventId(),status);
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        catch (Exception e) { LOG.warn("Mock webhook delivery failed: {}",event.providerEventId()); retry(event,invalid,attempt); }
    }
    private void retry(PaymentEvent event,boolean invalid,int attempt) {
        if (attempt<4 && !workers.isShutdown()) workers.schedule(() -> deliver(event,invalid,attempt+1),1L<<attempt,TimeUnit.SECONDS);
    }
    @PreDestroy public void close() { workers.shutdownNow(); }
}
