# codex-oracle review -- 2026-11-02 15:58:21 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outreach message generation: POST /api/outreach/messages now runs the AI generation in the background (lib/collect/run-jobs.ts startRunJob, same pattern as leads/research) and answers 202 {runKey}; GET ?runKey= polls; a second press for the same lead while running joins the same job; pasted replies stay synchronous; ReviewClient polls. Reason: prod 2026-11-02 generation >100s -> Cloudflare 524 while the server still wrote the set. Also verify: does this change depend on something NOT visible in this diff (config, timeout, upstream default)? If you cannot support a real finding, return none.
- exit: 0 | elapsed: 138040ms | answer: 756B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/review/ReviewClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 已回覆 202 的產信工作會在部署重建容器時消失
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts:84
  confidence  -> CONFIRMED
  scenario    -> 操作者在部署前開始產信，POST 回覆 202；產信尚未寫入資料庫時，夜間部署執行 `docker compose up -d` 重建 next-admin 容器。工作與記憶體中的進度一起消失，後續輪詢回覆 404，也沒有產生信件。工作只存在 `run-jobs.ts:43` 的 Map；部署路徑見 `sg-deploy.sh:359–360`。
  why missed  -> 沿用既有的記憶體工作追蹤模式，但這裡的 202 會讓使用者以為工作已被可靠接收；部署生命週期不在本次 diff 內。

TOTAL: 1 findings
