# ADR 017: 客戶怎麼買 — 線上用「權利」（合約、贈送＋點數），買斷＝一鍵架站到客戶主機、用客戶自己的 API、模組選購

- **狀態**：已接受（操作者 2026-10-14「你決定」：8 題照建議定案，第 3 題是上線前要查的事）
- **日期**：2026-10-14
- **承接**：[ADR 012](012-shared-platform-layer.md)（產品登記表、共用帳本、簽章許可 `entitlement_ref`）、[ADR 015](015-awarewave-account-and-shared-wallet.md)（一個帳號、一個錢包、WordPress 收費）、[ADR 016](016-social-manager-third-product.md)（社群管理）。
- **部分取代**（2026-10-14 接受起生效）：
  - HCI [ADR-0031](../../HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0031-ai-lego-usage-metering-attribution.md)：`:33` 不授權「Product/Plan/Feature/Entitlement/Limit engine」→ 由本 ADR 授權。gate 1／2／4（`:39-42`）的許可欄位與簽發條件改照 §3（簽發依據改為 `organization_entitlements`；`subscription_ref` 改為 `entitlement_id`＋`source_ref`）。驗章方式、不得直讀對方資料表不變。HCI `governance/ADR_INDEX.md` 已註記。
  - ADR 016 §7（`016:55`）「`organizations` 預留方案與上限欄位」→ 方案與上限改放 §2 的 `plans`，`organizations` 不加欄位。
- **來源**：操作者 2026-09-10「全部要能獨立串接、自用、開放訂閱或點數、賣人」（012:43）；2026-10-14「如果有客戶想訂閱或買斷某些服務、功能平台?」「買斷>>他們就要用自己的API了, 是一鍵架站,但可以選購, 所以我才一直說要用LEGO積木形式」「選購如果是 他本身就有網站 要怎麼辦?」。

## 脈絡

- 只能整個產品訂閱：`0062_organization_product_subscriptions.sql:79-85`（狀態 trial／active／past_due／canceled、`current_period_end`），CHECK 只認 `cognitive`、`hci`（`:79-80`），一個客戶一個產品只有一筆有效列（`:102`）。正式庫 0 筆（2026-10-14 查）。註冊時寫一筆 trial（`0063_portal_complete_signup.sql:76-77`）。
- 點數：ADR 015 一個錢包；帳本 `media_credit_ledger` 0 筆（同日查）。
- 簽章許可：設計好、沒做（012:131）。
- 認知平台每個執行點已帶功能名問許可：`ai_lego/platform/entitlement/check.py:23` `check_entitlement(store, tenant_id, capability_id)`，目前只看 tenant 是否 active（`:29-30`）；自行註冊的人都在同一個 tenant（015:56）。
- 社群（計畫放 `app/(shell)/tools/social/`，016 §1）、collect（`app/(shell)/ops/collect/`）、portal（`app/portal/`）都在 next-admin 一個 app 裡。
- 組織是兩層樹：`parent_organization_id`，上層不能再有上層（`0077_organization_hierarchy.sql:13-15`）；社群的一個品牌＝一筆組織（`0096_social_manager.sql:2`）。

## 決策

### 1. 兩條路，同一份商品目錄、同一個判斷

| | 線上（在我們的平台用） | 買斷（裝在客戶自己的主機） |
|---|---|---|
| AI 和平台 API 誰付 | 我們先付，扣客戶點數（ADR 015） | 客戶自己的 key |
| 客戶資料在哪 | 我們的資料庫 | 客戶的主機，我們碰不到 |
| 「能不能用」的答案來源 | 控制面簽的短效許可（012 §4） | 安裝時發的授權檔，離線驗章 |
| 收什麼 | 合約（試用、訂閱）、贈送、點數 | 一次買斷＋選購更新與維運 |

### 2. 商品目錄：產品 → 功能（名字在程式）→ 方案（資料）→ 價格（Woo）

- `lib/portal/products.ts` 仍是唯一產品清單（012 §5）。每個產品加 `features[]`：`feature_key`、名稱、上限種類（012 §1 QUOTA／RATE_LIMIT／SAFETY_GATE）、能不能買斷。
- 新表 `plans`：`plan_key`、`product_key`、`kind`（base 基本／addon 加購）、給哪些 `feature_key`、各 QUOTA 上限、`woo_product_ids`。新方案＝加一列。
- 價格只在 WooCommerce。付款通知帶 Woo 商品 id，控制面用 `plans.woo_product_ids` 查出方案（對應放在 Supabase，ADR 005:16）。
- **SAFETY_GATE**（例：HCI 持續監測，012:57）不進任何方案，也不能買斷。買斷版的安裝在建置時就排除含 SAFETY_GATE 功能的程式碼，不靠執行時開關（客戶擁有主機，開關改得掉）。登記表機械閘檢查「可買斷的模組沒有任何 SAFETY_GATE 功能」。

