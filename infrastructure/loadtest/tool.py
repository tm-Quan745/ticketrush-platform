"""Isolated load-test data and invariant checks. Never import application repositories."""
import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import time
import urllib.request
import uuid

import bcrypt
import psycopg
from psycopg.rows import dict_row
import redis


def guard():
    profiles = os.environ.get("SPRING_PROFILES_ACTIVE", "").split(",")
    if (os.environ.get("LOADTEST_PROFILE") != "loadtest" or "prod" in profiles
            or "loadtest" not in profiles or os.environ.get("POSTGRES_DB") != "ticketrush_loadtest"
            or os.environ.get("REDIS_ENV") != "loadtest"):
        raise RuntimeError("Refusing: dedicated loadtest profile, database and namespace required")


def connect():
    guard()
    return psycopg.connect(host=os.environ.get("PGHOST", "postgres"),
                          dbname=os.environ["POSTGRES_DB"], user=os.environ["POSTGRES_USER"],
                          password=os.environ["POSTGRES_PASSWORD"], row_factory=dict_row)


def redis_client():
    return redis.Redis(host="redis", password=os.environ["REDIS_PASSWORD"], decode_responses=True)


def uid(name):
    return uuid.uuid5(uuid.NAMESPACE_URL, "ticketrush-loadtest/" + str(name))


def jwt(user, roles, ttl=86400):
    def encode(value):
        return base64.urlsafe_b64encode(json.dumps(value, separators=(",", ":")).encode()).rstrip(b"=")
    now = int(time.time())
    header = encode({"alg": "HS256", "typ": "JWT"})
    payload = encode({"iss": "ticketrush", "aud": ["ticketrush-api"], "sub": str(user),
                      "iat": now, "exp": now + ttl, "jti": str(uuid.uuid4()), "roles": roles})
    body = header + b"." + payload
    signature = hmac.new(base64.b64decode(os.environ["JWT_SECRET"]), body, hashlib.sha256).digest()
    return (body + b"." + base64.urlsafe_b64encode(signature).rstrip(b"=")).decode()


def seed(db, users=20000, background=200, capacity=5000, mixed_tiers=3, waiting=False, queue_closed=False):
    guard()
    if not (1 <= users <= 1000000 and 1 <= background <= 10000 and 1 <= capacity <= 1000000
            and 1 <= mixed_tiers <= 100):
        raise ValueError("Invalid dataset shape")
    password = os.environ["LOADTEST_PASSWORD"]
    if not 12 <= len(password.encode()) <= 72:
        raise ValueError("LOADTEST_PASSWORD must have 12..72 bytes")
    if db.execute("SELECT count(*) AS n FROM users").fetchone()["n"]:
        raise RuntimeError("Seed requires an empty dataset; run reset first")
    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    records = [{"id": str(uid(i)), "email": f"buyer-{i}@loadtest.example", "password": password,
                "token": jwt(uid(i), ["USER"])} for i in range(users)]
    admin = {"id": str(uid("admin")), "token": jwt(uid("admin"), ["ADMIN", "USER"])}
    with db.cursor().copy("COPY users (id,email,password_hash) FROM STDIN") as cp:
        for row in records:
            cp.write_row((row["id"], row["email"], hashed))
        cp.write_row((admin["id"], "admin@loadtest.example", hashed))
    db.execute("INSERT INTO user_roles SELECT id,1 FROM users")
    db.execute("INSERT INTO user_roles VALUES (%s,2)", (admin["id"],))
    events = []
    for index, name in enumerate(["HOT", "MIXED", "WARMUP"] + [f"BACKGROUND-{i}" for i in range(background)]):
        event_id = uid(name)
        sql = """INSERT INTO events (id,title,venue_name,venue_address,start_time,end_time,
            sale_start_time,sale_end_time,status,created_by,waiting_room_enabled)
            VALUES (%s,%s,'Loadtest Hall','Synthetic City',now()+interval '7 days',now()+interval '7 days 2 hours',
            now()-interval '1 day',now()+interval '6 days','PUBLISHED',%s,%s)"""
        if queue_closed and index == 0:
            sql = """INSERT INTO events (id,title,venue_name,venue_address,start_time,end_time,
                sale_start_time,sale_end_time,status,created_by,waiting_room_enabled)
                VALUES (%s,%s,'Loadtest Hall','Synthetic City',now()+interval '7 days',now()+interval '7 days 2 hours',
                now()+interval '1 hour',now()+interval '6 days','PUBLISHED',%s,%s)"""
        db.execute(sql,
                   (event_id, name, admin["id"], waiting and index == 0))
        tiers = []
        for tier in range(mixed_tiers if name == "MIXED" else 1):
            tier_id = uid(f"{name}/{tier}")
            qty = capacity if name == "HOT" else 100000
            db.execute("""INSERT INTO ticket_tiers
                (id,event_id,name,price,currency,total_quantity,available_quantity,max_per_order)
                VALUES (%s,%s,%s,2500,'USD',%s,%s,4)""", (tier_id, event_id, f"Tier-{tier}", qty, qty))
            tiers.append(str(tier_id))
        events.append({"id": str(event_id), "name": name, "tiers": tiers})
    db.commit()
    os.umask(0o077)
    directory = Path("/data")
    directory.mkdir(exist_ok=True)
    (directory / "users.json").write_text(json.dumps(records))
    (directory / "admin.json").write_text(json.dumps(admin))
    (directory / "dataset.json").write_text(json.dumps({"events": events, "users": users, "capacity": capacity,
                                                       "waiting": waiting, "queue_closed": queue_closed,
                                                       "created_at": int(time.time())}))
    return {"buyers": users, "admins": 1, "events": len(events), "tiers": sum(len(e["tiers"]) for e in events),
            "hot_capacity": capacity, "waiting": waiting, "queue_closed": queue_closed}


