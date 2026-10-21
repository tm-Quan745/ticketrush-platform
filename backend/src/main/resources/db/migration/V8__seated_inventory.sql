CREATE TABLE venues (
    id UUID PRIMARY KEY,
    template_key VARCHAR(100) NOT NULL,
    template_version INTEGER NOT NULL CHECK (template_version > 0),
    name VARCHAR(200) NOT NULL,
    geometry JSONB NOT NULL CHECK (jsonb_typeof(geometry) = 'object'),
    UNIQUE(template_key, template_version)
);
CREATE TABLE sections (
    id UUID PRIMARY KEY,
    venue_id UUID NOT NULL REFERENCES venues(id),
    code VARCHAR(40) NOT NULL,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('GA','SEATED')),
    geometry JSONB NOT NULL CHECK (jsonb_typeof(geometry) = 'object'),
    UNIQUE(venue_id, code)
);
CREATE TABLE seats (
    id UUID PRIMARY KEY,
    section_id UUID NOT NULL REFERENCES sections(id),
    row_label VARCHAR(20) NOT NULL CHECK (length(trim(row_label)) > 0),
    row_rank INTEGER NOT NULL CHECK (row_rank >= 0),
    number INTEGER NOT NULL CHECK (number > 0),
    adjacency_segment INTEGER NOT NULL CHECK (adjacency_segment >= 0),
    x NUMERIC NOT NULL CHECK (x BETWEEN -10000 AND 10000),
    y NUMERIC NOT NULL CHECK (y BETWEEN -10000 AND 10000),
    accessible BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(section_id,row_label,number),
    UNIQUE(id,section_id)
);
CREATE INDEX idx_seats_section_row ON seats(section_id,row_rank,number);
ALTER TABLE events ADD COLUMN venue_id UUID REFERENCES venues(id);
ALTER TABLE ticket_tiers ADD COLUMN inventory_mode VARCHAR(10) NOT NULL DEFAULT 'COUNTER'
    CHECK (inventory_mode IN ('COUNTER','SEATED'));
ALTER TABLE ticket_tiers ADD CONSTRAINT uq_tier_event UNIQUE(id,event_id);
CREATE TABLE event_tier_sections (
    event_id UUID NOT NULL REFERENCES events(id),
    section_id UUID NOT NULL REFERENCES sections(id),
    tier_id UUID NOT NULL,
    PRIMARY KEY(event_id,section_id),
    UNIQUE(event_id,section_id,tier_id),
    FOREIGN KEY(tier_id,event_id) REFERENCES ticket_tiers(id,event_id)
);
CREATE TABLE event_seats (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    seat_id UUID NOT NULL,
    section_id UUID NOT NULL,
    tier_id UUID NOT NULL,
    status VARCHAR(10) NOT NULL,
    reservation_id UUID REFERENCES reservations(id),
    expires_at TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    UNIQUE(event_id,seat_id),
    FOREIGN KEY(seat_id,section_id) REFERENCES seats(id,section_id),
    FOREIGN KEY(event_id,section_id,tier_id) REFERENCES event_tier_sections(event_id,section_id,tier_id),
    CONSTRAINT event_seat_state CHECK (
        (status='HELD' AND reservation_id IS NOT NULL AND expires_at IS NOT NULL)
        OR (status='SOLD' AND reservation_id IS NOT NULL AND expires_at IS NULL)
        OR (status IN ('AVAILABLE','BLOCKED') AND reservation_id IS NULL AND expires_at IS NULL))
);
CREATE INDEX idx_event_seats_inventory ON event_seats(event_id,tier_id,status,id);
CREATE INDEX idx_event_seats_held ON event_seats(reservation_id) WHERE status='HELD';
CREATE TABLE reservation_seats (
    reservation_id UUID NOT NULL REFERENCES reservations(id),
    event_seat_id UUID NOT NULL REFERENCES event_seats(id),
    PRIMARY KEY(reservation_id,event_seat_id)
);
CREATE INDEX idx_reservation_seats_seat ON reservation_seats(event_seat_id);
ALTER TABLE event_seats ADD CONSTRAINT fk_event_seat_current_claim
    FOREIGN KEY(reservation_id,id) REFERENCES reservation_seats(reservation_id,event_seat_id)
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE tickets ADD COLUMN seat_id UUID,
    ADD COLUMN seat_snapshot JSONB,
    ADD CONSTRAINT fk_ticket_event_seat FOREIGN KEY(event_id,seat_id) REFERENCES event_seats(event_id,seat_id),
    ADD CONSTRAINT ticket_seat_snapshot CHECK (
        (seat_id IS NULL AND seat_snapshot IS NULL)
        OR (seat_id IS NOT NULL AND seat_snapshot IS NOT NULL AND jsonb_typeof(seat_snapshot)='object'
            AND seat_snapshot ?& ARRAY['section','row','number']));
CREATE UNIQUE INDEX uq_live_ticket_seat ON tickets(event_id,seat_id)
    WHERE seat_id IS NOT NULL AND status <> 'CANCELLED';

-- Template mutations are serialized with publication by the venue row lock.
CREATE FUNCTION protect_seating_template() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE old_venue UUID; new_venue UUID;
BEGIN
    IF TG_TABLE_NAME='venues' THEN old_venue := OLD.id; new_venue := NEW.id;
    ELSIF TG_TABLE_NAME='sections' THEN old_venue := OLD.venue_id; new_venue := NEW.venue_id;
    ELSE
        SELECT venue_id INTO old_venue FROM sections WHERE id=OLD.section_id;
        SELECT venue_id INTO new_venue FROM sections WHERE id=NEW.section_id;
        IF TG_OP <> 'DELETE' AND NOT EXISTS (SELECT 1 FROM sections WHERE id=NEW.section_id AND type='SEATED') THEN
            RAISE EXCEPTION 'Physical seats require a SEATED section' USING ERRCODE='23514';
        END IF;
    END IF;
    PERFORM id FROM venues WHERE id IN (old_venue,new_venue) ORDER BY id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM events WHERE venue_id IN (old_venue,new_venue) AND status <> 'DRAFT') THEN
        RAISE EXCEPTION 'Published venue templates are immutable' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER immutable_venue BEFORE UPDATE OR DELETE ON venues
    FOR EACH ROW EXECUTE FUNCTION protect_seating_template();
CREATE TRIGGER immutable_section BEFORE INSERT OR UPDATE OR DELETE ON sections
    FOR EACH ROW EXECUTE FUNCTION protect_seating_template();
CREATE TRIGGER immutable_seat BEFORE INSERT OR UPDATE OR DELETE ON seats
    FOR EACH ROW EXECUTE FUNCTION protect_seating_template();

CREATE FUNCTION protect_ticket_seat_snapshot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.seat_id IS DISTINCT FROM OLD.seat_id OR NEW.seat_snapshot IS DISTINCT FROM OLD.seat_snapshot THEN
        RAISE EXCEPTION 'Issued seat snapshot is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER immutable_ticket_seat BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION protect_ticket_seat_snapshot();
