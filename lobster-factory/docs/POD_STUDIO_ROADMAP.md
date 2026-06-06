# POD Studio Roadmap — 設計生成 → 印刷 → 上架賣貨（30 年架構計畫）

> 範本參考：同事 Jon Jones 的 MEGA「Mass E-commerce Generator & Automator」。
> 終點：在 **app.aware-wave.com** 自建一套 POD 流水線，把 AI 設計印成商品、上架到**操作者自己的店**（Hostinger 新子站 `shop.soulfulexpression.org`）販售。
> 建立：2026-06-06。狀態：規劃。SSOT = 本檔。

---

## [任務理解]（根本問題，非表面症狀）

操作者要的不是「一個塔羅工具」，而是**一條可長期營運的 print-on-demand 賣貨流水線**：
`想點子 → 生成設計圖（文字/以圖）→ 去背 → 合成商品 mockup → 印刷出貨 → 上架 WooCommerce 賣`。
塔羅工具是這條線的**第一格（Generate）**且只做一種商品；真正目標是把它**一般化成多商品流水線**並接上**印刷（Printful）+ 店面（WooCommerce）**。

**核心約束**：最小、穩定、安全、可驗證、可回滾、可擴充刪減、30 年可跑；**重用既有控制面（`ai_image_jobs`/`media_assets`/R2 合約/build-console），不重造、不破壞 next-admin/tarot 既有功能。**

---

## [現況分析]（已讀檔 + grep 證據）

| 能力 | 現況 | 證據 |
|---|---|---|
| **設計生成** | ✅ 已有（tarot）：`app/tools/tarot/*` + `lib/tarot/image-gen.ts`（FLUX/gpt-image，route auth 重用 `resolveOpsRole`+`canCreateAiImageJob`） | 本 session 已建並部署 |
| **影像 job 佇列** | 🟡 控制面骨架在、**無 worker**：`ai_image_jobs` 表（status/output_asset_id/trace_id）+ `POST /api/ops/ai-image-jobs`；無消費者 | `packages/db/migrations/0011_*.sql`；`AiJobForm.tsx`「executor wiring comes after control-plane stable」 |
| **持久儲存（R2）** | 🟡 **僅合約 + 表，無上傳程式碼**：`MEDIA_STORAGE_BOUNDARY_CONTRACT.md`（AI 圖→R2）+ `media_assets`(storage_backend r2)；vault 有 `CF_R2_ACCOUNT_ID/API_TOKEN/BUCKET`；manifest action type 有 `r2_put` 但 source 無 `S3Client`/`PutObject` | grep：source 無 aws-sdk client；只有 contract/ops-contracts |
| **去背** | ❌ 無 | grep removal.ai/rmbg = 0 |
| **Mockup / 印刷（Printful）** | ❌ 無 | grep printful = 0 |
| **WooCommerce 上架** | 🟡 **只有「provisioning 裝外掛」+ smokeProfile，無 REST 上架 client** | `provision-staging/route.ts`(裝 woocommerce 外掛)；`build-console/contracts.ts` smokeProfile=woocommerce；無 wc/v3 呼叫 |
| **店面** | 操作者既有 `soulfulexpression.org`（Hostinger，`hostinger_soulful` SSH key + `SUPABASE_SOULFULEXPRESSION_*`）；擬新增子站 `shop.soulfulexpression.org` | 憑證檔 + 操作者確認 |
| **可重用資產** | next-admin app + auth + globals.css 設計 token；tarot image-gen/studio 模式；Trigger.dev workflows（dormant，可跑批次）；build-console provisioning（建站）；R2 vault keys；Printful API key 需操作者自備（Jon 的不可用） | — |

**結論**：生成那一格已扎實。**儲存 / 去背 / Printful / WooCommerce 上架四塊全要新建**（部分有 schema/合約鷹架可接）。

---

## [風險清單]

