CREATE INDEX idx_tickets_user_issued ON tickets(user_id, issued_at DESC, id DESC);
