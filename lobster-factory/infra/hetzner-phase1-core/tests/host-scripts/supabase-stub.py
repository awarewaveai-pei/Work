# Supabase REST stub for hosting-gate.test.sh (deprovision-staging.sh). MODE=empty|html|org.
# GET returns canned JSON per table; POST/PATCH/DELETE answer 204 and log "<METHOD> <path> <body>" to stdout.
import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

MODE = os.environ.get("MODE", "empty")
SITE = "https://aware-wave.com/staging/site-b"
ORG_ROWS = {
    "wp_sites": [{"url": SITE, "organization_id": "org-1"}],
    "client_credentials": [{"id": "cc-1", "secret_ref": "client_cred:cc-1", "label": "x"}],
    "organizations": [{"metadata": {"client_config": {"site_url": SITE + "/", "brandColors": {"primary": "#123456"}}}}],
}


class H(BaseHTTPRequestHandler):
    def _send(self, code, body=b""):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        table = self.path.split("?")[0].rsplit("/", 1)[-1]
        if MODE == "html" and table == "wp_sites":
            return self._send(200, b"<html>proxy error</html>")
        if MODE == "org" and table in ORG_ROWS:
            return self._send(200, json.dumps(ORG_ROWS[table]).encode())
        return self._send(200, b"[]")

    def _write(self):
        n = int(self.headers.get("Content-Length") or 0)
        print(f"{self.command} {self.path} {self.rfile.read(n).decode()}", flush=True)
        self._send(204)

    do_POST = do_PATCH = do_DELETE = _write

    def log_message(self, *args):
        pass


HTTPServer(("", 8080), H).serve_forever()
