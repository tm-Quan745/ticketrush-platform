CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(64) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    schema_version INTEGER NOT NULL,
    payload JSONB NOT NULL,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING','PUBLISHED','FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ
);
CREATE INDEX idx_outbox_relay ON outbox_events(status,next_attempt_at,created_at);
CREATE INDEX idx_outbox_aggregate_order ON outbox_events(aggregate_type,aggregate_id,created_at,id);

CREATE TABLE processed_messages (
    consumer_name VARCHAR(100) NOT NULL,
    message_id UUID NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (consumer_name,message_id)
);

CREATE TABLE email_notifications (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    type VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    to_address VARCHAR(320) NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('PENDING','SENT','FAILED')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE(event_id,type)
);
CREATE INDEX idx_email_notifications_status ON email_notifications(status,created_at);
