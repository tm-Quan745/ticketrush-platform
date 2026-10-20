"""Verifier mutation tests against real isolated PostgreSQL and Redis services."""
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import tool


class ToolTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = tool.connect()
        cls.db.execute("TRUNCATE users,events,ticket_tiers,outbox_events,processed_messages CASCADE")
        cls.db.commit()
        cls.shape = tool.seed(cls.db, users=3, background=2, capacity=10)

    @classmethod
    def tearDownClass(cls):
        cls.db.rollback()
        cls.db.close()

    def setUp(self):
        self.db.rollback()
        self.user, self.tier = tool.uid(0), tool.uid("HOT/0")
        self.order, self.reservation, self.event = tool.uid("order"), tool.uid("reservation"), tool.uid("paid-event")
        self.db.execute("UPDATE ticket_tiers SET available_quantity=9 WHERE id=%s", (self.tier,))
        self.db.execute("""INSERT INTO reservations(id,user_id,tier_id,quantity,status,expires_at,created_at,updated_at)
            VALUES (%s,%s,%s,1,'CONFIRMED',now()+interval '1 minute',now(),now())""", (self.reservation, self.user, self.tier))
        self.db.execute("""INSERT INTO orders(id,user_id,reservation_id,status,total_amount,currency,payment_deadline,created_at,updated_at)
            VALUES (%s,%s,%s,'PAID',2500,'USD',now(),now(),now())""", (self.order, self.user, self.reservation))
        self.db.execute("""INSERT INTO tickets(id,order_id,user_id,event_id,tier_id,ticket_index,ticket_code,status,issued_at)
            VALUES (%s,%s,%s,%s,%s,0,'test-code','VALID',now())""", (tool.uid("ticket"), self.order, self.user, tool.uid("HOT"), self.tier))
        self.db.execute("""INSERT INTO payments(id,order_id,provider,provider_payment_id,amount,currency,status,scenario,next_dispatch_at,created_at,updated_at)
            VALUES (%s,%s,'mock','mock-test',2500,'USD','SUCCEEDED','SUCCESS',now(),now(),now())""", (tool.uid("payment"), self.order))
        self.db.execute("""INSERT INTO idempotency_keys(id,user_id,endpoint,key,request_hash,status,response_status,response_body,created_at,expires_at,lease_until)
            VALUES (%s,%s,'POST /api/v1/orders',%s,'hash','COMPLETED',201,%s,now(),now()+interval '1 day',now())""",
                        (tool.uid("key-row"), self.user, tool.uid("key"), '{"id":"' + str(self.order) + '"}'))
        self.db.execute("""INSERT INTO outbox_events(id,aggregate_type,aggregate_id,event_type,schema_version,payload,status,next_attempt_at,created_at,published_at)
            VALUES (%s,'order',%s,'order.paid',1,'{}','PUBLISHED',now(),now(),now())""", (self.event, self.order))
        self.db.execute("""INSERT INTO email_notifications(id,event_id,type,user_id,to_address,status,sent_at,created_at)
            VALUES (%s,%s,'order.paid',%s,'buyer@loadtest.example','SENT',now(),now())""", (tool.uid("email"), self.event, self.user))

    def tearDown(self):
        self.db.rollback()

    def checks(self):
        return tool.evaluate(tool.snapshot(self.db))

    def test_known_good_paid_dataset(self):
        self.assertTrue(all(c["passed"] for c in self.checks().values()))
        self.assertEqual(1, self.checks()["6_emails"]["sent_confirmations"])

    def test_inventory_conservation_fails(self):
        self.db.execute("UPDATE ticket_tiers SET available_quantity=10 WHERE id=%s", (self.tier,))
        self.assertFalse(self.checks()["1_inventory_conservation"]["passed"])

    def test_negative_inventory_and_oversold_fail(self):
        # Transaction-local mutation; rollback restores the real constraint.
        self.db.execute("ALTER TABLE ticket_tiers DROP CONSTRAINT ticket_tiers_available_quantity_check")
        self.db.execute("UPDATE ticket_tiers SET available_quantity=-1 WHERE id=%s", (self.tier,))
        self.db.execute("UPDATE reservations SET quantity=11")
        self.assertFalse(self.checks()["1_inventory_conservation"]["passed"])
        self.assertEqual(1, self.checks()["2_ticket_conservation"]["oversold"])

    def test_missing_tickets_fail_both_conservation_and_paid_consistency(self):
        self.db.execute("DELETE FROM tickets")
        self.assertFalse(self.checks()["2_ticket_conservation"]["passed"])
        self.assertFalse(self.checks()["4_paid_consistency"]["passed"])

    def test_duplicate_payment_effect_fails(self):
        self.db.execute("ALTER TABLE payments DROP CONSTRAINT payments_order_id_key")
        self.db.execute("""INSERT INTO payments SELECT %s,order_id,provider,'mock-duplicate',amount,currency,status,scenario,
            next_dispatch_at,created_at,updated_at FROM payments""", (tool.uid("duplicate-payment"),))
        self.assertFalse(self.checks()["3_idempotency"]["passed"])

    def test_duplicate_ticket_effect_fails(self):
        self.db.execute("ALTER TABLE tickets DROP CONSTRAINT tickets_order_id_ticket_index_key")
        self.db.execute("INSERT INTO tickets SELECT %s,order_id,user_id,event_id,tier_id,ticket_index,'duplicate-code',status,issued_at FROM tickets", (tool.uid("duplicate-ticket"),))
        self.assertFalse(self.checks()["3_idempotency"]["passed"])

    def test_missing_successful_key_fails(self):
        self.db.execute("DELETE FROM idempotency_keys")
        self.assertFalse(self.checks()["3_idempotency"]["passed"])

    def test_key_pointing_to_wrong_order_fails_even_when_counts_match(self):
        self.db.execute("UPDATE idempotency_keys SET response_body='{\"id\":\"missing\"}'")
        self.assertFalse(self.checks()["3_idempotency"]["passed"])

    def test_confirmed_without_paid_fails(self):
        self.db.execute("UPDATE orders SET status='EXPIRED'")
        self.assertFalse(self.checks()["4_paid_consistency"]["passed"])

    def test_pending_outbox_fails(self):
        self.db.execute("UPDATE outbox_events SET status='PENDING'")
        self.assertFalse(self.checks()["5_outbox"]["passed"])

    def test_failed_outbox_fails(self):
        self.db.execute("UPDATE outbox_events SET status='FAILED'")
        self.assertFalse(self.checks()["5_outbox"]["passed"])

    def test_missing_confirmation_fails(self):
        self.db.execute("DELETE FROM email_notifications")
        self.assertFalse(self.checks()["6_emails"]["passed"])

    def test_duplicate_confirmation_fails(self):
        self.db.execute("ALTER TABLE email_notifications DROP CONSTRAINT email_notifications_event_id_type_key")
        self.db.execute("INSERT INTO email_notifications SELECT %s,event_id,type,user_id,to_address,status,attempts,last_error,sent_at,created_at FROM email_notifications", (tool.uid("duplicate-email"),))
        self.assertFalse(self.checks()["6_emails"]["passed"])

    def test_drift_detects_real_redis_corruption_and_missing_keys(self):
        cache = tool.redis_client()
        key = "ticketrush:loadtest:verifier-test:available"
        try:
            cache.set(key, 8)
            bad = [{"observed": int(cache.get(key)), "expected": 9, "result": "HEALED"}]
            self.assertFalse(tool.drift_check(bad, bad)["passed"])
            cache.set(key, 9)
            good = [{"observed": int(cache.get(key)), "expected": 9, "result": "HEALED"}]
            self.assertTrue(tool.drift_check(bad, good)["passed"])
            self.assertEqual(1, tool.drift_check(bad, good)["before_mismatches"])
            self.assertFalse(tool.drift_check([], [{"observed": None, "expected": 9, "result": "BUSY"}])["passed"])
            self.assertFalse(tool.drift_check([], [])["passed"])
        finally:
            cache.delete(key)

    def test_overdue_payment_fails(self):
        self.db.execute("UPDATE orders SET status='PENDING_PAYMENT',payment_deadline=now()-interval '1 minute'")
        self.assertFalse(self.checks()["8_expiry"]["passed"])

    def test_overdue_hold_fails(self):
        self.db.execute("UPDATE reservations SET status='HELD',expires_at=now()-interval '1 minute'")
        self.assertFalse(self.checks()["8_expiry"]["passed"])

    def test_prod_is_refused(self):
        with patch.dict(os.environ, {"SPRING_PROFILES_ACTIVE": "prod,loadtest"}):
            with self.assertRaises(RuntimeError):
                tool.guard()


