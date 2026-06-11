# POD Studio P2a→P4 執行計畫（mockup 驗證已 PASS，2026-06-11）

> **這份是什麼**：POD Studio 從「藍本」走到「上線賣貨」的執行順序計畫。
> 藍本/規格 SSOT = `lobster-factory/docs/POD_STUDIO_ROADMAP.md`（細節都在那，本檔不重複）。
> 本檔只管：**順序、每階段做什麼、過關條件（gate）、先決、rollback**。
> 驗證證據 = `agency-os/WORKLOG.md` 2026-06-11「POD Studio P0 驗證」段。

---

## 0. 已完成 — P0 擬真合成驗證 ✅（2026-06-11）

- `google/nano-banana-2`（Replicate）：白衫 mockup ~95% 設計重現；黑衫鎖色 prompt 後 ~90%。
- 產出：`C:\Users\USER\Downloads\pod-mockup-test\`（3 張 + previews）。
- **三條 prompt 鐵則（直接進 Mockup Studio 範本）**：
  1. 深色衫 → prompt 逐色點名鎖色（"the two right petals are DARK NAVY BLUE, do NOT lighten"）
  2. 姿勢避開遮胸（禁抱胸/雙手交叉於胸前）
  3. 設計圖一律 **data URI** 餵入（≤256KB；外鏈會被 Replicate worker 擋）
- Schema 實測：`image_input` ≤14 張、resolution `1K/2K/4K`、aspect 15 種、`output_format jpg/png`；連發要隔 10–15s（429）。
- 成本基準：2K 一張 ~20–30s、3 張 < $0.25。

## 0.5 先決小修（P2a 動工前，5 分鐘）

| # | 事項 | 修法 |
|---|------|------|
| 1 | 本機 REPLICATE_API_TOKEN stale（SG 2026-06-05 已輪替 `r8_MX…`，本機 vault + `mcp/user-env.ps1` 還是舊 `r8_U…` → MCP 401） | SG `.env` 現役 token 回填本機兩處；筆電下次開機照 memory 同步 |
| 2 | CLAUDE.md doc drift：`secrets-vault.ps1 -Action get -Key` → 實際是 `-Name`，且輸出為 `NAME=value` 需 split | 修 CLAUDE.md 一行（governance 改動 → 跑 /doc-sync） |

---

## 執行順序（每階段 = 獨立可部署 + 可回滾的一個 PR；全部 feature-flag 預設 OFF）

### P2a — 儲存層（R2 + media_assets + My Designs）✅ 完成 2026-06-11（未部署）
- **實作**：`lib/storage/r2.ts`（**CF REST API 直 PUT，零 aws-sdk** — 沿用 SG `upload-to-r2.sh` 慣例；R2 keys 在 SG `.env`，非 vault）+ `app/api/tools/designs/route.ts`（POST 存/GET 列）+ `app/tools/designs` My Designs 頁 + vitest 6 tests。bucket `lobster-designs`（APAC）+ r2.dev public URL 已開。
- **Gate 已過**：REALTEST PUT→public GET 200 byte-exact→media_assets 201→select-back；tsc 0 錯；critic Deep 2M/3m 全修。
- **部署待辦**：SG env 加 `POD_DESIGNS_ENABLED=true` + `POD_DESIGNS_DEFAULT_ORG_ID=2bf60452-3d4d-47c2-9970-b9046ed1a35a`；`/sg-deploy` 等 go-ahead。
- **Escalation**：migration 0007/0011 media_assets 雙定義衝突（TASKS 🔴 High 項，db-expert 審後另修）。
- tarot→R2 wiring：等 tarot 模型彙總 session 完工再接（避撞 `image-gen.ts`）。

### P2b — 一般化生成器
- **做什麼**：`lib/tarot/image-gen.ts` 抽成 `lib/studio/image-provider.ts`（ImageProvider 介面）；新 `app/tools/studio`；tarot 變 preset 不破壞。
- **Gate**：REALTEST 生一張非塔羅設計；tarot 既有功能 smoke 不變。

### P2c — 去背
- **做什麼**：`lib/studio/bg-remover.ts`（BgRemover 介面，首選 Replicate rmbg/birefnet，重用 token）。
- **Gate**：REALTEST 去背一張 → 確認透明 alpha。

### Mockup Studio 頁（隨 P2c 後）
- **做什麼**：B9-S 雙模式（平拍/模特）控制欄 → 組 prompt + 設計 data URI → nano-banana-2 → 存 R2。**內建 §0 三條 prompt 鐵則**（深色鎖色範本、姿勢黑名單、data URI）。
- **Gate**：REALTEST 白衫+黑衫各一張，目視貼合度 ≥ 今天水準。

### 印刷檔管線（隨 Mockup Studio）
- 模型最大解析 → `nightmareai/real-esrgan`（schema 已查：image/scale/face_enhance）放大至 **3600×4800 @300DPI** → 去背 → 透明 PNG。
- **Gate**：輸出檔尺寸/透明 alpha/DPI 驗證。

### P2d — Printful 建綁-Woo sync product ★ High-risk gate
- **做什麼**：`lib/studio/print-provider.ts`（PrintProvider 介面）；上傳設計 → 建 **sync product**（綁 Woo 變體，白+黑 × 尺寸）。
- **先決（操作者）**：**妳自己的 Printful 帳號 + API key + Store ID**（Jon 的不可用；存 vault + SG env）。
- **Gate**：draft 模式建一個測試商品 + 取 mockup；**操作者明示 OK 才正式**。Rollback = 刪 draft。
- **地雷**：同事帳號的「Generate new mockup」永遠不要碰。

### P3 — WooCommerce 上架 ★ 先決待定
- **先決（操作者）**：Hostinger 方案可否加子站 `shop.soulfulexpression.org`？
- **做什麼**：`lib/studio/store-publisher.ts`（StorePublisher 介面，wc/v3 REST）；draft 商品先行。
- **Gate**：店後台見 draft 商品；操作者 review 才 publish。

### P4 — 訂單自動履約（閉環）
- **決策已定**：**Printful 原生 WooCommerce plugin**（免費自動、含退款缺貨處理），**不自寫履約管線**。
- **Gate**：真金流先 **draft/manual-approve** 跑通一筆測試單 → 對帳正確（金額/變體/印刷檔）→ 才開全自動。Rollback = 取消 draft 訂單。
- **冪等**：`woo_order_id → printful_order_id` 對應表，同單只送一次。

---

## 每階段共同紀律
- R0 四動作（REALTEST_EVIDENCE / REVIEW_DONE / BUGHUNT_DONE / WORKLOG）。
- `.ts/.tsx` 改動先 `npx tsc --noEmit`；部署走 `sg-deploy.sh next-admin`（內建 test+typecheck+smoke+自動回滾）。
- 純新增 + env flag 預設 OFF + additive migration；不動 next-admin 既有路由 / tarot / `ai_image_jobs`/`media_assets` 既有欄位。

## 待操作者決定（卡 P2d/P3 的只有這兩個）
1. **Printful 帳號**（P2d 必需）— 帳號開好後給我 API key + Store ID 進 vault。
2. **Hostinger 方案**可否加子站（P3 必需）。
P2a→P2c + Mockup Studio **不需要任何先決**，隨時可動工。