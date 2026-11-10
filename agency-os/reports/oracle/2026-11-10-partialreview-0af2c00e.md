# codex-oracle review -- 2026-11-10 14:45:08 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/providers.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Free-first rule for every vendor list (operator: use free and paid, free first). backend/providers.cjs (new): order = free rows then paid; default = env-named row if it can run, else first free that can run, else first paid that can run. Used by backend/speech.cjs, backend/transcribe.cjs (rows carry free = button price 0 from provider-cost.cjs) and backend/image-to-3d.cjs (local SF3D free; the static default on SPAR3D removed). capability() signatures lost the priceOf parameter. docker-compose.yml: workbench GEMINI_API_KEY back to the shared paid key. Report only what breaks, charges wrong money, or turns a main path red.
- exit: 0 | elapsed: 122329ms | answer: 1146B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/providers.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 一般部署不會套用工作台的 Gemini 金鑰變更  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:709`  
  confidence  -> CONFIRMED  
  scenario    -> 只用 `sg-deploy.sh video-workbench` 部署此變更時，腳本只同步 `apps/video-workbench`（`scripts/sg-deploy.sh:318-339`）；主機上的 Compose 檔仍保留舊設定，工作台的 Gemini 列繼續顯示未啟用。  
  why missed  -> diff 同時改了程式與 Compose，但部署腳本把 Compose 留在主機本地管理。

FINDING 2: 免費 3D 預設在本機 SF3D 忙碌時會直接回 409  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/image-to-3d.cjs:51`  
  confidence  -> CONFIRMED  
  scenario    -> Windows 已設定 SF3D、且一件本機轉換正在執行時，新開的圖片轉 3D 頁仍預選本機 SF3D；送出第二件工作時，`claim()` 因佔用而失敗，API 回 409（`backend/api.cjs:764-765`），即使付費方式可用。  
  why missed  -> `available` 只檢查安裝設定（`image-to-3d.cjs:48`），沒有納入單工佔用狀態。

TOTAL: 2 findings
