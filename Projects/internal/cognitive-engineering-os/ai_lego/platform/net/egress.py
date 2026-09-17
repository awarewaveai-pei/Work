"""EC §99 runtime egress gate + the single HTTP seam (moved out of research.literature_providers 2026-09-17
so the AI gateway shares one allowlist instead of a second copy).

Traps for future readers:
- ``fetch_json`` is the only place ``_OPENER.open`` is called; tests patch ``_OPENER.open`` or ``fetch_json``.
- Redirects are re-gated per hop by ``_NoCrossHostRedirects`` -- do not build a second opener.
"""

from __future__ import annotations

import http.client
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from ai_lego.errors import InvariantViolation

EGRESS_ALLOWLIST_ENV = "COGNITIVE_OS_NETWORK_EGRESS_ALLOWLIST"
DEFAULT_TIMEOUT_SECONDS = 20.0
MAX_BODY_BYTES = 4 * 1024 * 1024
USER_AGENT = "cognitive-os/1.0 (+https://cognitive.aware-wave.com)"


def egress_allowlist(environ: dict[str, str] | None = None) -> frozenset[str]:
    """Comma-separated bare hostnames. A scheme/port/path in an entry is a configuration error, named loudly
    (hostnames are not secret) instead of silently never matching."""
    env = os.environ if environ is None else environ
    raw = env.get(EGRESS_ALLOWLIST_ENV, "")
    hosts: set[str] = set()
    for entry in raw.split(","):
        host = entry.strip().lower()
        if not host:
            continue
        if any(ch in host for ch in "/:\\ \t") or host.startswith("."):
            raise InvariantViolation(f"EGRESS_ALLOWLIST_ENTRY_INVALID: {host!r} must be a bare hostname (no scheme, port, or path)")
        hosts.add(host)
    return frozenset(hosts)


def require_egress_allowed(host: str, environ: dict[str, str] | None = None) -> None:
    """EC §99 deny-by-default: an external host not on the runtime allowlist is refused before any I/O."""
    if host.lower() not in egress_allowlist(environ):
        raise InvariantViolation(
            f"NETWORK_EGRESS_DENIED: host {host!r} is not in {EGRESS_ALLOWLIST_ENV} "
            "(deny-by-default per policies/ai-execution/network-egress.yaml EGRESS-EC99-2)"
        )


class _NoCrossHostRedirects(urllib.request.HTTPRedirectHandler):
    """A redirect may only stay on the host we called: urllib copies every request header (including an API key)
    onto the redirected request, so "still on the allowlist" is not enough -- api.anthropic.com redirecting to
    api.openalex.org would ship the key. Same host is additionally re-gated by the allowlist."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401 -- urllib hook signature
        parts = urllib.parse.urlsplit(newurl)
        host = parts.hostname or ""
        if parts.scheme != "https":
            raise InvariantViolation(f"NETWORK_EGRESS_DENIED: redirect to non-https {newurl!r}")
        origin = urllib.parse.urlsplit(req.full_url).hostname if req is not None else None
        if origin is not None and host.lower() != origin.lower():
            raise InvariantViolation(f"NETWORK_EGRESS_DENIED: cross-host redirect {origin!r} -> {host!r} refused (request headers would be forwarded)")
        require_egress_allowed(host)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_NoCrossHostRedirects)


def fetch_json(
    url: str,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
    max_bytes: int = MAX_BODY_BYTES,
    error_prefix: str = "NETWORK",
) -> dict[str, Any]:
    """The only network seam. Egress-gate ``url``'s host, send, decode a JSON object.

    Any HTTP error is surfaced as ``<error_prefix>_UNAVAILABLE`` with the status code but never the
    response body (a provider's error body may echo request content)."""
    parts = urllib.parse.urlsplit(url)
    host = parts.hostname or ""
    if parts.scheme != "https":
        raise InvariantViolation(f"NETWORK_EGRESS_DENIED: only https egress is permitted, got {parts.scheme!r}")
    require_egress_allowed(host)
    request_headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if headers:
        request_headers.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    started = time.monotonic()
    try:
        with _OPENER.open(request, timeout=timeout) as response:  # noqa: S310 -- host allowlisted; redirects re-gated
            raw = response.read(max_bytes + 1)
    except urllib.error.HTTPError as error:
        raise InvariantViolation(f"{error_prefix}_UNAVAILABLE: HTTP {error.code} from {host}") from None
    except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError) as error:
        raise InvariantViolation(f"{error_prefix}_UNAVAILABLE: {type(error).__name__} reaching {host}") from None
    if len(raw) > max_bytes:
        raise InvariantViolation(f"{error_prefix}_MALFORMED_RESPONSE: body exceeds {max_bytes} bytes")
    if time.monotonic() - started > timeout * 2:
        raise InvariantViolation(f"{error_prefix}_UNAVAILABLE: provider exceeded the {timeout * 2:.0f}s wall-clock deadline")
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise InvariantViolation(f"{error_prefix}_MALFORMED_RESPONSE: {type(error).__name__}") from None
    if not isinstance(parsed, dict):
        raise InvariantViolation(f"{error_prefix}_MALFORMED_RESPONSE: top-level JSON is not an object")
    return parsed
