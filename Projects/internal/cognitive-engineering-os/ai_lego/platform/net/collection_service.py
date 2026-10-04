"""The Collection Service seam (RESEARCH_LINES_MASTER_PLAN §12.7 I-a): COS asks next-admin to run one research
collection. Only a grant REFERENCE crosses; next-admin exchanges it for the token later (plan K3).

Traps for future readers:
- Goes through ``egress.fetch_json`` like every other outbound call: https only, host on the runtime allowlist
  (docker-compose.yml, kept inside policy EGRESS-EC99-2 by tests/unit/test_egress_allowlist_parity.py).
- The internal ``http://lobster-next-admin:3000`` is unreachable by construction (https-only, host-only allowlist);
  the public ``https://app.aware-wave.com`` is the address, same as the Trigger worker uses (plan K1).
"""

from __future__ import annotations

import os
from typing import Any, Callable, Mapping

from ai_lego.platform.net.egress import fetch_json

DEFAULT_COLLECTION_SERVICE_URL = "https://app.aware-wave.com"
LOOKUP_ERRORS = "COLLECT_LOOKUP"   # egress.fetch_json raises COLLECT_LOOKUP_UNAVAILABLE (no answer) or _MALFORMED_RESPONSE (an answer)
TIMEOUT_SECONDS = 20.0


class CollectionServiceClient:
    def __init__(self, base_url: str, token: str, *, fetch: Callable[..., dict[str, Any]] | None = None):
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._fetch = fetch or fetch_json

    def start_run(self, grant_ref: str, project_id: str, run_id: str, seeds: list[dict[str, Any]], budget: Mapping[str, int]) -> dict[str, Any]:
        """Raises ``InvariantViolation`` (COLLECTION_SERVICE_UNAVAILABLE / NETWORK_EGRESS_DENIED ...) when not accepted."""
        return self._fetch(
            f"{self._base_url}/api/internal/collect/runs",
            TIMEOUT_SECONDS,
            method="POST",
            headers={"Authorization": f"Bearer {self._token}"},
            body={"grant_ref": grant_ref, "project_id": project_id, "run_id": run_id, "seeds": seeds, "budget": dict(budget)},
            error_prefix="COLLECTION_SERVICE",
        )

    def lookup(self, project_id: str, kind: str, items: list[dict[str, Any]], timeout: float, dbs: list[str] | None = None) -> dict[str, Any]:
        """Collect lookups v1 (specs/wire/lookup.v1.json). Raises ``InvariantViolation`` like ``start_run``; read the
        answer only through ``collect_lookups``, which never lets that reach a hook. ``dbs``: the fact-check databases
        that see the words (absent = every one)."""
        return self._fetch(
            f"{self._base_url}/api/internal/collect/lookups",
            timeout,
            method="POST",
            headers={"Authorization": f"Bearer {self._token}"},
            body={"project_id": project_id, "kind": kind, **({"dbs": dbs} if dbs is not None else {}), "items": items},
            error_prefix=LOOKUP_ERRORS,
        )


def collection_service_from_env(environ: Mapping[str, str] | None = None) -> CollectionServiceClient | None:
    """``None`` when COLLECT_RESEARCH_RUNS_TOKEN is unset: collections answer 503 instead of calling out unauthenticated."""
    env = os.environ if environ is None else environ
    token = (env.get("COLLECT_RESEARCH_RUNS_TOKEN") or "").strip()
    if not token:
        return None
    return CollectionServiceClient((env.get("COGNITIVE_OS_COLLECTION_SERVICE_URL") or DEFAULT_COLLECTION_SERVICE_URL).strip(), token)
