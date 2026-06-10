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

---

# 附錄 A — 操作者完整需求清單（本對話累積）

## A1. 商業目標
- 用 AI 生成設計 → 印成商品（POD）→ 上架自己的店賣。品牌 = **Soulful Expression**（靈性/塔羅調性）。
- 賣貨店 = **操作者自己的 `soulfulexpression.org`**（Hostinger）；擬新增**商店子站**（建議 `shop.soulfulexpression.org`）跑 WooCommerce + POD，與品牌主站分離。
- 印刷出貨 = **Printful**（操作者自己的帳號；Jon 的不可用）。
- 最終要做到 Jon 的 MEGA 等級（見附錄 B），但**自建在 app.aware-wave.com**、單一棧、可長期維運。

## A2. 塔羅工具（P1，多數已完成並部署 SG）
| 需求 | 狀態 |
|---|---|
| 78 張塔羅 AI 生成、整套同風格、下載印刷檔 PNG（76×126mm @300DPI 含出血） | ✅ |
| 文字生圖 / 以圖生圖 / 上傳風格參考圖 | ✅ |
| 多模型可選（flux-schnell 最省→gpt-image-high），每模型顯示可吃幾張參考圖（maxRefs） | ✅ |
| 角色改造：使用者描述（如「藍貓」）取代人物，整副變那個角色（非每張變色） | ✅ |
| **不可用 Claude API 翻譯**（省錢）→ 已移除，prompt 直送圖片模型，建議打英文 | ✅ |
| 上傳參考圖**自動縮圖**（避免 >10MB body → invalid_json） | ✅ |
| 分組/單張生成（不強制 78 張一起；大牌/牌組/單張），點卡看大圖 + 重生 | ✅ |
| 牌卡模板「選框 → 套上空白卡 → 下載正確成品」；模板要**有縮圖預覽**可選 | ✅ |
| **不同風格的框**（6 個 AI 生成空心框：經典RW/手繪/中世紀/民俗/羊皮卷/哥德） | ✅ |
| **3 層架構**：上=框線（壓在圖上）/ 中=塔羅圖 / 下=底色（透明中央框） | ✅ |
| 模板選擇器放在「風格描述」後（UX 順序） | ✅ |
| **待辦**：per-frame 藝術圖區域微調（尤其 gothic 太擠）；celestial 星月框補生（被內容過濾擋）；OpenAI gpt-image 待操作者加 billing；整副一致性（flux-dev 參考錨點） | ⏳ |

## A3. 決策紀錄
- 圖只活在瀏覽器 → 要**持久儲存**（P2a R2）。
- 儲存選 **Cloudflare R2**（零 egress、S3 相容、已有 vault keys、架構合約指定）；不存 Hostinger 本機。
- 不直接用 Jon 的 MEGA（私有碼/他的帳號/Streamlit 異棧）→ 自建擴充 next-admin。

---

# 附錄 B — Jon Jones 的 MEGA 完整功能/設定參考（操作者截圖整理，建置藍本）

> MEGA = **Mass E-commerce Generator & Automator**（`app.mega.management` / `mockups.mega.management`，Streamlit，多用戶）。GitHub: jonjonesai（`store-drop-skill` = 建店那塊；MEGA app 設計生成段為私有/可能在 `templatized-jonops`）。

## B1. 主流程（側欄 Progress 6 階段）
`Idea（Claude 生 prompt）→ Generate（多模型並行 + 參考圖）→ Select（挑）→ Process（去背 + 壓縮）→ Mockup（Printful）→ Published（WooCommerce + 文案 + 定價）`

## B2. 側欄導覽
App / Settings / Analytics / Generators / Research / Mockup Explorer / My Designs / BG Removal Compare。（+ Mockup Studio 連結；多用戶 admin/beta）

## B3. App 主頁
- 橫幅：「You have N saved designs — reuse on a new product without regenerating」+ Browse My Designs。
- **Step 1 Design Idea**：Generate Prompt（Claude）→ Image Prompt 文字框 → **Beautify**（Claude 美化）。
- **Step 2 Generated Images**（多模型結果，可 Retry）。
- **Step 3 Process & Create Mockup**：選定圖 → **去背樣式**（Preserve Design 溫和保留筆觸 / Strip Background 積極去白底）→ Process Artwork。
- 側欄控制：**Theme / Vibe / Subject**（自由詞）、**Product** 下拉、**Style** 下拉（None/Art Deco/Kawaii/Line Art/Minimalist/Pop Art/Retro/Street Art/Typography/Vintage Poster/Watercolor/Other）、**Reference Image**（上傳，200MB/檔 PNG/JPG/WEBP，+ 第二張可選）、**Background Remover**（birefnet/bria_rmbg2/photoroom/pixian/**removal_ai 現用**/remove_bg）、**Generators** 勾選、Product Specs、Progress。

