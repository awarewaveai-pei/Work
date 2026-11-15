# codex-oracle review -- 2026-11-15 11:29:24 +08:00

- mode: `review`
- scope: whole repo
- target: `8861a5137..eb09aaecb`
- context: (1) One shared allow-list of Replicate output hosts (next-admin lib/ai/replicate-output.ts: replicate.delivery + one proven R2 host, https only, exact host) read by every Replicate output reader in next-admin and video-workbench. (2) Region editor builds the instruction text on the server (instructionText), one coordinate format for all models; page sends raw text; 400 before any paid call on count mismatch; old jobs run with their stored prompt. (3) Region editor lists only rows whose catalog zh is ok, cheapest first, default = first runnable (Klein); Fill Pro zh set to no; catalog notes rewritten as measured pros/cons. Focus: any reader still hard-coding replicate.delivery; host check bypass (userinfo, port, case, trailing dot); old drafts/jobs naming hidden rows; PhotoCraft fill still listing all fill rows.
- exit: 0 | elapsed: 188994ms | answer: 576B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/replicate-output.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/replicate-output.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/replicate-run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/upscaler.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/video-motion-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/image-models.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/awarewave-files.txt, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-edit.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-run.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tool-processing.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-region.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/generation-flows.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/region-edit.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 輸出網址通過 allow-list 後，下載仍會跟隨重新導向，繞過目的地主機限制
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-edit.cjs:107
  confidence  -> CONFIRMED
  scenario    -> Replicate 回傳的允許網址在下載時回應 `302 Location: http://169.254.169.254/` → `fetchImpl` 未設定 `redirect: "manual"`，會向未列入 allow-list 的位址發送請求。
  why missed  -> 變更只檢查初始網址；實際下載的重新導向目的地沒有再經過檢查。

TOTAL: 1 findings
