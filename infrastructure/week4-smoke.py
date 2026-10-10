"""Real HTTP Week 4 smoke against an isolated Compose stack; cleans only its fixtures."""
import json
import os
import secrets
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone

import subprocess


def database(user_id, sql):
    return subprocess.run(
        ["docker", "compose", "exec", "-T", "postgres", "sh", "-c",
         'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v smoke_user="$1"',
         "sh", user_id], input=sql, text=True, capture_output=True, check=True).stdout


def main():
    base = "http://127.0.0.1:" + os.environ.get("BACKEND_PORT", "28082")
    test_token = os.environ["MOCK_PAYMENT_TEST_TOKEN"]

    def request(method, path, body=None, token=None, expected=200, extra=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        headers.update(extra or {})
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                status, raw, response_headers = response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            status, raw, response_headers = error.code, error.read(), error.headers
        assert status == expected, (method, path, status, expected, raw.decode())
        return (json.loads(raw) if raw else None), response_headers

    account = {"email": "week4-smoke-" + secrets.token_hex(8) + "@example.com",
               "password": secrets.token_urlsafe(30)}
    user, _ = request("POST", "/api/v1/auth/register", account, expected=201)
    try:
        regular = request("POST", "/api/v1/auth/login", account)[0]["accessToken"]
        database(user["id"], "INSERT INTO user_roles(user_id,role_id) VALUES (:'smoke_user'::uuid,2);\n")
        admin = request("POST", "/api/v1/auth/login", account)[0]["accessToken"]
        now = datetime.now(timezone.utc).replace(microsecond=0)
        event, _ = request("POST", "/api/v1/admin/events", {
            "title": "Week 4 Compose Smoke", "venueName": "Hall",
            "startTime": (now + timedelta(days=30)).isoformat(),
            "endTime": (now + timedelta(days=30, hours=2)).isoformat(),
            "saleStartTime": (now - timedelta(days=1)).isoformat(),
            "saleEndTime": (now + timedelta(days=29)).isoformat()}, admin, 201)
        event_path = "/api/v1/admin/events/" + event["id"]
        tier, _ = request("POST", event_path + "/tiers", {
            "name": "Standard", "price": 1250, "currency": "USD",
            "totalQuantity": 100, "maxPerOrder": 5}, admin, 201)
        request("POST", event_path + "/publish", token=admin)
        for scenario in ("SUCCESS", "FAILURE", "DUPLICATE_WEBHOOK"):
            hold, _ = request("POST", "/api/v1/reservations", {"tierId": tier["id"], "quantity": 3}, regular, 201)
            body = {"reservationId": hold["id"], "totalAmount": 1}
            headers = {"Idempotency-Key": str(uuid.uuid4()), "X-Mock-Scenario": scenario,
                       "X-Mock-Test-Token": test_token}
            order, _ = request("POST", "/api/v1/orders", body, regular, 201, headers)
            replay, replay_headers = request("POST", "/api/v1/orders", body, regular, 201, headers)
            assert replay == order and replay_headers["Idempotency-Replayed"] == "true"
            assert order["totalAmount"] == 3750
            path = "/api/v1/orders/" + order["id"]
            expected = "PAYMENT_FAILED" if scenario == "FAILURE" else "PAID"
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                current = request("GET", path, token=regular)[0]
                if current["status"] == expected:
                    break
                time.sleep(0.1)
            assert current["status"] == expected, (scenario, current)
            if expected == "PAID":
                tickets = request("GET", path + "/tickets", token=regular)[0]
                assert len(tickets) == 3 and len({t["ticketCode"] for t in tickets}) == 3
            else:
                request("GET", path + "/tickets", token=regular, expected=409)
            assert request("GET", event_path + "/inventory/reconcile", token=admin)[0] == []
            print("PASS:", scenario, "register/login -> reserve -> order/replay -> signed HTTP webhook ->", expected)
        spec = request("GET", "/v3/api-docs")[0]
        paths = ("/orders", "/orders/me", "/orders/{id}", "/orders/{id}/cancel",
                 "/orders/{id}/tickets", "/payments/webhook", "/admin/orders", "/admin/orders/{id}/refund")
        assert all("/api/v1" + path in spec["paths"] for path in paths)
        assert "201" in spec["paths"]["/api/v1/orders"]["post"]["responses"]
        assert "totalAmount" in spec["components"]["schemas"]["OrderView"]["properties"]
        assert "reservationId" in spec["components"]["schemas"]["OrderCreate"]["properties"]
        with urllib.request.urlopen(base + "/swagger-ui/index.html", timeout=30) as response:
            assert response.status == 200 and b"Swagger UI" in response.read()
        print("PASS: Swagger UI HTTP 200; OpenAPI contains all eight Week 4 paths; reconcile empty")
    finally:
        database(user["id"], """
            BEGIN;
            DELETE FROM payment_events WHERE payment_id IN
                (SELECT p.id FROM payments p JOIN orders o ON o.id=p.order_id WHERE o.user_id=:'smoke_user'::uuid);
            DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE user_id=:'smoke_user'::uuid);
            DELETE FROM tickets WHERE user_id=:'smoke_user'::uuid;
            DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id=:'smoke_user'::uuid);
            DELETE FROM orders WHERE user_id=:'smoke_user'::uuid;
            DELETE FROM idempotency_keys WHERE user_id=:'smoke_user'::uuid;
            DELETE FROM reservations WHERE user_id=:'smoke_user'::uuid;
            DELETE FROM ticket_tiers WHERE event_id IN (SELECT id FROM events WHERE created_by=:'smoke_user'::uuid);
            DELETE FROM events WHERE created_by=:'smoke_user'::uuid;
            DELETE FROM users WHERE id=:'smoke_user'::uuid;
            COMMIT;
            """)
        print("Cleanup: removed only this smoke run's fixtures")


if __name__ == "__main__":
    main()
