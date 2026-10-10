package com.vibe.ticketrush.outbox.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibe.ticketrush.common.service.CorrelationId;
import com.vibe.ticketrush.outbox.domain.*;
import com.vibe.ticketrush.outbox.repository.OutboxRepository;
import java.time.Clock;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OutboxPublisher {
    private final OutboxRepository events; private final ObjectMapper json; private final Clock clock;
    public OutboxPublisher(OutboxRepository events,ObjectMapper json,Clock clock) { this.events=events; this.json=json; this.clock=clock; }
    @Transactional(propagation=Propagation.MANDATORY)
    public UUID publish(String type,String aggregateType,UUID aggregateId,Object payload) {
        try {
            UUID id=UUID.randomUUID(); var now=clock.instant();
            String headers=json.writeValueAsString(java.util.Map.of("correlation_id",CorrelationId.current()));
            events.insert(new OutboxEvent(id,aggregateType,aggregateId,type,1,json.writeValueAsString(payload),headers,OutboxStatus.PENDING,0,now,now));
            return id;
        } catch (JsonProcessingException error) { throw new IllegalStateException("Cannot serialize outbox event",error); }
    }
}
