package com.vibe.ticketrush.order;

import com.fasterxml.jackson.databind.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.sql.Timestamp;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "ticketrush.payment.webhook-url=http://127.0.0.1:0/api/v1/payments/webhook",
    "ticketrush.payment.delay=100ms","ticketrush.payment.delayed-success-delay=3s",
    "ticketrush.payment.test-scenarios-enabled=true","ticketrush.reservation.expiry-enabled=false"})
@ActiveProfiles("test")
@Testcontainers
@org.springframework.test.annotation.DirtiesContext(classMode=org.springframework.test.annotation.DirtiesContext.ClassMode.AFTER_CLASS)
class MockGatewayIntegrationTest {
    static final String SECRET=UUID.randomUUID()+"-"+UUID.randomUUID();
    static final String TOKEN=UUID.randomUUID().toString();
    static final String PASSWORD=UUID.randomUUID().toString();
    @Container static final PostgreSQLContainer<?> POSTGRES=new PostgreSQLContainer<>("postgres:17-alpine");
    @Container static final GenericContainer<?> REDIS=new GenericContainer<>("redis:7.4-alpine")
        .withExposedPorts(6379).withCommand("redis-server","--requirepass",SECRET);
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",POSTGRES::getJdbcUrl);r.add("spring.datasource.username",POSTGRES::getUsername);r.add("spring.datasource.password",POSTGRES::getPassword);
        r.add("app.auth.jwt-secret",() -> Base64.getEncoder().encodeToString(SECRET.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        r.add("ticketrush.payment.webhook-secret",() -> SECRET);r.add("ticketrush.payment.test-token",() -> TOKEN);
        r.add("spring.data.redis.host",REDIS::getHost);r.add("spring.data.redis.port",() -> REDIS.getMappedPort(6379));r.add("spring.data.redis.password",() -> SECRET);
        r.add("spring.rabbitmq.password",() -> "unused");
    }
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired com.vibe.ticketrush.payment.service.PaymentService payments;
    @LocalServerPort int port;
    final HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    JsonNode call(String method,String path,Object payload,String token,Map<String,String> headers,int expected) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+path)).timeout(Duration.ofSeconds(15));
        if(token!=null)builder.header("Authorization","Bearer "+token);
        headers.forEach(builder::header);
        if(payload!=null)builder.header("Content-Type","application/json");
        var response=client.send(builder.method(method,payload==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build(),HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(expected);
        return response.body().isBlank()?json.nullNode():json.readTree(response.body());
    }
    @Test void fullPurchaseWithRealMockHttpAllScenarios() throws Exception {
        for(String scenario:List.of("SUCCESS","FAILURE","DUPLICATE_WEBHOOK","OUT_OF_ORDER","DELAYED_SUCCESS","INVALID_SIGNATURE","AMOUNT_MISMATCH")) {
            var credentials=Map.of("email",UUID.randomUUID()+"@example.com","password",PASSWORD);
            UUID user=UUID.fromString(call("POST","/api/v1/auth/register",credentials,null,Map.of(),201).path("id").asText());
            String jwt=call("POST","/api/v1/auth/login",credentials,null,Map.of(),200).path("accessToken").asText();
            UUID event=UUID.randomUUID(),tier=UUID.randomUUID();Instant now=Instant.now();
            jdbc.update("""
                INSERT INTO events(id,title,venue_name,venue_address,start_time,end_time,sale_start_time,sale_end_time,status,created_by)
                VALUES (?,'Mock Concert','Hall','City',?,?,?,?,'PUBLISHED',?)
                """,event,Timestamp.from(now.plusSeconds(86400)),Timestamp.from(now.plusSeconds(90000)),Timestamp.from(now.minusSeconds(60)),Timestamp.from(now.plusSeconds(7200)),user);
            jdbc.update("INSERT INTO ticket_tiers(id,event_id,name,price,currency,total_quantity,available_quantity,max_per_order) VALUES (?,?,'VIP',100,'USD',10,10,4)",tier,event);
            String hold=call("POST","/api/v1/reservations",Map.of("tierId",tier,"quantity",2),jwt,Map.of(),201).path("id").asText();
            if(scenario.equals("DELAYED_SUCCESS")) jdbc.update("UPDATE reservations SET expires_at=? WHERE id=?",Timestamp.from(Instant.now().plusSeconds(2)),UUID.fromString(hold));
            String order=call("POST","/api/v1/orders",Map.of("reservationId",hold),jwt,
                Map.of("Idempotency-Key",UUID.randomUUID().toString(),"X-Mock-Scenario",scenario,"X-Mock-Test-Token",TOKEN),201).path("id").asText();
            String expected=switch(scenario) {case "FAILURE","AMOUNT_MISMATCH" -> "PAYMENT_FAILED";case "INVALID_SIGNATURE" -> "PENDING_PAYMENT";default -> "PAID";};
            long deadline=System.nanoTime()+Duration.ofSeconds(15).toNanos();
            JsonNode current;
            do {
                Thread.sleep(100);current=call("GET","/api/v1/orders/"+order,null,jwt,Map.of(),200);
            } while(!current.path("status").asText().equals(expected) && System.nanoTime()<deadline);
            assertThat(current.path("status").asText()).as(scenario).isEqualTo(expected);
            if(expected.equals("PAID")) assertThat(call("GET","/api/v1/orders/"+order+"/tickets",null,jwt,Map.of(),200).size()).isEqualTo(2);
            if(scenario.equals("DUPLICATE_WEBHOOK")) {
                Thread.sleep(500);
                assertThat(jdbc.queryForObject("SELECT count(*) FROM payment_events e JOIN payments p ON p.id=e.payment_id WHERE p.order_id=?",Long.class,UUID.fromString(order))).isEqualTo(1);
            }
            if(scenario.equals("OUT_OF_ORDER")) {
                Thread.sleep(1400);
                assertThat(call("GET","/api/v1/orders/"+order,null,jwt,Map.of(),200).path("status").asText()).isEqualTo("PAID");
            }
            if(scenario.equals("SUCCESS")) {
                jdbc.update("INSERT INTO user_roles(user_id,role_id) VALUES (?,2)",user);
                String admin=call("POST","/api/v1/auth/login",credentials,null,Map.of(),200).path("accessToken").asText();
                call("POST","/api/v1/admin/orders/"+order+"/refund",null,admin,Map.of(),200);
                deadline=System.nanoTime()+Duration.ofSeconds(10).toNanos();
                do { Thread.sleep(100);current=call("GET","/api/v1/orders/"+order,null,jwt,Map.of(),200); }
                while(!current.path("status").asText().equals("REFUNDED") && System.nanoTime()<deadline);
                assertThat(current.path("status").asText()).isEqualTo("REFUNDED");
            }
            if(scenario.equals("INVALID_SIGNATURE")) {
                Thread.sleep(300);
                assertThat(jdbc.queryForObject("SELECT count(*) FROM payment_events e JOIN payments p ON p.id=e.payment_id WHERE p.order_id=?",Long.class,UUID.fromString(order))).isZero();
                // Recover durable INITIATED work after a failed delivery, using the real gateway again.
                jdbc.update("UPDATE payments SET scenario='SUCCESS',next_dispatch_at=? WHERE order_id=?",Timestamp.from(Instant.now().minusSeconds(1)),UUID.fromString(order));
                payments.recoverDispatch();deadline=System.nanoTime()+Duration.ofSeconds(10).toNanos();
                do { Thread.sleep(100);current=call("GET","/api/v1/orders/"+order,null,jwt,Map.of(),200); }
                while(!current.path("status").asText().equals("PAID") && System.nanoTime()<deadline);
                assertThat(current.path("status").asText()).isEqualTo("PAID");
            }
        }
        var spec=call("GET","/v3/api-docs",null,null,Map.of(),200);
        for(String path:List.of("/orders","/orders/me","/orders/{id}","/orders/{id}/cancel","/orders/{id}/tickets","/payments/webhook","/admin/orders","/admin/orders/{id}/refund"))
            assertThat(spec.path("paths").has("/api/v1"+path)).isTrue();
        assertThat(spec.path("components").path("schemas").path("OrderView").path("properties").has("totalAmount")).isTrue();
        assertThat(spec.path("components").path("schemas").path("OrderCreate").path("properties").has("reservationId")).isTrue();
    }
}
