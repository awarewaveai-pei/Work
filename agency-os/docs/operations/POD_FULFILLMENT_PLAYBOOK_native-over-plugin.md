# POD 履約標準作業手冊 — 新客戶一律走 Native（不走 Printful 外掛）

> **這份檔在幹嘛（AI / 人類開工前必讀）**
> 任何時候要處理「POD 商品怎麼從客戶下單 → 自動送印出貨」、要接**新的 POD 客戶**、或要碰 `woo-order` webhook / Printful 店設定 → **先讀這份**。
> 它是 POD 履約（fulfillment）的**決策 SSOT + 步驟 SOP**：講清楚為什麼選 native、新客戶怎麼接、哪些紅線不能碰。
> 決策紀錄：[ADR 008](../architecture/decisions/008-pod-fulfillment-native-store-over-plugin.md)。平台 adapter 總則：[multi-platform-delivery-architecture.md](../architecture/multi-platform-delivery-architecture.md)。

- 狀態：**已接受（2026-06-16）**
- 適用：所有 POD 客戶履約佈建
- 維護者：AwareWave 全能工程師

---

## 0. TL;DR（一句話）

**新客戶的 POD 履約一律走「Native API store + 你的 app（A1 建品 / A2 接單）」，不裝 Printful WooCommerce 外掛。既有已用外掛的客戶（soulful）維持不動，不遷移。**

---

## 1. 名詞（第一次出現，中英並列）

| 詞 | 英文 | 白話 |
|---|---|---|
| 履約 | fulfillment | 客人下單後「印 + 寄」的整段流程 |
| Platform store（平台店） | platform store | 透過**官方外掛**連的 Printful 店；只能在 Printful 後台操作 |
| Native (API) store | native store | 你的 **app 用程式 (API) 直接控制**的 Printful 店；不靠外掛 |
| 轉接器 | adapter | 把「某個賣場平台的訂單格式」翻成你系統看得懂的一小段程式 |
| 對帳 | reconciliation | 客戶收零售價 → 你付 Printful 批發價 → 你跟客戶結算的差額計算 |

---

## 2. 兩條路（為什麼有這份文件）

POD 履約有兩種接法，你的 Printful 帳號下會出現**兩個不同的店**：

### A 路 — Printful WooCommerce 外掛（platform store）
- 客戶網站裝官方外掛 → 連到一個 platform store（例：soulful = `18314943`）。
- 外掛自動同步商品、客人付款後自動送 Printful 印 + 寄。
- **soulful 現在就是這樣，運作正常。**

### B 路 — App 自建 native（native store）✅ 本標準採用
- 你在 **app.aware-wave.com（你的操作台，不賣東西）** 按一下 → A1 一鍵把商品建到 native store（`18324409`）。
- 客人在**客戶的 Woo 賣場**下單付款（錢進客戶金流，app 不收錢）。
- 客戶 Woo 背景丟 webhook 給你的 app → **A2** 接住 → 在 native store 建 Printful 草稿。
- （未來）confirm 步驟確認 → 扣款 → 送印。

---

## 3. 決策：為什麼選 B（native）

三個訊號全部指向 native：

1. **會有更多客戶** — A 路每多一個客戶就要再裝一次外掛、連一次帳號、設定一次；B 路是程式化，加客戶接近「複製貼上」，一個後台管全部。
2. **未來可能多平台**（目前 WooCommerce，之後可能 Shopify 等）— Printful 外掛**只認 WooCommerce**，換平台就被綁死；native 路的履約大腦集中在你的 app，**任何平台只要能丟 webhook 進來就接得上**（見 §6 轉接器）。
3. **app 是操作台不是店面** — B 路的設計本來就是「app 在背景收通知 + 下指令」，從不賣東西，跟 native 模式天生吻合。

> 反例（A 路的代價）：被 WooCommerce 綁死、每客戶重複手動設定、無法集中控管出貨與對帳。

---

## 4. 標準規則（強制）

| 情況 | 處置 |
|---|---|
| **新 POD 客戶** | 一律 B 路（native）。**不裝 Printful WooCommerce 外掛。** |
| **既有已用外掛的客戶（soulful）** | **不遷移。** 維持外掛履約（live client，遷移爆炸半徑高、無收益）。 |
| 同一客戶站同時有外掛 + A2 | **禁止**（雙履約機制 → 雙重下單風險）。擇一。 |

---

## 5. SOP — 接一個新 POD 客戶（native 路）

> 每個步驟標注**目前能力狀態**：✅ 已建可用 / 🟡 部分 / 🔴 未建。

