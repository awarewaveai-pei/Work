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
import sys
import uuid

from ai_lego.data.db import Databases
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import IdentityStore

PHASE1_TENANT_LEGAL_NAME = "AwareWave (self-use, Phase 1)"
PHASE1_WORKSPACE_NAME = "Default"
PLACEHOLDER_KEK_REF = "local-dev-placeholder:no-kms-yet"


def bootstrap(store: IdentityStore, email: str, password: str, display_name: str, region: str) -> dict[str, str]:
    """``region``: a configured database region (COGNITIVE_OS_DATABASE_URLS) -- the tenant's data_residency_region."""
    tenant_id = str(uuid.uuid4())
    tenant = store.create_tenant(
        tenant_id=tenant_id,
        legal_name=PHASE1_TENANT_LEGAL_NAME,
        home_jurisdiction="jurisdiction-pack.tw.v1",
        data_residency_region=region,
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
    parser.add_argument("--region", default=None, help="The tenant's region; default: the first region of COGNITIVE_OS_DATABASE_URLS.")
    args = parser.parse_args(argv)

    if args.password is not None:
        print("WARNING: --password puts the plaintext password in shell history and process listings (ps/Task Manager) for as long as this process runs. Prefer omitting --password and entering it at the prompt.", file=sys.stderr)
    password = args.password or getpass.getpass("Password (>= 12 chars): ")
    try:
        with Databases.from_env(max_size=1) as databases:
            region = args.region or databases.directory_region
            for configured in databases.regions():
                databases.require_schema_at_head(configured)
            ids = bootstrap(IdentityStore(databases), args.email, password, args.display_name, region)
    except InvariantViolation as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1

    print(f"PASS: Phase 1 tenant bootstrapped. tenant_id={ids['tenant_id']} workspace_id={ids['workspace_id']} identity_id={ids['identity_id']}")
    print(f"Log in with: POST /auth/login {{\"tenant_id\": \"{ids['tenant_id']}\", \"email\": \"{args.email}\", \"password\": \"...\"}}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
