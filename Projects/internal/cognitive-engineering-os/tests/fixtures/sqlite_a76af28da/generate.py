"""Builds ``runtime/`` next to this file: the SQLite files and file trees the engine at a76af28da leaves in ``.runtime``.

Run it once, into an empty ``runtime/``, with the engine of commit a76af28da on the path (a throwaway worktree of that
commit). What it writes describes a frozen shape and is never regenerated on main:

    git worktree add --detach D:/tmp/gl_a76 a76af28da
    PYTHONPATH=D:/tmp/gl_a76/Projects/internal/cognitive-engineering-os python generate.py <this folder>/runtime

Two tenants (both say ``local-dev``, as production does), accounts with every credential kind, a case with sources, a
collection run, an interpretation, a synthesis, a report, case and person documents, an erased case (its tombstone stays),
custom workflows (one updated, one deleted), AI usage (settled and still reserved), one derived-artifact index row, and
the blobs the rows name. Nothing here is a real person: the one password is the word below.
"""

from __future__ import annotations

import hashlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

PASSWORD = "fixture-password-not-a-secret"


def main(out: Path) -> None:
    from ai_lego.core.domain.blocks import FAMILY_BLOCK
    from ai_lego.core.support import canonical_json, sha256_bytes
    from ai_lego.data.events import record_log
    from ai_lego.data.object.derived_artifact_cache import DerivedArtifactCache
    from ai_lego.data.object.json_artifact_store import JsonArtifactStore
    from ai_lego.data.object.tenant_scoped_cas import TenantScopedCas
    from ai_lego.data.repositories.case_docs import CaseDocs
    from ai_lego.data.repositories.custom_workflow_repository import CustomWorkflowRepository
    from ai_lego.data.repositories.project_source_repository import ProjectSourceRepository
    from ai_lego.platform.identity.store import IdentityStore

    out.mkdir(parents=True, exist_ok=True)
    for name in ("identity.sqlite3", "projects.sqlite3", "custom_workflows.sqlite3", "derived_cache.sqlite3"):
        if (out / name).exists():
            raise SystemExit(f"{name} exists: the fixture is generated once")
    tool_block = next(iter(FAMILY_BLOCK.values()))
    now = datetime.now(timezone.utc).replace(microsecond=0)
    stamp = now.isoformat().replace("+00:00", "Z")
    later = (now + timedelta(days=2)).isoformat().replace("+00:00", "Z")

    store = IdentityStore(out / "identity.sqlite3")
    repo = ProjectSourceRepository(out / "projects.sqlite3")
    workflows = CustomWorkflowRepository(out / "custom_workflows.sqlite3")
    docs = CaseDocs(repo)
    source_cas = TenantScopedCas(out / "source-cas")
    artifacts = JsonArtifactStore(TenantScopedCas(out / "artifact-cas"))

    tenants = []
    for label in ("alpha", "bravo"):
        tenant = store.create_tenant(f"tenant-{label}", f"Fixture {label}", "jurisdiction-pack.tw.v1", "local-dev", "local-dev-placeholder:no-kms-yet")
        workspace = store.create_workspace(str(uuid4()), tenant["tenant_id"], "Default")
        second = store.create_workspace(str(uuid4()), tenant["tenant_id"], "Second")
        person = store.create_identity(str(uuid4()), tenant["tenant_id"], f"{label}@fixture.example", f"{label.title()} 人", PASSWORD)
        tenants.append((tenant["tenant_id"], workspace["workspace_id"], second["workspace_id"], person["identity_id"]))
    (alpha, alpha_ws, _, alice), (bravo, bravo_ws, _, bob) = tenants
    carol = store.create_identity(str(uuid4()), alpha, "carol@fixture.example", "Carol", PASSWORD)["identity_id"]
    collector = store.create_identity(str(uuid4()), alpha, "collector@fixture.example", "Collector", PASSWORD)["identity_id"]
    store.authenticate(alpha, "alpha@fixture.example", PASSWORD)
    store.issue_handoff_code(alice, alpha, "/projects")
    store.issue_password_reset_token(alpha, "carol@fixture.example")
    for capability, granted in (("research.collect", True), ("ai.draft", True), ("billing.export", False)):
        store.record_entitlement_check(alpha, capability, granted)
    store.record_entitlement_check(bravo, "ai.draft", True)
    usage_id, _ = store.reserve_ai_usage(alpha, alice, "interpret:fixture", "claude-fixture", 100, 50, since=stamp, fits=lambda used: True, run_id="run-settled")
    store.settle_ai_usage(usage_id, "claude-fixture", 80, 40)
    store.reserve_ai_usage(alpha, alice, "interpret:fixture", "claude-fixture", 500, 500, since=stamp, fits=lambda used: True, run_id="run-still-reserved")
    store.reserve_ai_usage(bravo, bob, "draft", "claude-fixture", 10, 10, since=stamp, fits=lambda used: True)

    def project(tenant: str, workspace: str, owner: str, name: str) -> str:
        project_id = str(uuid4())
        repo.create_project({"project_id": project_id, "tenant_id": tenant, "workspace_id": workspace, "name": name, "purpose": "fixture",
                             "data_classification": "Confidential", "status": "active", "version": 1, "created_by_identity_id": owner, "created_at": stamp})
        return project_id

    def source(tenant: str, project_id: str, owner: str, title: str, content: bytes, **extra: object) -> str:
        source_id = str(uuid4())
        cas_path = TenantScopedCas.cas_path_for(tenant, content)
        record = {"source_id": source_id, "project_id": project_id, "tenant_id": tenant, "title": title, "media_type": "text/plain",
                  "data_classification": "Confidential", "content_sha256": sha256_bytes(content), "size_bytes": len(content),
                  "artifact_uri": TenantScopedCas.artifact_uri("fixture", project_id, source_id, cas_path), "content_role": "primary",
                  "verification_status": "unverified", "status": "active", "version": 1, "created_by_identity_id": owner, "created_at": stamp,
                  "doi": None, "authors": None, "venue": None, "published_at": None, **extra}
        repo.add_source(record, cas_path, lambda: source_cas.put(tenant, content), writer=record_log.user(owner, "GATHER"))
        return source_id

    main_case = project(alpha, alpha_ws, alice, "主要案子")
    source(alpha, main_case, alice, "貼上的文字", "第一份來源：台北，2026。".encode("utf-8"))
    source(alpha, main_case, alice, "Cited paper", b"second source body", doi="10.0000/fixture", authors=["A. Author", "B. 作者"], venue="Fixture Journal",
           published_at="Spring 2020", canonical_url="https://example.invalid/paper", source_uri="https://example.invalid/paper?utm=1", fetched_at=stamp,
           provenance={"by": "collector", "hops": 1}, source_class="paper", relevance={"weight": 0.25, "rank_hint": 1.0, "big": 12345678901234567890})
    shared = b"the same bytes in two cases"
    second_case = project(alpha, alpha_ws, alice, "第二個案子")
    source(alpha, second_case, alice, "shared A", shared)
    erased_case = project(alpha, alpha_ws, alice, "要被抹除的案子")
    source(alpha, erased_case, alice, "shared B", shared)
    source(alpha, erased_case, alice, "only here", b"bytes only the erased case had")
    bravo_case = project(bravo, bravo_ws, bob, "bravo case")
    source(bravo, bravo_case, bob, "bravo source", b"bravo bytes")

    run_id = str(uuid4())
    repo.create_collection_run({"run_id": run_id, "project_id": main_case, "tenant_id": alpha, "status": "requested", "seeds_count": 1, "max_fetches": 5,
                                "requested_by_identity_id": alice, "requested_at": stamp, "deadline_at": later}, [{"query": "fixture"}])
    store.issue_collect_grant(alpha, main_case, run_id, collector, later)   # one grant stays unexchanged,
    store.exchange_collect_grant(store.issue_collect_grant(alpha, main_case, run_id, collector, later))   # one is exchanged
    repo.mark_collection_running(alpha, run_id)
    repo.finish_collection_run(alpha, run_id, "completed", {"fetched": 3, "written": 2, "unchanged": 1, "refused": 0, "stopped_by": "budget"})

    reference = artifacts.put(alpha, "FixtureInterpretation", {"summary": "兩個來源的重點", "confidence_note": 0.25, "ratio": 1.0})
    reference["weights"] = [1.0, 0.5, 2]
    repo.save_interpretation(alpha, main_case, str(uuid4()), reference, stamp, block=tool_block)
    repo.save_synthesis(alpha, main_case, str(uuid4()), "literature", artifacts.put(alpha, "FixtureSynthesis", {"claims": ["一", "二"]}), stamp)
    repo.save_report(alpha, main_case, str(uuid4()), artifacts.put(alpha, "FixtureReport", {"title": "報告"}), stamp)
    repo.rename_project(alpha, main_case, "主要案子（改名）", alice)

    case_owner = record_log.case(main_case)
    card = docs.save(alpha, case_owner, "sense.card", {"category": "感受", "text": "我其實很怕跟他談"}, record_log.user(alice, "SENSE"))
    docs.save(alpha, case_owner, "sense.card", {"category": "事件", "text": "第二張卡"}, record_log.user(alice, "SENSE"))
    docs.save(alpha, case_owner, "sense.card", {"category": "感受", "text": "改過的第一張卡"}, record_log.user(alice, "SENSE"), doc_id=card["doc_id"], base_version=1)
    gone = docs.save(alpha, case_owner, "sense.card", {"category": "直覺", "text": "刪掉的卡"}, record_log.user(alice, "SENSE"))
    docs.delete(alpha, case_owner, "sense.card", gone["doc_id"], record_log.user(alice, "SENSE"))
    docs.save(alpha, record_log.person(alice), "govern.location", {"where": "在家"}, record_log.user(alice, "GOVERN"))
    docs.save(bravo, record_log.case(bravo_case), "sense.card", {"category": "期待", "text": "bravo card"}, record_log.user(bob, "SENSE"))
    docs.save(alpha, record_log.case(erased_case), "sense.card", {"category": "恐懼", "text": "抹除前的卡"}, record_log.user(alice, "SENSE"))
    repo.erase_project(alpha, erased_case, alice, source_cas, 0)

    kept = str(uuid4())
    for workflow_id, title, owner, tenant in ((kept, "我的流程", alice, alpha), (str(uuid4()), "會被刪的流程", alice, alpha), (str(uuid4()), "carol 的流程", carol, alpha), (str(uuid4()), "bravo 流程", bob, bravo)):
        workflows.create({"workflow_id": workflow_id, "tenant_id": tenant, "title": title, "method_ids": ["m.one", "m.two"], "created_by_identity_id": owner, "created_at": stamp, "updated_at": stamp})
        if title == "會被刪的流程":
            workflows.delete(tenant, workflow_id, owner)
    workflows.update(alpha, kept, "我的流程（改）", ["m.one", "m.two", "m.three"], stamp, alice)

    # Files the API keeps beside the databases: the journal's CAS under the tenant's hashed namespace, a run's journal.
    namespace = hashlib.sha256(alpha.encode("utf-8")).hexdigest()[:32]
    TenantScopedCas(out / "workflow-cas").put(namespace, canonical_json({"encrypted": "ciphertext-stand-in"}).encode("utf-8"))
    journal = out / "workflows" / namespace / hashlib.sha256(alice.encode("utf-8")).hexdigest()[:32] / "run-fixture.journal.json"
    journal.parent.mkdir(parents=True, exist_ok=True)
    journal.write_text(canonical_json({"run": "run-fixture", "steps": 2}), encoding="utf-8")

    cache = DerivedArtifactCache(TenantScopedCas(out / "artifact-cas"), out / "derived_cache.sqlite3", clock=lambda: now)
    cache.put(alpha, sha256_bytes(b"second source body"), "transcribe.fixture", "v1", {"text": "派生出來的文字"})

    print(f"fixture written to {out}")


if __name__ == "__main__":
    main(Path(sys.argv[1]).resolve())
