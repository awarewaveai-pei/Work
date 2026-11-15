# PLAN — 原檔直傳 R2（「我的設計」存原始位元組，不受 10 MiB 請求上限）

狀態：計畫，待操作者 go（C1、C2 為 High）。來源：WORKLOG 2026-11-15 續18、續19；設計審查 Codex `agency-os/reports/oracle/2026-11-15-review-733e6616.md`（F1–F5 已併入）。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

## 0. 事實（皆已 grep 驗證）

- Next 15.5 middleware 讀每個 request body，超過 `middlewareClientMaxBodySize`（未設＝10 MiB，`node_modules/next/dist/server/body-streams.js:30,82-105`）即截斷 → route 讀殘缺 JSON。圖以 base64 放 JSON（×4/3），原檔 >~7.5 MB 存不進（8,936 KB PNG → 12.2 MB）。
- R2 只用 Cloudflare REST＋Bearer（`lib/storage/r2.ts:3-8`），無 S3 憑證；容器 env 只有 `R2_ACCOUNT_ID`、`R2_API_TOKEN`、`R2_DESIGNS_BUCKET`、`R2_DESIGNS_PUBLIC_BASE` 等。
- `r2GetObject` 先整包讀入再比 `maxBytes`（`lib/storage/r2.ts:208-209`）。
- designs POST insert 失敗只刪 `source_key`，主圖留在 `designs/`（`app/api/tools/designs/route.ts:304-307`）。
- 實際主機可由 env 覆寫：`STAFF_HOSTS`、`PRODUCT_HOST_<KEY>`（`lib/portal/hosts.ts:17-27`）。
- 塔羅「存無框圖」：`frameCardArt` 只把 `toGalleryArt`（≤2048px WebP，`TarotStudio.tsx:248`）存進 `batch[].art`（`:875`），按鈕送的就是它（`:2306-2309`）；原圖未保留。
- PSD／.vectorcraft 原檔走 `sourceFile`，由副檔名嗅探（`lib/studio/design-source.ts:34-48`）。

## 1. 不變量

- I1：「我的設計」存的＝使用者拿到的原始位元組（操作者日後從這裡挑印刷檔）；不得有損轉檔、不得無聲失敗。
- I2：大檔不經 app 的 request body；不調高 middleware 上限（它在驗身分前把 body 複製兩份，續18）。
- I3：伺服器只登記自己驗過的物件：先看 R2 回應的 Content-Length（≤ token.bytes ≤ 上限）才讀，邊讀邊擋；長度、嗅探、sha256 由伺服器自算。
- I4：`designs/` 下每個物件都有 DB 列；任何失敗路徑都刪掉本次寫入的正式物件；未登記的上傳只存在 `uploads/pending/`，由 lifecycle 1 天清。

## 2. 架構（一條路，所有大小都走）

```
瀏覽器 ─① POST /api/tools/designs/upload-url {kind:"image"|"source", mime|ext, bytes} ─▶ next-admin（middleware 驗身分，body 小）
       ◀─ {putUrl, key:"uploads/pending/<uuid>.<ext>", token=HMAC(kind|key|org|mime/ext|bytes|exp)}
瀏覽器 ─② PUT putUrl（原始位元組；presigned SigV4，簽入 Content-Type）─▶ R2 lobster-designs
瀏覽器 ─③ POST /api/tools/designs {upload:{key,token}, sourceUpload?:{key,token}, …metadata} ─▶ next-admin
       驗 token（org、kind、未過期）→ 讀 pending（I3）→ image: sharp 嗅探；source: design-source 嗅探
       → sha256 → putDesignObject(正式 key) → insert media_assets（同現行欄位）→ 刪 pending
       insert 或任一步失敗 → 刪本次正式物件（I4）。
```

- presigned 而非「調高上限＋nginx 擋未登入」或「分塊經 app」：位元組不經 app request；伺服器只在登記時讀一次、有上限且先驗長度。代價：R2 S3 憑證＋bucket CORS（High）。
- pending→正式 key：正式 `designs/` 只放已登記物件；孤兒交給 lifecycle，不必掃描比對 DB。
- token 用 HMAC 不用 DB 列：免 migration；金鑰 `DESIGNS_UPLOAD_TOKEN_SECRET`（新 env，與 R2 憑證分開）。

## 3. 工作卡（依序；每張獨立 commit；測試只寫卡內點名者）

