# Phase 6 — 交付、成效與商業模式契約

**狀態：設計基線；未架設新的 Postiz integration、未發布媒體、未啟用收費或企業 API。**
**日期：2026-09-06**

## 已確認的現況

WordPress 現行 route 直接將 bare HTTPS video URL 寫入文章內容，見 `CURRENT_BASELINE_AND_GAP_AUDIT.md:14-20,31-36`；它尚未持有 immutable Release、替換鏈或回滾 receipt。社群 route 已有 Postiz draft/now 與依平台選擇比例的程式路徑，見 `CURRENT_BASELINE_AND_GAP_AUDIT.md:24-29,61-63`，但不存在 durable delivery-attempt 或成效 ledger。

Legacy reference 已確定 Postiz 是唯一社群發佈路徑，WordPress 只能經 wp-bridge，不得復活舊 Python 直接發布或排程，見 `LEGACY_REFERENCE_ADOPTION_MATRIX.md:6-18,35-40`。Phase 2 已預留 `media_delivery_attempts`，但沒有 migration 或 integration，見 `PHASE_2_ASSET_RELEASE_REFERENCE_CONTRACT.md:22-51`。

## 目標不變量

1. WordPress 和 Postiz 都只接受 approved immutable Release 及其 pinned artifacts；不可接受 renderer job、draft URL 或可變 Timeline。
2. 每次外部呼叫都有內部 attempt ID、destination、idempotency key、external ID、狀態、request fingerprint、可安全顯示的錯誤分類和驗證 evidence；重試不建立第二篇貼文。
3. 對每個目的地，草稿、排程、發布、驗證、替換與撤回都是明確 state transition；目的地不支援撤回時，系統必須記錄限制而非假稱成功。
4. 成效快照是 append-only，必須附平台、帳號／channel（tenant-scope）、Release、variant、觀測窗口與收集器版本；它不能改寫原始媒體或先前發布 receipt。
5. 自用、SaaS 和企業 BYO API 共用 Capability Contract、asset lineage、QA 和 Release gate；差異只能表現在 entitlement、provider profile、cost attribution 和資料保留 policy。
6. 秘密永不進入前端、Release、Timeline、media asset metadata 或 Postiz request log。企業 API 僅保存 vault reference、provider ID、policy ID 和使用 receipt。

## Delivery attempt 狀態機

```text
release_approved
  → delivery_draft_created → scheduled → submitting → accepted → verifying → delivered
                                              ↘ failed → retry_queued
delivered → replacement_pending → superseded
delivered → withdrawal_requested → withdrawn | withdrawal_unsupported
```

`media_delivery_attempts` 至少需要 `release_id`、`organization_id`、`destination`、`channel_ref`、`state`、`idempotency_key`、`request_fingerprint`、`external_id`、`external_url`（若目的地提供）、`attempted_at`、`verified_at`、`error_code` 與 `evidence_json`。唯一 constraint 為 `(organization_id, destination, idempotency_key)`；外部 API timeout 或不確定回應必須進 `unknown` / `verifying`，不得自動重新送出。

### WordPress adapter

adapter 接收 Release 的 `wordpress_embed` artifact role，先建立或定位 wp-bridge draft，保存 pre-change revision / content hash，執行 replace，重新讀取驗證，再寫 delivery receipt。回滾使用儲存的 WP revision 或已驗證的前一 Release，不使用字串反向取代。現有 bare URL route 僅是 legacy adapter，不能被新的 Release path 直接覆蓋。

### Postiz adapter

Postiz 是唯一社群 publisher。adapter 先根據 destination policy 從 Release artifact roles 選取已 QA 的原生比例，建立 Postiz draft，取得 external ID 後才可排程或由授權者確認立即發布。`confirmPublishNow` 類確認仍屬操作 UI，不取代 Release approval。重試沿用 idempotency key；驗證以 Postiz 可提供的 post/status evidence 為準，不以 HTTP accepted 假定已發布。

## Outcomes 與回饋

成效收集是 `media.collect_outcomes` capability，不是 renderer 或 publisher 的副作用。每次 collection 建立不可變 snapshot，至少含：Release ID、delivery attempt ID、destination、平台時區、觀測窗口、指標名稱／值／單位、collector version、來源 timestamp 與資料可用性。後續題材、腳本或剪輯推薦只可讀已授權、去識別的 snapshot；不得直接改寫 Release、Timeline 或 Story Bible。

## 三種商業模式

| 模式 | 身分／邊界 | Provider 與成本 | 交付規則 |
|---|---|---|---|
| 自用 offline / hosted | AwareWave 內部 organization；可在本機 worker 或受控主機跑 | 使用內部 approved provider profile；成本照 capability receipt 歸屬 | 仍經 QA / Release；offline export 不自動發布。 |
| SaaS 免費 / 訂閱 / 點數 | tenant-scoped entitlement；免費層和付費層是 policy，不是前端條件判斷 | 每次 capability 先 reservation、成功後 usage receipt、失敗釋放或分類；不可相信 client 用量 | 可建立 draft；實際 delivery 受 plan、權限與 human confirmation。 |
| 企業 BYO API | enterprise tenant policy + vault credential reference；tenant 可選 provider 但不可繞過 allowlist | 不保存原始 key；按 provider profile、資料區域、model version、spend cap、audit receipt 執行 | artifact、QA、Release、WP/Postiz receipt 仍完全 tenant-isolated。 |

Provider allowlist 必須在 capability resolver 之前評估：provider jurisdiction / data residency、資料類別、模型版本、license、企業 BYO policy、預算與 kill switch 任一不通過即 fail-closed。不得把模型名稱或原始 API base URL 交給瀏覽器自由提交。現有 provider settings 分散於 compose，尚未具備此治理層，見 `CURRENT_BASELINE_AND_GAP_AUDIT.md:73-74`。

## 安全接線順序

1. 先完成 Phase 2 Release、artifact pin、delivery attempt schema、tenant proof、idempotency rehearsal 和 safe delete。
2. 在 staging 架設／核對 Postiz integration，以 disposable channel 做 draft、schedule、timeout/unknown、retry、verify、replace、withdrawal-unsupported fixtures；沒有真實社群帳號或 explicit publish authorization 時不得走 publish。
3. 建立 wp-bridge Release adapter，先對 disposable WordPress draft 驗證 content revision、replace 與 rollback evidence。
4. 建立 provider profile、vault-reference、entitlement / usage reservation 的 repository boundary；先做 deny-policy / cross-tenant / exhausted-credit negative tests。
5. 成效收集先 read-only snapshot，確認 platform API scope、retention 和 privacy，再接回題材／腳本建議。最後才逐 tenant 啟用 SaaS 或 enterprise plan。

## rollback

每個 destination、provider profile、tenant plan 和 collector 都可獨立 feature-flag 關閉。關閉只停止新 attempt，不刪除 Release、delivery receipts、usage receipts 或 outcomes snapshots。對外已發布內容只能依目的地能力執行 replacement / withdrawal 並留下失敗證據；不能藉由刪除本地記錄假裝已回滾。
