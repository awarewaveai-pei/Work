"""/api/live/ws 只收本服務自己頁面的連線（Origin 守衛）。"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

import app as app_module  # noqa: E402
from lib.live.hub import origin_allowed  # noqa: E402


class OriginTests(unittest.TestCase):
    def test_only_this_service_as_origin(self):
        self.assertTrue(origin_allowed("http://127.0.0.1:8420", "127.0.0.1:8420"))
        self.assertTrue(origin_allowed("http://localhost:8420", "localhost:8420"))
        self.assertFalse(origin_allowed("https://evil.example", "127.0.0.1:8420"))
        self.assertFalse(origin_allowed("http://127.0.0.1:9999", "127.0.0.1:8420"))
        self.assertFalse(origin_allowed("http://evil.example:8420", "evil.example:8420"))
        self.assertFalse(origin_allowed("", "127.0.0.1:8420"))
        self.assertFalse(origin_allowed("null", "127.0.0.1:8420"))

    def test_a_foreign_page_cannot_open_the_socket(self):
        client = TestClient(app_module.app, base_url="http://127.0.0.1:8420")
        with self.assertRaises(WebSocketDisconnect):
            with client.websocket_connect("/api/live/ws", headers={"origin": "https://evil.example", "host": "127.0.0.1:8420"}):
                pass
        with client.websocket_connect("/api/live/ws", headers={"origin": "http://127.0.0.1:8420", "host": "127.0.0.1:8420"}) as ws:
            self.assertEqual(ws.receive_json()["type"], "snapshot")


if __name__ == "__main__":
    unittest.main()
