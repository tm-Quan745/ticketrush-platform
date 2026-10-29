# DBeaver development reset and concert fixtures

These files target the TicketRush PostgreSQL schema after Flyway V1 through V9.
They are SQL scripts for DBeaver, not application migrations. Do not add them to
Flyway's migration directory.

## Files

1. `01-reset-all-data.sql`: removes application data, including accounts, sessions,
   purchases, tickets, events and seating templates. Keeps the schema, the three
   role definitions and `flyway_schema_history`.
2. `02-seed-vietnam-concerts.sql`: adds 16 published, currently on-sale demo events,
   48 VND tiers, a shared venue with three sections and 200 physical seats, and
   3,200 available event-seat records. Each event has 500 standing tickets and
   200 reserved seats. Dates are relative to execution time and use GMT+7.

Names include Anh Trai Say Hi, Anh Trai Vuot Ngan Chong Gai, EXSH, Tinh Ha Say Hi,
Concert Quoc Gia and other fictional concert examples. The Vietnamese titles are
stored in the SQL file. Dates, locations, prices and capacity are fictional, not
announced event information. Image URLs are deliberately absent; upload suitable
images through the admin UI.

## Run in DBeaver

1. Stop the application backend and workers before resetting. Select the intended
   disposable development database and back it up if you need its current data.
   Run `SELECT current_database(), current_user;` to check the connection.
2. Open `01-reset-all-data.sql` in a SQL editor attached to that connection. Execute
   the entire script, including `BEGIN` and `COMMIT`. This deletes all user accounts.
3. Open and execute the entire `02-seed-vietnam-concerts.sql` script. Its final query
   shows event IDs, titles, prices, currency and available stock.
4. If a statement fails, stop execution and run `ROLLBACK;` before retrying. Never
   continue from the middle of the seed script. A second seed intentionally raises
   an error without overwriting existing sales or creating duplicate events.
5. Start the backend and sign up again through the application. Existing access
   tokens must not be reused. Log out and log in again on each browser.

You can run only the seed script to add the examples without erasing existing
accounts or events. It must not already have been run on that database.

## Prevent unrelated development seeds

When restarting, use `SPRING_PROFILES_ACTIVE=demo` without `dev` if you want only
these SQL-created events. The default `dev` profile automatically adds Dev Events
and an additional seated example; `DEV_SEED_ENABLED=false` alone does not disable
that separate seated example. No application source change is required.

## Restore an admin account

Register your account through the application first, then replace the email below
with your own registered email and execute in DBeaver:

```sql
INSERT INTO public.user_roles (user_id, role_id)
SELECT u.id, r.id
FROM public.users u
CROSS JOIN public.roles r
WHERE u.email = lower(trim('your-email@example.com')) AND r.name = 'ADMIN'
ON CONFLICT DO NOTHING;
```

The result must report one inserted row unless the role is already present. Sign
out and back in to receive an access token with the new role. No passwords or
password hashes are embedded in the fixtures.

## Other state

SQL only resets PostgreSQL. It does not purge Redis, RabbitMQ queues, browser-local
read markers or mail already sent to Mailpit. In a reused development stack, clear
only that stack's test cache and pending message queues before restarting workers.
Do not use a global Redis flush against a shared instance. The seed uses fresh IDs
so newly seeded events cannot reuse deleted event cache keys.

## Verify

```sql
SELECT count(*) AS demo_events
FROM public.events e JOIN public.venues v ON v.id=e.venue_id
WHERE v.template_key='vietnam-concert-demo'; -- 16

SELECT t.currency, count(*) AS tiers
FROM public.ticket_tiers t JOIN public.events e ON e.id=t.event_id
JOIN public.venues v ON v.id=e.venue_id
WHERE v.template_key='vietnam-concert-demo'
GROUP BY t.currency; -- VND, 48

SELECT count(*) AS available_demo_seats
FROM public.event_seats es JOIN public.events e ON e.id=es.event_id
JOIN public.venues v ON v.id=e.venue_id
WHERE v.template_key='vietnam-concert-demo' AND es.status='AVAILABLE'; -- 3200 before purchases
```

From the repository root, with Docker running:

```powershell
./backend/mvnw.cmd -f backend/pom.xml -Dtest=DbeaverSeedIntegrationTest package
```

The integration test uses its own PostgreSQL 17 container. It checks the actual SQL,
foreign keys, sale windows, VND prices, seat counts, repeat-seed refusal, reset and
reseed. If Docker is unavailable, the test is skipped; build success alone does not
prove SQL execution succeeded.
