package com.vibe.ticketrush.reservation;
import org.springframework.test.context.TestPropertySource;
@TestPropertySource(properties="ticketrush.reservation.strategy=optimistic")
class OptimisticReservationBenchmarkTest extends ReservationBenchmarkSupport {}
