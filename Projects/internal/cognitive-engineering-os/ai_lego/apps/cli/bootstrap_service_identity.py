"""One-time bootstrap: create a dedicated Cognitive OS Tenant/Workspace/service-account Identity
for an external system integration (first caller: next-admin's cs_knowledge_sources -> Cognitive OS
Source Import bridge, lib/cognitive-os/ in the next-admin app).

Distinct from ``bootstrap_phase1_tenant.py``, which bootstraps the ONE human operator login: this
script is for machine-to-machine service accounts, one tenant per integration, and NEVER prompts
interactively -- it must run non-interactively over ``docker exec`` (no TTY). Omit ``--password``
to auto-generate one (recommended: a service account has no human typing it in).

Run inside the cognitive-os-api container, so it writes the SAME identity.sqlite3 the running API
reads (``COGNITIVE_OS_DB_PATH``, see docker-compose.yml)::

    docker exec cognitive-os-api python -m ai_lego.apps.cli.bootstrap_service_identity \\
        --legal-name "EdD Research (service account)" \\
        --email edd-research-import@cognitive-os.local

See ``Projects/internal/cognitive-engineering-os/docs/COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md``.
``encryption_root_key_ref`` is a LOCAL-DEV PLACEHOLDER (no real KMS integration exists yet --
matches bootstrap_phase1_tenant.py's own disclosed gap, not a new one).
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
import uuid
from pathlib import Path

from ai_lego import PRODUCT_ROOT
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import IdentityStore

PLACEHOLDER_KEK_REF = "local-dev-placeholder:no-kms-yet"


def default_db_path() -> Path:
    return Path(os.environ.get("COGNITIVE_OS_DB_PATH", PRODUCT_ROOT / ".runtime" / "identity.sqlite3"))


def bootstrap_service_identity(
    store: IdentityStore,
    legal_name: str,
    workspace_name: str,
    email: str,
    display_name: str,
    password: str,
) -> dict[str, str]:
    tenant = store.create_tenant(
        tenant_id=str(uuid.uuid4()),
        legal_name=legal_name,
        home_jurisdiction="jurisdiction-pack.tw.v1",
        data_residency_region="local-dev",
        encryption_root_key_ref=PLACEHOLDER_KEK_REF,
    )
    workspace = store.create_workspace(str(uuid.uuid4()), tenant["tenant_id"], workspace_name)
    identity = store.create_identity(str(uuid.uuid4()), tenant["tenant_id"], email, display_name, password)
    return {"tenant_id": tenant["tenant_id"], "workspace_id": workspace["workspace_id"], "identity_id": identity["identity_id"]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--legal-name", required=True, help="e.g. 'EdD Research (service account)'")
    parser.add_argument("--workspace-name", default="Default")
    parser.add_argument("--email", required=True)
    parser.add_argument("--display-name", default="Service Account")
    parser.add_argument("--password", default=None, help="Omit to auto-generate (recommended -- this is a machine service account, not a human login).")
    parser.add_argument("--db-path", type=Path, default=None)
    args = parser.parse_args(argv)

    password = args.password or secrets.token_urlsafe(24)
    store = IdentityStore(args.db_path or default_db_path())

    try:
        ids = bootstrap_service_identity(store, args.legal_name, args.workspace_name, args.email, args.display_name, password)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1

    print(f"PASS: service tenant bootstrapped. tenant_id={ids['tenant_id']} workspace_id={ids['workspace_id']} identity_id={ids['identity_id']}")
    if args.password is None:
        print(f"GENERATED_PASSWORD={password}")
    print(f"Log in with: POST /auth/login {{\"tenant_id\": \"{ids['tenant_id']}\", \"email\": \"{args.email}\", \"password\": \"...\"}}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