## B4. Settings → API Connections（存進 .env）
- **WooCommerce**：Store URL、Consumer Key、Consumer Secret；+ WP Username/Application Password（媒體上傳，繞過 Cloudinary fetch 不穩）。
- **Printful**：API Key、Store ID、Test。
- **Image Generation**：Provider（replicate）；**kie.ai**（替代供應商，便宜 25-40%）API Key。
- **Replicate**：API Token、Test。
- **Cloudinary**（圖床）：Cloud Name、API Key、API Secret、Test。
- **Anthropic**（商品文案）：API Key、Test。
- **Tinify**（壓縮）：API Key、Test。
- **removal.ai**（去背）：API Key。
- **Brand Assets**：Inside Label Logo URL。
- **Size Guide**：Size Guide 頁 URL（自動附到服飾/泳裝商品描述）。
- Test All Connections。

## B5. Settings → Pricing Defaults（每商品零售價，持久 + 預填）
- **Apparel**：T-shirt 24.99/26.99(plus)、Hoodie 49.99/54.99、Crew Neck Sweatshirt 32.99/34.99、Youth T-shirt 21.99、Sweatshirt 56.99/58.99、Hawaiian Shirt 49.99/51.99、Bodycon Dress 44.99、Swimsuit 49.99/51.99、Yoga Leggings 54.99、Baby Bodysuit 24.99。
- **Headwear**：Beanie 29.99、Cuffed Beanie 29.99、Classic Snapback 34.99、Classic Dad Hat 32.99。
- **Bags & Accessories**：Tote Bag 29.99、Fanny Pack 39.99、Backpack 58.99、iPhone Case 29.99、Samsung Case 29.99。
- **Drinkware**：White Glossy Mug 11/15/20oz 14.99/16.99/18.99、Black Glossy Mug 11/15oz 16.99/18.99、Shaker Pint Glass 19.99、Water Bottle 34.99。
- **Home & Living**：Basic Pillow 26.99、Wall Art Vertical 8x10/12x16/16x20 29.99/39.99/49.99、Wall Art Horizontal 10x8/16x12/20x16 29/39/49、Mousepad 19.99、Flag 32.99、Beach Towel 30x60/36x72 52.99/62.99。
- **Stationery**：Sticker 3x3/4x4/5.5x5.5 3.99/4.99/5.99、Bumper Sticker 10.99。

## B6. Settings → Users / Usage
- 多用戶（admin + beta testers），跨 MEGA + Mockup Studio 共用。
- 用量：每用戶 30 天視窗 **Products X/50、Generations X/250**，到期重置（配額控制）。

## B7. Generators（Generator Registry，每 ~90 天更新）
Active 6 / Reserve 1 / Deprecated 3 / Total 10。表欄：Name｜Developer｜Status｜Ratios｜Input Images｜Max Res｜Transparent BG｜Speed：
- Ideogram V3（Ideogram AI，active，15 ratios，3 input，1536px，slow）
- Flux 2 Pro（Black Forest Labs，active，11，8，2048px/4MP，fast）
- Seedream 5 Lite（ByteDance，active，9，14，3072px/3K，medium）
- GPT-Image 2（OpenAI，active，3，multiple，~1024-1536px，fast）
- GPT-Image 2 (kie)（OpenAI via kie.ai，active，5，0，4K/2K，fast）
- Nano Banana 2（Google DeepMind，active，15，14，4096px/4K，fast）
- Flux 2 Max（Black Forest Labs，reserve，11，8，2048px/4MP，fast）
- 每生成器詳情：slug、強弱項、Best For、支援 aspect ratios、**API 參數**（prompt / aspect_ratio / resolution 67 presets / magic_prompt_option / style_type / style_preset 64 / **style_reference_images 最多 3** / image inpainting + mask）、capabilities、新增/更新日期。

## B8. Research（MEGA Research）
「丟一個 niche → 生 10 個 design territories → 一鍵送進 MEGA」。Niche + **Audience**（Any/Female/Male/Gen X/Millennials/Gen Z/Moms/Dads…）+ **Tone**（Any/Humor·sarcasm/Nostalgic·retro/Premium·minimal/Dark·edgy/Wholesome/Rebellious/Patriotic…）→ Generate 10 territories。每日配額（如 20/20）。

## B9. Mockup Explorer
預生成 mockup 庫 — 瀏覽每個商品的每種 Printful mockup 樣式。挑 Product（Cached library / All MEGA products / Generate new）。例：Greeting Card Vertical（10 mockups）ID 568 → Flat 1-6、Lifestyle 1-3 變化。點 mockup 看 `option_group` 名（用在 `_extra_styles` / mockup configs）。

## B9-S. Mockup Studio（AI 合成 lifestyle/模特商品圖 — ★ 操作者要的「生成圖＋模特兒＋合成」就是這個）

