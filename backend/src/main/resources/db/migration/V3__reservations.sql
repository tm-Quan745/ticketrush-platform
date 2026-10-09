CREATE TABLE reservations (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    tier_id UUID NOT NULL REFERENCES ticket_tiers(id),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    status VARCHAR(20) NOT NULL CHECK (status IN ('HELD','CONFIRMED','EXPIRED','CANCELLED')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0)
);
CREATE UNIQUE INDEX uq_reservations_active ON reservations(user_id,tier_id) WHERE status='HELD';
CREATE INDEX idx_reservations_expiry ON reservations(status,expires_at);
CREATE INDEX idx_reservations_user ON reservations(user_id,created_at,id);
CREATE INDEX idx_reservations_tier ON reservations(tier_id);