1. **成本失控**（圖生成 / Printful / R2 / OpenAI billing）→ 需 server 端 per-user 配額 + 二次確認 + 預估顯示。
2. **外部 API 依賴**（Replicate / OpenAI / Printful / WooCommerce / R2）斷線或變更 → 需 idempotency、重試、fail-open、provider 抽象層（避免 vendor 鎖死，30 年可換）。
3. **Hostinger 方案限制**：多站需 Premium/Business；單站方案無法加子站 → **動工前必須確認方案**。
4. **帳號歸屬**：Printful / WooCommerce 必須用**操作者自己的**帳號（taiwanmerch/Jon Printful 不可用）。
5. **安全**：所有金鑰僅 server 端（絕不 `NEXT_PUBLIC_`）；WC consumer key 最小權限；R2 bucket 分離（不用 `lobster-backup` 備份桶）；所有工具 route 走既有 auth；公開圖資產走 CDN 但不可洩私密。
6. **破壞既有**：next-admin 是 production（維修主控等）；新功能必須**純新增 + feature-flag 預設 OFF**（依 lobster 自動化安全預設），不動既有路由/DB。
7. **資料一致性**：DB 只做 additive migration（沿用既有遷移流程），不破壞 `ai_image_jobs`/`media_assets`。
8. **印刷品質**：印刷檔需正確 DPI/出血/透明背景/尺寸（各 Printful 商品規格不同）→ 需 per-product 模板規格。

---

## [方案比較]

**A. 直接用同事的 MEGA（Streamlit）**
- 優：現成、省工。缺：他的私有碼、Streamlit 與本棧（Next.js/Supabase/SG）不同、帳號是他的、無法整進 app.aware-wave.com 治理/auth/監控。30 年維運在別人手上。**否決為主線**（可借鑒流程）。

**B. 在 app.aware-wave.com 自建（擴充 next-admin），分階段**（建議）
- 優：重用既有 auth/控制面/部署/監控/R2；單一棧、單一治理；provider 抽象可換；feature-flag 漸進、可回滾。缺：工程量大 → 用**分階段**化解（每階段獨立可上、可回滾）。

**C. 全新獨立 app**
- 優：乾淨。缺：重造 auth/部署/監控/儲存，違反「不重造」+ 30 年維運分裂。**否決**。

---

## [建議方案]：B — 擴充 next-admin，6 階段漸進

**設計原則**：① 每階段純新增 + env flag 預設 OFF ② provider 抽象（`ImageProvider`/`BgRemover`/`PrintProvider`/`StorePublisher` 介面，實作可換）③ 重用 `ai_image_jobs`/`media_assets`/R2 合約 ④ 每階段獨立 REALTEST + rollback。

```
tarot (已有) ──┐
               ├─► [P2a 儲存層 R2+media_assets+My Designs]  ← 先做，解決「關分頁就沒了」
               │      └─► [P2b 一般化生成器 Studio：多商品/多模型/風格預設]
               │              └─► [P2c 去背 BgRemover(Replicate rmbg)]
               │                      └─► [P2d Printful：上傳設計→建商品→取 mockup]
               │                              └─► [P3 WooCommerce 上架（shop.soulfulexpression.org）]
               └─► [P1 tarot 收尾（per-frame 微調 / OpenAI billing / 一致性）]
```

---

## [實作計畫]（分階段，每階段 = 一個可獨立部署 + 回滾的 PR）

### P1 — tarot 收尾（小、低風險，本 session 多數已完成）
- per-frame 藝術圖區域微調（尤其 gothic）；celestial 框補生；OpenAI billing 待操作者；整副一致性（flux-dev 參考圖錨點）。
- **不阻擋 P2**（可並行）。

### P2a — 儲存層（R2 + media_assets + My Designs）★ 地基，先做
- 新 `lib/storage/r2.ts`：S3 相容 client（`@aws-sdk/client-s3` 或 raw SigV4），用 `CF_R2_*`；`putObject(key, bytes, contentType)` → 回 public URL。**新 designs bucket**（非 `lobster-backup`）+ 公開網域（`cdn.aware-wave.com` 或 r2.dev）。
- 寫 `media_assets`（既有表，storage_backend=r2, asset_domain=ai_generated, object_key/url/checksum）。
- 生成成功 → server 上傳 R2 → 存 media_assets → 回 asset URL。tarot/studio 改存 R2（不再只活在瀏覽器）。
- 新 `app/tools/designs`（My Designs）：列 media_assets、重用、下載。
- **驗證**：REALTEST 上傳一張 → curl R2 public URL 200 → media_assets 有列。**rollback**：flag off + 移除 route，表為 additive 不動。

