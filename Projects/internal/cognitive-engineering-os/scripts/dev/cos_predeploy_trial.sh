#!/usr/bin/env bash
# Cognitive OS pre-deploy, run on the host: (1) consistent backup of the live data volume (SQLite backup API, plain copy
# for the stores); (2) the target commit's product + spec extracted to a trial tree whose .runtime is a copy of that
# backup; (3) the API's own constructors open the copies (their open-time migrations run), every table's row count is
# compared before/after, every existing project and its sources are read back, /health and /catalog answer.
# Never touches the live volume except to read it. Usage: bash -s <sha> < this file
set -euo pipefail
SHA="$1"
VOL=/var/lib/docker/volumes/cognitive-engineering-os_cognitive-os-identity-data/_data
TS=$(date -u +%Y%m%dT%H%M%SZ)
WORK=/home/ubuntu/cos-predeploy-$TS
mkdir -p "$WORK"
echo "work=$WORK"
cd /opt/cognitive-os
git fetch --quiet origin main
git cat-file -e "$SHA^{commit}"
echo "target=$(git log --oneline -1 "$SHA")"

sudo -n python3 - "$VOL" "$WORK/backup" <<'PY'
import pathlib, shutil, sqlite3, sys
src, dst = map(pathlib.Path, sys.argv[1:3])
n = 0
for p in sorted(src.rglob("*")):
    q = dst / p.relative_to(src)
    if p.is_dir():
        q.mkdir(parents=True, exist_ok=True); continue
    q.parent.mkdir(parents=True, exist_ok=True)
    if p.name.endswith(("-wal", "-shm", "-journal")):
        continue                                   # folded into the backup-API copy of its database
    if p.suffix == ".sqlite3":
        s = sqlite3.connect(f"file:{p}?mode=ro", uri=True); d = sqlite3.connect(q)
        s.backup(d); d.close(); s.close()
        ok = sqlite3.connect(q).execute("PRAGMA integrity_check").fetchone()[0]
        print(f"backup {p.name}: integrity {ok}")
    else:
        shutil.copy2(p, q)
    n += 1
print(f"backup files: {n}")
PY
sudo -n chown -R ubuntu:ubuntu "$WORK/backup"

mkdir -p "$WORK/trial"
git archive "$SHA" Projects/internal/cognitive-engineering-os agency-os/docs/AI_LEGO_Cognitive_Engineering_OS | tar -x -C "$WORK/trial"
PRODUCT="$WORK/trial/Projects/internal/cognitive-engineering-os"
mkdir -p "$PRODUCT/.runtime"
cp -a "$WORK/backup/." "$PRODUCT/.runtime/"

cd "$PRODUCT"
COGNITIVE_OS_DB_PATH="$PRODUCT/.runtime/identity.sqlite3" PYTHONPATH="$PRODUCT" /opt/cognitive-os/.deploy-venv/bin/python3 - "$PRODUCT" <<'PY'
import json, pathlib, sqlite3, sys
product = pathlib.Path(sys.argv[1]); rt = product / ".runtime"
import ai_lego
assert pathlib.Path(ai_lego.__file__).resolve().is_relative_to(product.resolve()), ai_lego.__file__
from ai_lego.apps.api import main as m
assert m.PRODUCT_ROOT.resolve() == product.resolve(), m.PRODUCT_ROOT
DBS = ["identity.sqlite3", "projects.sqlite3", "custom_workflows.sqlite3"]
def counts(path):
    c = sqlite3.connect(path)
    out = {t: c.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for (t,) in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    c.close(); return out
def columns(path, table):
    c = sqlite3.connect(path); cols = [r[1] for r in c.execute(f'PRAGMA table_info("{table}")')]; c.close(); return cols
before = {d: counts(rt / d) for d in DBS}
cols_before = columns(rt / "projects.sqlite3", "prov_sources")
store = m.get_store(); repo = m.get_project_source_repository(); workflows = m.get_custom_workflow_repository()
after = {d: counts(rt / d) for d in DBS}
changed_existing = {d: {t: [before[d][t], after[d].get(t)] for t in before[d] if before[d][t] != after[d].get(t)} for d in DBS}
new_tables = {d: sorted(set(after[d]) - set(before[d])) for d in DBS}
print("rows before:", json.dumps(before))
print("existing tables whose row count changed:", json.dumps(changed_existing))
print("new tables:", json.dumps(new_tables))
print("prov_sources new columns:", sorted(set(columns(rt / "projects.sqlite3", "prov_sources")) - set(cols_before)))
c = sqlite3.connect(rt / "projects.sqlite3")
pairs = list(c.execute("SELECT tenant_id, project_id FROM platform_projects")); c.close()
sources = 0
for tenant_id, project_id in pairs:
    assert repo.get_project(tenant_id, project_id) is not None
    sources += len(repo.list_sources(tenant_id, project_id))
print(f"read back through the new code: {len(pairs)} projects, {sources} sources")
total = 0
for tenant_id in sorted({t for t, _ in pairs}):
    for project_id, items in repo.analyses(tenant_id).items():
        for item in items:
            latest = repo.interpretation_events(tenant_id, item["interpretation_id"])[-1]["event_type"]
            expected = {"InterpretationRequested": "PENDING", "InterpretationFailed": "FAILED"}.get(latest, "DONE")
            assert item["status"] == expected, (item["interpretation_id"], item["status"], latest)
            total += 1
    missing = {p for t, p in pairs if t == tenant_id} - set(repo.last_activity(tenant_id))
    assert not missing, missing
print(f"analyses read through the new code: {total}, each status equal to GET /interpretations' reading; every project has a last activity")
from fastapi.testclient import TestClient
client = TestClient(m.app)
health = client.get("/health"); catalog = client.get("/catalog")
print("health", health.status_code, health.json().get("status"), "| catalog", catalog.status_code, catalog.json().get("counts"))
bad = any(changed_existing[d] for d in DBS) or health.status_code != 200 or catalog.status_code != 200
print("TRIAL", "FAIL" if bad else "PASS")
sys.exit(1 if bad else 0)
PY
echo "trial done: $WORK"