### 3. 線上：合約 → 權利 → 許可

- **主體＝計費帳戶**：`coalesce(parent_organization_id, id)`（兩層樹的最上層）。品牌、部門這些子組織用上層的權利，「品牌數」上限算在上層。這是 HCI ADR-0009 租戶模型的 adapter 對應，不改它。
- **合約＝0062**：一列＝一個（計費帳戶、產品、方案）。加 `plan_key`、`source_ref`（Woo 訂閱編號）。唯一索引改為（organization_id, product_key, plan_key）且非 canceled；每產品最多一個 base（控制面寫入時檢查，它是唯一寫入者）。試用＝base 列的 `trial` 狀態，付款時就地改 `active`、填 `plan_key`，不新增列。加購＝另一列 addon 方案。CHECK 改成包含所有登記表的產品（現在缺 `social`）。
- **權利＝新表 `organization_entitlements`**：`organization_id`（計費帳戶）、`product_key`、`feature_key`（必填）、`source`（contract／comp）、`source_ref`（合約 id 或贈送原因）、`starts_at`、`ends_at`、`status`、上限。合約變動時控制面重算該帳戶的權利列。贈送整個產品＝照一個具名方案展開成每個功能一列。
- 點數不變成權利：按次扣點的功能，許可帶「這次最多花多少」（015 §1）。
- **只有控制面碰這三張表**（0062、`plans`、`organization_entitlements`）：靜態檢查只允許 `lib/entitlements/**` 與 `app/portal/**` 引用它們，其他地方出現就建置失敗。社群、collect 跟控制面在同一個 app，用的是繞過 RLS 的 service-role client（0062:51-52），沒有這道檢查就擋不住直讀。
- **許可**（012 §4 `entitlement_ref` 擴充，取代 ADR-0031 gate 1 欄位）：`tenant`（計費帳戶）、`product_key`、`feature_key`、`entitlement_id`、`source_ref`、上限、可花點數上限、`issued_at`、`expires_at`（分鐘級）、`kid`、簽章。只在該功能有 active 權利列時簽發（取代 gate 2 條件）。用量回報帶 `entitlement_id`（取代 gate 4 的 `subscription_ref`）。畫面要灰掉沒買的按鈕時，產品要一份簽章的「此帳戶能用的功能與上限」，快取幾分鐘。
- 認知平台：`check_entitlement` 改收 session 對應的計費帳戶與 `feature_key`、驗許可，不再只看 tenant。

### 4. 程式只有一個判斷：`grant = can(主體, feature_key)`

- 回傳 `{allowed, limits, max_spend, report(usage)}`。
- 線上：主體＝計費帳戶，答案來自許可；`report()` 回報用量給控制面記帳。
- 買斷：主體＝這台安裝，答案來自授權檔；`max_spend` 空、`report()` 不做事（用客戶自己的 key）。
- 每個收費的按鈕或 API 呼叫前問一次；產品程式不知道答案來自合約、贈送還是買斷。

### 5. 買斷＝一鍵架站＋選購模組（LEGO）

- **另開一個「買斷安裝」階段**，不是在[總藍圖](../../operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md) Stage 4／5 上加一步：Stage 4 用我們的主機商 token 和 SSH key（`:148`），Stage 5 把服務接到我們自己的監控（`:154`）。買斷安裝要：
  1. 主機商 adapter 每次呼叫帶客戶的主機商 token（`lobster-factory/packages/workflows/src/provision/serverAdapterFactory.ts:80`，新主機商＝新 adapter）；
  2. 在客戶主機裝一整套獨立服務（選到的模組需要的聯集）；
  3. 交接時撤掉我們的 SSH key 與所有我們的密鑰；客戶有買維運才保留一把維運用的 key。
