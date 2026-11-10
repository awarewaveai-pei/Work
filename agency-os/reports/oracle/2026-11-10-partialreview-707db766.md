# codex-oracle review -- 2026-11-10 10:49:55 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/chunked-upload.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/assets-ui.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-chunked-upload.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card P6.20: chunked upload for video.aware-wave.com (single request capped at 100 MB by Cloudflare + nginx; /uploads sent base64 JSON). New backend/chunked-upload.cjs (16 MiB raw chunks, per-chunk sha256 on receipt and on join, resume via status, owner userId check -> 404, per-org open-bytes quota, idle sweep, restart wipes) + api.cjs routes /uploads/sessions[/id[/chunks/n|/complete]] + storeUpload refactor of /uploads + engineRender split into engineRenderFile so complete({render meta}) reuses it + assets-ui.js uploadChunked/uploadAsset. ONLY review the P6.20 hunks in api.cjs: the hunks about image-to-3d / meshy / blender / imageTo3d belong to another session (S4b) and are out of scope. Identity: server.cjs already verifies the next-admin HMAC signature and creates one api per org; req.vwIdentity.userId is the owner. Design doc: docs/p6-golive-plan-20261103.md section P6.20.
- exit: 0 | elapsed: 182466ms | answer: 1612B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/assets-ui.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/chunked-upload.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-chunked-upload.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 大於 100 MB 的引擎成片仍以單次請求上傳
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-engine-host.js:589
  confidence  -> CONFIRMED
  scenario    -> EffectCraft 輸出 120 MB MOV → `engineSubmitRender` 仍將整個檔案送往 `/engine/renders` → 外層 nginx 的 100m 上限拒絕請求，成片無法入庫。
  why missed  -> 後端新增了成片分段完成路徑，但引擎輸出的前端呼叫點未接上。

FINDING 2: 續傳鍵可能把兩個不同檔案拼成一個
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/assets-ui.js:104
  confidence  -> CONFIRMED
  scenario    -> 兩個內容不同的影片具有相同檔名、大小及 `lastModified`；第一個上傳部分分段後中斷，再選第二個 → 前端沿用第一個 session 並跳過已收分段 → 伺服器只驗各段雜湊，最終接受混合檔。
  why missed  -> 驗收只測同一檔案續傳，沒有驗證續傳鍵是否代表相同內容。

FINDING 3: 重啟後未再上傳的組織，其分段檔不會清除
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:32
  confidence  -> CONFIRMED
  scenario    -> 某組織留下未完成的 500 MiB 上傳後服務重啟，該組織不再呼叫上傳路由 → `createChunkedUploads` 從未執行，其清理程式也不會執行；舊分段持續占用磁碟，而新程序的配額從零計算。
  why missed  -> 清理寫在分段模組初始化時，但 API 對該模組採延遲初始化。

TOTAL: 3 findings
