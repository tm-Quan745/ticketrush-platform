CREATE TABLE orders (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    reservation_id UUID NOT NULL UNIQUE REFERENCES reservations(id),
    status VARCHAR(24) NOT NULL CHECK (status IN ('PENDING_PAYMENT','PAID','PAYMENT_FAILED','CANCELLED','EXPIRED','REFUND_PENDING','REFUNDED')),
    total_amount BIGINT NOT NULL CHECK (total_amount >= 0),
    currency VARCHAR(3) NOT NULL,
    payment_deadline TIMESTAMPTZ NOT NULL,
    manual_review BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    version BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_orders_user ON orders(user_id,created_at,id);
CREATE INDEX idx_orders_status ON orders(status,created_at);
CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id),
    tier_id UUID NOT NULL REFERENCES ticket_tiers(id),
    event_id UUID NOT NULL REFERENCES events(id),
    tier_name VARCHAR(200) NOT NULL,
    unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE(order_id,tier_id)
);
CREATE TABLE payments (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    provider VARCHAR(30) NOT NULL,
    provider_payment_id VARCHAR(100) NOT NULL UNIQUE,
    amount BIGINT NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('INITIATED','SUCCEEDED','FAILED','REFUNDED')),
    scenario VARCHAR(30) NOT NULL,
    next_dispatch_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_payments_dispatch ON payments(status,next_dispatch_at);
CREATE TABLE payment_events (
    id UUID PRIMARY KEY,
    provider_event_id VARCHAR(150) NOT NULL UNIQUE,
    payment_id UUID NOT NULL REFERENCES payments(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('SUCCEEDED','FAILED','REFUNDED')),
    payload TEXT NOT NULL,
    review_required BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE tickets (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id),
    user_id UUID NOT NULL REFERENCES users(id),
    event_id UUID NOT NULL REFERENCES events(id),
    tier_id UUID NOT NULL REFERENCES ticket_tiers(id),
    ticket_index INTEGER NOT NULL CHECK (ticket_index >= 0),
    ticket_code VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('VALID','CANCELLED','USED')),
    issued_at TIMESTAMPTZ NOT NULL,
    UNIQUE(order_id,ticket_index)
);
CREATE INDEX idx_tickets_tier_status ON tickets(tier_id,status);
CREATE TABLE idempotency_keys (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    endpoint VARCHAR(100) NOT NULL,
    key UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('IN_PROGRESS','COMPLETED')),
    response_status INTEGER,
    response_body TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    lease_until TIMESTAMPTZ NOT NULL,
    UNIQUE(user_id,endpoint,key)
);
CREATE INDEX idx_idempotency_expiry ON idempotency_keys(expires_at);
