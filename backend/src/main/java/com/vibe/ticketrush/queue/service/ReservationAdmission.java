package com.vibe.ticketrush.queue.service;

import java.util.UUID;

public interface ReservationAdmission {
    void requireAdmission(UUID tier,UUID user,String token);
}