def queue_audit(event):
    guard()
    members = redis_client().zrange(f"ticketrush:loadtest:queue:{event}:waiting", 0, -1, withscores=True)
    positions = [int(score) for _, score in members]
    return {"event": str(event), "queue_size": len(positions), "positions_distinct": len(set(positions)),
            "position_min": min(positions) if positions else None, "position_max": max(positions) if positions else None,
            "positions_contiguous": positions == list(range(1, len(positions) + 1))}


def configure_queue(event, rate, output):
    guard()
    if not 1 <= rate <= 1000:
        raise ValueError("rate must be 1..1000")
    admin = json.loads((Path("/data") / "admin.json").read_text())
    value = http("PUT", f"http://backend:8080/api/v1/admin/events/{event}/waiting-room", token=admin["token"],
                 payload={"enabled": True, "rate": rate, "mode": "fifo"})
    target = Path("/data") / Path(output).name
    target.write_text(json.dumps(value))
    target.chmod(0o600)
    return {"event": str(event), "rate": rate, "settings": value, "output": target.name}


def open_queue(db, event):
    guard()
    db.execute("UPDATE events SET sale_start_time=now()-interval '1 second' WHERE id=%s", (event,))
    db.commit()
    return {"event": str(event), "opened": True}


def admission_pairs(event, count, timeout, output):
    guard()
    if not 1 <= count <= 100000:
        raise ValueError("count must be 1..100000")
    admin = json.loads((Path("/data") / "admin.json").read_text())
    result = []
    seen = set()
    deadline = time.monotonic() + timeout
    while len(result) < count and time.monotonic() < deadline:
        values = http("GET", f"http://backend:8080/internal/loadtest/events/{event}/waiting-room/admissions?limit={min(1000, count-len(result))}",
                      token=admin["token"]) or []
        for value in values:
            if value["user"] not in seen:
                seen.add(value["user"])
                result.append(value)
        if len(result) < count:
            time.sleep(0.25)
    if len(result) != count:
        raise RuntimeError(f"Timed out waiting for {count} admission pairs; received {len(result)}")
    target = Path("/data") / Path(output).name
    target.write_text(json.dumps(result))
    target.chmod(0o600)
    return {"event": str(event), "pairs": len(result), "output": target.name}


def http(method, url, token=None, basic=None, payload=None):
    headers = {}
    if token:
        headers["Authorization"] = "Bearer " + token
    if basic:
        headers["Authorization"] = "Basic " + base64.b64encode(basic.encode()).decode()
    if payload is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, method=method, headers=headers,
                                     data=None if payload is None else json.dumps(payload).encode())
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read()
        if method == "DELETE":
            return None
        return json.loads(body) if body.strip() else None


