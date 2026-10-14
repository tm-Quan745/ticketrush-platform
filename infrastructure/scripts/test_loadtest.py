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

    def test_remote_write_failure_is_detected_case_insensitively(self):
        self.assertTrue(loadtest.remote_write_failed(
            'Failed to send the time series data to the endpoint'))
        self.assertTrue(loadtest.remote_write_failed('Stopping output failed'))
        self.assertFalse(loadtest.remote_write_failed('probe completed successfully'))

    def test_explicit_backend_commit_is_used_as_build_revision(self):
        self.assertEqual("abc123", loadtest.backend_build_revision(SimpleNamespace(backend_commit="abc123")))


if __name__ == '__main__':
    unittest.main()
