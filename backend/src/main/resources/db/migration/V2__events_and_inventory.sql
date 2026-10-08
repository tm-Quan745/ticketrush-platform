ALTER TABLE events RENAME COLUMN name TO title;
ALTER TABLE events RENAME COLUMN starts_at TO start_time;
ALTER TABLE events
    ADD COLUMN venue_name VARCHAR(200),
    ADD COLUMN venue_address VARCHAR(500),
    ADD COLUMN image_url VARCHAR(2048),
    ADD COLUMN end_time TIMESTAMPTZ,
    ADD COLUMN sale_start_time TIMESTAMPTZ,
    ADD COLUMN sale_end_time TIMESTAMPTZ,
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN created_by UUID REFERENCES users(id),
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- V1 has no duration, sale window, or creator. Preserve rows as private drafts.
UPDATE events SET end_time = start_time + interval '1 hour',
    sale_start_time = start_time - interval '1 day', sale_end_time = start_time;
ALTER TABLE events
    ALTER COLUMN end_time SET NOT NULL,
    ALTER COLUMN sale_start_time SET NOT NULL,
    ALTER COLUMN sale_end_time SET NOT NULL,
    ADD CONSTRAINT event_title CHECK (length(trim(title)) > 0),
    ADD CONSTRAINT event_dates CHECK (end_time > start_time AND sale_end_time <= start_time
        AND sale_start_time < sale_end_time),
    ADD CONSTRAINT event_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'ENDED'));
CREATE INDEX idx_events_status_start ON events(status, start_time);
CREATE INDEX idx_events_sale_start ON events(sale_start_time);

-- V1 decimal prices are interpreted as USD major units; see ADR 0003.
ALTER TABLE ticket_tiers ALTER COLUMN price TYPE BIGINT USING (price * 100)::BIGINT;
ALTER TABLE ticket_tiers
    ADD COLUMN description TEXT,
    ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    ADD COLUMN max_per_order INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD CONSTRAINT tier_currency CHECK (currency ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT tier_order_limit CHECK (max_per_order >= 1),
    ADD CONSTRAINT tier_name CHECK (length(trim(name)) > 0);
CREATE INDEX idx_ticket_tiers_event ON ticket_tiers(event_id);
