# PLAN — 原檔直傳 R2（「我的設計」存原始位元組，不受 10 MiB 請求上限）

狀態：計畫 v3，待操作者 go（C1、C2 為 High）。來源：WORKLOG 2026-11-15 續18–續20；設計審查 Codex `agency-os/reports/oracle/2026-11-15-review-733e6616.md`（F1–F5）、`…-98183ab1.md`（v2 F1–F3）皆已併入；Fable 複檢見 §0 末三條、§2。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

## 0. 事實（皆已 grep 驗證）

- Next 15.5 middleware 讀每個 request body，超過 `middlewareClientMaxBodySize`（未設＝10 MiB，`node_modules/next/dist/server/body-streams.js:30,82-105`）即截斷 → route 讀殘缺 JSON。圖以 base64 放 JSON（×4/3），原檔 >~7.5 MB 存不進（8,936 KB PNG → 12.2 MB）。
- R2 只用 Cloudflare REST＋Bearer（`lib/storage/r2.ts:3-8`），無 S3 憑證；presigned URL 只有 S3 API 能簽 → 必須新增 S3 憑證。
- `r2GetObject` 先整包讀入再比 `maxBytes`（`lib/storage/r2.ts:208-209`）。
- designs POST insert 失敗只刪 `source_key`，主圖留在 `designs/`（`app/api/tools/designs/route.ts:304-307`）。
- 實際主機由 env 覆寫：`STAFF_HOSTS`、`PRODUCT_HOST_<KEY>`、`PUBLIC_BASE_DOMAIN`（`lib/portal/hosts.ts:8-27`）。
- 塔羅「存無框圖」送的是 `toGalleryArt`（≤2048px WebP，`TarotStudio.tsx:248`）存進 `batch[].art`（`:875`、`:2306-2309`）；原圖未保留，且不能改成保留——`toGalleryArt` 存在的理由就是壓 React state 記憶體（78 張 ×9 MB）。
- 批次卡的原圖已在伺服器端 R2：job 記錄每張卡的 designs bucket URL（`app/api/tools/tarot/batch/[jobId]/image/[index]/route.ts:3-12`，`isDesignsAsset`）。
- PSD／.vectorcraft 原檔走 `sourceFile`，副檔名嗅探（`lib/studio/design-source.ts:34-48`）。
- **否決「上傳路由排除 middleware matcher」**：`lib/tenant-guard.ts:37,153` 無 `x-ops-user-kind` 即 fail-open 為 staff 跨全組織；`lib/ops-role.ts:37` 讀請求的 `x-ops-simulated-role`；nginx 不剝 `x-ops-*`（`nginx/default.conf:153-180`）→ 匿名請求可以 staff 身分寫任意組織。middleware 是唯一身分閘，不另開第二套。

## 1. 不變量

- I1：「我的設計」存的＝使用者拿到的原始位元組（操作者日後從這裡挑印刷檔）；不得有損轉檔、不得無聲失敗。
- I2：大檔不經 app 的 request body；不調高 middleware 上限（驗身分前即複製兩份，續18）；不繞過 middleware。
- I3：伺服器只登記自己驗過的物件：先看 R2 回應 Content-Length ≤ 上限才讀，邊讀邊擋；嗅探、sha256 由伺服器自算；暫存 key 的組織段必須等於請求者的組織。
- I4：`designs/` 下每個物件都有 DB 列；任何失敗路徑刪掉本次寫入的正式物件；未登記的上傳只在 `uploads/pending/`，lifecycle 1 天清。
- I5：瀏覽器 state 不持有原圖；原圖只在 R2（pending 或正式）。

## 2. 架構