### P2b — 一般化生成器（MEGA「Generate」格）
- 把 `lib/tarot/image-gen.ts` 抽成 `lib/studio/image-provider.ts`（`ImageProvider` 介面，FLUX/gpt-image 實作；tarot 變成呼叫端的一個 preset）。
- 新 `app/tools/studio`：theme/vibe/subject → prompt（可選 Claude 生，但**預設關**避成本）→ 多模型 → 參考圖 → 商品類型選擇。
- **不破壞 tarot**：tarot 留著，共用 provider。
- **驗證**：REALTEST 生一張非塔羅設計。**rollback**：新 route 移除。

### P2c — 去背（BgRemover 抽象）
- 新 `lib/studio/bg-remover.ts`（`BgRemover` 介面）。**首選 Replicate rmbg/birefnet**（重用 REPLICATE token，無新廠商、便宜）；removal.ai 為可選實作。
- 生成 → 去背 → 透明 PNG 存 R2（印刷用）。
- **驗證**：REALTEST 去背一張 → 確認透明 alpha。**rollback**：步驟可跳過（flag）。

### P2d — Printful（PrintProvider 抽象）★ 需操作者 Printful 帳號
- 新 `lib/studio/print-provider.ts`（`PrintProvider` 介面，Printful 實作）：list products → create sync product（上傳去背設計）→ get mockups。
- 金鑰 `PRINTFUL_API_KEY` + `PRINTFUL_STORE_ID`（操作者自備，存 vault + SG env）。
- **High-risk（外部建商品）**：先 dry-run / draft 模式，操作者確認才正式。
- **驗證**：REALTEST 對 Printful sandbox/draft 建一個測試商品 + 取 mockup。**rollback**：刪 draft 商品。

### P3 — WooCommerce 上架（賣貨終點）★ 需新店子站
- **先決：店面 provisioning**（操作者決定）：`shop.soulfulexpression.org`（Hostinger 子站）裝 WP+WooCommerce+Kadence+Printful 外掛。手段：Hostinger hPanel 手動 / 借鑒 store-drop-skill / build-console 流程（需評估 Hostinger 相容）。
- 新 `lib/studio/store-publisher.ts`（`StorePublisher` 介面，WooCommerce REST 實作）：建商品（標題/Claude 文案/定價/分類/mockup 圖/尺寸表）。
- 金鑰 `WOO_STORE_URL/WOO_CK/WOO_CS`（操作者店的 consumer key/secret，最小權限）。
- **High-risk（對 production 店建商品）**：draft 商品先，操作者 review 才 publish。
- **驗證**：REALTEST 對 staging 或 draft 建一個測試商品 → 店後台可見。**rollback**：刪 draft。

---

## [驗證計畫]（每階段 R0 四動作）

1. **REALTEST**：每階段對**真實外部 API**（R2 curl / Replicate / Printful draft / WooCommerce draft）實打 + 觀察，記 `REALTEST_EVIDENCE`。`.ts` 改動先 `tsc --noEmit`。
2. **Review**：`/review`（critic 外部 oracle），尤其 auth/金鑰/外部呼叫/idempotency。
3. **抓蟲**：grep 新 symbol 跨檔 call sites（scope 含 lobster-factory/agency-os/scripts）。
4. **WORKLOG**：每階段 entry 含四動作。
5. **部署**：走 `sg-deploy.sh next-admin`（內建 npm test + typecheck + smoke + 自動回滾）；deploy 前 `/check-drift`+`/verify`+`tsc`。
6. **端到端**：P3 完成後跑一次「生成 → 去背 → Printful draft → WooCommerce draft」整鏈，截圖存證。

---

## [待操作者決定 / 先決條件]
1. **Hostinger 方案**是否允許加子站？（要先確認才動 P3 店面）
2. 店面：子網域 `shop.soulfulexpression.org`（建議）vs 子目錄 vs 主站加 Woo？
3. **Printful 帳號**（操作者自己的）—— P2d 必需。
4. P1 tarot 要做到什麼程度才算「好用」（per-frame 微調 / 一致性 / OpenAI）。

## [Rollback 總則]
每階段 = 純新增 + env flag（預設 OFF）+ additive migration。回滾 = flag off / 移除 route+lib / 刪外部 draft 商品。**不破壞** next-admin 既有路由、`ai_image_jobs`/`media_assets` 既有欄位、tarot 既有功能。
