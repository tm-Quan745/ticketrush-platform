-- DEVELOPMENT ONLY. Deletes accounts, sessions, purchases, events and venue templates.
-- Stop the backend/workers first. Run the whole file as a script in DBeaver.
-- Keep roles and flyway_schema_history: they are application/schema reference data.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = public;

TRUNCATE TABLE
    email_notifications, processed_messages, outbox_events,
    payment_events, payments, tickets, order_items, orders, idempotency_keys,
    reservation_seats, event_seats, reservations, event_tier_sections,
    ticket_tiers, events, seats, sections, venues,
    refresh_tokens, user_roles, users
RESTART IDENTITY;

COMMIT;

SELECT 'users' AS table_name, count(*) AS remaining FROM public.users
UNION ALL SELECT 'events', count(*) FROM public.events
UNION ALL SELECT 'orders', count(*) FROM public.orders
UNION ALL SELECT 'tickets', count(*) FROM public.tickets;
