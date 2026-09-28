# Inside the live cognitive-os-api container: what GET /projects now returns per tenant, through the deployed code
# (the endpoint's own _project_with_activity over the repository), plus each project's analyses newest first.
# Reads only. Run: docker exec -i cognitive-os-api python - < this file
import json
import sqlite3
from ai_lego.apps.api import main as m

repo = m.get_project_source_repository()
db = sqlite3.connect(f"file:{repo.db_path}?mode=ro", uri=True)
tenants = [t for (t,) in db.execute("SELECT DISTINCT tenant_id FROM platform_projects ORDER BY tenant_id")]
db.close()
for tenant in tenants:
    analyses, activity, tasks, reruns = m._analyses(repo, tenant), repo.last_activity(tenant), repo.tasks(tenant), repo.reruns(tenant)   # as GET /projects reads them
    for project in repo.list_projects(tenant):
        shown = m._project_with_activity(project, analyses, activity, tasks, reruns)
        latest = shown["latest_analysis"]
        print(json.dumps({
            "tenant": tenant[-8:], "name": shown["name"], "created": shown["created_at"], "updated": shown["updated_at"],
            "analyses": shown["analysis_count"], "methods": shown["methods"], "latest": latest and [latest["status"], latest["requested_at"]],
            "list": [[a["status"], a["requested_at"], a["interpretation_id"][-6:]] for a in reversed(analyses.get(project["project_id"], []))],
        }, ensure_ascii=False))