def reset(db):
    guard()
    # The orchestrator stops the backend first so workers cannot repopulate cleared state.
    if os.environ.get("BACKEND_STOPPED") != "true":
        raise RuntimeError("Reset requires the orchestrator to stop backend workers")
    db.execute("TRUNCATE users,events,ticket_tiers,outbox_events,processed_messages CASCADE")
    db.execute("SELECT pg_stat_statements_reset()")
    db.commit()
    cache = redis_client()
    count = 0
    # Re-scan until empty; SCAN is not a stable snapshot while deleting batches.
    while True:
        keys = list(cache.scan_iter(match="ticketrush:loadtest:*", count=1000))
        if not keys:
            break
        for offset in range(0, len(keys), 500):
            count += cache.delete(*keys[offset:offset + 500])
    basic = os.environ["RABBITMQ_USER"] + ":" + os.environ["RABBITMQ_PASSWORD"]
    queues = http("GET", "http://rabbitmq:15672/api/queues/%2F", basic=basic)
    purged = []
    for queue in queues:
        if queue["name"].startswith("notification.email"):
            from urllib.parse import quote
            http("DELETE", "http://rabbitmq:15672/api/queues/%2F/" + quote(queue["name"], safe="") + "/contents", basic=basic)
            purged.append(queue["name"])
    http("DELETE", "http://mailpit:8025/api/v1/messages")
    return {"redis_keys_deleted": count, "queues_purged": purged}


SQL_CHECKS = {
    "inventory": """SELECT t.id AS tier_id,t.total_quantity AS total,t.available_quantity AS available,
        coalesce(sum(r.quantity) FILTER (WHERE r.status='HELD'),0)::bigint AS held,
        coalesce(sum(r.quantity) FILTER (WHERE r.status='CONFIRMED'),0)::bigint AS confirmed,
        (SELECT count(*) FROM tickets k WHERE k.tier_id=t.id AND k.status='VALID') AS tickets
        FROM ticket_tiers t LEFT JOIN reservations r ON r.tier_id=t.id GROUP BY t.id ORDER BY t.id""",
    "payment_duplicates": """SELECT count(*) AS violations FROM
        (SELECT order_id FROM payments WHERE status='SUCCEEDED' GROUP BY order_id HAVING count(*)>1) x""",
    "ticket_duplicates": """SELECT count(*) AS violations FROM
        (SELECT order_id,ticket_index FROM tickets GROUP BY order_id,ticket_index HAVING count(*)>1) x""",
    "ticket_quantity": """SELECT count(*) AS violations FROM orders o JOIN reservations r ON r.id=o.reservation_id
        WHERE o.status='PAID' AND r.quantity<>(SELECT count(*) FROM tickets t WHERE t.order_id=o.id AND t.status='VALID')""",
    "idempotency": """WITH keys AS (SELECT user_id,key,response_body::jsonb->>'id' AS order_id
        FROM idempotency_keys WHERE endpoint='POST /api/v1/orders' AND status='COMPLETED' AND response_status=201),
        invalid AS (SELECT k.* FROM keys k LEFT JOIN orders o ON o.id::text=k.order_id AND o.user_id=k.user_id WHERE o.id IS NULL),
        missing AS (SELECT o.id FROM orders o LEFT JOIN keys k ON o.id::text=k.order_id AND o.user_id=k.user_id WHERE k.order_id IS NULL)
        SELECT (SELECT count(*) FROM orders) AS orders,(SELECT count(*) FROM keys) AS successful_keys,
        (SELECT count(DISTINCT (user_id,key)) FROM keys) AS distinct_keys,
        (SELECT count(DISTINCT order_id) FROM keys) AS distinct_effects,
        (SELECT count(*) FROM invalid)+(SELECT count(*) FROM missing) AS violations""",
    "paid_without_tickets": """SELECT count(*) AS violations FROM orders o WHERE status='PAID'
        AND NOT EXISTS(SELECT 1 FROM tickets t WHERE t.order_id=o.id AND t.status='VALID')""",
    "confirmed_without_paid": """SELECT count(*) AS violations FROM reservations r WHERE status='CONFIRMED'
        AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.reservation_id=r.id AND o.status='PAID')""",
    "outbox": """SELECT count(*) FILTER (WHERE status='PENDING') AS pending,
        count(*) FILTER (WHERE status='FAILED') AS failed,count(*) FILTER (WHERE status='PUBLISHED') AS published FROM outbox_events""",
    "emails": """SELECT count(*) AS paid_orders,
        count(*) FILTER (WHERE confirmations=1) AS exactly_one,
        coalesce(sum(confirmations),0)::bigint AS sent_confirmations,
        count(*) FILTER (WHERE confirmations<>1) AS violations FROM (SELECT o.id,
        (SELECT count(*) FROM email_notifications n JOIN outbox_events e ON e.id=n.event_id
        WHERE e.aggregate_id=o.id AND e.event_type='order.paid' AND n.type='order.paid' AND n.status='SENT') AS confirmations
        FROM orders o WHERE o.status='PAID') x""",
    "overdue_orders": """SELECT count(*) AS violations FROM orders
        WHERE status='PENDING_PAYMENT' AND payment_deadline + make_interval(secs => %s) < now()""",
    "expired_holds": """SELECT count(*) AS violations FROM reservations
        WHERE status='HELD' AND expires_at + make_interval(secs => %s) < now()""",
    "totals": """SELECT (SELECT count(*) FROM orders) AS orders,
        (SELECT count(*) FROM orders WHERE status='PAID') AS paid,
        (SELECT count(*) FROM orders WHERE status='PENDING_PAYMENT') AS pending_payment,
        (SELECT count(*) FROM reservations WHERE status='HELD') AS held,
        (SELECT count(*) FROM tickets WHERE status='VALID') AS valid_tickets"""
}


