package com.vibe.ticketrush.reservation;
import org.springframework.test.context.TestPropertySource;
@TestPropertySource(properties={
    "ticketrush.reservation.strategy=conditional-update",
    "spring.datasource.hikari.connection-timeout=30000"})
class ConditionalReservationIntegrationTest extends ReservationIntegrationSupport {}
