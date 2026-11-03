# codex-oracle review -- 2026-11-03 08:56:57 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/pipeline-tick.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/send-adapter.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender-pool.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator: use the existing Gmail (awarewaveai@gmail.com, send_mode='draft', SPEC I10: never auto-sent) with the pipeline: research -> write -> (person approves in the queue; manual profile) -> pipeline creates Gmail drafts -> person presses send. pipeline.ts: drafting mailboxes = inPool (auto) OR autoDrafts (draft mode + healthy + active + connector settings.auto_draft === true); budget counts a draft mailbox's daily_limit x1.5. pipeline-store reads the switch from the connector join. send-adapter is untouched (reads only inPool). Verify nothing can make the draft mailbox send, and that a draft mailbox without the switch gets no automation. If you cannot support a real finding, return none.
- exit: 0 | elapsed: 161588ms | answer: 1938B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/pipeline-tick.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 重新連接 Gmail 會清掉 `auto_draft` 開關
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/gmail/oauth/callback/route.ts:107
  confidence  -> CONFIRMED
  scenario    -> 操作者已將 connector 的 `settings.auto_draft` 設為 `true`，之後因授權失效重新連接 Gmail → OAuth callback 以只含 email、scope、connected_at 的物件覆寫整個 `settings` → pipeline 不再為該信箱自動建立草稿。
  why missed  -> 開關的讀取邏輯在 diff 內；重新連線時覆寫設定的邏輯在 diff 外。

FINDING 2: 有多個草稿信箱時，寫信階段可能一直選到未開啟自動草稿的信箱
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sender.ts:34
  confidence  -> CONFIRMED
  scenario    -> 同一組織有兩個 draft 信箱：較早建立的 A 未開 `auto_draft`，B 已開；沒有 auto 寄送池 → `senderFor` 選 A 寫信，但 pipeline 只查 B 的已核准郵件（`pipeline.ts:145`）→ 信件持續停在 approved，無法進入預期的 Gmail 草稿流程。
  why missed  -> 新測試直接提供 senderId 為已開啟信箱的核准郵件，未經實際的 `senderFor` 選擇流程。

FINDING 3: 已停用的 Gmail connector 仍會啟動付費 pipeline 工作
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts:29
  confidence  -> CONFIRMED
  scenario    -> draft 信箱仍 active、healthy，connector 保留 `auto_draft: true`，但操作者將 connector 設為 `is_enabled: false` → 查詢只讀 `settings`，仍將該組織納入 pipeline 並計入研究／寫信預算；建立 Gmail 草稿時，`draft.ts:154-166` 拒絕停用的 connector → 產生無法交付的已核准郵件。
  why missed  -> 新的資格判斷未讀 connector 的啟用狀態；既有草稿流程會檢查它。

TOTAL: 3 findings
