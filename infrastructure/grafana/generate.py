"""Generate checked-in dashboard JSON from auditable PromQL definitions."""
import json
from pathlib import Path

HTTP = 'http_server_requests_seconds'

def quantile(q):
    return f'histogram_quantile({q},sum by (le,uri) (rate({HTTP}_bucket[1m])))'

DASHBOARDS = {
    "overview": [
        ("Request rate by route", f'sum by (uri) (rate({HTTP}_count[1m]))', "reqps"),
        ("Error fraction (5xx)", f'sum(rate({HTTP}_count{{status=~"5.."}}[1m])) / clamp_min(sum(rate({HTTP}_count[1m])),0.01)', "percentunit"),
        ("p50 by endpoint", quantile(.5), "s"), ("p95 by endpoint", quantile(.95), "s"),
        ("p99 by endpoint", quantile(.99), "s"),
        ("4xx vs 5xx responses", f'sum by (status) (rate({HTTP}_count{{status=~"[45].."}}[1m]))', "reqps"),
        ("k6 request rate", 'sum(rate(k6_http_reqs_total[1m]))', "reqps"),
        ("Active alert conditions", 'ALERTS{alertstate="firing"}', "short")],
    "reservation-funnel": [
        ("Reservation attempts by result", 'sum by (result) (rate(reservation_attempts_total[1m]))', "reqps"),
        ("Orders created", 'ticketrush_funnel_orders_created', "short"),
        ("Orders paid", 'ticketrush_funnel_orders_paid', "short"),
        ("Tickets issued", 'ticketrush_funnel_tickets_issued', "short"),
        ("Inventory remaining (eight bounded slots)", 'ticketrush_inventory_remaining', "short")],
    "database": [
        ("Postgres connections", 'pg_stat_database_numbackends{datname!=""}', "short"),
        ("Hikari active connections", 'hikaricp_connections_active', "short"),
        ("Hikari pending threads", 'hikaricp_connections_pending', "short"),
        ("Connection acquire p95", 'histogram_quantile(0.95,sum by(le)(rate(hikaricp_connections_acquire_seconds_bucket[1m])))', "s"),
        ("Transactions per second", 'rate(pg_stat_database_xact_commit{datname!=""}[1m])+rate(pg_stat_database_xact_rollback{datname!=""}[1m])', "ops"),
        ("Sessions waiting on locks", 'ticketrush_database_lock_waits', "short"),
        ("Deadlocks per second", 'rate(pg_stat_database_deadlocks[1m])', "ops"),
        ("Slow query fingerprints (mean >=250ms)", 'ticketrush_database_slow_query_fingerprints', "short"),
        ("Buffer cache hit ratio", 'rate(pg_stat_database_blks_hit[1m])/clamp_min(rate(pg_stat_database_blks_hit[1m])+rate(pg_stat_database_blks_read[1m]),1)', "percentunit")],
    "redis": [
        ("Redis commands per second", 'rate(redis_commands_processed_total[1m])', "ops"),
        ("Lettuce command latency p95", 'histogram_quantile(0.95,sum by(le,command)(rate(lettuce_command_completion_seconds_bucket[1m])))', "s"),
        ("Redis memory", 'redis_memory_used_bytes', "bytes"),
        ("Keyspace hit rate", 'rate(redis_keyspace_hits_total[1m])/clamp_min(rate(redis_keyspace_hits_total[1m])+rate(redis_keyspace_misses_total[1m]),1)', "percentunit"),
        ("Redis gate active (0 = inactive or circuit open)", 'redis_gate_active', "short"),
        ("Redis circuit open", 'redis_circuit_open', "short"),
        ("Fallback operations", 'sum by(feature)(rate(redis_fallback_total[1m]))', "ops"),
        ("Inventory drift (last reconciliation)", 'inventory_drift', "short"),
        ("Public event cache hits", 'rate(cache_hit_total[1m])', "ops")],
    "messaging": [
        ("Outbox pending", 'outbox_pending_count', "short"),
        ("Oldest pending outbox age", 'outbox_oldest_pending_age_seconds', "s"),
        ("Outbox publish throughput", 'sum by(result)(rate(outbox_publish_total[1m]))', "ops"),
        ("Rabbit queue depth", 'rabbitmq_queue_messages', "short"),
        ("DLQ depth", 'rabbitmq_queue_messages{queue=~".*dlq"}', "short"),
        ("Email throughput", 'rate(email_sent_total[1m])', "ops")],
    "jvm-containers": [
        ("Backend process CPU", 'process_cpu_usage', "percentunit"),
        ("JVM heap used", 'sum by(instance)(jvm_memory_used_bytes{area="heap"})', "bytes"),
        ("GC pause max", 'jvm_gc_pause_seconds_max', "s"),
        ("JVM threads", 'jvm_threads_live_threads', "short"),
        ("Tomcat busy threads", 'tomcat_threads_busy_threads', "short"),
        ("Container CPU cores", 'sum by(name)(rate(container_cpu_usage_seconds_total{image!=""}[1m]))', "cores"),
        ("Container memory working set", 'container_memory_working_set_bytes{image!=""}', "bytes"),
        ("Container threads", 'container_threads{image!=""}', "short")],
    "waiting-room": [
        ("Queue size", 'waiting_room_size', "short"),
        ("Admission rate", 'rate(waiting_room_admitted_total[1m])', "ops"),
        ("Wait p50", 'histogram_quantile(0.5,sum by(le)(rate(waiting_room_wait_seconds_bucket[1m])))', "s"),
        ("Wait p95", 'histogram_quantile(0.95,sum by(le)(rate(waiting_room_wait_seconds_bucket[1m])))', "s"),
        ("Wait histogram", 'sum by(le)(rate(waiting_room_wait_seconds_bucket[1m]))', "ops")]
}

for slug, specs in DASHBOARDS.items():
    panels = []
    for i, (title, query, unit) in enumerate(specs):
        panels.append({"id": i + 1, "type": "timeseries", "title": title,
                       "datasource": {"type": "prometheus", "uid": "prometheus"},
                       "gridPos": {"h": 8, "w": 12, "x": (i % 2) * 12, "y": (i // 2) * 8},
                       "fieldConfig": {"defaults": {"unit": unit}, "overrides": []},
                       "targets": [{"refId": "A", "expr": query, "legendFormat": "{{uri}}{{result}}{{slot}}{{name}}{{queue}}{{command}}"}]})
    dashboard = {"uid": "tr-" + slug, "title": "TicketRush / " + slug.replace("-", " ").title(),
                 "schemaVersion": 41, "version": 1, "refresh": "5s", "tags": ["ticketrush"],
                 "time": {"from": "now-15m", "to": "now"}, "panels": panels}
    (Path(__file__).parent / "dashboards" / (slug + ".json")).write_text(json.dumps(dashboard, indent=2) + "\n")
