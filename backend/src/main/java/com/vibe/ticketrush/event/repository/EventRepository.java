package com.vibe.ticketrush.event.repository;
import com.vibe.ticketrush.event.domain.Event;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import java.util.*;
public interface EventRepository extends JpaRepository<Event, UUID>, JpaSpecificationExecutor<Event> {
    @Query("select e.id from Event e where e.waitingRoomEnabled=true and e.status=com.vibe.ticketrush.event.domain.EventStatus.PUBLISHED")
    java.util.List<UUID> waitingRoomEvents();
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from Event e where e.id = :id")
    Optional<Event> lockById(UUID id);
}
