"""Grant or revoke the one granted role (docs/platform/STEP34_SHARED_RULES.md §5): the operator runs it where the API runs,
on the database the API reads (COGNITIVE_OS_DATABASE_URLS). No web route can do this.

    python -m ai_lego.apps.cli.grant_role --tenant T --identity I --role appeal_handler --by "operator name" [--revoke]
"""

from __future__ import annotations

import argparse
import sys

from ai_lego.data.db import Databases
from ai_lego.errors import InvariantViolation
from ai_lego.platform.identity.store import IdentityStore


def main(argv: list[str] | None = None, databases: Databases | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_lego.apps.cli.grant_role", description=__doc__.splitlines()[0])
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--identity", required=True)
    parser.add_argument("--role", required=True, choices=IdentityStore.GRANTED_ROLES)
    parser.add_argument("--by", help="the operator granting it (required to grant)")
    parser.add_argument("--revoke", action="store_true")
    args = parser.parse_args(argv)
    own = databases is None
    databases = databases or Databases.from_env(max_size=1)
    try:
        store = IdentityStore(databases)
        if args.revoke:
            changed = store.revoke_role(args.tenant, args.identity, args.role)
            print(f"{args.role} {'revoked' if changed else 'was not held'}: {args.identity}")
        else:
            changed = store.grant_role(args.tenant, args.identity, args.role, args.by or "")
            print(f"{args.role} {'granted' if changed else 'already held'}: {args.identity}")
    except InvariantViolation as error:
        print(str(error), file=sys.stderr)
        return 2
    finally:
        if own:
            databases.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
