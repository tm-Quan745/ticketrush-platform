package com.vibe.ticketrush.common.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;

@Repository
public class IdempotencyRepository {
    private final JdbcTemplate jdbc;
    public IdempotencyRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Entry(UUID id,String hash,String status,Integer responseStatus,String body,Instant lease) {}
    public boolean insert(UUID id,UUID user,String endpoint,UUID key,String hash,Instant now) {
        return jdbc.update("""
            INSERT INTO idempotency_keys(id,user_id,endpoint,key,request_hash,status,created_at,expires_at,lease_until)
            VALUES (?,?,?,?,?,'IN_PROGRESS',?,?,?) ON CONFLICT(user_id,endpoint,key) DO NOTHING
            """,id,user,endpoint,key,hash,Timestamp.from(now),Timestamp.from(now.plusSeconds(86400)),Timestamp.from(now.plusSeconds(60)))==1;
    }
    public Entry find(UUID user,String endpoint,UUID key) {
        return jdbc.queryForObject("SELECT * FROM idempotency_keys WHERE user_id=? AND endpoint=? AND key=?",(rs,n) ->
                new Entry(rs.getObject("id",UUID.class),rs.getString("request_hash"),rs.getString("status"),
                    rs.getObject("response_status",Integer.class),rs.getString("response_body"),rs.getTimestamp("lease_until").toInstant()),user,endpoint,key);
    }
    public void recover(UUID id,Instant now) {
        jdbc.update("""
            DELETE FROM idempotency_keys WHERE id IN
            (SELECT id FROM idempotency_keys WHERE id=? AND
             ((status='IN_PROGRESS' AND lease_until<?) OR expires_at<?) FOR UPDATE SKIP LOCKED)
            """,id,Timestamp.from(now),Timestamp.from(now));
    }
    public void lock(UUID id) {
        if (jdbc.queryForList("SELECT id FROM idempotency_keys WHERE id=? AND status='IN_PROGRESS' FOR UPDATE",id).isEmpty())
            throw new com.vibe.ticketrush.common.service.ApiException(org.springframework.http.HttpStatus.CONFLICT,"IDEMPOTENCY_BUSY","Retry shortly");
    }
    public void complete(UUID id,int status,String body) {
        if (jdbc.update("UPDATE idempotency_keys SET status='COMPLETED',response_status=?,response_body=? WHERE id=? AND status='IN_PROGRESS'",status,body,id)!=1)
            throw new IllegalStateException("Idempotency lease lost");
    }
    public void abandon(UUID id) { jdbc.update("DELETE FROM idempotency_keys WHERE id=? AND status='IN_PROGRESS'",id); }
    public void cleanup(Instant now) {
        jdbc.update("DELETE FROM idempotency_keys WHERE id IN (SELECT id FROM idempotency_keys WHERE expires_at<? FOR UPDATE SKIP LOCKED)",Timestamp.from(now));
    }
}