```
瀏覽器 ─① POST /api/tools/designs/upload-url {kind:"image"|"source", mime|ext} ─▶ next-admin（middleware 驗身分；body 小）
       ◀─ {putUrl（presigned S3 PUT，10 分鐘，簽入 Content-Type）, key:"uploads/pending/<org>/<uuid>.<ext>"}
瀏覽器 ─② PUT putUrl（原始位元組）─▶ R2 lobster-designs
瀏覽器 ─③ POST /api/tools/designs {upload:{key}, sourceUpload?:{key}, …metadata} ─▶ next-admin
       key 前綴＝`uploads/pending/<請求者 org>/`（I3）→ HEAD 驗 Content-Length ≤ 上限 → S3 CopyObject 到正式 key
       → **從正式 key** 讀（使用者寫不到）：image 用 sharp 嗅探、source 用 design-source 嗅探、sha256
       → insert media_assets（同現行欄位）→ 刪 pending。任一步失敗 → 刪本次正式物件（I4）。
```

- 先複製再驗：presigned PUT URL 到期前可重複使用（Cloudflare 文件），驗 pending 再複製會有「驗 A、複製 B」競態；正式 key 只有伺服器能寫，從它驗就沒有這個窗。
- 無 HMAC token、無新 secret：授權＝presigned URL 本身（只有通過 middleware 的人拿得到）＋ key 路徑帶 org（I3）。
- 批次卡不另開伺服器端複製：載入時是「同源路由取原圖 → 套調色 → 做無框圖」（`TarotStudio.tsx:1159-1164`），伺服器端原圖與使用者看到的無框圖不同；點「存無框圖」時重走同一段（取原圖、套調色、PUT、登記），一條路、不佔 state。
- pending→正式 key：正式 `designs/` 只放已登記物件；孤兒交 lifecycle。
- 新依賴 `aws4fetch`（R2 文件建議的 SigV4 簽章，無相依）：presign、CopyObject 共用一個 client。

## 3. 工作卡（依序；每張獨立 commit；測試只寫卡內點名者）

