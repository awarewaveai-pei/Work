"""Pure authentication policy shared by video-service startup and its tests."""

from __future__ import annotations

import ipaddress


def is_loopback_host(host: str) -> bool:
    """Return true only for an explicit local bind address."""
    normalized = host.strip().strip("[]").lower()
    if normalized == "localhost":
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


def authentication_required(
    *, render_auth_token: str, host: str, allow_insecure_local_render: bool
) -> bool:
    """Validate startup policy and return whether requests require a token.

    Empty credentials are allowed only for an explicit developer opt-in bound to a
    loopback address. A non-loopback process must never silently run fail-open.
    """
    if render_auth_token.strip():
        return True
    if allow_insecure_local_render and is_loopback_host(host):
        return False
    raise RuntimeError(
        "RENDER_AUTH_TOKEN is required unless ALLOW_INSECURE_LOCAL_RENDER=true "
        "and VIDEO_SERVICE_HOST is loopback"
    )