1. **客戶站確認**：客戶有 WordPress + WooCommerce。**不要**裝 Printful 外掛。
2. **建商品** ✅ — 在 app.aware-wave.com → POD 建品 → 🚀 一鍵上 Printful（native）。商品建到 native store `18324409`（`POST /store/products`，一次建品 + 綁變體 + 上印刷檔）。
   - 程式 SSOT：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/print-provider.ts`
3. **商品推到客戶 Woo 賣場** 🟡 — 透過 **wp-bridge**（一鍵發佈）。確保 Woo 商品的 **SKU = native store 的變體 SKU**（這是 A2 接單成敗的關鍵；SKU 對不上 → A2 建草稿會回 `502 Sync variant not found`）。詳見 wp-bridge runbook。
4. **接單 webhook** ✅ — 在客戶 WooCommerce → Settings → Advanced → Webhooks 建：
   - Topic：`Order updated`（+ 視付款流程加 `Order created`）
   - Delivery URL：`https://app.aware-wave.com/api/webhooks/woo-order`
   - Secret：每客戶一組隨機值，**同一組**寫進 SG `.env` 的 `WC_WEBHOOK_SECRET`
   - 程式 SSOT：`.../next-admin/app/api/webhooks/woo-order/route.ts` + `lib/studio/woo-webhook.ts`
5. **啟用 A2** ✅ — SG `/root/lobster-phase1/.env`：`POD_AUTO_FULFILL_ENABLED=true` + `WC_WEBHOOK_SECRET=<上一步同值>` → `docker compose up -d next-admin`。
   - ⚠ machine-local `docker-compose.yml` 的 next-admin `environment:` 區塊須含 `POD_AUTO_FULFILL_ENABLED` + `WC_WEBHOOK_SECRET` passthrough（`sg-deploy` 只 rsync `apps/`，不覆蓋 root compose → repo 的 wiring 不會自動到 prod，需手動補；2026-06-16 已補）。
6. **驗證**（零金流測法）：
   - 未簽章 POST → 應 `401 unauthorized`（HMAC 守門）
   - 用 secret 正確簽章、body 缺地址 → 應 `400 recipient_incomplete`（HMAC 通過、未建草稿）
   - 用真實 SKU + 完整地址簽章 POST → 應建出 native store 草稿（`draft:true`）；若 `502 Sync variant not found` = 回 step 3 對齊 SKU。
7. **真送印（confirm）** 🔴 **未建 — 金流紅線**，見 §7。在那之前 A2 只到「草稿」，需**人工在 Printful 後台確認**。

---

## 6. 多平台未來（轉接器模式）

目前接單程式是為 **WooCommerce** 寫的（驗 Woo 簽章、讀 Woo 訂單格式）。新增平台（Shopify 等）= 補一個**轉接器 (adapter)**：

- 只需新增「讀該平台訂單格式 + 驗該平台簽章」一小段（多數平台與 Woo 一樣是 HMAC-SHA256）。
- **建單 / 出貨那段共用，不重寫。**
- 總則對齊現有架構：[multi-platform-delivery-architecture.md](../architecture/multi-platform-delivery-architecture.md)（`platform_profile` = wordpress / shopify / webflow / custom_app）。

---

## 7. 金流紅線 — confirm 步驟（🔴 未建）

A2 目前只到 **draft（草稿，不扣款不印）**。真正「自動扣款 + 送印」的 confirm 步驟**完全沒寫**，且：

- confirm 一按下去 = 真的花**你的** Printful 帳號的錢（客人的錢在客戶的 Woo，中間有**對帳**：客戶收零售 → 你付 Printful 批發 → 你跟客戶結算）。
- **建 confirm 前置（同一批做，缺一不可）**：
  1. 用 webhook topic header 判別狀態，顯式處理 `refunded` / partial-refund-still-processing edge。
  2. confirm 必須有**獨立 flag**（與 draft flag 分離）+ **每筆/批次人工審核閘**，禁止裸自動 confirm。
  3. 先跑 draft 模式對帳通過 + **操作者明示批准**（High-risk）。
- **商業前置**：先把「客戶怎麼付錢給你 / 對帳怎麼算」想清楚，再建 confirm。
- 程式紅線標記：`print-provider.ts createDraftOrderOnNative` 的 `⚠ DO NOT add confirm` 註解。

---

## 8. 目前實況（concrete state，2026-06-16）

| 項目 | 值 / 狀態 |
|---|---|
| A2 引擎（`POD_AUTO_FULFILL_ENABLED`） | ✅ SG prod LIVE（保留啟用，給未來 native 客戶） |
| Native store（A1 建品 / A2 草稿） | `18324409`（`PRINTFUL_NATIVE_STORE_ID`） |
| soulful 履約 | A 路外掛 → platform store `18314943`（`PRINTFUL_STORE_ID`）；**A2 webhook 已移除，不接 A2** |
| confirm / 扣款 / 送印 | 🔴 未建（金流紅線） |
| 觀察性缺口 | `woo-order/route.ts` 不寫 server log（`docker logs lobster-next-admin` 只見啟動）→ A2 失敗只能看 HTTP response；**confirm phase 前須補結構化 log** |

---

## 9. 相關檔

- 決策：[ADR 008](../architecture/decisions/008-pod-fulfillment-native-store-over-plugin.md)
- 平台 adapter 總則：[multi-platform-delivery-architecture.md](../architecture/multi-platform-delivery-architecture.md)
- 程式：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/woo-order/route.ts`、`lib/studio/woo-webhook.ts`、`lib/studio/print-provider.ts`
- 歷史與證據：`agency-os/WORKLOG.md` 2026-06-16 `ops(pod-a2)`
- 客戶台帳：`agency-os/tenants/<slug>/core/ENVIRONMENT_REGISTRY.md`