- **模組清單**（每個產品一份）：System Foundry `kernel/06_MODULARITY_CONTRACT.md` 的十項，加上：需要的基礎服務（例：社群＝next-admin＋Supabase＋Trigger.dev＋Postiz）、要填的設定值（客戶的 API key、網址）、依賴的模組（例：社群依賴帳號層）、可接的外部來源（§6）。安裝程式只讀這份清單。
- **一份程式**：next-admin 照一個 app 出貨，沒選的模組路由與選單關掉；含 SAFETY_GATE 的程式碼在建置時排除（§2）。
- **授權檔**：`format_version`、`kid`、`install_id`、客戶、模組、每個 `feature_key` 的上限、`updates_until`、簽章（Ed25519，同 ADR 007）。安裝內存一組可接受的公鑰，換金鑰時舊授權檔仍可驗。功能沒有到期日；`updates_until` 只管能不能拿新版。
- **不放遠端關閉開關**：我們的伺服器停了客戶照常能用。授權檔是合約工具，不是防破解。
- RATE_LIMIT 照樣在本機執行，因為它保護外部資源（例：Postiz 每小時 30 次、抓取禮貌預算）。
- Postiz 是 AGPL-3.0：交付未修改的官方映像並附原始碼位置；我們的程式只走它的公開 API（016 §7）。交付前請律師確認。

### 6. 客戶已經有網站：網站是「接進來的來源」

- 網站留在原主機。WordPress 裝 wp-bridge 外掛（`lobster-factory/packages/wp-bridge-plugin/`）；其他網站用 RSS 或 API。線上、買斷都這樣接，所以有沒有網站不影響選哪條路。
- 買斷通常另租一台主機：一般共享虛擬主機跑不動 Docker 和資料庫；分開放，功能主機出事時網站照常。
- 客戶網站是 WordPress 時，可選擇讓它當買斷安裝的登入入口（ADR 015 §2 同一套簽章開門）；預設用安裝自己的登入。

## 產品決定（2026-10-14 定案）

| # | 問題 | 決定 |
|---|---|---|
| 1 | 功能切多細？ | 先「產品＋幾個加購＋上限」（例：社群＝品牌數、每月貼文數、審核流程）。不要每個按鈕都賣 |
| 2 | 試用？ | 每個產品 14 天、每個帳戶一次 |
| 3 | 訂閱怎麼每月扣款？ | WooCommerce 加定期扣款外掛；選哪個、台灣金流能不能定期扣款，在「順序」第 3 步前查定 |
| 4 | 買斷含多久更新？ | 含 1 年；之後選購年費繼續拿新版，不續也能一直用目前版本 |
| 5 | 大改版（例：2.0）買斷客戶有沒有？ | 更新期內有；過期要續 |
| 6 | 買斷的主機誰管？ | 我們一鍵裝好；選購維運月費（備份、更新、監控）；主機在客戶名下 |
| 7 | 買斷能不能只買一個模組？ | 能，連同它依賴的模組 |
| 8 | 線上和買斷能不能互換？ | 可以，資料匯出匯入另做；先不承諾自動搬 |

## 順序（風險由低到高，每段做完現有產品照常）

1. `products.ts` 加 `features[]`；登記表機械閘（012 §5）加「收費功能都有登記」「可買斷模組無 SAFETY_GATE」；`products.test.ts` 改比對全部產品（現在只比 self-signup）。只讀。
2. Migration：`plans`、`organization_entitlements`；0062 加 `plan_key`、`source_ref`、改唯一索引、放寬 CHECK（0062 目前 0 筆，不用雙寫期）；三表只給控制面的靜態檢查。控制面發功能級許可（012 §8 第 3 步）。
3. Woo 付款通知 → 合約與權利；帳本泛化（015 §4 第 2 步）。
4. 各產品收費點接 `can()`；認知平台改 `check_entitlement`。
5. 買斷安裝階段：模組清單、建置時排除、授權檔簽發、客戶 token 的 adapter、交接撤 key。排在一鍵架站 Stage 4 之後。

## 不採用

- **買斷＝線上權利表裡一筆沒有到期日的列**：客戶還在我們主機、用我們的 API，賣一次永遠倒貼（操作者 2026-10-14 更正）。
- **每個模組拆成獨立 app**：多出好幾套登入和主題（016「不採用」同理）。
- **價格寫在程式裡**：每次調價都要部署。
- **買斷版靠執行時開關擋 SAFETY_GATE**：客戶改得掉，等於可購買（012:59 紅線）。
- **買斷版遠端關閉開關**：違反買斷承諾。

## 後果

- 正面：新產品、新功能、新方案、改價格都是資料；產品程式只問一次 `can()`；買斷不增加我們的 API 成本，客戶資料也不在我們手上。
- 代價：控制面多兩張表、許可簽發與靜態檢查；每個產品維護模組清單；買斷要有建置變體、更新管道和版本支援期，是持續成本。
- 需跟進：`lib/portal/products.ts`＋`__tests__/products.test.ts`、`lobster-factory/packages/db/migrations/`（plans、entitlements、0062 擴充）、`ai_lego/platform/entitlement/check.py`、wp-bridge 外掛（付款通知）、一鍵架站總藍圖（加買斷安裝階段）、`ADR_INDEX.md`。