class SeederTests(unittest.TestCase):
    def test_exact_shape_and_repeatability(self):
        with tool.connect() as db:
            shapes = []
            for _ in range(2):
                db.execute("TRUNCATE users,events,ticket_tiers,outbox_events,processed_messages CASCADE")
                db.commit()
                shape = tool.seed(db, users=7, background=4, capacity=11, mixed_tiers=2)
                self.assertEqual({"buyers": 7, "admins": 1, "events": 7, "tiers": 8, "hot_capacity": 11,
                                  "waiting": False, "queue_closed": False}, shape)
                self.assertEqual(8, db.execute("SELECT count(*) n FROM users").fetchone()["n"])
                self.assertEqual(8, db.execute("SELECT count(*) n FROM ticket_tiers").fetchone()["n"])
                shapes.append(db.execute("SELECT id,total_quantity,available_quantity FROM ticket_tiers ORDER BY id").fetchall())
                import json
                users = json.loads(Path("/data/users.json").read_text())
                self.assertEqual(7, len(users))
                import bcrypt
                hashed = db.execute("SELECT password_hash FROM users LIMIT 1").fetchone()["password_hash"]
                self.assertTrue(bcrypt.checkpw(users[0]["password"].encode(), hashed.encode()))
                with self.assertRaises(RuntimeError):
                    tool.seed(db, users=7)
                db.rollback()
            self.assertEqual(shapes[0], shapes[1])

    def test_closed_queue_seed_has_future_sale_start(self):
        with tool.connect() as db:
            db.execute("TRUNCATE users,events,ticket_tiers,outbox_events,processed_messages CASCADE")
            db.commit()
            shape = tool.seed(db, users=3, background=1, capacity=10, waiting=True, queue_closed=True)
            self.assertTrue(shape["queue_closed"])
            self.assertGreater(db.execute("SELECT extract(epoch FROM sale_start_time-now()) AS seconds FROM events WHERE id=%s", (tool.uid("HOT"),)).fetchone()["seconds"], 3500)


if __name__ == "__main__":
    unittest.main()
