# codex-oracle review -- 2026-11-12 22:35:28 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card TTS.2: restore free Edge TTS (4 voices zh-TW HsiaoChen/YunJhe, en-US Jenny/Guy) that the old app had. apps/video-service/server.py new POST /tts (auth X-Render-Token, validates text/voice, reuses pipeline._tts edge-tts, answers audio/mpeg, 502 on Edge failure). video-workbench backend/speech.cjs: edge-tts row (credential = VW_TTS_SERVICE_URL + VW_TTS_SERVICE_TOKEN), free (cost-model.ts FREE_TTS_MODELS, provider-cost speechUsd 0), default by the free-first rule; synthesize() falls back once to Gemini when Edge fails and the job is labelled and charged as Gemini (api.cjs uses spoken.model). docker-compose.yml workbench gets VW_TTS_SERVICE_URL http://video-service:8732 and VW_TTS_SERVICE_TOKEN from VIDEO_SERVICE_SECRET. Report only what breaks, charges wrong money, leaks a secret, or turns a main path red.
- exit: 0 | elapsed: 161735ms | answer: 1600B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 一般部署不會啟用免費 Edge 配音
  file:line   -> agency-os/AGENTS.md:11；lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:713
  confidence  -> CONFIRMED
  scenario    -> 只透過 `sg-deploy.sh` 部署本次 app 程式碼時，正式機的 Compose 檔不會同步，workbench 容器收不到新增的 URL 與 token；Edge 無法成為預設配音。
  why missed  -> diff 有 Compose 設定，但部署流程把 Compose 當作另一條獨立路徑。

FINDING 2: 超過 2000 字的免費配音請求會自動改用付費 Gemini
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py:119；lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs:140
  confidence  -> CONFIRMED
  scenario    -> 使用者在沒有字數上限的配音輸入框送出 2001 字並選 Edge；服務回 400，workbench 將它當成 Edge 故障，改呼叫 Gemini 並按 Gemini 計費。
  why missed  -> 2000 字限制只在下游服務，fallback 沒區分輸入驗證失敗與服務故障。

FINDING 3: 新增 Edge 聲線映射會改壞既有 OpenAI 聲線
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs:32
  confidence  -> CONFIRMED
  scenario    -> 舊草稿儲存 Gemini `Charon` 聲線，之後選 OpenAI 配音；反向映射現在將 `Charon` 指向 Edge 聲線 ID，OpenAI 找不到該 ID，最後使用預設 `coral`，而非原本的 `onyx`。
  why missed  -> Edge 項目加入共用反向映射時，覆蓋了原有的 Gemini→OpenAI 對應。

TOTAL: 3 findings
