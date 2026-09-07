# Phase 1B-4 — renderer attempt protocol

**狀態：設計包；尚未改 renderer、未建立 R2 receipt bucket、未寫入資料、未部署。**
**日期：2026-09-07**
**前置：** Phase 1B-1 lifecycle contract、Phase 1B-2 durable job schema、受控 staging R2 與 renderer canary。
**不變量：** video_jobs 是唯一商業工作真相；renderer attempt receipt 只保存外部計算的可查證執行證據。任何不確定的 submit 都不得自動產生第二次 render。

## 1. 已核實的協定缺口

| 目前行為 | 證據 | 風險 |
|---|---|---|
| video-service 每次 submit_render 都新建 UUID，且只寫 process-local _JOBS。 | D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\video-service\server.py:265-323 | timeout 重送或 service restart 無法判別同一 attempt，會重複花費算力。 |
| GET /job 僅查 _JOBS；服務重啟後回 job_not_found。 | server.py:446-455 | 下一層只能看到 404，沒有 durable attempt receipt 可對帳。 |
| next-admin client 只送 renderer auth 和 JSON body，未送 idempotency key 或 request fingerprint。 | D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\video\render-client.ts:112-160 | renderer 無法辨識重播與新工作。 |
| render-draft 在 renderer 接受後才建立 video_jobs row。 | D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\app\api\video\render-draft\route.ts:142-195 | 本地票據失敗會留下無法恢復的 renderer work。 |
| 現有 R2 寫入走 Cloudflare REST PUT，沒有 conditional claim。 | server.py:73-82 | 同一 key 的 concurrent submit 無原子互斥。 |

