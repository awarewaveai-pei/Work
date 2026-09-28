#!/usr/bin/env bash
# Row counts of the live Cognitive OS databases, read-only. Usage: bash -s < this file
set -euo pipefail
VOL=/var/lib/docker/volumes/cognitive-engineering-os_cognitive-os-identity-data/_data
sudo -n python3 - "$VOL" <<'PY'
import json, pathlib, sqlite3, sys
rt = pathlib.Path(sys.argv[1]); out = {}
for d in ["identity.sqlite3", "projects.sqlite3", "custom_workflows.sqlite3"]:
    c = sqlite3.connect(f"file:{rt / d}?mode=ro", uri=True)
    out[d] = {t: c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for (t,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    out[d]["_integrity"] = c.execute("PRAGMA integrity_check").fetchone()[0]
    c.close()
print(json.dumps(out))
PY
