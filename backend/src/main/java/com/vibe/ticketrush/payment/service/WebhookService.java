package com.vibe.ticketrush.payment.service;

import com.vibe.ticketrush.payment.repository.PaymentRepository;
import com.vibe.ticketrush.payment.domain.PaymentStatus;
import com.vibe.ticketrush.payment.dto.PaymentEvent;
import com.vibe.ticketrush.order.service.PaymentOrderOperations;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;

@Service
public class WebhookService {
    private final PaymentRepository payments;
    private final PaymentOrderOperations orders;
    private final Clock clock;
    public WebhookService(PaymentRepository payments,PaymentOrderOperations orders,Clock clock) { this.payments=payments; this.orders=orders; this.clock=clock; }
    @Transactional(timeout=15)
    public void process(PaymentEvent event,String raw) {
        var payment=payments.byReference(event.providerPaymentId());
        if (!payments.event(payment,event,raw,clock.instant())) return;
        orders.lock(payment.orderId());
        payment=payments.byReference(event.providerPaymentId());
        if (!orders.matches(payment.orderId(),event.amount(),event.currency())) {
            payments.markReview(event.providerEventId());
            orders.mismatch(payment.orderId());
            payments.transition(payment.id(),PaymentStatus.INITIATED,PaymentStatus.FAILED,clock.instant());
            return;
        }
        switch(event.type()) {
            case SUCCEEDED -> {
                if (payments.transition(payment.id(),PaymentStatus.INITIATED,PaymentStatus.SUCCEEDED,clock.instant())) orders.succeeded(payment.orderId());
            }
            case FAILED -> {
                if (payments.transition(payment.id(),PaymentStatus.INITIATED,PaymentStatus.FAILED,clock.instant())) orders.failed(payment.orderId());
            }
            case REFUNDED -> {
                if (payment.status()==PaymentStatus.REFUNDED) return;
                if (!payments.transition(payment.id(),PaymentStatus.SUCCEEDED,PaymentStatus.REFUNDED,clock.instant()))
                    throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"UNEXPECTED_REFUND","Successful payment required");
                orders.refunded(payment.orderId());
            }
        }
    }
}
