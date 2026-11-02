# codex-oracle review -- 2026-11-02 13:22:17 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generation-schema.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/review-policy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/brand-context.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/review-sampling.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/generation.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS v2 card C16.1+C16.3 (Claude SDK worker): risk-weighted deterministic review sampling keeping the expected total at review_sample_pct (weights: new profile, new industry, low evidence confidence, profile x angle bounce/negative rate above org), fixed angle vocabulary in the generation JSON written to co_messages.angle, winning-angle section in brand-context and pickVariant leaning 75/25 to the winner after >=30 sends per angle. Manual review_mode must never auto-approve; sample_pct never 0. SSOT agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md section 6 C16, SPEC D23 D24.
- exit: 0 | elapsed: 112674ms | answer: 2366B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/generation.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/brand-context.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/generation-schema.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/review-policy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/review-sampling.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 新 profile 的抽樣率可達設定值的五倍
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/review-policy.ts:180
  confidence  -> CONFIRMED
  scenario    -> profile 剛切入 sampled、`review_sample_pct=10`、尚無帶 `sample.weight` 的歷史決策時，`meanWeight=1`；前 20 封各有 `newProfile` 權重 5，實際抽樣機率變成 50%，違反總量維持 10%。
  why missed  -> 測試自行提供已知的平均權重，沒有經過空歷史資料的載入路徑。

FINDING 2: 尚未寄出的信會讓新產業風險消失
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/review-policy.ts:171
  confidence  -> CONFIRMED
  scenario    -> profile 在牙醫產業只有一封 `approved`、從未寄出；查詢仍將牙醫加入 `mailedIndustries`。下一封牙醫信不會取得 `newIndustry` 權重，降低了原本要加強的人工抽樣。
  why missed  -> 查詢沿用寄送流程中的多種狀態，但風險條件要求的是「寄過」。

FINDING 3: 七日異常率漏算較早建立、近期才寄出的信
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/review-policy.ts:174
  confidence  -> CONFIRMED
  scenario    -> 草稿十天前建立、昨天寄出並退信；信的 `status='sent'`，但 `created_at` 不在七日窗內，因此退信不進入 profile×angle 異常率，也不觸發 `badSegment` 抽樣。資料表另有 `sent_at`，寄出函式會設定它（`lobster-factory/packages/db/migrations/0153_co_replies.sql:85`）。
  why missed  -> 查詢套用了常見的建立時間篩選，未對照寄出時間欄位。

FINDING 4: 尚未分類的回信被計為有效回覆
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/review-policy.ts:198
  confidence  -> CONFIRMED
  scenario    -> 回信先寫入 `co_replies`，其 `reply_type` 仍為 NULL；`NULL !== "unprocessed"` 為 true，故該角度立刻增加一次回覆。若兩個角度各達 30 封且差距僅一封，尚未處理的回信即可改變勝出角度與後續 75/25 選版。`reply_type` 在 schema 允許 NULL（`lobster-factory/packages/db/migrations/0153_co_replies.sql:45`）。
  why missed  -> 判斷只排除失敗終態，沒有要求回信已完成分類。

TOTAL: 4 findings