| 卡 | 風險 | 內容 | 驗收 |
|---|---|---|---|
| C1 | High | 操作者在 Cloudflare 建 R2 S3 相容 token（**僅** `lobster-designs`，Object Read & Write）；agent 寫 `mcp/user-env.ps1`＋容器 env（`R2_S3_ACCESS_KEY_ID`、`R2_S3_SECRET_ACCESS_KEY`），compose 走 `scripts/safe-infra-patch.sh compose`；`mcp/user-env.template.ps1` 加名稱。 | `docker exec lobster-next-admin printenv R2_S3_ACCESS_KEY_ID` 有值；回滾＝safe-infra-patch 自動還原 |
| C2 | High | 新 `scripts/r2-designs-bucket-config.ts`（本機 `npx tsx`；`STAFF_HOSTS`／`PRODUCT_HOST_*`／`PUBLIC_BASE_DOMAIN` 由 `docker exec lobster-next-admin printenv` 取得後以 env 傳入）：origin＝`https://`＋`staffHosts()` 與每個 `door.app==="next-admin"` 且 enabled 的 `productHost(p)`（兩者回裸主機名，R2 CORS 要 `scheme://host`）；`--dev-origin http://localhost:3000` 明示旗標才加入。CORS 只開 PUT＋`content-type`、MaxAge 600；lifecycle `uploads/pending/` 1 天刪。`--dry-run` 印差異；`--apply` 先存現行設定。走 Cloudflare REST `r2/buckets/<bucket>/{cors,lifecycle}`；現有 `R2_API_TOKEN` 若無 bucket 設定權限，由操作者臨時給 admin token 跑一次。主機 env 改了要重跑（寫進腳本開頭）。 | 現行設定備份＋dry-run 差異＋apply 後讀回一致；各 origin preflight 200、非清單 origin 被拒 |
| C3 | Medium | `lib/storage/r2-s3.ts`（aws4fetch client：`presignPut(key, mime, 600s)`、`copyObject(src, dst)`、`headObject(key)`）；`app/api/tools/designs/upload-url/route.ts`（授權同 designs POST：`resolveOpsRole`＋`canCreateAiImageJob`＋`effectiveOrgId`；image mime＝`lib/storage/r2.ts:82-84` 三種；source ext＝`SOURCE_EXTS`；回 key＋putUrl）。 | 測試：未登入 401、非白名單 mime 400、key 含請求者 org；實測 presign PUT 到 `uploads/pending/<org>/` 成功、改 Content-Type 被拒 |
| C4 | Medium | `r2GetObject`：先比 Content-Length 與 `maxBytes`，再串流累計（超過即中止）。designs POST 加 `upload`／`sourceUpload`（與 `image`／`sourceUrl` 互斥）照 §2 順序（HEAD → Copy → 從正式 key 驗 → insert → 刪 pending）；上限 64 MiB；任一失敗分支刪本次全部正式物件（含既有 base64 路徑，`route.ts:304-307`）。 | 測試：Content-Length 超過不複製；key 的 org 段≠請求者 org、大小超限、非圖片、原檔嗅探不符、key 不在 pending 皆 4xx 且不留正式物件；驗證讀的是正式 key（mock 讓 pending 與正式內容不同，DB 記的是正式的 sha256）；insert 失敗後 `designs/` 無殘留；真實測：presign→PUT→登記 9 MB PNG，下載 sha256 相同 |
| C5 | Medium | 新 `lib/studio/design-upload.ts`（瀏覽器：Blob→①②，回 key；`register(key, meta)`→③）。`TarotStudio.tsx`：瀏覽器內生成（預覽／比較／修圖）一出圖就 PUT 原圖到 pending，state 只留 key＋顯示用縮圖；自動存檔＝立即 `register`（同今日行為）；「存無框圖」：瀏覽器生成的卡＝`register(key)`，批次卡＝點擊時 `fetch /api/tools/tarot/batch/<job>/image/<i>` → 套目前調色 → ①②③（與載入時同一段邏輯，抽成一個函式）；整副牌（有框）存檔＝框好的 Blob 走 ①②③；自動存檔失敗畫面顯示一行（頁內既有提示樣式、theme token）；pending 過期（1 天）→ 提示「原圖已過期，請重新生成」。刪 `toGalleryArt`。 | 塔羅真實操作：Ideogram 大圖、「存無框圖」（瀏覽器生成與批次各一）存入後，從「我的設計」下載＝原 PNG（sha256 相同）；斷網時有失敗提示；state 無原圖 Blob |
| C6 | Medium | 其餘呼叫端改走 `design-upload.ts`：`studio/StudioWorkbench.tsx:955,1004`、`banner/BannerStudio.tsx:1291`、`canvas/CanvasEditor.tsx`、`mockup/MockupStudio.tsx:494,510`、`mockup/ModelMockupPanel.tsx:75`、`publish/PublishWizard.tsx:264`、`designs/DesignsGallery.tsx:592`、`public/editor-shared/blocks/my-designs.js:36`（PSD 走 `kind:"source"`）。**刪除**：designs POST 的 base64 `image` 輸入（`sourceUrl` 保留）、`lib/studio/image-upload-limit.ts`＋其測試、`my-designs.js` 的 `uploadableDataUrl`／`UPLOAD_MAX_CHARS`；測試 `app/api/tools/designs/{source,customer,batch-dedupe}.test.ts` 改走 `upload`（mock R2 GET）。 | 各頁存一張 >10 MB 圖與一個 >10 MB PSD 成功；`grep "uploadableDataUrl\|toGalleryArt\|image too large (~9MB limit)"` 0 命中 |

## 4. 不在此計畫（同類，另案）

- 其他 >10 MiB request body 的 route（續18 清單：`studio/{generate,inpaint,genfill,remove-bg,mockup,fabric-print}`、`tarot/generate`、`content/image`、`video/upload-asset` 45 MB）：改為「①② 拿 key，再傳 key」沿用 C3／C4 元件，逐 route 開卡。

## 5. 回滾

- C1／C2：safe-infra-patch 自動還原；bucket 設定以 C2 備份還原；刪 S3 token。
- C3–C6：`git revert`；未登記 pending 由 lifecycle 一天內清；正式物件與 DB 列格式不變。
