"""Export one study's research data (docs/platform/STEP34_SHARED_RULES.md §10, card 31): the operator runs it where the API
runs, on the database the API reads (COGNITIVE_OS_DATABASE_URLS), with the study's secret in
COGNITIVE_OS_STUDY_SECRET_<STUDY>. No web route exports research data. Prints the manifest (what was left out and why).

    python -m ai_lego.apps.cli.research_export --tenant T --study S --out file.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ai_lego.data import db
from ai_lego.data.db import Databases
from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
from ai_lego.errors import InvariantViolation
from ai_lego.platform import research_export


def main(argv: list[str] | None = None, databases: Databases | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m ai_lego.apps.cli.research_export", description=__doc__.splitlines()[0])
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--study", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)
    own = databases is None
    databases = databases or Databases.from_env(max_size=1)
    try:
        manifest = research_export.export(ProjectSourceRepository(databases), args.tenant, args.study, args.out, now=db.now())
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
    except InvariantViolation as error:
        print(str(error), file=sys.stderr)
        return 2
    finally:
        if own:
            databases.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
