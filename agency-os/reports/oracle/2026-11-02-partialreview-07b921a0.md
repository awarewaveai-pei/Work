# codex-oracle review -- 2026-11-02 16:01:46 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up to the outreach background-generation change: the polling client now shows a Chinese 'interrupted, press again' message when GET ?runKey= answers 404 (job lost on a deploy restart; prior finding accepted as the run-jobs.ts trade-off). Verify the route + client together. If you cannot support a real finding, return none.
- exit: 0 | elapsed: 167164ms | answer: 681B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 輪詢在工作尚未完成或發生錯誤時，會向其他組織的客戶揭露工作狀態或錯誤內容
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts:97
  confidence  -> CONFIRMED
  scenario    -> B 組織的客戶知道 A 組織某筆 lead 的 UUID，並以該 UUID 組成 `runKey` 輪詢。A 的工作仍在執行時，`job.result` 尚不存在，組織檢查被略過，B 收到 `running`；工作拋錯時，B 還會收到錯誤內容（第 100–101 行）。
  why missed  -> 作者把組織 ID 放在完成後的 `result`，但授權檢查也依賴這個尚未存在的值。

TOTAL: 1 findings
