# codex-oracle review -- 2026-10-25 01:53:47 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/ai-cost-logged.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/billed-usage-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-openai.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Fixes for the previous review of commit 103852367 (agency-os/reports/oracle/2026-10-25-partialreview-b2a49fdd.md, 8 findings). F1: gemini-flash-latest gets a price row (Google does not publish its target; priced as the newest listed Flash, 3.8 Flash, labelled est.). F2/F6: script-forge uses client.beta.messages.stream and logs stream.currentMessage in finally (the SDK snapshot relabels the model on fallback and overwrites cumulative counters); an OpenAI stream aborted before its final usage frame still writes nothing (no usage exists to log). F3: image-gen marks a failure after the provider finished as billed (empty output, or the output download failed); logImageResult logs ok or billed results. F4: logImageCost takes organizationId; the batch card passes the job org, the scene image passes billedOrgId. F5: video-pipeline buildSceneAsset now logs its scene image; the gate adds "a file has at least as many cost-log calls as paid calls" (a /predictions/${id} poll is not a new call). F7: openaiUsageTokens moves prompt_tokens_details.cached_tokens to cache read (outreach, script-forge, article generator). F8: image vendor and price come from IMAGE_RATES. Real check: an outreach gpt-4o-mini call now logs 0.000003 USD (was 0.000045). Verify the fixes are complete and introduce no double logging (e.g. image-gen callers that already logged on success and now also get billed failures).
- exit: 0 | elapsed: 164358ms | answer: 2138B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/hosting/provision-staging/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/ai-cost-logged.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/log-ai-call.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/ai-openai.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/billed-usage-log.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 正常完成的 Anthropic 串流不再記錄成本。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/script-forge/route.ts:163
  confidence  -> CONFIRMED
  scenario    -> Claude 正常完成串流 → SDK 在結束前清除 currentMessage → finally 取得 undefined，跳過 logAiCall。已核對安裝版本的 node_modules/@anthropic-ai/sdk/lib/BetaMessageStream.js:455；完成訊息保存在 receivedMessages，並由 finalMessage() 取得。
  why missed  -> 把進行中的 snapshot 當成完成後仍保留的結果；route.test.ts:14 固定回傳 currentMessage: undefined，測試也未驗證成本紀錄。

FINDING 2: Tarot batch 將成本歸給子組織，而非 grant 的實際計費帳戶。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/tarot/batch/[jobId]/card/route.ts:96
  confidence  -> CONFIRMED
  scenario    -> 子組織 B 的 parent_organization_id 為 A，B 建立 batch。job.organizationId 保留 B，但 grantFor 經 lib/entitlements/subject.ts:69 將計費帳戶解析為 A。新增紀錄卻直接寫 B，導致 A 的成本歸屬漏記，與 grant 計費對象不一致。
  why missed  -> 假設 job 的資料擁有者就是計費帳戶；未沿 resolveSubject 追查父組織解析。

FINDING 3: 新增的 billed 失敗訊號仍被三個既有圖片入口忽略。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts:485
  confidence  -> CONFIRMED
  scenario    -> 經 /api/content/image 生成圖片，Replicate 已 succeeded，但下載回傳 HTTP 503。新版回傳 {ok:false,billed:true}，呼叫端仍在 app/api/content/image/route.ts:232 提前返回，跳過 :263 的成本紀錄。app/api/tools/tarot/generate/route.ts:110 與 app/api/tools/studio/generate/route.ts:126 同樣只在 ok 時記帳。三個檔案都各有一次生成與一次 logger，因此新增計數檢查仍放行。
  why missed  -> 只將 batch、staging、video 三處接上 logImageResult；共享回傳型別更新後，其餘呼叫端沒有消費 billed。

TOTAL: 3 findings
