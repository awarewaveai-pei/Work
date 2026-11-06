# codex-oracle review -- 2026-11-06 08:18:55 +08:00

- mode: `review`
- scope: whole repo
- target: `b29c0aa31`
- context: C16.2 outreach: Gemini free-tier daily cap (retryDelay hours) must fail fast instead of burning the 120 s claim-check timeout; claim-consistency route gets an until cutoff so a multi-day batched measure keeps the same sample. Also check /root/c162-daily.sh logic is not in diff (host script) - review only code.
- exit: 0 | elapsed: 112626ms | answer: 1121B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/cheap-json-gemini.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `until` 無法固定跨日批次的訊息集合
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts:49
  confidence  -> CONFIRMED
  scenario    -> 第一天完成 offset 0–19；隔天有人透過 `messages/route.ts:198` 刪除其中一封。`until` 只排除較新的訊息，後續 offset 20 會跳過原本第 21 封；合併報告漏算一封。
  why missed  -> 修正只考慮新增訊息，未對照既有的硬刪除路徑。

FINDING 2: 跨日批次使用即時證據，核對條件未固定
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/claim-consistency/route.ts:61
  confidence  -> CONFIRMED
  scenario    -> 第一天量測部分信件後，某筆證據不再是 approved；第二天同一批樣本的後續信件由 `approvedEvidence` 讀到不同證據，甚至在第 62 行被略過。合併的一致率混用不同核對條件，`until` 無法防止。
  why missed  -> 固定了訊息建立時間，未追查核對時讀取的證據來源。

TOTAL: 2 findings
