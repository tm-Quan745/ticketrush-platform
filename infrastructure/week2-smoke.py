"""Verify Week 2 against running Docker Compose; remove only this run's fixtures."""
import json
import os
import secrets
import subprocess
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


def database(user_id, sql):
    result = subprocess.run(
        ["docker", "compose", "exec", "-T", "postgres", "sh", "-c",
         'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v smoke_user="$1"',
         "sh", user_id], input=sql, text=True, capture_output=True, check=True)
    return result.stdout


def main():
    port = os.environ.get("BACKEND_PORT", "8080")
    env_file = Path(".env")
    if env_file.exists() and "BACKEND_PORT" not in os.environ:
        for line in env_file.read_text().splitlines():
            if line.startswith("BACKEND_PORT="):
                port = line.split("=", 1)[1].strip() or port
    base = "http://127.0.0.1:" + port

    def request(method, path, body=None, token=None, expected=200):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        assert status == expected, (method, path, status, expected)
        return json.loads(raw) if raw else None

    account = {"email": "week2-smoke-" + secrets.token_hex(8) + "@example.com",
               "password": secrets.token_urlsafe(30)}
    user = request("POST", "/api/v1/auth/register", account, expected=201)
    try:
        regular = request("POST", "/api/v1/auth/login", account)["accessToken"]
        request("POST", "/api/v1/admin/events", {}, regular, expected=403)
        database(user["id"], "INSERT INTO user_roles(user_id, role_id) VALUES (:'smoke_user'::uuid, 2);\n")
        admin = request("POST", "/api/v1/auth/login", account)["accessToken"]
        now = datetime.now(timezone.utc).replace(microsecond=0)
        event = request("POST", "/api/v1/admin/events", {
            "title": "Week 2 Compose Smoke", "venueName": "Smoke Hall",
            "startTime": (now + timedelta(days=30)).isoformat(),
            "endTime": (now + timedelta(days=30, hours=2)).isoformat(),
            "saleStartTime": (now - timedelta(days=1)).isoformat(),
            "saleEndTime": (now + timedelta(days=29)).isoformat()}, admin, 201)
        event_path = "/api/v1/admin/events/" + event["id"]
        tier = request("POST", event_path + "/tiers", {
            "name": "Standard", "price": 1250, "currency": "USD",
            "totalQuantity": 100, "maxPerOrder": 5}, admin, 201)
        assert tier["availableQuantity"] == 100
        request("GET", "/api/v1/events/" + event["id"], expected=404)
        request("POST", event_path + "/publish", token=admin)
        exact = request("GET", event_path + "/inventory", token=admin)
        assert exact[0]["totalQuantity"] == exact[0]["availableQuantity"] == 100
        detail = request("GET", "/api/v1/events/" + event["id"])
        assert detail["tiers"][0]["availability"] == "AVAILABLE"
        assert "availableQuantity" not in json.dumps(detail)
        listing = request("GET", "/api/v1/events?keyword=Week%202%20Compose%20Smoke&onSale=true")
        assert any(e["id"] == event["id"] for e in listing["content"])
        spec = request("GET", "/v3/api-docs")
        paths = ["/events", "/events/{id}", "/admin/events", "/admin/events/{id}",
                 "/admin/events/{id}/publish", "/admin/events/{id}/cancel",
                 "/admin/events/{id}/tiers", "/admin/tiers/{id}", "/admin/events/{id}/inventory"]
        assert all("/api/v1" + p in spec["paths"] for p in paths)
        assert "201" in spec["paths"]["/api/v1/admin/events"]["post"]["responses"]
        for name in ["EventPage", "Detail", "PublicTier", "InventoryView"]:
            assert name in spec["components"]["schemas"]
        assert "200" in spec["paths"]["/api/v1/events"]["get"]["responses"]
        with urllib.request.urlopen(base + "/swagger-ui/index.html", timeout=30) as response:
            assert response.status == 200 and b"Swagger UI" in response.read()
        print("PASS: USER denied; ADMIN create event/tier, publish, exact inventory; anonymous list/detail")
        print("PASS: draft hidden; public quantities hidden; OpenAPI 9 paths; Swagger UI HTTP 200")
    finally:
        database(user["id"], """
            BEGIN;
            DELETE FROM ticket_tiers WHERE event_id IN (SELECT id FROM events WHERE created_by = :'smoke_user'::uuid);
            DELETE FROM events WHERE created_by = :'smoke_user'::uuid;
            DELETE FROM users WHERE id = :'smoke_user'::uuid;
            COMMIT;
            """)
        print("Cleanup: removed only this run's account/event/tier fixtures")


if __name__ == "__main__":
    main()