| 卡 | 風險 | 內容 | 驗收 |
|---|---|---|---|
| C1 | High | 操作者在 Cloudflare 建 R2 S3 相容 token（**僅** `lobster-designs`，Object Read & Write）；agent 寫 `mcp/user-env.ps1`＋容器 env（`R2_S3_ACCESS_KEY_ID`、`R2_S3_SECRET_ACCESS_KEY`、`DESIGNS_UPLOAD_TOKEN_SECRET`），compose 走 `scripts/safe-infra-patch.sh compose`；`mcp/user-env.template.ps1` 加名稱。 | `docker exec lobster-next-admin printenv R2_S3_ACCESS_KEY_ID` 有值；回滾＝safe-infra-patch 自動還原 |
| C2 | High | 新 `scripts/r2-designs-bucket-config.mjs`，在容器內跑（`docker exec lobster-next-admin node …`，讀到實際 `STAFF_HOSTS`／`PRODUCT_HOST_*`）：origin＝`staffHosts()`＋每個 `door.app==="next-admin"` 且 enabled 的 `productHost(p)`（`lib/portal/hosts.ts`），CORS 只開 PUT＋`content-type`、MaxAge 600；lifecycle `uploads/pending/` 1 天刪。`--dry-run` 印差異；`--apply` 先把現行設定存檔。主機 env 改了要重跑（寫進腳本開頭）。 | 現行設定備份＋dry-run 差異＋apply 後讀回一致；各 origin preflight OPTIONS 200、非清單 origin 被拒 |
| C3 | Medium | 新依賴 `aws4fetch`（R2 文件建議，無相依）；`lib/storage/r2-presign.ts`（PUT，10 分鐘，Content-Length 能否簽入以實測定，不能也由 I3 守住）；`lib/studio/design-upload-token.ts`（HMAC 簽／驗，`timingSafeEqual`）；`app/api/tools/designs/upload-url/route.ts`（授權同 designs POST：`resolveOpsRole`＋`canCreateAiImageJob`＋`effectiveOrgId`；image mime＝`lib/storage/r2.ts:82-84` 三種；source ext＝`SOURCE_EXTS`；bytes ≤ 64 MiB）。 | 測試：token 竄改／過期／換 org／換 kind 皆拒；未登入 401；實測 presign PUT 到 `uploads/pending/` 成功、改 Content-Type 被拒 |
| C4 | Medium | `lib/storage/r2.ts` `r2GetObject`：先比回應 Content-Length 與 `maxBytes`，再串流讀並逐塊累計（超過即中止）。designs POST 加 `upload`／`sourceUpload` 輸入（與 `image`／`sourceUrl` 互斥）照 §2 ③；insert 失敗分支改為刪本次全部正式物件（主圖＋原檔，含既有 base64 路徑，`route.ts:304-307`）。 | 測試：Content-Length 超過不讀 body；大小不符、非圖片、原檔嗅探不符、key 不在 `uploads/pending/`、token 對不上 皆 4xx 且不留正式物件；insert 失敗後 `designs/` 無殘留；真實測：presign→PUT→登記一張 9 MB PNG，下載 sha256 相同 |
| C5 | Medium | 新 `lib/studio/design-upload.ts`（瀏覽器：Blob→①②③，回 `{ok}`／`{ok:false,error}`）。`TarotStudio.tsx`：`batch[]` 改存無框原圖 Blob（`artBlob`，取代 `art` 縮圖；頁面本就每張持有牌面 `blob`），預覽／比較／修圖／存無框圖／整副牌存檔都傳原始 Blob；自動存檔失敗畫面顯示一行（頁內既有提示樣式、theme token）；刪 `toGalleryArt` 的存檔用途。 | 塔羅真實操作：Ideogram 大圖與「存無框圖」存入後，從「我的設計」下載＝原 PNG（sha256 相同）；斷網時畫面有失敗提示 |
| C6 | Medium | 其餘呼叫端改走 `design-upload.ts`：`studio/StudioWorkbench.tsx:955,1004`、`banner/BannerStudio.tsx:1291`、`canvas/CanvasEditor.tsx`、`mockup/MockupStudio.tsx:494,510`、`mockup/ModelMockupPanel.tsx:75`、`publish/PublishWizard.tsx:264`、`designs/DesignsGallery.tsx:592`、`public/editor-shared/blocks/my-designs.js:36`（PSD 原檔走 `kind:"source"`）。全數改完刪 `lib/studio/image-upload-limit.ts`；designs POST 的 base64 `image` 輸入保留給小圖或移除（改完時再判）。 | 各頁存一張 >10 MB 圖與一個 >10 MB PSD 成功；`grep uploadableDataUrl` 0 命中 |

## 4. 不在此計畫（同類，另案）

- 其他 >10 MiB request body 的 route（續18 清單：`studio/{generate,inpaint,genfill,remove-bg,mockup,fabric-print}`、`tarot/generate`、`content/image`、`video/upload-asset` 45 MB）：改為「C3 上傳拿 key，再傳 key」沿用 C3／C4 元件，逐 route 開卡。

## 5. 回滾

- C1／C2：safe-infra-patch 自動還原；bucket 設定以 C2 備份還原；刪 S3 token。
- C3–C6：`git revert`；未登記 pending 由 lifecycle 一天內清；正式物件與 DB 列格式不變。
