# 塔羅牌印刷檔生成工具 — app.aware-wave.com

## Context（為什麼做這個）

使用者要在 `https://app.aware-wave.com`(= `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`,Next.js 15 App Router)加一個**塔羅牌印刷檔生成工具**。

工作流(使用者確認版):
1. 用**文字生圖**或**以圖生圖**(上傳一張底圖)生成**一張**樣本圖。
2. 滿意後鎖定該風格;或直接**上傳一張現成圖**當風格參考。
3. 用該風格**整套 78 張塔羅牌**一致生成。
4. 提供**下載**(PNG,完整印刷牌卡)。

使用者提供的 `tarot-ai-generator.jsx` 是 Claude artifact 原型,只能參考其**78 張牌資料 + 卡片版面**,其生成邏輯(瀏覽器直打 `api.anthropic.com`、無 key、生 SVG)**不可用於生產**,且 Claude 不會生 PNG。

### 三個已釐清的硬約束(寫進決策,別重議)
- **$100 Claude 訂閱無法給網站程式用** → 必須用 API key。app env 已配 `REPLICATE_API_TOKEN` + `OPENAI_API_KEY`。
- **Claude 不生 raster 圖**。真實圖片(img2img / 吃上傳風格圖)只能用圖片模型。
- **SVG 做不到此工作流**(無法 img2img、無法吃上傳照片風格)→ 確定走 **PNG 圖片模型**。
- 時間現實:78 張一張約 15–25 秒,**全套 20–40 分鐘**,瀏覽器需開著看進度。MVP 不建 Trigger.dev/R2 佇列(現有 `ai_image_jobs` 是無 worker 的空殼)。

### 風險分級
**Medium**(新外部 API 呼叫、會花錢、新依賴;非 auth/payment/RLS/migration)。部署到 SG 前需走 `/check-drift` + `/verify` + `tsc --noEmit`,並等使用者明示 go-ahead 才 `sg-deploy`。

---

## 架構(MVP,薄伺服器 + 客戶端組版)

```
[Client /tools/tarot]                    [Server route]                  [外部 API]
 Step1 風格設計 (1 張預覽)  ── POST ──▶  /api/tools/tarot/generate  ──▶  Replicate FLUX
 Step2 批次 78 張 (逐張迴圈) ─ 78×POST ─▶  (single image / request)    └▶  OpenAI gpt-image-1
 Step3 canvas 組印刷牌卡 + JSZip 打包下載
```

- **金鑰只在伺服器**(`process.env`,絕不 `NEXT_PUBLIC_`)。客戶端永遠走自家 `/api` route。
- **一張圖 = 一個 request**(壓在 nginx 60s 內);客戶端迴圈 78 次,逐張顯示進度 + 失敗可重試單張。
- **印刷牌卡組版在客戶端 `<canvas>`**:AI 藝術圖 + 裝飾邊框 + 牌名 + 羅馬數字,輸出 70×120mm @300DPI 含出血(約 898×1488px),`canvas.toBlob` → PNG。避免新增伺服器影像處理 + 儲存層。
- **下載**:`jszip` 把 78 張 PNG 打成一個 zip;單張也可右鍵存。
- **MVP 無伺服器儲存**:圖片活在 session 記憶體,下載即走。(未來再接 R2 / `media_assets` / Trigger.dev 批次,列為 enhancement。)

---

## 新增 / 修改檔案

### 1. 牌資料(從原型移植,修亂碼)
**新增** `app/tools/tarot/cards.ts`
- 移植 `tarot-ai-generator.jsx` 的 `TAROT_CARDS`(22 大 + 56 小 = 78),保留 `name/roman/type/theme/colors/symbols`。
- 每張加一個 `subjectPrompt`(該牌的主體描述,供圖片模型用,例:THE FOOL = "a carefree young traveler at a cliff edge, small dog, white rose, bright sky")。

### 2. 頁面(client component)
**新增** `app/tools/tarot/page.tsx` + `app/tools/tarot/TarotStudio.tsx`(`"use client"`)
- **Step 1 風格設計**:
  - 模式:文字生圖 / 以圖生圖(上傳底圖)/ 上傳風格參考圖。
  - Provider 選擇:FLUX / gpt-image-1(兩者都做)。
  - 風格 prompt 輸入 + 可選參考圖上傳(轉 base64)。
  - 「生成預覽」→ 對 `THE FOOL`(或風格樣本)打一次 `/api/tools/tarot/generate` → 顯示。可重生直到滿意。
  - 鎖定風格 = 記住 { stylePrompt, seed, referenceImage, provider }。
- **Step 2 批次生成**:對 78 張迴圈呼叫 generate(帶鎖定風格 + 各牌 `subjectPrompt`),進度條 X/78,單張失敗標記可重試。
- **Step 3 組版 + 下載**:每張回傳圖丟進 `renderPrintCard()` canvas → PNG;全部完成後 JSZip 下載 `tarot-deck-print.zip`。
- 樣式沿用 `app/globals.css` 既有 token(`.topbar`/`.page`/`.card`/`.form-input` 等),不引入 Tailwind。

