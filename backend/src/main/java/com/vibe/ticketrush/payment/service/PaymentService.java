package com.vibe.ticketrush.payment.service;

import com.vibe.ticketrush.payment.domain.*;
import com.vibe.ticketrush.payment.repository.PaymentRepository;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.UUID;

@Service
public class PaymentService implements PaymentOperations {
    private final PaymentRepository payments;
    private final PaymentGateway gateway;
    private final PaymentProperties properties;
    private final Environment environment;
    private final Clock clock;
    private final TransactionTemplate tx;
    public PaymentService(PaymentRepository payments,PaymentGateway gateway,PaymentProperties properties,Environment environment,
            Clock clock,PlatformTransactionManager manager) {
        this.payments=payments; this.gateway=gateway; this.properties=properties; this.environment=environment; this.clock=clock;
        this.tx=new TransactionTemplate(manager);
    }
    public PaymentScenario scenario(String requested,String token) {
        if (requested==null) return PaymentScenario.SUCCESS;
        if (environment.matchesProfiles("prod") || !properties.testScenariosEnabled() || properties.testToken().isBlank()
                || token==null || !MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),properties.testToken().getBytes(StandardCharsets.UTF_8)))
            throw new ApiException(HttpStatus.FORBIDDEN,"MOCK_SCENARIOS_DISABLED","Mock scenarios require a development test token");
        try { return PaymentScenario.valueOf(requested); }
        catch (IllegalArgumentException e) { throw new ApiException(HttpStatus.BAD_REQUEST,"UNKNOWN_SCENARIO","Unknown mock scenario"); }
    }
    @Transactional(propagation=Propagation.MANDATORY)
    public String initiate(UUID order,long amount,String currency,PaymentScenario scenario) {
        if (properties.webhookSecret().length()<32)
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PAYMENT_NOT_CONFIGURED","Payment webhook secret is not configured");
        String reference=gateway.createPayment(order,amount,currency,scenario);
        payments.create(order,reference,amount,currency,scenario,clock.instant());
        return reference;
    }
    public String reference(UUID order) { return payments.byOrder(order).reference(); }
    public boolean succeeded(UUID order) { return payments.byOrder(order).status()==PaymentStatus.SUCCEEDED; }
    @Transactional(propagation=Propagation.MANDATORY)
    public void refund(UUID order) {
        var payment=payments.byOrder(order);
        gateway.refund(payment.reference(),payment.amount(),payment.currency());
    }
    @Scheduled(fixedDelayString="${ticketrush.payment.dispatch-interval:10s}")
    public void recoverDispatch() {
        var due=tx.execute(s -> payments.due(clock.instant()));
        if (due==null) return;
        for (var payment:due) {
            if (payment.status()==PaymentStatus.SUCCEEDED) gateway.refund(payment.reference(),payment.amount(),payment.currency());
            else gateway.createPayment(payment.orderId(),payment.amount(),payment.currency(),payment.scenario());
        }
    }
}