> 獨立 companion app（`mockups.mega.management`），**與主流程的 Printful mockup（B9 Explorer）並行的第二條路**。差別：Explorer = Printful 預拍固定範本；**Studio = 用 AI 直接生一張擬真商品照**，把設計印在衫上 + 自帶場景/道具/模特兒。這條路比 Printful 靈活（自訂場景/道具/模特族裔），也是我們自建要走的路。截圖來源：操作者 2026-06-11。

**輸入控制（截圖逐欄）**
- **Product Type**：T-shirt / Hoodie / Sweatshirt / Tank Top / Youth Tee（單選）
- **Color**：下拉（如 White `#f4f5f0`），顯示「N colors available for this product」
- **Background Surface**：自由文字場景面（如 `light wooden table`）→ 平拍背景
- **Style**：`Male (relaxed)` / `Female (scrunched)` → 模特性別 / 衫的擺放姿態
- **Lighting**：`Soft top-down` / `Strong side-angle`
- **Niche Props（3 角落道具）**：Bottom-Left（apparel prop，如珍奶）／Top-Right（niche prop 1，如台灣國旗）／Bottom-Right（niche prop 2，如福爾摩沙旅遊地圖）
- Clear inputs / Logout

**模特版額外帶入（操作者口述，2026-06-11）**：合成「有模特兒」的商品圖時，prompt 額外帶入 → **產品（型號+色）、設計圖案、模特兒 種族膚色 / 性別 / 動作姿勢 / 場景**。即：不只平拍，可生「某族裔模特兒穿著印有此設計的衫、在某場景、某動作」的 lifestyle 照。

**產出範例（截圖）**：奶油色 tee 印「鼎泰豐 DIN TAI FUNG」平拍於木桌 + 筷子/湯匙叉 + 竹蒸籠小籠包；「I ❤ 台北」tee + 中華民國國旗道具。→ 設計、衫、場景、主題道具**一張 AI 圖同時生成**。

**機制（推斷，合理且我們可複製）**：把上面所有控制組成一段結構化 prompt + **把設計圖當 reference image** → 餵多模態影像模型，由模型直接把設計「印」到衫上並處理皺褶/光線/透視。**不是手工 displacement map**；現代多模態模型（尤其 Nano Banana = Gemini image）擅長「把這個 logo/設計貼到這個產品/模特身上」的擬真合成 → 這也是它在 Analytics 勝率最高（33.3%）的原因。

**Generators（截圖）**：Ideogram / Ideogram 4 / Flux 2 Pro / Seedream 5 Lite / **Nano Banana 2** / Nano Banana 2 (kie) / GPT-Image 2 / GPT-Image 2 (kie) / MAI Image 2.5。
**Analytics 勝率（哪個模型的圖被選為成品）**：Nano Banana 2 = 33.3%（2/6）、Flux 2 Pro = 16.7%（1/6），其餘 <5 runs。→ **合成首選 Nano Banana 2**。

**我們自建對應**：next-admin 加「Mockup Studio」頁，輸入同上 → 組 prompt + 設計當 reference → 走 **Replicate MCP**（已有）呼叫 **Nano Banana 2 / Flux / Seedream** → 產出擬真 mockup 存 R2。**不需要 Printful、不需要實拍範本庫、不需手工貼圖**。

## B9-A. Analytics（Generator 勝率追蹤 — 驅動「該留哪些模型」）
「Win Rates：每個 generator 的圖被選為成品的頻率（最少 5 次出場才顯示率）」。表欄：Generator｜Appearances｜Wins｜Win Rate。另有 Recent Selections（generator｜product｜ratio｜date）。截圖數據：Nano Banana 2 6 出場 2 勝 33.3%、Flux 2 Pro 6/1/16.7%、Seedream 5 Lite/MAI/Ideogram 4/GPT-Image 2 (kie)/GPT-Image 2 皆 0 勝。→ 用途：每 ~90 天汰換生成器（B7 registry）時用真實勝率決定 active/deprecated。**自建對應**：記 `generation_runs`（model, product, ratio, selected_bool, ts）即可算同樣勝率。

## B10. My Designs
「每張處理過的設計都存這，可換商品重用不必重生」。Filter Status/Type/Search。每張：縮圖、prompt·狀態(processed)·fullbleed·生成器、Reuse/Open/Delete。

## B11. 整合服務清單（我們自建時要對應）
Replicate（+ kie.ai 便宜替代）｜OpenAI gpt-image｜Anthropic（文案/prompt）｜removal.ai + birefnet/bria/photoroom/pixian/remove_bg（去背，多選可比較）｜Tinify（壓縮）｜Cloudinary（圖床，我們改用 **R2**）｜Printful（印刷+mockup+出貨）｜WooCommerce（上架）。

> **自建對應原則**：我們不照搬廠商（圖床用 R2 不用 Cloudinary；去背先用 Replicate rmbg 不另接 removal.ai；多模型先用 FLUX/gpt-image 再擴），但**流程/功能/設定欄位以 MEGA 為功能藍本**。
