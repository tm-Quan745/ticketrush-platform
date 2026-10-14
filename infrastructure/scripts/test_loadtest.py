import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent))
import loadtest


class ObservabilityPreflightTest(unittest.TestCase):
    def test_compose_service_rows_accepts_object_and_array(self):
        self.assertEqual(
            [{"Service": "prometheus"}],
            loadtest.compose_service_rows('{"Service":"prometheus"}'))
        self.assertEqual(
            [{"Service": "prometheus"}],
            loadtest.compose_service_rows('[{"Service":"prometheus"}]'))
        self.assertEqual(
            [{"Service": "prometheus"}, {"Service": "cadvisor"}],
            loadtest.compose_service_rows('{"Service":"prometheus"}\n{"Service":"cadvisor"}'))

    def test_remote_write_failure_is_detected_case_insensitively(self):
        self.assertTrue(loadtest.remote_write_failed(
            'Failed to send the time series data to the endpoint'))
        self.assertTrue(loadtest.remote_write_failed('Stopping output failed'))
        self.assertFalse(loadtest.remote_write_failed('probe completed successfully'))

    def test_explicit_backend_commit_is_used_as_build_revision(self):
        self.assertEqual("abc123", loadtest.backend_build_revision(SimpleNamespace(backend_commit="abc123")))

    def test_healthy_cadvisor_target_uses_actual_prometheus_labels(self):
        self.assertTrue(loadtest.healthy_cadvisor_target({
            "health": "up", "labels": {"job": "containers", "instance": "cadvisor:8080"}}))
        self.assertFalse(loadtest.healthy_cadvisor_target({
            "health": "up", "labels": {"job": "cadvisor", "instance": "cadvisor:8080"}}))

    def test_preflight_keeps_probe_metric_after_k6_exits(self):
        command = loadtest.k6_preflight_command("probe-1")
        self.assertIn("K6_PROMETHEUS_RW_STALE_MARKERS=false", command)
        self.assertIn("preflight_id=probe-1", command)

    def test_closed_queue_seed_and_queue_metadata_are_recorded(self):
        args = SimpleNamespace(users=5000, background=200, capacity=5000, waiting=True, queue_closed=True,
                               param=["QUEUE_USERS=900", "QUEUE_POLLERS=2500", "QUEUE_POLL_DURATION=90s"])
        self.assertIn("--queue-closed", loadtest.seed_args(args))
        self.assertEqual({"QUEUE_USERS": 900, "QUEUE_JOIN_VUS": 300, "QUEUE_POLLERS": 2500,
                          "QUEUE_POLL_DURATION": "90s", "CHECKOUT_VUS": 100}, loadtest.k6_queue_parameters(args))


if __name__ == '__main__':
    unittest.main()