def snapshot(db, grace=5):
    result = {}
    for name, query in SQL_CHECKS.items():
        rows = db.execute(query, (grace,) if name in ("overdue_orders", "expired_holds") else ()).fetchall()
        result[name] = rows if name == "inventory" else rows[0]
    return result


def evaluate(data):
    inventory = data["inventory"]
    keys = data["idempotency"]
    checks = {
        "1_inventory_conservation": {"violations": int(not inventory) + sum(t["available"] < 0 or t["available"] + t["held"] + t["confirmed"] != t["total"] for t in inventory),
                                     "tiers_checked": len(inventory)},
        "2_ticket_conservation": {"violations": sum(t["tickets"] != t["confirmed"] or t["confirmed"] > t["total"] for t in inventory),
                                  "sold": sum(t["confirmed"] for t in inventory),
                                  "oversold": sum(max(0, t["confirmed"] + t["held"] - t["total"]) for t in inventory)},
        "3_idempotency": {**keys, "violations": keys["violations"] + int(len({keys["orders"], keys["successful_keys"], keys["distinct_keys"], keys["distinct_effects"]}) != 1)
                           + data["payment_duplicates"]["violations"] + data["ticket_duplicates"]["violations"] + data["ticket_quantity"]["violations"]},
        "4_paid_consistency": {"paid_without_tickets": data["paid_without_tickets"]["violations"],
                               "confirmed_without_paid": data["confirmed_without_paid"]["violations"],
                               "violations": data["paid_without_tickets"]["violations"] + data["confirmed_without_paid"]["violations"]},
        "5_outbox": {**data["outbox"], "violations": data["outbox"]["pending"] + data["outbox"]["failed"]},
        "6_emails": data["emails"],
        "8_expiry": {"overdue_orders": data["overdue_orders"]["violations"], "overdue_holds": data["expired_holds"]["violations"],
                     "violations": data["overdue_orders"]["violations"] + data["expired_holds"]["violations"]}
    }
    for check in checks.values():
        check["passed"] = check["violations"] == 0
    return checks


def drift_check(before, after):
    def mismatches(rows):
        return sum(row["observed"] is None or row["observed"] != row["expected"] or row["result"] in ("BUSY", "FALLBACK") for row in rows)
    return {"tiers_checked": len(after), "before_mismatches": mismatches(before), "after_mismatches": mismatches(after),
            "before": before, "after": after, "violations": mismatches(after), "passed": bool(after) and mismatches(after) == 0}


