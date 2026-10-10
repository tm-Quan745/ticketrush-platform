package com.vibe.ticketrush.reservation.repository;
import com.vibe.ticketrush.reservation.domain.*;
import java.time.Instant;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
public interface ReservationRepository extends JpaRepository<Reservation, UUID> {
    @Modifying(flushAutomatically=true,clearAutomatically=true)
    @Query(value="UPDATE reservations SET status='CONFIRMED',updated_at=:now,version=version+1 WHERE id=:id AND status IN ('EXPIRED','CANCELLED')",nativeQuery=true)
    int confirmReleased(UUID id,Instant now);
    @Modifying(flushAutomatically=true,clearAutomatically=true)
    @Query(value="UPDATE reservations SET status='CANCELLED',updated_at=:now,version=version+1 WHERE id=:id AND status='CONFIRMED'",nativeQuery=true)
    int cancelConfirmed(UUID id,Instant now);
    boolean existsByUserIdAndTierIdAndStatus(UUID userId, UUID tierId, ReservationStatus status);
    @Query(value="SELECT * FROM reservations WHERE id=:id FOR UPDATE", nativeQuery=true)
    Optional<Reservation> lock(UUID id);
    @Modifying(flushAutomatically=true, clearAutomatically=true)
    @Query(value="UPDATE reservations SET status=:next, updated_at=:now, version=version+1 WHERE id=:id AND status='HELD'", nativeQuery=true)
    int transition(UUID id, String next, Instant now);
    @Query(value="SELECT * FROM reservations WHERE status='HELD' AND expires_at<:now ORDER BY expires_at,id LIMIT :batch FOR UPDATE SKIP LOCKED", nativeQuery=true)
    List<Reservation> expiredBatch(Instant now, int batch);
    @Query(value="SELECT * FROM reservations WHERE user_id=:userId AND status='HELD' AND expires_at<:now ORDER BY id FOR UPDATE", nativeQuery=true)
    List<Reservation> expiredForUser(UUID userId, Instant now);
    @Query("select r from Reservation r where r.userId=:userId and (:status is null or r.status=:status)")
    Page<Reservation> mine(UUID userId, ReservationStatus status, Pageable pageable);
}