Cloudflare R2 的 S3-compatible PutObject 已支援 If-None-Match conditional operation；此能力必須以 staging integration test 驗證，不得由文件宣稱直接視為 production proof。官方依據：[S3 API compatibility](https://developers.cloudflare.com/r2/api/s3/api/) 與 [R2 consistency model](https://developers.cloudflare.com/r2/reference/consistency/)。

## 2. 目標邊界

1. Next-admin durable executor 在呼叫 renderer 前，已建立 tenant-owned video_jobs durable intent、immutable request_fingerprint、idempotency_key 與 lifecycle_state = submitting。
2. renderer 不接觸 Supabase service-role credential、不改寫 video_jobs、不判定 tenant entitlement。
3. renderer 以 private R2 receipt object 對同一 idempotency_key 建立可重啟的 attempt claim；公開影片 output 不是 claim record。
4. receipt claim 失敗、request fingerprint 不一致、R2 conditional semantics 未證明、或 submit response 不確定時，executor 進 unknown/reconciling；不能 blind retry。
5. 最終 artifact 只有在 renderer receipt 記為 succeeded、輸出 checksum/metadata 被驗證後，才由 Next-admin finalization 寫入 media_assets。

## 3. Renderer HTTP v1

現有 POST /render 保持相容直到 staging 通過。新 adapter 使用 v1 端點：

| 操作 | 必需輸入 | 成功輸出 | 拒絕條件 |
|---|---|---|---|
| POST /v1/render-attempts | X-Render-Token、X-Render-Idempotency-Key、X-Render-Request-SHA256、validated render body | attempt_id、disposition accepted 或 existing、receipt revision、state | missing/malformed headers 400；same key but different fingerprint 409；receipt store failure 503 before compute |
| GET /v1/render-attempts/{attempt_id} | renderer auth | attempt_id、state、request fingerprint、output metadata、observed timestamps | unknown attempt 404；無權 401 |
| POST /v1/render-attempts/{attempt_id}/reconcile | renderer auth、expected receipt revision | observed renderer state 或 unknown | non-expired lease 409；CAS conflict 409；receipt unreadable 503 |

Idempotency key 為 UUID 或 32–128 位 URL-safe opaque value，由 Next-admin 生成且永不接受 browser supplied 值。Request SHA-256 由 canonical render request 計算，內容包括 scene、asset UUID/version/checksum、output profile、voice、renderer capability version；不得只雜湊 display title 或 URL。

同 key、同 fingerprint 的並發 POST 必須回同一 attempt_id；只有第一個 request 可取得 accepted。相同 idempotency key、不同 request_fingerprint 必須回 HTTP 409；新 request 一律使用新 key。

## 4. Private R2 receipt model

新增獨立、非公開 renderer-attempt-receipts bucket。它不使用現有 public video output URL，也不由瀏覽器存取。

物件 key 為 attempts/v1/{sha256(idempotency_key)}.json。最小 receipt 內容：

| 欄位 | 目的 |
|---|---|
| protocol_version、attempt_id | 協定與 immutable renderer identity |
| idempotency_key_hash、request_fingerprint | 重播比對；不得保存原始 key |
| state、receipt_revision | 目前觀測和 compare-and-swap version |
| lease_owner、lease_expires_at | 讓 service restart 與 executor recovery 能安全判斷 |
| accepted_at、started_at、finished_at | 有序證據時間戳 |
| output_manifest | 每個 output 的 private key、checksum、MIME、尺寸、duration |
| failure_class、sanitized_error | 可分類失敗，不含 provider token、raw authorization header、私密 URL 或完整 stack trace |

建立 receipt 必須使用 S3-compatible PutObject with If-None-Match: *。收到 precondition failure 時讀取既有 receipt，先比對 request_fingerprint，吻合才回 existing。更新 receipt 必須使用 ETag conditional write；CAS conflict 時重新讀取，絕不覆寫他人 state。

receipt bucket access key 只允許該 bucket 的 read/write scope；不得授與 delete、list-other-bucket 或 public-object scope。它存於既有 secret vault；不進 source、log、health endpoint 或 browser response。實作前必須確認目前 Cloudflare REST API token 與 S3 access credential 不可混用，並新增 staging-only credential rotation and revoke runbook。

## 5. State and recovery

Renderer receipt state 必須與 video_jobs lifecycle 對照，但不是第二個 workflow authority：

| renderer receipt | video_jobs lifecycle | executor 行為 |
|---|---|---|
| accepted | submitted | 記錄 acceptance 後開始 polling。 |
| running 且 lease 有效 | rendering | 不重送；持續 polling。 |
| succeeded | finalizing | 驗證 output manifest，再建立 media_assets receipt。 |
| failed | failed | 記錄 sanitized failure，不刪 attempt evidence。 |
| lease expired、無 final output | unknown → reconciling | 查 receipt、output manifest 與 renderer observation；不直接 retry。 |
| receipt 遺失或 fingerprint 不符 | unknown | 需要 operator decision；不得假裝 failed 或重新送出。 |

服務 startup 不可把未完成 receipt 標成 failed。它只停止本機 thread；reconcile 依 lease 和 CAS 產生可稽核觀測。自動 retry 只有在 renderer receipt 已明確為 failed 且 failure_class 是 retryable，並經 executor policy/attempt budget 檢查時才允許。

## 6. Staging proof packet

下列測試全數通過前，v1 endpoint 不可被 VideoStudio route 使用：

1. 兩個平行 POST 使用相同 key/fingerprint，只產生一個 attempt_id、一個 compute invocation。
2. 相同 key、不同 fingerprint 回 409，沒有 render 或 R2 output。
3. client timeout 後以同 key 查詢，取得既有 attempt，不創建第二個。
4. renderer restart 後仍可由 private receipt 查詢 attempt；未完成 receipt 進 unknown/reconciling，不能自動重送。
5. conditional PUT 或 ETag CAS 無法運作時，renderer 在開始 TTS/ffmpeg 前 503 fail closed。
6. receipt 成功但 output manifest 不完整時，Next-admin 不得 finalization 或建立 media_assets。
7. deny-list 測試證明 health endpoint、client response、logs 和 receipt 不洩漏 R2 secret、idempotency 原文或私密 asset URL。
8. disposable staging tenant 的 kill/restart/timeout drill 證明：一次 request 至多一個 compute attempt，且每個 terminal state 可追溯到 video_jobs event 與 receipt revision。

## 7. Change package and rollback

| 包 | 範圍 | 完成證據 |
|---|---|---|
| 1B-4a | receipt store port、canonical request hash、contract fixtures | deterministic hash、bad header、same/different fingerprint tests |
| 1B-4b | video-service v1 endpoint、conditional R2 adapter、receipt state machine | parallel submit、restart、CAS and secret-redaction tests |
| 1B-4c | next-admin renderer client and durable executor adapter | durable intent before submit、unknown/reconcile and no-double-submit tests |
| 1B-4d | staging canary/runbook/receipt | disposable tenant drill, health, rollback and evidence archive |

Rollback 是 feature flag 將 caller 留在 legacy route，並保留 private receipts 和 video_jobs evidence 可查。已經建立的 v1 attempt 不得刪除來製造表面乾淨狀態。停止或刪除 receipt bucket、變更 credential 或啟動新 renderer compose 都是個別 High-risk approval。
