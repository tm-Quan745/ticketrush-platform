WITH scope AS (SELECT * FROM event_seats WHERE event_id=:event),
members AS (
 SELECT rs.*,r.status,r.quantity,r.tier_id,r.expires_at FROM reservation_seats rs
 JOIN reservations r ON r.id=rs.reservation_id JOIN ticket_tiers t ON t.id=r.tier_id
 WHERE t.event_id=:event AND t.inventory_mode='SEATED'
)
SELECT 'SOLD_TICKET_ORDER' AS code, es.id AS entity_id FROM scope es
WHERE es.status='SOLD' AND (
 (SELECT count(*) FROM tickets t WHERE t.event_id=es.event_id AND t.seat_id=es.seat_id AND t.status IN ('VALID','USED'))<>1
 OR (SELECT count(*) FROM tickets t JOIN orders o ON o.id=t.order_id
     WHERE t.event_id=es.event_id AND t.seat_id=es.seat_id AND t.status IN ('VALID','USED')
     AND o.status='PAID' AND o.reservation_id=es.reservation_id)<>1)
UNION ALL
SELECT 'MULTIPLE_ACTIVE_RESERVATIONS',event_seat_id FROM members WHERE status IN ('HELD','CONFIRMED')
GROUP BY event_seat_id HAVING count(*)>1
UNION ALL
SELECT 'HELD_RESERVATION_TTL',es.id FROM scope es LEFT JOIN reservations r ON r.id=es.reservation_id
WHERE es.status='HELD' AND (r.id IS NULL OR r.status<>'HELD' OR r.tier_id<>es.tier_id OR r.expires_at IS DISTINCT FROM es.expires_at)
UNION ALL
SELECT 'RESERVATION_MEMBERSHIP',r.id FROM reservations r JOIN ticket_tiers t ON t.id=r.tier_id
WHERE t.event_id=:event AND t.inventory_mode='SEATED' AND
 (r.quantity<>(SELECT count(*) FROM members m WHERE m.reservation_id=r.id)
 OR EXISTS(SELECT 1 FROM members m JOIN scope es ON es.id=m.event_seat_id WHERE m.reservation_id=r.id AND
    (es.tier_id<>r.tier_id OR (r.status IN ('HELD','CONFIRMED') AND
       (es.reservation_id IS DISTINCT FROM r.id OR es.status<>CASE WHEN r.status='HELD' THEN 'HELD' ELSE 'SOLD' END)))))
UNION ALL
SELECT 'SECTION_CAPACITY',m.section_id FROM event_tier_sections m JOIN sections sec ON sec.id=m.section_id
WHERE m.event_id=:event AND sec.type='SEATED' AND
 (SELECT count(*) FROM seats s WHERE s.section_id=m.section_id)<>
 (SELECT count(*) FROM scope es WHERE es.section_id=m.section_id AND es.status IN ('AVAILABLE','HELD','SOLD','BLOCKED'))
UNION ALL
SELECT 'USED_SEAT_AVAILABLE',t.id FROM tickets t JOIN scope es ON es.seat_id=t.seat_id AND es.event_id=t.event_id
WHERE t.status='USED' AND es.status='AVAILABLE'
UNION ALL
SELECT 'LIVE_TICKET_STATE',t.id FROM tickets t JOIN scope es ON es.seat_id=t.seat_id AND es.event_id=t.event_id
WHERE t.status IN ('VALID','USED') AND es.status<>'SOLD'
