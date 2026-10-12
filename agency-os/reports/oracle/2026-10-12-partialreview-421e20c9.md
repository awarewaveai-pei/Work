# codex-oracle review -- 2026-10-12 13:08:46 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Two fixes in next-admin collect. (1) Search vendor language/region params come from one per-vendor table SEARCH_LOCALES in search/drivers.ts: Brave rejected search_lang=zh with HTTP 422 so it never answered; zh now maps to zh-hant+country TW (probed 200), Serper hl=zh-tw gl=tw, an unmapped code throws. (2) orchestrator.ts: when a strategy read a page and the quality gate refused it, then every heavier strategy failed, the refusal (e.g. blocked_page firewall page) is now settled as the page answer instead of the generic fetch_failed (which was worded 系統讀不到這一頁); remaining failures carry fetch_failed:http_N / content_type_X, dns_failed, blocked_by_gate codes worded in sinks/cognitive.ts asideWhy. Do not change wire shapes (Projects/internal/cognitive-engineering-os/specs/wire/collector.v2.json).
- exit: 0 | elapsed: 593786ms | answer: 773B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-official-sources.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-search-locale.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/collectors/web-search.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/orchestrator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/search/drivers.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/cognitive.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A later heavy-tier error erases a more specific earlier fetch diagnosis.

  file:line   -> `orchestrator.ts:584` -> `orchestrator.ts:644`; `http-html.ts:377` -> `extract-provider.ts:116`
  confidence  -> CONFIRMED
  scenario    -> With rendering enabled, `/download` returns `application/zip`; the HTML tier records `status=415`, then the renderer returns malformed JSON and throws a status-less error. `lastFailure` is overwritten, so the final aside becomes bare `fetch_failed` instead of `fetch_failed:content_type_application/zip`.
  why missed  -> Tests cover detailed codes with only one failing strategy (`collect-official-sources.test.ts:155`, `:162`), not a specific first-tier failure followed by an unstructured heavier-tier failure.

TOTAL: 1 finding
