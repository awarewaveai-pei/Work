# codex-oracle review -- 2026-11-25 14:33:52 +08:00

- mode: `review`
- scope: whole repo
- target: `e828559c2..HEAD`
- context: not a fix: three video-workbench tools wired up. privacy = local YuNet face tracking + FFmpeg mosaic (invariant: every frame between a track's first and last detection is covered; zero faces = job fails, no asset). depth = local MiDaS + cross-frame alignment. sfx/separate = paid feature key video.audio-tools (invariant: a paid vendor row runs only with a permit, charged only on success with the real cost; ElevenLabs free plan and missing keys = row unavailable, no fallback to another vendor). X1 = page lock driven only by /capabilities. Focus on billing (main-system.cjs paidFeature/ledgerKind, audio-tools.cjs, api.cjs quote+settle), mirelo.cjs (never sent for review before), and privacy coverage gaps.
- exit: 0 | elapsed: 188706ms | answer: 1680B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/workbench-usage.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/.dockerignore, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/.gitignore, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/Dockerfile, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/audio-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/audio-tools.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/depth-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/elevenlabs.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/face-privacy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/media.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/mirelo.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/video-describe.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/package-lock.json, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/package.json, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tool-processing.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-workflows.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/vendor-depth.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/vendor-face.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/paid-price.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/depth.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/elevenlabs-free-tier.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/privacy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/sfx-billing.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/vendor/depth/sources.json, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/vendor/face/face_detection_yunet_2023mar.onnx, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/vendor/face/sources.json
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 部署設定未傳入 Mirelo 金鑰，Mirelo 列會持續顯示不可用
  file:line   -> lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:733
  confidence  -> CONFIRMED
  scenario    -> 即使部署環境有 `MIRELO_API_KEY`，video-workbench 的 `environment` 只傳入 ElevenLabs 等金鑰；Mirelo 列因此判定缺金鑰，指名提交回傳 503（`backend/audio-tools.cjs:34`）。
  why missed  -> 測試 harness 直接注入 Mirelo 金鑰，沒有使用 Compose 的環境設定。

FINDING 2: 貼近畫面邊角的人臉，偵測框內仍有像素未遮蓋
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/face-privacy.cjs:144
  confidence  -> CONFIRMED
  scenario    -> 偵測框為 `{x:0,y:0,w:100,h:100}` 時，擴張框被畫面邊界裁成 `125×125`；橢圓遮罩在原框左上角的值是 0，該處輸出原畫面。我用 `expandBox`、`drawMask` 實際驗得左上角為 0、框中心為 255。
  why missed  -> 現有遮罩測試只用遠離畫面邊界的置中人臉。

FINDING 3: Mirelo 回報未扣點數時，平台仍按估算成本扣款
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts:293
  confidence  -> CONFIRMED
  scenario    -> Mirelo 的 unmetered key 完成工作會回傳 `credits: null`；`mirelo.cjs:104` 將它轉成 `undefined`，此處便以影片秒數估價並交由 usage 結算，違反按實際成本扣款的要求。[Mirelo 官方文件](https://mirelo.ai/api-docs.md)明載 unmetered 工作的完成回應為 `credits: null`。
  why missed  -> 測試只覆蓋回傳正數 credits 的計量金鑰。

TOTAL: 3 findings