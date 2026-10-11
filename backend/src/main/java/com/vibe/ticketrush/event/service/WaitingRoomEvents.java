package com.vibe.ticketrush.event.service;

import java.time.Instant;
import java.util.*;

public interface WaitingRoomEvents {
    record Settings(UUID id, boolean enabled, int rate, String mode, Instant saleStart, Instant saleEnd, boolean published) {}
    Settings settings(UUID event);
    List<UUID> enabledEvents();
    Settings configure(UUID event, boolean enabled, int rate, String mode);
}
