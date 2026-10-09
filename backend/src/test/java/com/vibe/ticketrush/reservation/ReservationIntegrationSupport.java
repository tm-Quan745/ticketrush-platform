package com.vibe.ticketrush.reservation;

import com.vibe.ticketrush.reservation.service.*;
import com.vibe.ticketrush.reservation.domain.*;
import com.vibe.ticketrush.inventory.service.InventoryReconciliationService;
import com.vibe.ticketrush.common.service.ApiException;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.*;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.IntFunction;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

abstract class ReservationIntegrationSupport extends ReservationTestFixture {
    @Test @Tag("concurrency") void twoHundredUsersForFiftyTickets() throws Exception {
        List<UUID> users=new ArrayList<>();for(int i=0;i<200;i++)users.add(addUser());
        var outcomes=concurrent(200,i -> reserve(users.get(i),tier,1));
        assertThat(outcomes.stream().filter("OK"::equals).count()).isEqualTo(50);
        assertThat(outcomes.stream().filter("SOLD_OUT"::equals).count()).isEqualTo(150);
        assertThat(jdbc.queryForObject("SELECT available_quantity FROM ticket_tiers WHERE id=?",Integer.class,tier)).isZero();
        invariant();
    }
    @Test @Tag("concurrency") void mixedQuantities() throws Exception {
        jdbc.update("UPDATE ticket_tiers SET total_quantity=120,available_quantity=120 WHERE id=?",tier);
        List<UUID> users=new ArrayList<>();for(int i=0;i<100;i++)users.add(addUser());
        var outcomes=concurrent(100,i -> reserve(users.get(i),tier,1+i%4));
        assertThat(outcomes).allMatch(s -> s.equals("OK") || s.equals("SOLD_OUT"));invariant();
    }
    @Test @Tag("concurrency") void oneHoldPerUserAndTier() throws Exception {
        var outcomes=concurrent(20,i -> reserve(user,tier,1));
        assertThat(outcomes.stream().filter("OK"::equals).count()).isEqualTo(1);
        assertThat(outcomes.stream().filter("ALREADY_HELD"::equals).count()).isEqualTo(19);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reservations WHERE status='HELD'",Long.class)).isEqualTo(1);invariant();
    }
    @Test @Tag("concurrency") void fourExpiryWorkersReleaseExactlyOnce() throws Exception {
        for(int i=0;i<30;i++)service.create(addUser(),tier,1);
        clock.advance(601);
        var released=concurrent(4,i -> {
            int total=0, batch;
            while ((batch=transactions.expireBatch())>0) total+=batch;
            return total;
        });
        assertThat(released.stream().mapToInt(Integer::intValue).sum()).isEqualTo(30);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM reservations WHERE status='EXPIRED'",Long.class)).isEqualTo(30);
        assertThat(transactions.expireBatch()).isZero();assertAvailable(50);invariant();
    }
    @Test @Tag("concurrency") void cancelRacesExpiry() throws Exception {
        var r=service.create(user,tier,4);clock.advance(601);
        concurrent(2,i -> i==0 ? transactions.cancel(user,r.id()) : transactions.expireBatch());
        assertAvailable(50);invariant();
    }
    @Test void lazyExpiryCannotConfirmAndAllowsNewHold() {
        var r=service.create(user,tier,4);clock.advance(601);
        assertThat(transactions.confirm(r.id())).isFalse();
        assertThat(transactions.get(user,r.id()).status()).isEqualTo(ReservationStatus.EXPIRED);
        assertAvailable(50);
        var next=service.create(user,tier,1);
        assertThat(next.status()).isEqualTo(ReservationStatus.HELD);invariant();
    }
    @Test void readAndListingApplyLazyExpiryBeforeStatusFilter() {
        var r=service.create(user,tier,2);clock.advance(601);
        assertThat(transactions.mine(user,ReservationStatus.HELD,0,20).totalElements()).isZero();
        assertThat(transactions.get(user,r.id()).status()).isEqualTo(ReservationStatus.EXPIRED);
        assertAvailable(50);invariant();
    }
    @Test void transitionsAndRollback() {
        var r=service.create(user,tier,2);
        assertThat(transactions.confirm(r.id())).isTrue();
        assertThat(transactions.confirm(r.id())).isFalse();assertThat(transactions.cancel(user,r.id())).isFalse();
        clock.advance(601);assertThat(transactions.expireBatch()).isZero();assertAvailable(48);invariant();
        var cancelled=service.create(user,tier,1);assertThat(transactions.cancel(user,cancelled.id())).isTrue();
        assertThat(transactions.cancel(user,cancelled.id())).isFalse();assertThat(transactions.confirm(cancelled.id())).isFalse();invariant();
        assertThat(reserve(user,tier,5)).isEqualTo("INVALID_QUANTITY");assertAvailable(48);invariant();
    }
    @Test void saleWindowAndQuantityRules() {
        assertThat(reserve(user,tier,0)).isEqualTo("INVALID_QUANTITY");
        jdbc.update("UPDATE events SET status='DRAFT' WHERE id=?",event);
        assertThat(reserve(user,tier,1)).isEqualTo("SALE_NOT_OPEN");
        jdbc.update("UPDATE events SET status='PUBLISHED',sale_start_time=? WHERE id=?",ts(1),event);
        assertThat(reserve(user,tier,1)).isEqualTo("SALE_NOT_OPEN");
        clock.advance(1);var r=service.create(user,tier,1);assertThat(transactions.cancel(user,r.id())).isTrue();
        clock.advance(7199);r=service.create(user,tier,1);assertThat(transactions.cancel(user,r.id())).isTrue();
        clock.advance(1);assertThat(reserve(user,tier,1)).isEqualTo("SALE_NOT_OPEN");invariant();
    }
    @Test void httpAuthorizationAndOwnerFlow() throws Exception {
        var auth=jwt().jwt(j -> j.subject(user.toString())).authorities(new SimpleGrantedAuthority("ROLE_USER"));
        http.perform(post("/api/v1/reservations").contentType("application/json").content("{\"tierId\":\""+tier+"\",\"quantity\":1}"))
            .andExpect(status().isUnauthorized());
        http.perform(post("/api/v1/reservations").with(auth).contentType("application/json").content("{\"tierId\":\""+tier+"\",\"quantity\":0}"))
            .andExpect(status().isBadRequest());
        var response=http.perform(post("/api/v1/reservations").with(auth).contentType("application/json")
            .content("{\"tierId\":\""+tier+"\",\"quantity\":2}")).andExpect(status().isCreated()).andReturn();
        UUID id=UUID.fromString(new com.fasterxml.jackson.databind.ObjectMapper().readTree(response.getResponse().getContentAsString()).path("id").asText());
        http.perform(get("/api/v1/reservations/me").with(auth)).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].id").value(id.toString()));
        http.perform(get("/api/v1/reservations/"+id).with(jwt().jwt(j -> j.subject(addUser().toString())).authorities(new SimpleGrantedAuthority("ROLE_USER"))))
            .andExpect(status().isForbidden());
        http.perform(get("/api/v1/reservations/"+UUID.randomUUID()).with(auth)).andExpect(status().isNotFound());
        http.perform(get("/api/v1/admin/events/"+event+"/inventory/reconcile").with(auth)).andExpect(status().isForbidden());
        http.perform(get("/api/v1/admin/events/"+event+"/inventory/reconcile").with(jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
            .andExpect(status().isOk()).andExpect(content().json("[]"));
        http.perform(delete("/api/v1/reservations/"+id).with(auth)).andExpect(status().isNoContent());
        http.perform(delete("/api/v1/reservations/"+id).with(auth)).andExpect(status().isConflict());assertAvailable(50);invariant();
    }
    @Test void failedInsertRollsBackInventoryDecrement() {
        assertThatThrownBy(() -> service.create(UUID.randomUUID(),tier,3))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        assertAvailable(50);invariant();
    }
    @Test @Tag("concurrency") void confirmRacesExpiry() throws Exception {
        var r=service.create(user,tier,3);clock.advance(601);
        var outcomes=concurrent(2,i -> i==0 ? transactions.confirm(r.id()) : transactions.expireBatch());
        assertThat(outcomes.get(0)).isEqualTo(false);assertAvailable(50);invariant();
    }
    @Test void reconciliationReportsCorruption() {
        jdbc.update("UPDATE ticket_tiers SET available_quantity=49 WHERE id=?",tier);
        assertThat(reconciliation.reconcile(event)).hasSize(1);
    }
}
