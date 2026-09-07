import pathlib
import sys
import unittest

SERVICE_DIR = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_DIR))

from auth_policy import authentication_required, is_loopback_host  # noqa: E402


class AuthenticationPolicyTests(unittest.TestCase):
    def test_recognises_only_loopback_hosts(self):
        self.assertTrue(is_loopback_host("127.0.0.1"))
        self.assertTrue(is_loopback_host("::1"))
        self.assertTrue(is_loopback_host("localhost"))
        self.assertFalse(is_loopback_host("0.0.0.0"))
        self.assertFalse(is_loopback_host("video-service"))

    def test_token_requires_authentication(self):
        self.assertTrue(
            authentication_required(
                render_auth_token="test-token",
                host="0.0.0.0",
                allow_insecure_local_render=False,
            )
        )

    def test_empty_token_is_rejected_without_explicit_local_exception(self):
        with self.assertRaisesRegex(RuntimeError, "RENDER_AUTH_TOKEN"):
            authentication_required(
                render_auth_token="",
                host="127.0.0.1",
                allow_insecure_local_render=False,
            )

    def test_local_exception_requires_loopback(self):
        self.assertFalse(
            authentication_required(
                render_auth_token="",
                host="127.0.0.1",
                allow_insecure_local_render=True,
            )
        )
        with self.assertRaisesRegex(RuntimeError, "RENDER_AUTH_TOKEN"):
            authentication_required(
                render_auth_token="",
                host="0.0.0.0",
                allow_insecure_local_render=True,
            )


if __name__ == "__main__":
    unittest.main()