### 3. canvas 印刷組版工具
**新增** `app/tools/tarot/renderPrintCard.ts`
- 輸入:藝術圖(Image/bitmap)+ card meta。輸出:898×1488 PNG blob。
- 畫:出血底 → 藝術圖填入畫窗 → 裝飾邊框(canvas path,用 `card.colors`)→ 頂部羅馬數字 + 底部牌名(serif)。
- 對齊原型 `TarotCard` 的視覺,但放大到印刷解析度。

### 4. 伺服器生成 route
**新增** `app/api/tools/tarot/generate/route.ts`(POST)
- Auth:`resolveOpsRole(request)` + 重用 `canCreateAiImageJob(role)`(owner/admin/operator)— 來自 `lib/ops-role.ts`。
- body:`{ provider: 'flux'|'openai', mode: 'text'|'image', prompt, referenceImage?, seed?, size }`。
- **FLUX 分支**:fetch `api.replicate.com` 建 prediction → 在本 request 內輪詢至完成(<60s);img2img/風格參考用支援 image input 的 FLUX 模型(如 `black-forest-labs/flux-dev` img2img 或 flux redux)。
- **OpenAI 分支**:fetch `api.openai.com/v1/images/generations`(text)或 `/images/edits`(吃參考圖),model `gpt-image-1`,size `1024x1536`。
- 沿用 `lib/onboarding/spec-generator.ts` 的 **AbortController + timeout + finally clear** 模式;env key 缺失先擋(回 500 `missing_*_key`)。
- 回 `{ ok, image(base64 png), seed }`;錯誤回 `{ ok:false, error }`。

### 5.(可選)風格描述抽取
**新增** `app/api/tools/tarot/describe-style/route.ts`
- 上傳風格圖時,用既有 `@anthropic-ai/sdk`(vision)抽出一段風格描述詞,併入每張 prompt 強化一致性。沿用 spec-generator 的 client 寫法。MVP 可先省略,純靠 reference image + 固定 seed。

### 6. 側欄入口
**修改** `app/layout.tsx`
- 在 "Content Tools" 區加 `<Link href="/tools/tarot">🔮 Tarot</Link>`。

### 7. 依賴
**修改** `apps/next-admin/package.json`
- 加 `jszip`(客戶端打包)。
- FLUX / OpenAI 都用原生 `fetch`,**不加** replicate/openai SDK(減少依賴面)。
- `sharp` 不需要(組版在客戶端 canvas)。

---

## 風格一致性機制(關鍵)
1. **固定 seed**:預覽鎖定後整套沿用同 seed。
2. **共用風格前綴 + 各牌主體**:`{stylePrompt} + {card.subjectPrompt} + ", tarot card composition, portrait"`。
3. **參考圖**:img2img / 風格參考圖透過模型 image input 帶入每張。
4.(可選)vision 抽風格詞 → 併入前綴。

---

## 驗證計畫(R0 四動作)

1. **實測(REALTEST)**:
   - 本機 `npm run dev` 起 next-admin;`/tools/tarot` 開得起來。
   - `curl -X POST localhost:3000/api/tools/tarot/generate`(帶模擬 role header)各對 FLUX、OpenAI 打一次 → 確認回傳 base64 PNG、exit 0。記 `REALTEST_EVIDENCE`。
   - UI 跑一次「預覽 1 張 → 批次 3 張(縮小測試集)→ 下載 zip」全流程。
2. **tsc**:`.ts/.tsx` 改動 → `npx tsc --noEmit` 必過(REALTEST 前)。
3. **Review**:`/review`(critic)讀回 route + canvas + page;結論納入 `REVIEW_DONE`。
4. **抓蟲(BUGHUNT)**:grep `canCreateAiImageJob` / `resolveOpsRole` call sites 一致;grep `tarot` 跨檔無 stale;scope 含 `lobster-factory` + `agency-os` + `scripts`。
5. **部署**:`/check-drift` → `/verify` → 等 go-ahead → `sg-deploy.sh next-admin` →（部署規則需）env 確認 `REPLICATE_API_TOKEN`/`OPENAI_API_KEY` 在 SG container 內可讀 → smoke check `/tools/tarot` 200。

---

## 已知風險 / rollback
- **nginx 60s/req**:gpt-image-1 高品質可能接近上限;對策 size/quality 調中、或單獨提高該 route 的 `proxy_read_timeout`。FLUX dev 通常 <30s。
- **成本**:每套 NT$60–150;UI 在「生成整套」前顯示預估張數 + 費用提示,需使用者二次確認才跑 78 張。
- **品質/解析度**:模型輸出約 1024×1536,放進印刷畫窗;不足時加 upscale(enhancement,非 MVP)。
- **rollback**:純新增檔案 + 一行側欄 + 一個 dep;移除 `app/tools/tarot/`、還原 `layout.tsx`、`package.json` 即完全復原。無 DB/migration 變更。
