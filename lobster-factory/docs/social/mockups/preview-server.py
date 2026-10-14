#!/usr/bin/env python3
"""Local preview of the social-manager mockups, wrapped in the same skeleton the Artifact publisher adds
(charset, viewport, body margin 0, [hidden] reset). The repo file stays the published file; this only lets a browser
on this machine render it in standards mode so layout can be measured before publishing.
Run:  python lobster-factory/docs/social/mockups/preview-server.py [port]   then open http://127.0.0.1:<port>/
(.claude/launch.json entry "social-mocks" starts it on 8766). Serves only the *-mock.html files in this folder;
anything else is 404, a foreign Host header is 403 (DNS rebinding), and a port already in use is an error, not a
silent second listener (Windows SO_REUSEADDR would let two servers share it)."""
import html, http.server, os, pathlib, sys
from urllib.parse import unquote, urlsplit

HERE = pathlib.Path(__file__).resolve().parent
SKELETON_HEAD = ('<!doctype html><html><head><meta charset="utf-8">'
                 '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
                 '<style>body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>')


def pages() -> dict[str, pathlib.Path]:
    return {p.name: p for p in sorted(HERE.glob("*-mock.html"))}


class H(http.server.BaseHTTPRequestHandler):
    def _body(self) -> tuple[int, bytes]:
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
        if host not in ("127.0.0.1", "localhost", "::1"):
            return 403, b"forbidden host"
        name = unquote(urlsplit(self.path).path).lstrip("/")
        found = pages()
        if name == "":
            links = "".join(f'<li><a href="/{html.escape(n)}">{html.escape(n)}</a></li>' for n in found)
            return 200, (SKELETON_HEAD + f"<ul>{links}</ul></body></html>").encode("utf-8")
        page = found.get(name)  # exact name from the folder listing: no traversal, no case-folded duplicate
        if page is None:
            return 404, b"not found"
        return 200, (SKELETON_HEAD + page.read_text(encoding="utf-8") + "</body></html>").encode("utf-8")

    def _send(self, head_only: bool) -> None:
        code, body = self._body()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8" if code == 200 else "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store"); self.end_headers()
        if not head_only:
            self.wfile.write(body)

    def do_GET(self):
        self._send(False)

    def do_HEAD(self):
        self._send(True)

    def log_message(self, fmt, *args):
        sys.stdout.write("%s %s\n" % (self.address_string(), fmt % args)); sys.stdout.flush()


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = os.name != "nt"


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    print(f"serving {HERE} on http://127.0.0.1:{port}/", flush=True)
    Server(("127.0.0.1", port), H).serve_forever()
