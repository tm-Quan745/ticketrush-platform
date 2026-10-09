package com.vibe.ticketrush.reservation;
import com.vibe.ticketrush.reservation.domain.ReservationStatus;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
class ReservationStatusTest {
    @Test void onlyHeldMayTransitionToTerminalStatus() {
        for(var from:ReservationStatus.values()) for(var to:ReservationStatus.values())
            assertThat(from.canTransitionTo(to)).isEqualTo(from==ReservationStatus.HELD && to!=ReservationStatus.HELD);
        assertThat(ReservationStatus.HELD.canTransitionTo(null)).isFalse();
    }
}
