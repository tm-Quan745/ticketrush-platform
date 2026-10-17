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
        metadata = loadtest.k6_queue_parameters(args)
        expected = {"QUEUE_USERS": 900, "QUEUE_JOIN_VUS": 300, "QUEUE_POLLERS": 2500,
                    "QUEUE_POLL_DURATION": "90s", "CHECKOUT_VUS": 100,
                    "CHECKOUT_RATE": 20, "CHECKOUT_DURATION": "5s", "CHECKOUT_MAX_RETRIES": 3}
        self.assertEqual(expected, {key: metadata[key] for key in expected})

    def test_every_scenario_declares_started_completed_and_paid_minimums(self):
        for scenario in "ABCDEFGHWJRPQSTV":
            args = SimpleNamespace(scenario=scenario, users=900, param=[])
            declaration = loadtest.work_minimum(args)
            self.assertEqual({"started", "completed", "paid"}, set(declaration["minimums"]))
            self.assertEqual({"started", "completed", "paid"}, set(declaration["metrics"]))

    def test_empty_paid_checkout_fails_even_when_invariants_can_pass(self):
        declaration = {"minimums": {"started": 100, "completed": 100, "paid": 100},
                       "metrics": {"started": "checkout_started", "completed": "purchases_paid", "paid": "purchases_paid"}}
        summary = {"metrics": {"checkout_started": {"values": {"count": 100}},
                                "purchases_paid": {"values": {"count": 0}}}}
        result = loadtest.evaluate_work_minimum(summary, declaration)
        self.assertFalse(result["passed"])
        self.assertEqual({"started": 100, "completed": 0, "paid": 0}, result["actual"])

    def test_checkout_rejects_stale_admission_tokens(self):
        with self.assertRaisesRegex(RuntimeError, "older than five minutes"):
            loadtest.validate_admission_age(1000, 1301)
        self.assertEqual(299, loadtest.validate_admission_age(1000, 1299)["age_seconds"])


if __name__ == '__main__':
    unittest.main()
