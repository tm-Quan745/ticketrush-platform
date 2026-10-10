package com.vibe.ticketrush.notification.service;

import com.vibe.ticketrush.auth.service.UserDirectory;
import com.vibe.ticketrush.common.events.EventEnvelope;
import com.vibe.ticketrush.notification.repository.NotificationRepository;
import com.vibe.ticketrush.order.service.OrderEmailQuery;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.util.UUID;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

@Service
public class EmailNotificationService {
    private static final String CONSUMER="notification.email";
    private final NotificationRepository notifications; private final UserDirectory users; private final OrderEmailQuery orders; private final JavaMailSender mail; private final Clock clock; private final io.micrometer.core.instrument.Counter sent;
    public EmailNotificationService(NotificationRepository notifications,UserDirectory users,OrderEmailQuery orders,JavaMailSender mail,Clock clock,MeterRegistry meters) { this.notifications=notifications;this.users=users;this.orders=orders;this.mail=mail;this.clock=clock;sent=meters.counter("email_sent_total","result","sent"); }
    @Transactional
    public boolean process(EventEnvelope event) {
        if (!notifications.markProcessing(CONSUMER,event.eventId(),clock.instant())) return false;
        if (!supports(event.eventType())) return true;
        UUID userId=parseUuid(event,"userId"); UUID orderId=parseUuid(event,"orderId");
        String address;
        try { address=users.emailOf(userId); } catch (RuntimeException e) { throw new NonRetryableNotificationException("Unknown user",e); }
        if (!notifications.create(event.eventId(),event.eventType(),userId,address,clock.instant())) return false;
        var order=orders.emailOrder(orderId);
        try {
            var message=mail.createMimeMessage(); var helper=new MimeMessageHelper(message,true,"UTF-8");
            helper.setTo(address); helper.setSubject(subject(event.eventType())); String html=html(event.eventType(),order); helper.setText(text(event.eventType(),order),html);
            mail.send(message); notifications.sent(event.eventId(),event.eventType(),clock.instant()); sent.increment(); return true;
        } catch (MailException | jakarta.mail.MessagingException e) { throw new RetryableNotificationException("SMTP delivery failed",e); }
    }
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void recordFailure(EventEnvelope event,Exception error) {
        UUID userId=parseUuid(event,"userId");
        notifications.failed(event.eventId(),event.eventType(),userId,users.emailOf(userId),error.toString(),clock.instant());
    }
    private static boolean supports(String type) { return type.equals("order.paid")||type.equals("order.payment_failed")||type.equals("order.expired")||type.equals("order.refunded"); }
    private static UUID parseUuid(EventEnvelope event,String field) { try { return UUID.fromString(event.payload().path(field).asText()); } catch (IllegalArgumentException e) { throw new NonRetryableNotificationException("Malformed event payload",e); } }
    private static String subject(String type) { return switch(type) { case "order.paid" -> "Your TicketRush order is confirmed"; case "order.payment_failed" -> "TicketRush payment failed"; case "order.expired" -> "Your TicketRush order expired"; default -> "Your TicketRush refund is complete"; }; }
    private static String html(String type,OrderEmailQuery.EmailOrder order) { String body=switch(type) { case "order.paid" -> "Your order is confirmed. Ticket codes: "+String.join(", ",order.ticketCodes())+". QR code: available in your tickets."; case "order.payment_failed" -> "Your payment failed. Please place a new order."; case "order.expired" -> "Your order expired before payment was completed."; default -> "Your refund has been completed."; }; return "<html><body><p>"+escape(body)+"</p></body></html>"; }
    private static String text(String type,OrderEmailQuery.EmailOrder order) { return switch(type) { case "order.paid" -> "Your order is confirmed. Ticket codes: "+String.join(", ",order.ticketCodes()); case "order.payment_failed" -> "Your payment failed."; case "order.expired" -> "Your order expired."; default -> "Your refund has been completed."; }; }
    private static String escape(String value) { return value.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&#39;"); }
}