def verify(db, drain=180, grace=5, reconcile=True):
    deadline = time.monotonic() + drain
    while True:
        db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        data = snapshot(db, grace)
        db.rollback()
        # Do not declare success before abandoned holds and pending payments have expired.
        if (data["outbox"]["pending"] == 0 and data["totals"]["held"] == 0 and data["totals"]["pending_payment"] == 0
                and data["emails"]["violations"] == 0) or time.monotonic() >= deadline:
            break
        time.sleep(2)
    checks = evaluate(data)
    if data["totals"]["held"] or data["totals"]["pending_payment"]:
        checks["8_expiry"]["drain_incomplete"] = data["totals"]
        checks["8_expiry"]["passed"] = False
    if reconcile:
        token = json.loads(Path("/data/admin.json").read_text())["token"]
        events = db.execute("SELECT id FROM events ORDER BY id").fetchall()
        db.rollback()
        before, after, api_violations = [], [], []
        base = os.environ["API_URL"]
        api_errors = []
        for event in events:
            path = base + f"/api/v1/admin/events/{event['id']}/inventory/"
            try:
                api_violations.extend(http("GET", path + "reconcile", token))
                before.extend(http("POST", path + "redis-reconcile", token))
                after.extend(http("POST", path + "redis-reconcile", token))
            except Exception as error:
                api_errors.append({"event": str(event["id"]), "error": str(error)})
        checks["7_redis_drift"] = drift_check(before, after)
        checks["7_redis_drift"]["passed"] &= not api_errors and len(after) == len(data["inventory"])
        checks["admin_inventory_audit"] = {"violations": len(api_violations), "errors": api_errors,
                                            "passed": not api_violations and not api_errors}
    else:
        checks["7_redis_drift"] = {"passed": False, "reason": "Reconciliation was not executed"}
    return {"passed": all(c["passed"] for c in checks.values()), "checks": checks, "counts": data,
            "timestamp": int(time.time())}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["seed", "reset", "verify", "top-queries", "test", "queue-audit", "queue-open", "queue-config", "admission-pairs"])
    parser.add_argument("--users", type=int, default=20000)
    parser.add_argument("--background", type=int, default=200)
    parser.add_argument("--capacity", type=int, default=5000)
    parser.add_argument("--mixed-tiers", type=int, default=3)
    parser.add_argument("--waiting", action="store_true")
    parser.add_argument("--queue-closed", action="store_true")
    parser.add_argument("--event")
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--rate", type=int)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--drain", type=int, default=180)
    parser.add_argument("--grace", type=int, default=5)
    parser.add_argument("--output", default="verification.json")
    parser.add_argument("--top", type=int, default=10)
    args = parser.parse_args()
    guard()
    if args.command == "test":
        import unittest
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover(".", "test_*.py"))
        raise SystemExit(0 if result.wasSuccessful() else 1)
    with connect() as db:
        if args.command == "seed":
            result = seed(db, args.users, args.background, args.capacity, args.mixed_tiers, args.waiting, args.queue_closed)
        elif args.command == "reset":
            result = reset(db)
        elif args.command == "verify":
            result = verify(db, args.drain, args.grace)
        elif args.command == "queue-audit":
            result = queue_audit(uuid.UUID(args.event) if args.event else uid("HOT"))
        elif args.command == "queue-open":
            result = open_queue(db, uuid.UUID(args.event) if args.event else uid("HOT"))
        elif args.command == "queue-config":
            if args.rate is None:
                raise ValueError("queue-config requires --rate")
            result = configure_queue(uuid.UUID(args.event) if args.event else uid("HOT"), args.rate, args.output)
        elif args.command == "admission-pairs":
            result = admission_pairs(uuid.UUID(args.event) if args.event else uid("HOT"), args.count, args.timeout, args.output)
        else:
            result = {}
            for sort in ("total_exec_time", "mean_exec_time"):
                # Only this fixed allowlist is used as an SQL identifier; user N stays bound.
                from psycopg import sql
                result[sort] = db.execute(sql.SQL("SELECT queryid,query,calls,total_exec_time,mean_exec_time,rows FROM pg_stat_statements ORDER BY {} DESC LIMIT %s")
                                         .format(sql.Identifier(sort)), (max(1, min(args.top, 100)),)).fetchall()
        target = Path("/results") / Path(args.output).name
        target.write_text(json.dumps(result, indent=2, default=str))
        target.chmod(0o644)  # Sanitized reports are readable by CI artifact upload; credentials remain 0600.
        if args.command == "verify":
            print(json.dumps({"passed": result["passed"], "checks": {k: {f: v for f, v in c.items() if f not in ("before", "after")}
                              for k, c in result["checks"].items()}}, indent=2, default=str))
            raise SystemExit(0 if result["passed"] else 1)
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
