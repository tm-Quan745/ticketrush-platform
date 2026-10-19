package com.vibe.ticketrush.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibe.ticketrush.common.events.EventEnvelope;
import com.vibe.ticketrush.notification.service.EmailNotificationService;
import com.vibe.ticketrush.order.service.OrderService;
import com.vibe.ticketrush.outbox.service.OutboxRelay;
import com.vibe.ticketrush.payment.domain.PaymentScenario;
import com.vibe.ticketrush.payment.dto.PaymentEvent;
import com.vibe.ticketrush.payment.service.WebhookService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.utility.DockerImageName;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;

@TestPropertySource(properties={"ticketrush.payment.delay=24h", "ticketrush.payment.dispatch-interval=24h",
    "ticketrush.outbox.relay-interval=24h", "ticketrush.notification.concurrency=4"})
class OutboxDeliveryIntegrationTest extends ReservationTestFixture {
    private static final String BROKER_PASSWORD=UUID.randomUUID().toString();
    static { rabbitPassword=() -> BROKER_PASSWORD; }
    @Container static final RabbitMQContainer RABBIT=new RabbitMQContainer("rabbitmq:4.1-management-alpine")
        .withAdminUser("testuser").withAdminPassword(BROKER_PASSWORD);
    @Container static final GenericContainer<?> REDIS=new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine"))
        .withExposedPorts(6379);
    @Container static final GenericContainer<?> MAILPIT=new GenericContainer<>(DockerImageName.parse("axllent/mailpit:v1.26"))
        .withExposedPorts(1025,8025);
    @DynamicPropertySource static void services(DynamicPropertyRegistry r) {
        r.add("spring.rabbitmq.host",RABBIT::getHost);
        r.add("spring.rabbitmq.port",RABBIT::getAmqpPort);
        r.add("spring.rabbitmq.username",RABBIT::getAdminUsername);
        r.add("spring.rabbitmq.password",RABBIT::getAdminPassword);
        r.add("spring.data.redis.host",REDIS::getHost);
        r.add("spring.data.redis.port",() -> REDIS.getMappedPort(6379));
        r.add("spring.data.redis.password",() -> "");
        r.add("spring.mail.host",MAILPIT::getHost);
        r.add("spring.mail.port",() -> MAILPIT.getMappedPort(1025));
        String secret=UUID.randomUUID().toString()+UUID.randomUUID();
        r.add("ticketrush.payment.webhook-secret",() -> secret);
    }
    @Autowired OrderService orders;
    @Autowired WebhookService webhooks;
    @Autowired OutboxRelay relay;
    @Autowired EmailNotificationService notifications;
    @Autowired ObjectMapper json;

    @Test void everyPurchaseEventRoutesAndConcurrentDuplicateDeliverySendsOneEmail() throws Exception {
        var hold=service.create(user,tier,1);
        var response=orders.create(user,hold.id(),UUID.randomUUID(),PaymentScenario.SUCCESS);
        UUID order=UUID.fromString(json.readTree(response.body()).path("id").asText());
        webhooks.process(new PaymentEvent(UUID.randomUUID().toString(),"mock_"+order,
            PaymentEvent.Type.SUCCEEDED,100,"USD"),"{}");
        UUID eventId=jdbc.queryForObject("SELECT id FROM outbox_events WHERE aggregate_id=? AND event_type='order.paid'",UUID.class,order);
        var envelope=new EventEnvelope(eventId,"order.paid",1,"order",order,clock.instant(),"test-delivery",
            json.valueToTree(Map.of("orderId",order,"userId",user)));

        // Exercise the actual consumer transaction concurrently before broker redelivery.
        assertThat(concurrent(8,i -> notifications.process(envelope))).filteredOn(Boolean::booleanValue).hasSize(1);
        await().atMost(Duration.ofSeconds(15)).pollInterval(Duration.ofMillis(100)).untilAsserted(() -> {
            relay.relay();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE status<>'PUBLISHED'",Integer.class)).isZero();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM processed_messages",Integer.class)).isEqualTo(4);
        });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE status='PUBLISHED'",Integer.class)).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM email_notifications WHERE status='SENT'",Integer.class)).isEqualTo(1);
        try (var client=HttpClient.newHttpClient()) {
            var request=HttpRequest.newBuilder(URI.create("http://"+MAILPIT.getHost()+":"+MAILPIT.getMappedPort(8025)+"/api/v1/messages"))
                .timeout(Duration.ofSeconds(5)).build();
            var mail=client.send(request,HttpResponse.BodyHandlers.ofString());
            assertThat(mail.statusCode()).isEqualTo(200);
            assertThat(json.readTree(mail.body()).path("total").asInt()).isEqualTo(1);
        }
        invariant();
    }
}
