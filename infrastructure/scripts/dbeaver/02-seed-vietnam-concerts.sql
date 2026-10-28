-- DEVELOPMENT FIXTURES ONLY: titles are examples, not official event listings.
-- Dates, venues and prices are fictional. All amounts are whole Vietnamese dong.
-- Requires Flyway migrations V1..V9. Safe to run after reset; refuses a second seed.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public;
SET LOCAL TIME ZONE 'Asia/Ho_Chi_Minh';

DO $seed$
DECLARE
    venue_uuid uuid := gen_random_uuid();
    ga_uuid uuid := gen_random_uuid();
    stand_a_uuid uuid := gen_random_uuid();
    stand_b_uuid uuid := gen_random_uuid();
    event_uuid uuid;
    tier_uuid uuid;
    starts timestamptz;
    fixture record;
    section_row record;
BEGIN
    PERFORM pg_advisory_xact_lock(297016);
    IF EXISTS (SELECT 1 FROM venues WHERE template_key='vietnam-concert-demo' AND template_version=1) THEN
        RAISE EXCEPTION 'Demo seed already exists. No data changed. Reset first only if you want to erase existing data.';
    END IF;

    INSERT INTO venues(id,template_key,template_version,name,geometry)
    VALUES (venue_uuid,'vietnam-concert-demo',1,'Sân khấu concert mẫu',
        '{"width":640,"height":520,"stage":[260,80,380,140]}'::jsonb);
    INSERT INTO sections(id,venue_id,code,name,type,geometry) VALUES
        (ga_uuid,venue_uuid,'GA','Khu đứng','GA','{"polygon":[[250,180],[390,180],[390,310],[250,310]],"color":"#f59e0b"}'),
        (stand_a_uuid,venue_uuid,'STAND_A','Khán đài A','SEATED','{"polygon":[[90,180],[220,180],[220,400],[90,400]],"color":"#6366f1"}'),
        (stand_b_uuid,venue_uuid,'STAND_B','Khán đài B','SEATED','{"polygon":[[420,180],[550,180],[550,400],[420,400]],"color":"#ec4899"}');

    -- Populate the immutable venue before publishing any event.
    INSERT INTO seats(id,section_id,row_label,row_rank,number,adjacency_segment,x,y,accessible)
    SELECT gen_random_uuid(), section_id, 'R'||r, r-1, c, (c-1)/5,
           left_x + 10 + (c-1)*12, 195 + (r-1)*20, r=1 AND c<=2
    FROM (VALUES (stand_a_uuid,90),(stand_b_uuid,420)) AS s(section_id,left_x)
    CROSS JOIN generate_series(1,10) AS rows(r)
    CROSS JOIN generate_series(1,10) AS columns(c);

    FOR fixture IN SELECT * FROM (VALUES
        (1,'Anh Trai Say Hi - Đêm 1','TP. Hồ Chí Minh',1200000::bigint),
        (2,'Anh Trai Say Hi - Đêm 2','Hà Nội',1200000::bigint),
        (3,'Anh Trai Vượt Ngàn Chông Gai - Đêm 1','TP. Hồ Chí Minh',1500000::bigint),
        (4,'Anh Trai Vượt Ngàn Chông Gai - Đêm 2','Hà Nội',1500000::bigint),
        (5,'EXSH - Em Xinh Say Hi','TP. Hồ Chí Minh',1100000::bigint),
        (6,'EXSH - Đêm hội âm nhạc','Đà Nẵng',1000000::bigint),
        (7,'Tinh Hà Say Hi - Đêm 1','Hà Nội',900000::bigint),
        (8,'Tinh Hà Say Hi - Đêm 2','TP. Hồ Chí Minh',900000::bigint),
        (9,'Concert Quốc Gia - Việt Nam Rực Rỡ','Hà Nội',500000::bigint),
        (10,'Concert Quốc Gia - Tự Hào Việt Nam','TP. Hồ Chí Minh',500000::bigint),
        (11,'V-Pop Summer Night','Đà Nẵng',700000::bigint),
        (12,'Indie Việt - Những Ngày Rực Rỡ','Đà Lạt',450000::bigint),
        (13,'Rock Việt - Bùng Cháy','Hải Phòng',600000::bigint),
        (14,'Acoustic Night - Chạm Cảm Xúc','Huế',350000::bigint),
        (15,'Countdown Việt Nam','TP. Hồ Chí Minh',800000::bigint),
        (16,'Thanh Xuân Rực Rỡ - Music Festival','Cần Thơ',650000::bigint)
    ) AS data(ordinal,title,city,base_price)
    LOOP
        event_uuid := gen_random_uuid();
        starts := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
            + (30+fixture.ordinal*3) + time '19:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
        INSERT INTO events(id,title,description,venue_name,venue_address,venue_id,
            start_time,end_time,sale_start_time,sale_end_time,status,waiting_room_enabled)
        VALUES (event_uuid,fixture.title,
            '[DEMO] Dữ liệu giả lập để thử đặt vé. Lịch diễn, địa điểm và giá vé không phải thông tin chính thức.',
            'Sân khấu concert mẫu - '||fixture.city,'Địa điểm giả lập tại '||fixture.city,venue_uuid,
            starts,starts+interval '3 hours',CURRENT_TIMESTAMP-interval '1 day',starts-interval '2 hours','DRAFT',false);

        FOR section_row IN SELECT id,name,type,code FROM sections WHERE venue_id=venue_uuid ORDER BY code
        LOOP
            tier_uuid := gen_random_uuid();
            INSERT INTO ticket_tiers(id,event_id,name,description,price,currency,
                total_quantity,available_quantity,max_per_order,inventory_mode)
            VALUES (tier_uuid,event_uuid,section_row.name,'Demo concert ticket',
                fixture.base_price + CASE section_row.code WHEN 'STAND_A' THEN 400000 WHEN 'STAND_B' THEN 200000 ELSE 0 END,
                'VND',CASE WHEN section_row.type='GA' THEN 500 ELSE 0 END,
                CASE WHEN section_row.type='GA' THEN 500 ELSE 0 END,6,
                CASE WHEN section_row.type='GA' THEN 'COUNTER' ELSE 'SEATED' END);
            INSERT INTO event_tier_sections(event_id,section_id,tier_id) VALUES(event_uuid,section_row.id,tier_uuid);
        END LOOP;

        -- Match application publication: SEATED capacity comes from event_seats.
        INSERT INTO event_seats(id,event_id,seat_id,section_id,tier_id,status)
        SELECT gen_random_uuid(),event_uuid,s.id,s.section_id,m.tier_id,'AVAILABLE'
        FROM event_tier_sections m JOIN seats s ON s.section_id=m.section_id WHERE m.event_id=event_uuid;
        UPDATE events SET status='PUBLISHED',updated_at=CURRENT_TIMESTAMP WHERE id=event_uuid;
    END LOOP;
END;
$seed$;
COMMIT;

SELECT e.id,e.title,e.start_time,e.status,t.name AS tier,t.price,t.currency,t.inventory_mode,
    CASE WHEN t.inventory_mode='COUNTER' THEN t.available_quantity
         ELSE (SELECT count(*) FROM public.event_seats es WHERE es.tier_id=t.id AND es.status='AVAILABLE') END AS available
FROM public.events e JOIN public.ticket_tiers t ON t.event_id=e.id
JOIN public.venues v ON v.id=e.venue_id AND v.template_key='vietnam-concert-demo'
ORDER BY e.start_time,t.price;
