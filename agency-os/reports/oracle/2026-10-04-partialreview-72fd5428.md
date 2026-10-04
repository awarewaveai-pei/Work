# codex-oracle review -- 2026-10-04 13:44:44 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Second Codex pass on Claude's uncommitted step-2 integration change in the cognitive engine (Python FastAPI). Your first pass found F1 (CLI gateway urlopen + Anthropic SDK bypass egress), F2 (VERIFY not yet using quoted; deferred), F3 (ingest maps a case erased midway to 400), F4 (unreadable collect answer classified as no answer), F5 (value accepted beside 查不到). Fixes now: F1 -> AIGateway uses AnthropicProvider (egress allowlist) and egress.fetch_loopback_json (loopback IP literal only, no proxy, no redirect), test_egress_allowlist_parity forbids network imports outside egress.py and names the three modules that start processes; F3 -> two app-level exception handlers make any case-gone error (uncaught, or the cause of an HTTPException) a 404, per-route copies removed; F4 -> COLLECT_LOOKUP_MALFORMED_RESPONSE is MALFORMED, spec R7 rewritten; F5 -> evidence_words.cell refuses a value on non-查到. Also in this diff from before: require_case/CASE_ERASED for every case writer, the AI gate's quoted mechanism for someone else's words, CaseDocs.reads facade. Check the fixes close their class, any regression they cause (e.g. a route whose HTTPException context is a case-gone error but should not be 404; a caller passing value on a non-found cell; the CLI gateway behaviour change when the allowlist env is unset), and anything else concrete. Every finding with file:line.
- exit: 0 | elapsed: 729954ms | answer: 1506B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/doc_kinds.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/evidence_words.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/verify.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/project_source_repository.py, Projects/internal/cognitive-engineering-os/ai_lego/errors.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/research/source_manifest.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_execution/gateway.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gate.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/__init__.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/integrity.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collect_lookups.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collection_service.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/egress.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/errors.ts, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_SHARED_RULES.md, Projects/internal/cognitive-engineering-os/pyproject.toml, Projects/internal/cognitive-engineering-os/specs/wire/lookup.v1.json, Projects/internal/cognitive-engineering-os/tests/unit/test_api_ingest.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_govern.py, Projects/internal/cognitive-engineering-os/tests/unit/test_egress_allowlist_parity.py, Projects/internal/cognitive-engineering-os/tests/unit/test_gateway.py, Projects/internal/cognitive-engineering-os/tests/unit/test_second_coder.py, Projects/internal/cognitive-engineering-os/tests/unit/test_step2_foundation.py, Projects/internal/cognitive-engineering-os/tests/unit/case_fixture.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collect_lookups.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `CaseDocs.delete` permits late writes for person records linked to an erased case.
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py:94-95` -> `Projects/internal/cognitive-engineering-os/ai_lego/core/domain/doc_kinds.py:48-49`
  confidence  -> CONFIRMED
  scenario    -> A person-owned document with `from_case` is being deleted while its case is erased; because `delete` checks only `owner.kind == "case"`, it can append `DocDeleted` after the case is gone instead of raising `CASE_ERASED`, leaving an orphan person record.
  why missed  -> The new existence check was added to `save` and case-owned `delete`, but the person-owned `from_case` delete path has no equivalent check.

FINDING 2: The egress parity test misses valid direct network imports.
  file:line   -> `Projects/internal/cognitive-engineering-os/tests/unit/test_egress_allowlist_parity.py:32-37` -> `Projects/internal/cognitive-engineering-os/tests/unit/test_egress_allowlist_parity.py:65`
  confidence  -> CONFIRMED
  scenario    -> A new engine module uses `from http import client` followed by `client.HTTPConnection("attacker.example")`; `_OPENS_CONNECTIONS` matches `http.client` but not `from http import client`, so the test still passes while the module opens a connection outside `egress.py`.
  why missed  -> The detector matches a finite list of import spellings rather than checking all connection-capable APIs or exercising the claimed boundary.

TOTAL: 2 findings
