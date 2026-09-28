# Inside the live cognitive-os-api container: every stored analysis of every tenant, as GET /interpretations/{id} would
# return it (record, result, gate_results, manifest, attempts), one JSON line each. Reads only.
# Run: docker exec -i cognitive-os-api python - < this file > out.jsonl
import json
from ai_lego.apps.api import main as m

repo = m.get_project_source_repository()
store = m.get_artifact_store()
import sqlite3
db = sqlite3.connect(f"file:{repo.db_path}?mode=ro", uri=True)
rows = list(db.execute("SELECT tenant_id, project_id, interpretation_id, artifact_reference_json, created_at FROM project_interpretations ORDER BY created_at"))
db.close()
for tenant, project, interp, ref, created in rows:
    artifact = store.read(tenant, json.loads(ref))
    events = repo.interpretation_events(tenant, interp)
    print(json.dumps({
        "tenant": tenant[-8:], "project": repo.get_project(tenant, project)["name"], "interpretation_id": interp, "created_at": created,
        "requested": next((e["payload"] for e in events if e["event_type"] == "InterpretationRequested"), None),
        "judgments": [e["payload"] for e in events if e["event_type"] == "InterpretationJudged"],
        "record": artifact["record"], "result": artifact["interpretation"], "gate_results": artifact["gate_results"],
        "attempts": artifact.get("attempts"), "manifest": artifact.get("prompt_manifest"),
    }, ensure_ascii=False))
