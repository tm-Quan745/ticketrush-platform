package com.vibe.ticketrush.order.service;

import com.vibe.ticketrush.order.dto.GateDtos.Ticket;
import com.vibe.ticketrush.order.repository.GateRepository;
import com.vibe.ticketrush.common.service.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.util.UUID;

@Service
public class GateService {
    private final GateRepository tickets;
    private final Clock clock;
    public GateService(GateRepository tickets, Clock clock) { this.tickets = tickets; this.clock = clock; }
    @Transactional(readOnly = true)
    public Ticket verify(String code) { return tickets.find(code); }
    @Transactional
    public Ticket checkIn(String code, UUID staff) {
        // Serialize with refunds, then let the conditional update choose exactly one winner.
        if (!tickets.lockOrder(code).equals("PAID") || !tickets.use(code, staff, clock.instant())) {
            throw new ApiException(HttpStatus.CONFLICT, "TICKET_NOT_USABLE", "Ticket already used or no longer valid");
        }
        return tickets.find(code);
    }
}
