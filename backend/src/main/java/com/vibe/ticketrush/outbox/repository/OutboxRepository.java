package com.vibe.ticketrush.outbox.repository;

import com.vibe.ticketrush.outbox.domain.*;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class OutboxRepository {
    private final JdbcTemplate jdbc;
    public OutboxRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public void insert(OutboxEvent event) {
        jdbc.update("""
            INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,schema_version,payload,headers,status,attempts,next_attempt_at,created_at)
            VALUES (?,?,?,?,?,CAST(? AS jsonb),CAST(? AS jsonb),?,?,?,?,?)""",
            event.id(),event.aggregateType(),event.aggregateId(),event.eventType(),event.schemaVersion(),event.payload(),event.headers(),
            event.status().name(),event.attempts(),Timestamp.from(event.nextAttemptAt()),Timestamp.from(event.createdAt()));
    }
    public List<OutboxEvent> lockReady(Instant now, int batchSize) {
        return jdbc.query("""
            SELECT e.* FROM outbox_events e
            WHERE e.status='PENDING' AND e.next_attempt_at<=?
              AND NOT EXISTS (SELECT 1 FROM outbox_events earlier WHERE earlier.aggregate_type=e.aggregate_type
                AND earlier.aggregate_id=e.aggregate_id AND earlier.status<>'PUBLISHED'
                AND (earlier.created_at<e.created_at OR (earlier.created_at=e.created_at AND earlier.id<e.id)))
            ORDER BY e.created_at,e.id LIMIT ? FOR UPDATE SKIP LOCKED
            """, (rs,n) -> new OutboxEvent(rs.getObject("id",UUID.class),rs.getString("aggregate_type"),rs.getObject("aggregate_id",UUID.class),
                rs.getString("event_type"),rs.getInt("schema_version"),rs.getString("payload"),rs.getString("headers"),
                OutboxStatus.valueOf(rs.getString("status")),rs.getInt("attempts"),rs.getTimestamp("next_attempt_at").toInstant(),rs.getTimestamp("created_at").toInstant()),
            Timestamp.from(now),batchSize);
    }
    public void published(UUID id, Instant now) { jdbc.update("UPDATE outbox_events SET status='PUBLISHED',published_at=?,last_error=NULL WHERE id=? AND status='PENDING'",Timestamp.from(now),id); }
    public void failedAttempt(UUID id,int attempts,Instant next,String error,boolean terminal) {
        jdbc.update("UPDATE outbox_events SET status=?,attempts=?,next_attempt_at=?,last_error=? WHERE id=? AND status='PENDING'",
            terminal ? "FAILED" : "PENDING",attempts,Timestamp.from(next),error.length()>2000?error.substring(0,2000):error,id);
    }
    public long pendingCount() { return jdbc.queryForObject("SELECT count(*) FROM outbox_events WHERE status='PENDING'",Long.class); }
    public Long oldestPendingAgeSeconds(Instant now) { return jdbc.queryForObject("SELECT EXTRACT(EPOCH FROM (? - min(created_at)))::bigint FROM outbox_events WHERE status='PENDING'",Long.class,Timestamp.from(now)); }
    public List<OutboxEvent> list(OutboxStatus status,int page,int size) {
        return jdbc.query("SELECT * FROM outbox_events WHERE status=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",(rs,n) -> new OutboxEvent(rs.getObject("id",UUID.class),rs.getString("aggregate_type"),rs.getObject("aggregate_id",UUID.class),rs.getString("event_type"),rs.getInt("schema_version"),rs.getString("payload"),rs.getString("headers"),OutboxStatus.valueOf(rs.getString("status")),rs.getInt("attempts"),rs.getTimestamp("next_attempt_at").toInstant(),rs.getTimestamp("created_at").toInstant()),status.name(),size,(long)page*size);
    }
    public boolean retry(UUID id,Instant now) { return jdbc.update("UPDATE outbox_events SET status='PENDING',attempts=0,next_attempt_at=?,last_error=NULL WHERE id=? AND status='FAILED'",Timestamp.from(now),id)==1; }
    public int cleanup(Instant cutoff) { return jdbc.update("DELETE FROM outbox_events WHERE status='PUBLISHED' AND published_at<?",Timestamp.from(cutoff)); }
}
