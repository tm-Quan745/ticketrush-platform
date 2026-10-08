package com.vibe.ticketrush.event.service;
import com.vibe.ticketrush.event.domain.EventStatus;
import java.time.Instant;
import java.util.UUID;
/** Module boundary. Lock remains held until the caller's transaction completes. */
public interface EventAccess {
    record SaleState(EventStatus status, Instant saleStartTime) {
        public boolean saleStarted(Instant now) {
            return status == EventStatus.PUBLISHED && !now.isBefore(saleStartTime);
        }
    }
    SaleState lockForTierChange(UUID id);
    void requireExists(UUID id);
}
