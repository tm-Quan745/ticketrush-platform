package com.vibe.ticketrush.notification.repository;

import com.vibe.ticketrush.notification.domain.EmailStatus;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationRepository {
    private final JdbcTemplate jdbc;
    public NotificationRepository(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Row(UUID id,UUID eventId,String type,UUID userId,String address,EmailStatus status,int attempts,String error,Instant sentAt) {}
    private Row row(java.sql.ResultSet rs,int n) throws java.sql.SQLException { return new Row(rs.getObject("id",UUID.class),rs.getObject("event_id",UUID.class),rs.getString("type"),rs.getObject("user_id",UUID.class),rs.getString("to_address"),EmailStatus.valueOf(rs.getString("status")),rs.getInt("attempts"),rs.getString("last_error"),rs.getTimestamp("sent_at")==null?null:rs.getTimestamp("sent_at").toInstant()); }
    public boolean markProcessing(String consumer,UUID messageId,Instant now) { return jdbc.update("INSERT INTO processed_messages(consumer_name,message_id,processed_at) VALUES (?,?,?) ON CONFLICT DO NOTHING",consumer,messageId,Timestamp.from(now))==1; }
    public boolean create(UUID eventId,String type,UUID userId,String address,Instant now) { return jdbc.update("INSERT INTO email_notifications(id,event_id,type,user_id,to_address,status,attempts,created_at) VALUES (?,?,?,?,?,'PENDING',1,?) ON CONFLICT(event_id,type) DO UPDATE SET status='PENDING',attempts=email_notifications.attempts+1,last_error=NULL",UUID.randomUUID(),eventId,type,userId,address,Timestamp.from(now))==1; }
    public void sent(UUID eventId,String type,Instant now) { jdbc.update("UPDATE email_notifications SET status='SENT',attempts=attempts+1,last_error=NULL,sent_at=? WHERE event_id=? AND type=?",Timestamp.from(now),eventId,type); }
    public void failed(UUID eventId,String type,UUID userId,String address,String error,Instant now) { jdbc.update("INSERT INTO email_notifications(id,event_id,type,user_id,to_address,status,attempts,last_error,created_at) VALUES (?,?,?,?,?,'FAILED',1,?,?) ON CONFLICT(event_id,type) DO UPDATE SET status='FAILED',attempts=email_notifications.attempts+1,last_error=EXCLUDED.last_error",UUID.randomUUID(),eventId,type,userId,address,error.length()>2000?error.substring(0,2000):error,Timestamp.from(now)); }
    public List<Row> list(EmailStatus status,int page,int size) { return jdbc.query("SELECT * FROM email_notifications WHERE status=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",this::row,status.name(),size,(long)page*size); }
    public Row get(UUID id) { return jdbc.query("SELECT * FROM email_notifications WHERE id=?",this::row,id).stream().findFirst().orElseThrow(); }
    public boolean retry(UUID id) { return jdbc.update("UPDATE email_notifications SET status='PENDING',last_error=NULL WHERE id=? AND status='FAILED'",id)==1; }
}
