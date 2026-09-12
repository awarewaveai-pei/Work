"""One-time bootstrap: create the real (non-synthetic) Phase 1 self-use Tenant/Workspace/Identity
row set. Safe to re-run -- exits cleanly (no duplicate) if the tenant already exists.

Run::

    python -m ai_lego.apps.cli.bootstrap_phase1_tenant --email you@example.com --password '...'

See ``Projects/internal/cognitive-engineering-os/docs/COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md``.
``encryption_root_key_ref`` is a LOCAL-DEV PLACEHOLDER (no real KMS integration exists yet --
Phase 1 processes no third-party customer data, so this is a deferred, disclosed gap, not a
silent one; see that blueprint's risk-classification.json).
"""

from __future__ import annotations

import argparse
import getpass
import os
import sys
import uuid
from pathlib import Path

from ai_lego import PRODUCT_ROOT
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import IdentityStore

PHASE1_TENANT_LEGAL_NAME = "AwareWave (self-use, Phase 1)"
PHASE1_WORKSPACE_NAME = "Default"
PLACEHOLDER_KEK_REF = "local-dev-placeholder:no-kms-yet"


def default_db_path() -> Path:
    return Path(os.environ.get("COGNITIVE_OS_DB_PATH", PRODUCT_ROOT / ".runtime" / "identity.sqlite3"))


def bootstrap(store: IdentityStore, email: str, password: str, display_name: str) -> dict[str, str]:
    tenant_id = str(uuid.uuid4())
    tenant = store.create_tenant(
        tenant_id=tenant_id,
        legal_name=PHASE1_TENANT_LEGAL_NAME,
        home_jurisdiction="jurisdiction-pack.tw.v1",
        data_residency_region="local-dev",
        encryption_root_key_ref=PLACEHOLDER_KEK_REF,
    )
    workspace = store.create_workspace(str(uuid.uuid4()), tenant["tenant_id"], PHASE1_WORKSPACE_NAME)
    identity = store.create_identity(str(uuid.uuid4()), tenant["tenant_id"], email, display_name, password)
    return {"tenant_id": tenant["tenant_id"], "workspace_id": workspace["workspace_id"], "identity_id": identity["identity_id"]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--display-name", default="Operator")
    parser.add_argument("--password", default=None, help="Omit to be prompted (recommended -- avoids the password landing in shell history).")
    parser.add_argument("--db-path", type=Path, default=None)
    args = parser.parse_args(argv)

    if args.password is not None:
        print("WARNING: --password puts the plaintext password in shell history and process listings (ps/Task Manager) for as long as this process runs. Prefer omitting --password and entering it at the prompt.", file=sys.stderr)
    password = args.password or getpass.getpass("Password (>= 12 chars): ")
    store = IdentityStore(args.db_path or default_db_path())

    try:
        ids = bootstrap(store, args.email, password, args.display_name)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1

    print(f"PASS: Phase 1 tenant bootstrapped. tenant_id={ids['tenant_id']} workspace_id={ids['workspace_id']} identity_id={ids['identity_id']}")
    print(f"Log in with: POST /auth/login {{\"tenant_id\": \"{ids['tenant_id']}\", \"email\": \"{args.email}\", \"password\": \"...\"}}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
