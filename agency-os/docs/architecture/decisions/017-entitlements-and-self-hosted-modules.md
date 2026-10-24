# ADR 017: 客戶怎麼買 — 線上用「權利」（合約、贈送＋點數），買斷＝一鍵架站到客戶主機、用客戶自己的 API、模組選購

- **狀態**：已接受（操作者 2026-10-14「你決定」：8 題照建議定案，第 3 題是上線前要查的事）
- **日期**：2026-10-14；修訂 2026-10-16（§0 三軸、§3 actor／on_behalf_of、順序 6–7）、2026-10-17（§0b 積木契約、順序 3↔4 對調、Q9–Q10）、2026-10-18（全鏈自審：金鑰託管、會員離開 WordPress、退款、備份）
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

### 0. 三條軸；對外的五種方式是組合（操作者 2026-10-16 定案，每個產品都適用）

程式和資料只存三條軸，各在自己的地方；新方式＝新組合，不改程式。**產品不選方式**：三軸的值屬於請求與計費帳戶，由共用層回答，所以每個產品從登記那天起五種方式全部都有，登記表沒有、也不准有「支援哪幾種」的欄位（操作者 2026-10-17 問「五對象都要的嗎」；`audience` 欄撤回同理）。產品只選三件：哪些功能收費（`features`）、哪些絕不能買斷（SAFETY_GATE）、買斷時依賴哪些積木（`dependsOn`）。

| 軸 | 存在哪 | 值 | 本 ADR |
|---|---|---|---|
| A 部署 | 每個安裝 | `hosted`（我們主機，控制面簽許可）／`self_hosted`（客戶主機，離線授權檔） | §1、§5 |
| B 商業（錢從哪來） | 計費帳戶 × 產品 × 功能 | `contract`（0062 合約：trial → active 訂閱）／`comp`（贈送、自用）／`credits`（錢包按次扣，不是權利列）／`perpetual`（授權檔） | §3（前兩個＝`organization_entitlements.source`）、ADR 015（credits）、§5（perpetual） |
| C 操作 | 每次請求 | `actor`＝誰按（`staff:<uid>`／`customer:<uid>`／`api_key:<id>`）；`on_behalf_of`＝替哪個計費帳戶 | §3 許可欄位、§4 `can()` |

| 對外五種 | A | B | C |
|---|---|---|---|
| 自用（我們自己用） | hosted | comp；計費帳戶 `organizations.kind = internal`（Account#0） | staff |
| 代操（我們替客戶操作） | hosted；客戶買維運時 self_hosted | 客戶的 contract／credits | staff，`on_behalf_of` = 客戶 |
| 訂閱 | hosted | contract（14 天 trial 起） | customer |
| 點數（共用錢包按次扣） | hosted | credits（ADR 015） | customer |
| 賣人＝買斷 | self_hosted | perpetual＋`updates_until`；客人已有網站就接進來（§6） | customer；買維運時 staff |

- **業界對照**（照抄的部分，不重新發明）：B 軸＝Stripe Billing 的 Customer→Subscription→Price→Entitlement，許可與價格分離（Stigg、LaunchDarkly 同）；`perpetual`＋`updates_until`＝JetBrains perpetual fallback；授權檔離線驗章＝GitLab self-managed／Atlassian Data Center；C 軸代操＝Shopify collaborator／Meta Business Manager partner／Google Ads 管理員帳戶（代理商員工用自己的帳號進客戶帳戶、用量記客戶、稽核記「誰替誰」、客戶可撤）；`api_key` actor＝OpenAI／Stripe API key（綁計費帳戶與 scope，用量計 credits）。
- **已定義、還沒賣的值**（不是待補，是等第一個客戶）：`api_key` actor（順序第 6 步）；轉售＝授權檔 `max_tenants > 1`（順序第 7 步）。值存 text，不存 boolean，加值不改 schema。
- System Foundry 問卷已能表達五種方式（都是既有答案的組合：自用＝員工使用要＋收費不要；代操＝員工要＋外部客戶不要＋收費要；訂閱／點數＝外部客戶要＋訂閱／預付點數要；買斷＝License 要）與根組織數（多家公司／分公司／集團／個人自用）；只缺一題「裝在客戶自己的主機」。藍圖末節「交付登記」推出五答案；子網域與 WordPress 登入來源是 AwareWave 實作值，由產生器補問（TASKS 2026-10-17 更正）。

### 0b. 每個系統同一個模式：積木契約（操作者 2026-10-17「每次開發系統要用同一個模式」「樂高積木」「未來某天不掛 WordPress」）

一個產品＝一塊積木。十項宣告照 System Foundry `kernel/06_MODULARITY_CONTRACT.md`（state／behavior／API 與事件契約／不變量／依賴／失敗隔離／資料生命週期／可觀測／遷移回滾／替換策略），寫在登記表那一列的 `modules` 與產生器產出的 `MODULE_MANIFEST.json`。本 ADR 加的、每塊都要過的八條：

1. **登記列**：`products.ts` 一列（門、登入來源，加上順序 1 新增的 `features[]`、`accessChannels`、`modules`；現有 `products.ts:19-45` 只有門、登入來源、`standalone`、`status`、`selfSignup`）。沒有列＝不是產品，拿不到許可。
2. **自己的門**：子網域保留，頁面在自己的前綴下（ADR 018）。
3. **自己的資料**：不讀寫別的產品的表（HCI ADR-0002）；要資料走對方的 API 或簽章事件。
4. **只問一個判斷**：收費動作前 `can(主體, feature_key, actor)`；不自建帳本、不自建方案表。
5. **外部供應商一律在接頭後面**，接頭的值是設定不是程式：付款 `payments: woo | stripe | local`、會員與登入 `loginSources`（ADR 018 §3）、CRM 事件下游 `crm: fluentcrm | none`、AI `lib/ai/gateway.ts`、主機商 `serverAdapterFactory`。
6. **離開 WordPress 測試**（可替換性的具體形式）：整套測試以 `payments=local`、`loginSources=[local]`、`crm=none` 跑一遍必須全綠；任何核心邏輯 import WordPress／Woo／Fluent 的符號即紅燈（第 2 步 import-boundary 閘加這一組）。WordPress 是今天的門口與收銀台（ADR 015），不是房子；哪天自建會員與金流，換接頭的值，產品程式不動。會員主檔在 Supabase（ADR 005），WordPress 只是登入來源之一：離開時把 `awarewave-wp` 來源的使用者改為 `local`（寄設定密碼信），資料不搬；合約與權利列本來就在控制面，不受影響。
7. **選配＝在 System Foundry 勾積木**（操作者 2026-10-18「應該要可以選擇項目（行銷、客服、社群…）然後組裝上去」）：登記表就是積木目錄。順序 1 的 `scripts/sync-foundry-catalog.mjs` 把 `products.ts` 匯出成 `System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/awarewave-products.json`（每產品：key、名稱、一句用途、`dependsOn`、`standalone`、`features`、manifest 路徑），System Foundry 問卷多一節「AwareWave 積木」，每個產品一題要／不要；勾了就把該產品的 `MODULE_MANIFEST.json` 當一個模組放進藍圖，`dependsOn` 走 SF 既有的能力依賴閉包（產品映成 `CAP-AW-<KEY>`），`foundry-plan.json` 的 `modules[]` 列出選到的產品。`new-product.mjs --from-foundry` 讀 `modules[]`：客戶自己的系統＝買斷安裝的模組清單（順序 5）；線上帳戶＝方案要開的功能（順序 4）。閘：目錄檔必須等於登記表重新匯出的結果（測試 diff），`status: available` 的產品都要在目錄裡；SF 的 `make verify` 加同一檢查。`features[]` 與 `plans` 決定一個客戶能用哪些功能；`standalone`＋`dependsOn` 決定買斷能單獨裝哪些積木。
8. **只有一個入口，兩條路進來**：新系統只從 `scripts/new-product.mjs` 長出來（順序 1）；手寫一列＝閘紅。整套新系統先走 System Foundry（`python scripts/serve_configurator.py` → 答要／不要 → Submit → `generated/<名稱>/`），再 `new-product.mjs --from-foundry generated/<名稱>`：讀 `.foundry/resolution/foundry-plan.json` 與藍圖末節「交付登記」，十項宣告直接填進 `MODULE_MANIFEST.json`（欄位名與 `kernel/06` 相同），只補問子網域與逐項收費功能；小工具直接 `new-product.mjs` 答五題。兩條路同一份登記表、同一個 `can()`、同一個 manifest。

### 1. 兩條路，同一份商品目錄、同一個判斷

| | 線上（在我們的平台用） | 買斷（裝在客戶自己的主機） |
|---|---|---|
| AI 和平台 API 誰付 | 我們先付，扣客戶點數（ADR 015） | 客戶自己的 key |
| 客戶資料在哪 | 我們的資料庫 | 客戶的主機，我們碰不到 |
| 「能不能用」的答案來源 | 控制面簽的短效許可（012 §4） | 安裝時發的授權檔，離線驗章 |
| 收什麼 | 合約（試用、訂閱）、贈送、點數 | 一次買斷＋選購更新與維運 |

### 2. 商品目錄：產品 → 功能（名字在程式）→ 方案（資料）→ 價格（Woo）

- `lib/portal/products.ts` 仍是唯一產品清單（012 §5）。每個產品加 `features[]`：`feature_key`、名稱、上限種類（012 §1 QUOTA／RATE_LIMIT／SAFETY_GATE）、能不能買斷。
- 新表 `plans`：`plan_key`、`product_key`、`kind`（base 基本／addon 加購）、給哪些 `feature_key`、各 QUOTA 上限。新方案＝加一列。
- 價格只在 WooCommerce。付款通知帶 `plan_key`：Woo 商品 meta `_awarewave_plan_key`（點數包另有 `_awarewave_credit_units`）是商品→方案的唯一對應，由 wp-bridge 外掛在送事件時填入；控制面只認 `plan_key`，不認 Woo 商品 id（2026-10-24 改，`plans.woo_product_ids` 由 0124 移除；原寫法「`plans.woo_product_ids` 查方案」作廢。執行卡 step-4 §4b 設計更新）。
- **SAFETY_GATE**（例：HCI 持續監測，012:57）不進任何方案，也不能買斷。買斷版的安裝在建置時就排除含 SAFETY_GATE 功能的程式碼，不靠執行時開關（客戶擁有主機，開關改得掉）。做法是**目錄邊界**而不是人工清單：SAFETY_GATE 功能的程式只准住在 `lib/safety-gated/**` 與 `app/(shell)/**/safety/**`；`BUYOUT=1` 建置時這兩個目錄被 alias 成空模組，測試從所有入口走 import 圖證明到不了它們，再在 image 內 grep 證明（Codex 2026-10-18 M16）。登記表機械閘檢查「可買斷的模組沒有任何 SAFETY_GATE 功能」。

### 3. 線上：合約 → 權利 → 許可

- **主體＝計費帳戶**：`coalesce(parent_organization_id, id)`（兩層樹的最上層）。品牌、部門這些子組織用上層的權利，「品牌數」上限算在上層。這是 HCI ADR-0009 租戶模型的 adapter 對應，不改它。
- **試用從註冊那刻就有到期日**：`0063_portal_complete_signup.sql:76-77` 只寫 `status='trial'`、`current_period_end` 為空（Codex 2026-10-18 M4）；順序 2 改成註冊時寫 `current_period_end = now() + 14 天`、`plan_key = <產品的 trial 方案>`，並照方案展開 trial 權利列；每帳戶每產品只能有一次 trial（唯一索引 `(organization_id, product_key) where status='trial'`＋歷史 trial 列不刪）。
- **合約＝0062**：一列＝一個（計費帳戶、產品、方案）。加 `plan_key`、`source_ref`（Woo 訂閱編號）。唯一索引改為（organization_id, product_key, plan_key）且非 canceled；每產品最多一個 base（控制面寫入時檢查，它是唯一寫入者）。試用＝base 列的 `trial` 狀態，付款時就地改 `active`、填 `plan_key`，不新增列。加購＝另一列 addon 方案。CHECK 改成包含所有登記表的產品（現在缺 `social`）。
- **權利＝新表 `organization_entitlements`**：`organization_id`（計費帳戶）、`product_key`、`feature_key`（必填）、`source`（contract／comp）、`source_ref`（合約 id 或贈送原因）、`starts_at`、`ends_at`、`status`、上限。合約變動時控制面重算該帳戶的權利列，照固定狀態機：**換方案**＝舊列 `ends_at = now()`、新列 active；**取消**＝不新增列，現有列 `ends_at = current_period_end + 寬限`（付到期末仍能用）；**退款**＝`ends_at = now()`；**拒付**＝`status = suspended`（Codex R2-2）。贈送整個產品＝照一個具名方案展開成每個功能一列。
- 點數不變成權利：功能在登記表宣告 `billing: contract | credits`。`contract` 功能看權利列；`credits` 功能不看權利列，`can()` 查錢包餘額（經帳本 client），餘額 ≥ 該功能最低扣點才 `allowed`，許可帶「這次最多花多少」＝餘額與單次上限取小（015 §1）。沒有權利列也沒有餘額＝拒絕（Codex 2026-10-18 C1）。
- **到期與寬限**：權利列 `ends_at = current_period_end + 7 天`（預設，操作者可改）；每日全域工作把過期列改 `expired`，不刪列：`client_schedules` 是每客戶一列（`0097:24-25`），不適用；用 Trigger.dev 排程任務 `entitlements-expire` 每日 POST `/api/internal/entitlements/expire`（Bearer `SCHEDULE_INGEST_TOKEN`，與 `schedules-heartbeat` 同法），一次掃全部帳戶（Codex 2026-10-18 M7）。**試用結束**無付款同樣過期；資料保留 90 天後標 `erasure_due`，實際刪除走既有擦除流程。
- **代操授權**：員工替組織 X 簽許可，只在該員工對 X 有角色（成員列或 `ops_role` owner/admin）時成立，否則 403；`actor` 永遠記員工本人。
- **許可的位元組格式**（JS 簽、Python 驗，必須互通）：`format_version: 1`；payload 用 RFC 8785 JSON Canonicalization（JCS）序列化成 UTF-8 位元組，Ed25519 簽該位元組，簽章 base64url；傳輸＝HTTP header `X-AwareWave-Permit: <base64url(payload)>.<base64url(sig)>`。共用測試向量 `lobster-factory/packages/contracts/fixtures/permit-v1/*.json`（合法、改一 byte、過期、未知 kid、假私鑰），vitest 與 pytest 都跑同一組（Codex 2026-10-18 M11）。
- **金鑰**：許可簽章私鑰 `ENTITLEMENT_SIGNING_KEY`（vault → `mcp/user-env.ps1` → 容器 env）；公鑰清單 `ENTITLEMENT_PUBLIC_KEYS`（`kid:公鑰`，可多把，換鑰時新舊並存一個 `expires_at` 窗）。授權檔私鑰 `LICENCE_SIGNING_KEY` 另一把，同法。兩把私鑰各留一份離線備份（vault 匯出，不在任何主機上）：遺失＝簽不出新許可與新授權檔，已發的照常驗。許可與授權檔都帶 `format_version`，驗章端拒絕不認識的版本。三張表、錢包帳本、稽核列納入既有每日備份與月度還原演練（B7）；帳本與稽核列永不刪（0066 `ON DELETE RESTRICT` 同法）。
- **RLS**：`plans`、`organization_entitlements`、0062 只給 `service_role`；`anon`／`authenticated` 無 policy。0062 現有 `org_product_subs_select`（`0062:139-143`，authenticated 可讀自己組織的合約）由順序 2 的 migration 明確 `drop policy`，驗收用 `pg_policies` 查詢證明三表只剩 service_role（Codex 2026-10-18 M5）。客戶要看自己的方案走 `/portal` 的 API，不直讀表。價格在 Woo，不在這三表。
- **只有控制面碰這三張表**（0062、`plans`、`organization_entitlements`）：靜態檢查只允許 `lib/entitlements/**` 與 `app/portal/**` 引用它們，其他地方出現就建置失敗。社群、collect 跟控制面在同一個 app，用的是繞過 RLS 的 service-role client（0062:51-52），沒有這道檢查就擋不住直讀。
- **許可**（012 §4 `entitlement_ref` 擴充，取代 ADR-0031 gate 1 欄位）：`tenant`（計費帳戶）、`product_key`、`feature_key`、`entitlement_id`、`source_ref`、上限、可花點數上限、`actor`、`on_behalf_of`（§0 C 軸；`on_behalf_of` 永遠等於 `tenant`，代操時 `actor` 是員工）、`issued_at`、`expires_at`（分鐘級）、`kid`、簽章。簽發條件二擇一：`contract` 功能要有 active 權利列（`entitlement_id` 填該列）；`credits` 功能要錢包餘額 ≥ 最低扣點（`entitlement_id` 空、`source: credits`、`max_spend` = min(餘額, 單次上限)）。兩者都沒有不簽（取代 gate 2 條件；Codex R2-1）。用量回報帶 `entitlement_id`（取代 gate 4 的 `subscription_ref`）與 `actor`／`on_behalf_of`，點數永遠扣 `on_behalf_of`，稽核永遠記 `actor`。畫面要灰掉沒買的按鈕時，產品要一份簽章的「此帳戶能用的功能與上限」，快取幾分鐘。
- 認知平台：`check_entitlement` 改收 session 對應的計費帳戶與 `feature_key`、驗許可，不再只看 tenant。

### 4. 程式只有一個判斷：`grant = can(主體, feature_key, actor)`

- 回傳 `{allowed, limits, max_spend, report(usage)}`。
- 主體＝計費帳戶（`on_behalf_of`），`actor`＝這次請求是誰（§0 C 軸）；`actor` 只進稽核與用量，不影響 `allowed`。
- 線上：答案來自許可；`report()` 回報用量給控制面記帳。
- 先看權利列、再看錢包（2026-10-23，§0 錢的軸屬帳戶×產品×功能）：該帳戶該功能有 active 的 comp／contract 列就照列放行、不扣點（`report()` 只扣 `source=credits`）；沒有列，`billing: credits` 的功能才看錢包，其餘拒絕（`can.ts` `issuePermit`）。
- 涵蓋全部功能的帳戶（自用、操作者自己的研究、全產品代操合約）不逐功能登記：`organization_all_features` 一帳戶一列（0118），每日 expire 掃描依 `products.ts` 補齊，新功能隔天自動有列；結束涵蓋＝刪該列再把其權利列改 `expired`。
- 買斷：主體＝這台安裝，答案來自授權檔；`max_spend` 空、`report()` 不做事（用客戶自己的 key）。
- 每個收費的按鈕或 API 呼叫前問一次；產品程式不知道答案來自合約、贈送還是買斷。收費 API 路由一律用 `withFeature("<feature_key>", handler)` 包起來（順序 3）：它先問 `can()`，同時把「路由→功能」登記進一張程式內的表，順序 6 的 API key scope 檢查就查這張表，不另維護路徑清單（Codex 2026-10-18 M20）。

- **影子模式（操作者 2026-10-19 定案）**：環境變數 `ENTITLEMENT_MODE` = `shadow`（預設，未設或拼錯也是 shadow）｜`enforce`（只認這個字）。shadow：`can()` 照算真實判決，拒絕時寫稽核 `entitlement.would_deny`（feature_key、subject、actor、reason）但**回傳 allowed**；表不存在、讀不到 `ENTITLEMENT_SIGNING_KEY`／`ENTITLEMENT_PUBLIC_KEYS`、DB 連不上等基礎設施錯誤一律 log（`entitlement.infra_error`）後放行，不丟例外；shadow 不扣點。enforce：fail-closed，拒絕與基礎設施錯誤都拒絕。原因：0110 與簽章金鑰尚未套 prod、prod 沒有任何權利資料，約 20 個付費 AI 呼叫點若預設拒絕，DEPLOY_HOLD 一解除全部 AI 功能停擺。**翻到 `enforce` 是 High，要操作者 go**；前置＝0110 與簽章金鑰已套 prod、internal 帳戶與現有客戶的 comp／trial 權利已 seed、`entitlement.would_deny` 稽核近期為零或已逐筆解釋。員工自用（back-office，無客戶）記在 internal 帳戶，名單 `BACK_OFFICE_FEATURES`（`lib/entitlements/can.ts`）。
- **獨立產品服務取許可（2026-10-19 實作）**：認知平台這類不在 next-admin 內的服務，請求沒帶 `X-AwareWave-Permit` 時向 `POST /api/internal/entitlements/permit/<product>` 要（Bearer＝該產品專屬 `ENTITLEMENT_ISSUER_TOKEN_<PRODUCT>`，只能簽該產品的功能、`<product>:<id>` 形式的 actor、根組織），拿到後仍在本地用公鑰驗並綁自己的（計費帳戶、功能、actor）；驗過才快取到到期前 30 秒。認知平台的 tenant→計費帳戶目前是 `ENTITLEMENT_BILLING_ACCOUNTS` 設定（`ai_lego/platform/entitlement/check.py`）。翻 enforce 的前置再加：各產品 issuer token 與公鑰已配、每個 tenant 已對應計費帳戶。
- **灰掉沒買的按鈕**：`GET /api/entitlements/features` 回該帳戶「能用的功能」（每個收費路由功能一個判決、不寫稽核、Ed25519 簽章、快取 5 分鐘）；畫面用 `usePaidFeatures()`（`lib/entitlements/use-paid-features.ts`）灰按鈕，載入中或拿不到就不灰（API 照樣問 `can()`）。shadow 時全部可用，清單仍帶真實判決。
- **付費 vendor 只有三道縫**：SDK 走 `lib/ai/gateway.ts` loader，直打 HTTP 走同檔 `providerUrl(grant, provider, path)`（origin 只在 `PROVIDER_ORIGINS`），collect 搜尋／抽取走 `createProviderCall({ grant })`；三道都以型別要求 grant。`import-boundary.test.ts` 擋縫外任何字串（含拼接、大小寫）出現 provider host。邊界：origin 若從環境變數或設定組成，測試看不到——新 provider 一律加進 `PROVIDER_ORIGINS` 或 collect registry，不從 env 讀 origin。
- **用量已記、扣點未接**（2026-10-23）：每道付費縫（`lib/ai/gateway.ts` 三個入口、collect `createProviderCall`；video.tts 在 video-service 接單後）呼叫 `grant.recordUse()`：每個 grant 第一次碰到付費工作記一列 `entitlement.usage`（同請求的函式庫、同工作的輪詢共用 grant＝一列），units＝0、不扣點。閘 `lib/portal/__tests__/registry-code.test.ts`：每個 credits 功能的詢問處必須走到 `recordUse`。每功能扣幾點（`lib/entitlements/ledger.ts` `DEFAULT_CREDIT_POLICY` 是佔位值）屬定價，由操作者定；定案後在 `recordUse` 填 units 與冪等鍵，定案前 enforce 下 credits 功能只看餘額不扣點。

### 5. 買斷＝一鍵架站＋選購模組（LEGO）

- **另開一個「買斷安裝」階段**，不是在[總藍圖](../../operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md) Stage 4／5 上加一步：Stage 4 用我們的主機商 token 和 SSH key（`:148`），Stage 5 把服務接到我們自己的監控（`:154`）。買斷安裝要：
  1. 主機商 adapter 每次呼叫帶客戶的主機商 token：現有 `serverAdapterFactory.ts:63-67` 只從 `HETZNER_STAGING_TOKEN` 環境變數取 token，沒有買斷分支；順序 5 新增 `{ mode: "buyout", secretRef }` 分支，買斷模式禁止讀環境變數（新主機商＝新 adapter）；
  2. 在客戶主機裝一整套獨立服務（選到的模組需要的聯集）；
  3. 交接時撤掉我們的 SSH key 與所有我們的密鑰；客戶有買維運才保留一把維運用的 key。
- **模組清單**（每個產品一份）：System Foundry `kernel/06_MODULARITY_CONTRACT.md` 的十項，加上：需要的基礎服務（例：社群＝next-admin＋Supabase＋Trigger.dev＋Postiz）、要填的設定值（客戶的 API key、網址）、依賴的模組（例：社群依賴帳號層）、可接的外部來源（§6）。安裝程式只讀這份清單。
- **模組清單的盤點（2026-10-19，grep 驗過）**：
  - 粒度＝產品。「需要的基礎服務」填 **compose 檔＋要用的 service 名**，不是每個 container 都列成模組；Supabase 13、Trigger 9、Postiz 4、Chatwoot 4 個 service 是各自 compose 檔的內部，安裝以整個 compose 檔為單位，不能只裝其中幾個（拆法等第 5 項實作時看實況，不在此預設）。
  - 清單的正本是每個產品的 `MODULE_MANIFEST.json`（`products.ts` 的 `modules: { dependsOn, manifest }` 已指向它，`:26`）；`services`、`env` 寫進 manifest，**不**另在 `products.ts` 加欄位。十一份已建立（Foundry v1.7 V17-8，2026-10-20），完整度只看 `scripts/product-manifests.mjs` `manifestStatus()`；下表是 2026-10-19 的盤點，env 全集與更正以 manifest 為準（例：manifest 另列 cs 的 `OPENAI_API_KEY`、studio 的 `PRINTFUL_STORE_ID`／`WC_WEBHOOK_SECRET`）。
  - 服務所在（路徑相對 `lobster-factory/infra/`）：

    | 基礎服務 | compose 檔 | service |
    |---|---|---|
    | next-admin、renderer | `hetzner-phase1-core/docker-compose.yml` | `next-admin`、`renderer`（同檔還有 nginx／redis／n8n／wordpress 等，買斷只取需要的） |
    | supabase | `supabase/docker-compose.yml` | studio、kong、auth、rest、realtime、storage、imgproxy、meta、functions、analytics、db、vector、supavisor |
    | trigger | `trigger/docker-compose.yml` | webapp、supervisor、postgres、redis、clickhouse、registry、minio、electric、docker-proxy |
    | postiz | `postiz/docker-compose.yml` | postiz、postiz-redis、temporal、temporal-postgresql |
    | chatwoot | `chatwoot/docker-compose.yml` | chatwoot-rails、chatwoot-sidekiq、chatwoot-postgres、chatwoot-redis |
    | video-service | `hetzner-phase1-core/apps/video-service/docker-compose.video.yml` | video-service |
    | remotion-service | `hetzner-phase1-core/apps/remotion-service/docker-compose.remotion.yml` | remotion-service |
    | cognitive-os | `Projects/internal/cognitive-engineering-os/docker-compose.yml`（repo 根相對） | cognitive-os-api、cognitive-os-web、-web-2、-web-3；`cognitive-os-files` 是 volume 不是 service；自己的 PostgreSQL，不用 supabase |

  - 各產品要的服務與客戶要填的設定（env 名在 `lib/` 內有 grep 命中；「客戶自備」＝值是客戶自己的帳號）：

    | 產品 | 基礎服務 | 客戶自備 env |
    |---|---|---|
    | social | next-admin、supabase、trigger、postiz | 各社群平台授權（Meta 等）、`POSTIZ_API_BASE_URL`、`POSTIZ_API_KEY`（更正：無 `SMARTLINK_*` 變數，smart link 的訪客雜湊 salt 每個程序隨機，`lib/social/smartlink.ts:116`） |
    | cs | next-admin、supabase、chatwoot、trigger（客服排程工作 `applyChatwootBaseline` 由 `lib/schedules/jobs.ts:9` 引用，排程由 Trigger 的 `schedules-heartbeat.ts` 驅動） | `ANTHROPIC_API_KEY`（或 `GEMINI_API_KEY`）、Messenger／LINE 授權 |
    | collect | next-admin、supabase、trigger、renderer | 搜尋與抓取供應商 key（`BRAVE_SEARCH_API_KEY`、`FIRECRAWL_API_KEY`、`PERPLEXITY_API_KEY`、`SERPER_API_KEY`、`OPENAI_API_KEY`，擇一即可）；內部 `RENDERER_URL`、`RENDERER_SHARED_SECRET` 由安裝產生 |
    | outreach | next-admin、supabase | 客戶自己的 Google OAuth（Gmail connector） |
    | content（video） | next-admin、supabase、postiz、video-service、remotion-service | `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`PEXELS_API_KEY`、`R2_*`、`STRIPE_SECRET_KEY`（若客戶要收款）、`WP_API_URL`＋`WORDPRESS_JWT_TOKEN`（若客戶要發到 WordPress）；內部 `VIDEO_SERVICE_URL`、`REMOTION_SERVICE_URL` 由安裝產生 |
    | tarot | next-admin、supabase、trigger（78 張批次生成） | `REPLICATE_API_TOKEN`、`OPENAI_API_KEY`、`R2_API_TOKEN`、`R2_ACCOUNT_ID`、`R2_DESIGNS_BUCKET`、`R2_DESIGNS_PUBLIC_BASE` |
    | studio（POD） | next-admin、supabase、trigger（訂單收件匣掃描） | `REPLICATE_API_TOKEN`、`ANTHROPIC_API_KEY`、`PRINTFUL_API_KEY`、`WPBRIDGE_*`、`R2_API_TOKEN`、`R2_ACCOUNT_ID`、`R2_DESIGNS_BUCKET`、`R2_DESIGNS_PUBLIC_BASE` |
    | cognitive | cognitive-os（自帶 compose 與 PostgreSQL）、next-admin 的 collect（收集工作交給它） | `COGNITIVE_OS_ANTHROPIC_API_KEY`、`COGNITIVE_OS_COLLECTION_SERVICE_URL` |

  - **依賴證據（2026-10-19，grep；路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`，trigger 任務在 `lobster-factory/packages/workflows/src/trigger/`）**：
    - social→postiz：`lib/social/store.ts:10`、`lib/social/dispatch.ts:16` 引用 `lib/content/postiz.ts`，env 讀取在 `lib/content/postiz.ts:38-41`。
    - social→trigger：`social-dispatch.ts:2,15`（另 `social-rotation.ts`、`social-metrics.ts`）。
    - cs→trigger：`cs-inbound-sweep.ts`；cs→chatwoot：`app/api/webhooks/chatwoot/route.ts`、`lib/cs/chatwoot-client`（token 存組織設定，`app/api/ops/clients/[slug]/cs-config/chatwoot-token/route.ts`，不是環境變數）。
    - collect→renderer：`lib/collect/net/providers.ts:46`（`RENDERER_URL`）、`lib/collect/collectors/extract-provider.ts:41`。
    - content→R2：`lib/content/video/reconcile.ts:16-19`、`lib/storage/r2.ts:30-37`；content→collect（同 app，無新服務）：`lib/content/postiz.ts:3`。
    - content→video-service／remotion-service：`lib/content/video/render-client.ts:55`、`lib/content/video/remotion-client.ts:7`；content→WordPress：`lib/content/publish/wordpress-core.ts:354`、`app/api/content/newsletter/route.ts:171`。
    - **tarot→R2（新增）**：`lib/tarot/image-gen.ts:12`（`getDesignsPublicBase`）→ `lib/storage/r2.ts:46-47`。**tarot→trigger（新增）**：`tarot-batch-generate.ts:34,58,83`。
    - **studio→R2（新增）**：`lib/studio/print-file.ts:25`、`lib/studio/upscaler.ts:11`、`lib/studio/wp-web-image.ts:21`、`lib/studio/printful-mockup.ts:26,273`。**studio→trigger（新增）**：`pod-order-inbox-sweep.ts:2,22,32`。studio→WordPress：payload 在 `lib/studio/pod-product.ts:3`，`WPBRIDGE_*` 讀取在共用路由 `app/api/tools/publish/route.ts:351`。
    - **cognitive→next-admin collect（新增）**：`Projects/internal/cognitive-engineering-os/docker-compose.yml:31`（`COGNITIVE_OS_COLLECTION_SERVICE_URL`）；`:29` 出口白名單含 `app.aware-wave.com`；除此 `ai_lego/*.py` 對 redis／n8n／R2／WP／Chatwoot／Postiz／trigger.dev 無命中。
    - **更正**：content 列移除 renderer（`lib/content`、`app/api/content`、`app/api/video` 無 `RENDERER_URL` 呼叫；「renderer」只出現在註解與 `rendererKind` 欄位）。
    - 無證據、不加：八個產品目錄內 n8n、redis（`REDIS_URL`／ioredis）無呼叫；`SCHEDULE_INGEST_TOKEN` 只在 `app/api/internal/schedules/run-due/route.ts:28`、`app/api/internal/entitlements/expire/route.ts:9`（平台層，非單一產品）。
  - 有排程工作的產品（`lib/schedules/jobs.ts` 目前引用 collect、cs）一律另需 trigger（`lobster-factory/packages/workflows/src/trigger/schedules-heartbeat.ts`）；新產品加排程工作時，manifest 的 services 要同步加 trigger。
  - 授權風險不同：Postiz 是 AGPL-3.0（見下方 Postiz 條，待決 2）；其餘見下表。
  - **授權盤點（2026-10-19，查官方來源；自己的話摘要，非法律意見，交律師確認前不得對客戶承諾）**：

    | 元件 | 版本或 image tag（compose 行） | 授權 | 未修改映像交付客戶自架的額外義務 | 商業使用限制 | 來源 |
    |---|---|---|---|---|---|
    | Chatwoot | `chatwoot/chatwoot:v4.18.0`（`chatwoot/docker-compose.yml:38`） | MIT；`enterprise/` 目錄另有授權檔 | 寬鬆授權；映像是否含 `enterprise/` 待查 | `enterprise/` 條款待查 | https://github.com/chatwoot/chatwoot/blob/develop/LICENSE |
    | Trigger.dev | `trigger.dev:${TRIGGER_IMAGE_TAG:-v4.4.4}`（`trigger/docker-compose.yml:187,304`） | Apache-2.0 | 保留授權與版權聲明 | 無（頁面未見雲端專屬限制） | https://github.com/triggerdotdev/trigger.dev |
    | Supabase postgres | `supabase/postgres:15.8.1.085`（`supabase/docker-compose.yml:581`） | PostgreSQL License；內含第三方 extension 各有授權（逐一待查） | 保留聲明 | 無 | https://github.com/supabase/postgres |
    | Supabase kong | `kong/kong:3.9.1`（`:79`） | Apache-2.0 | 保留聲明 | 無 | https://github.com/Kong/kong |
    | Supabase auth（gotrue） | `supabase/gotrue:v2.186.0`（`:135`） | MIT | 保留聲明 | 無 | https://github.com/supabase/auth |
    | Supabase postgrest | `postgrest/postgrest:v14.6`（`:280`） | MIT | 保留聲明 | 無 | https://github.com/PostgREST/postgrest |
    | Supabase realtime | `supabase/realtime:v2.76.5`（`:312`） | Apache-2.0 | 保留聲明 | 無 | https://github.com/supabase/realtime |
    | Supabase storage | `supabase/storage-api:v1.44.2`（`:364`） | Apache-2.0 | 保留聲明 | 無 | https://github.com/supabase/storage |
    | Supabase studio | `supabase/studio:2026.03.16-sha-5528817`（`:14`） | monorepo 為 Apache-2.0；`apps/studio` 有無例外頁面未載，待查 | 保留聲明 | 待查 | https://github.com/supabase/supabase |
    | Postiz | `postiz-app:v2.25.1`（`postiz/docker-compose.yml:92`） | AGPL-3.0 | 交付映像＝散布，須附上或提供對應原始碼；客戶改程式並對外提供網路服務時須公開其修改；其餘待律師 | 官方稱自架無功能限制；AGPL 與專有程式合併的邊界待律師 | https://github.com/gitroomhq/postiz-app |
    | Temporal | `temporalio/auto-setup:1.28.1`（`postiz/docker-compose.yml:55`） | MIT | 保留聲明 | 無 | https://github.com/temporalio/temporal |
    | ClickHouse | `bitnamilegacy/clickhouse:25.7.5-debian-12-r0`（`trigger/docker-compose.yml:66`） | Apache-2.0（上游） | 保留聲明；`bitnamilegacy` 打包層授權與停更狀態待查 | 無 | https://github.com/ClickHouse/ClickHouse |
    | MinIO | `bitnamilegacy/minio:${MINIO_IMAGE_TAG:-latest}`（`trigger/docker-compose.yml:135`；`hetzner-phase1-core/docker-compose.yml:775` 固定 sha） | **AGPLv3** | 同 Postiz：散布須附原始碼；官方 README 稱用戶自負 AGPL 遵循責任；上游 repo 已封存、不再維護 | AGPL 與專有程式合併的邊界待律師 | https://github.com/minio/minio |
    | Redis | `redis:7.2-alpine`（postiz `:16`、chatwoot `:130`）；`redis:${REDIS_IMAGE_TAG:-7-alpine}`（`trigger/docker-compose.yml:48`）；`redis:7-alpine`（`hetzner-phase1-core/docker-compose.yml:45`） | ≤7.2：BSD-3-Clause；7.4–7.8：RSALv2 或 SSPLv1 擇一；8.x：再加 AGPLv3 | 7.2 無額外義務；`7-alpine` 是浮動 tag，實際解析版本待查（解析到 7.4 以上＝RSALv2／SSPLv1，禁止當成服務提供給第三方，須律師看） | 7.2 無；7.4 以上有（見左） | https://redis.io/legal/licenses/ |
    | Electric | `electricsql/electric:${ELECTRIC_IMAGE_TAG:-1.2.4}`（`trigger/docker-compose.yml:161`） | Apache-2.0 | 保留聲明 | 無 | https://github.com/electric-sql/electric |

    - 範圍外未查：supabase 的 logflare、vector、imgproxy、meta、edge-runtime、supavisor，Chatwoot 的 pgvector，docker-proxy，nginx／n8n／mariadb／wordpress（買斷只取需要的服務時再查）。
    - **建議（只是建議，OPEN 清單在別檔）**：MinIO 是 AGPLv3、Redis `7-alpine` 可能是 RSALv2／SSPLv1，與 Postiz 同屬需律師看的類別，建議把「待決 2」的範圍從 Postiz 擴大到 MinIO 與浮動 tag 的 Redis。
- **一份程式**：next-admin 照一個 app 出貨，沒選的模組路由與選單關掉；含 SAFETY_GATE 的程式碼在建置時排除（§2）。
- **授權檔只在款項落定後簽發**：買斷訂單要在 `payment_events` 有已結清列、且退款／拒付窗（預設 30 天，操作者可改）內無反轉事件，或操作者在 `/ops/billing` 標記「匯款已入帳」（High，留稽核列）；安裝工作流在開工前再查一次，未落定即拒（Codex R2-3）。
- **授權檔**：`format_version`、`kid`、`install_id`、客戶、模組、每個 `feature_key` 的上限、`updates_until`、`max_tenants`（預設 1；>1 才是轉售，順序第 7 步）、簽章（Ed25519，同 ADR 007）。安裝內存一組可接受的公鑰，換金鑰時舊授權檔仍可驗。功能沒有到期日；`updates_until` 只管能不能拿新版。
- **不放遠端關閉開關**：我們的伺服器停了客戶照常能用。授權檔是合約工具，不是防破解。
- **更新管道**：版本＝簽章的 release（image tag＋migrations＋changelog）放我方 registry；每個安裝配一組**只屬於它的** registry 拉取憑證（隨授權檔簽發，到期＝`updates_until`，可單獨撤銷），不用任何 AwareWave 共用憑證，交接撤鑰後仍能拉更新（Codex 2026-10-18 M15）；過期不擋使用。建置變體 `BUYOUT=1` 把含 SAFETY_GATE 的檔案排除在 image 外，測試在 image 內 grep 證明。
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
| 3 | 訂閱怎麼每月扣款？ | WooCommerce Subscriptions（唯一有官方訂閱 action 的外掛）＋ TapPay 自動扣款；點數包走同一金流一般刷卡；TapPay 不收 SaaS 訂閱就改 PAYUNi Pro（操作者 2026-10-25，選項與事實：執行卡 step-4 §待決選項）。台灣公司不能直接開 Stripe。付款事件由 wp-bridge 外掛掛 WCS 的 PHP action 送出，不用 Woo 原生 webhook |
| 4 | 買斷含多久更新？ | 含 1 年；之後選購年費繼續拿新版，不續也能一直用目前版本 |
| 5 | 大改版（例：2.0）買斷客戶有沒有？ | 更新期內有；過期要續 |
| 6 | 買斷的主機誰管？ | 我們一鍵裝好；選購維運月費（備份、更新、監控）；主機在客戶名下 |
| 7 | 買斷能不能只買一個模組？ | 能，連同它依賴的模組 |
| 8 | 線上和買斷能不能互換？ | 可以，資料匯出匯入另做；先不承諾自動搬 |
| 9 | 買斷怎麼收錢？（操作者 2026-10-17 問，預設值可改） | **三段**：①買斷價＝36 個月訂閱價，含 12 個月更新；②更新年費＝買斷價 20%，選購，不續仍可用最後版本（JetBrains perpetual fallback）；③維運月費分級（備份、監控、更新套用、支援回應時間），選購，含一把維運 key；AI 與平台 API 客戶自付。對照：Atlassian Data Center 年度維護、WHMCS owned licence＋support/updates。 |
| 10 | 做的先後？（操作者 2026-10-17） | ①先服務自己的客戶（代操計費：順序 1→2→3）②訂閱／點數在 aware-wave.com（順序 4）＋每個產品長成單一產品的樣子（順序 8）③賣斷給一般公司（順序 5）。所以 `can()` 在 Woo 之前。 |
| 11 | 客戶怎麼拿到一個功能？（操作者 2026-10-24「每個功能都要分開購買或我們送」「video、design 要加購，是積木」） | 每個登記表 `features` 都分開買（contract）或我們送（comp）；「功能」＝登記表的 feature，不是每個按鈕（#1 不變）。**門**：帳戶持有該產品任一有效列才進得了門，否則只看到「尚未開通」頁（`lib/portal/door-access.ts`，ProductDoorShell；員工照進）。**點數**（操作者 2026-10-25 定）：點數只是付款方式，不是使用權——功能要有一張權利列才能用；`comp` 列免費，`contract` 列在 `billing: credits` 的功能上按次扣錢包，沒有列一律拒（`can.ts` `issuePermit`，順序 4b-5）。點數包商品對應一個 `kind=addon` 方案（features＝該產品的點數功能），第一次買包就寫列。點數條款：結帳必勾「不適用七日解除權、不可退、不可轉讓、不可換現金」，款項入合約負債（ADR 015 §待查已定）。 |

## 順序（風險由低到高，每段做完現有產品照常）

每步的執行卡（Decision／Files／指令／預期結果／Rollback）在 `agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-N.md`；監工台 `check.mjs` 要求每步都有卡。

1. `products.ts` 加 `features[]`、`accessChannels`（`ui`；`api` 等順序第 6 步）；`scripts/sync-foundry-catalog.mjs` 把登記表匯出成 System Foundry 的「AwareWave 積木」目錄（§0b 第 7 條）；登記表機械閘（012 §5）加「收費功能都有登記」「可買斷模組無 SAFETY_GATE」「**反向登記**：`app/(shell)/tools/<x>`、`app/(shell)/ops/<x>`、`app/(shell)/<x>` 與 `app/<門前綴>` 每個目錄都要在登記表有一列，或在 `BACK_OFFICE` 清單裡附一句理由；兩邊都沒有就紅燈。判準是功能不是路徑：**會給客戶用、或會叫付費 AI、或會收費的＝產品**（客服 `ops/cs`＋`cs-widget`＋`ops/knowledge`、蒐集器 `ops/collect`、行銷 `outreach` 都是產品，即使今天住在 `/ops` 下）；只有員工管 AwareWave 自己營運的才是後台（`ops/clients`、`schedules`、`billing`、`repairs`、`integrations`、`system-modes`、`approvals`、`backup`、`inbox`、`costs`、`onboarding`、`build`、`ops-console`、`api-check*`）」。**住在 `/ops` 下的產品不搬家也不改程式**：登記列先補上、子網域保留、`status: coming_soon`，員工門路徑照舊；要開給客戶時照固定配方三步（卡 1）：①把頁面抽成共用元件，②加產品門路由 `app/<key>/{layout,page}.tsx` 渲染同一元件（社群已是這個做法：`app/social/` 與 `tools/social` 共用 `SocialApp`），③`status: available`＋DNS、nginx。資料表不動、API 前綴不動。**現況 13 個 tools 目錄只有 social 有登記列**，本步一次歸位（預設：video、tarot、studio、design＝canvas+designs+mockup+banner+vector-editor、content＝content+publish+events、cs；theme 與 ai-models 列 `STAFF_UTILITIES` 並由測試證明不 import 付費 SDK），表在 `handoffs/2026-10-16-customer-model-supervisor/cards/step-1.md`；**產生器** `scripts/new-product.mjs`（新產品的唯一入口，操作者 2026-10-16「要去哪裡按什麼」）：問 SOP §18 五題，寫登記列、`app/<門前綴>/{layout,page}.tsx` 骨架、`lib/<key>/can-points.ts`（收費點呼叫 `can()` 的範例）、測試；System Foundry 藍圖末節就是這五個答案。之後 `/ops/products` 的「新增產品」表單只是跑同一條命令；`products.test.ts` 改比對全部產品（現在只比 self-signup）。不碰資料庫。
2. Migration：`plans`、`organization_entitlements`、`organizations.kind`（`internal`／`customer`，預設 customer，Account#0 改 internal）；0062 加 `plan_key`、`source_ref`、改唯一索引、放寬 CHECK（0062 目前 0 筆，不用雙寫期）；三表只給控制面的靜態檢查。控制面發功能級許可（012 §8 第 3 步）。
3. 各產品收費點接 `can()`；認知平台 `check_entitlement(store, tenant_id, capability_id) -> bool`（`ai_lego/platform/entitlement/check.py:25`）改成 `can()` 的薄接頭：加 `actor`、回傳 grant 物件（allowed／limits／max_spend／report），呼叫端只有 `ai_lego/apps/api/main.py` 9 處，同一 commit 改完；它 docstring 的「Phase 2 換內容不換簽章」由本步取代（讀過 2026-10-16）。HCI 側照 ADR-0031 gate 1–4 的位置落地，欄位改本 ADR §3（`entitlement_id`＋`source_ref`＋`actor`＋`on_behalf_of`）；主體解析照 ADR-0009（portal `organizations` 是 tenant 的 adapter，`external_tenant_id` 對應）。
   **付費入口唯一閘**（第 2、3 步一起落地，補「沒登記也能收錢」的洞）：付費供應商 SDK（`@anthropic-ai/sdk`、`openai`、`replicate`、fal、google-genai）與錢包帳本 client 只准在 `lib/entitlements/**` 與 `lib/ai/gateway.ts`（進去先問 `can()`）引用；三張權利表只准在 `lib/entitlements/**` 與 `app/portal/**`（§3）；WordPress／Woo／Fluent 符號只准在各自接頭檔（§0b 第 6 條）。一個測試掃全部 import，別處出現建置失敗。認知平台同理：`ai_lego/platform/ai_execution/gateway.py` 是唯一 AI 入口，呼叫端必須帶 grant。沒登記的產品拿不到 grant，所以收不了錢、也叫不到付費 AI。
4. Woo 付款通知 → 合約與權利；帳本泛化（015 §4 第 2 步）。**分兩段（2026-10-23，執行卡 step-4）**：4a 接頭＋收件表＋合約／權利／帳本寫入，付款來源 `local`（人工登記），不等任何待決；4b Woo 事件＋定期扣款＋點數條款（待決 1、3）。**4b 前置：ADR 015 順序 1（WordPress 一次性碼進入產品門）**，否則在 WordPress 付了錢的人進不了門（4a 的客戶由員工邀請進門）；營運唯讀頁 `/ops/billing`（合約、權利、餘額、帳本）同步做。付款事件先落 **收件表** `payment_events(provider, event_id) unique`，再在同一交易裡處理（合約、權利、帳本），重送同一 `event_id` 不做事（Codex 2026-10-18 M8）。事件六種：訂單完成、訂閱續約、訂閱取消、點數包購買、**退款**、**拒付（chargeback）**。退款訂閱＝取消（權利列到期）；退款點數包＝帳本 `refund` 分錄（0066 已有該 `entry_type`），只退未用部分，已用不退（ADR 015）；拒付＝立即把該合約的權利列改 `suspended`、錢包凍結，人工複核後才解（M9）。發票、稅、幣別全在 Woo，控制面不碰。
5. 買斷安裝階段：模組清單、建置時排除、授權檔簽發、客戶 token 的 adapter、交接撤 key。排在一鍵架站 Stage 4 之後。
6. API 通道（等第一個只串 API 的客戶）：計費帳戶發 API key（scope＝feature_key 子集），`actor = api_key:<id>`，用量走同一個 `report()`；登記表 `accessChannels` 加 `api`。
7. 轉售（等第一個轉售客戶）：授權檔 `max_tenants > 1`，安裝內租戶數受它限制；合約與價格另訂。**`max_tenants` 數的是客戶根組織**（`parent_organization_id IS NULL AND kind = 'customer'` 的 `organizations` 列，0077；`internal` 不算，Codex 2026-10-18 M17）：一家公司、或一個集團含子公司／分公司／部門，都是 1，組織樹是產品本來的功能，不另收；多個不相干的客戶（代理商買去代操）才是 >1，隔離責任在客戶主機，合約寫明（操作者 2026-10-16 定案）。我們替買斷客戶代操不算租戶數，是維運加購（產品決定 Q6）。
8. **每個產品長成單一產品的樣子**（操作者 2026-10-18「他們還沒有展現單一產品的樣貌」）：登記列只給名字，本步給樣子。每個登記產品各做一次：頁面抽成共用元件（照 social 的 `SocialApp`）、加產品門路由 `app/<key>/` 精簡版面、開場是可用狀態（功能清單來自登記表與第 3 步的簽章功能清單、有示範資料）、manifest 無 TODO；`status: available` 的條件由測試擋（門頁存在、manifest 完整、features 非空、smoke 綠）。門上線（DNS、憑證、兩層 nginx）逐產品 High。前置：順序 1、3；與順序 4 同一優先段（要賣，先有樣子）。不搬資料表、不改 API 前綴。
9. **客戶自己的網址指到 hosted 產品門（白牌）**（等第一個要的客戶）：`custom_domains(host, organization_id, product_key, verified_at)`，`doorForHost` 查表、DNS TXT 挑戰、憑證自動（Cloudflare for SaaS 或 on-demand ACME）；ADR 018 §2。買斷安裝不用它（整台就是客戶網域）。

## 不採用

- **每個系統各自做會員、登入、計費、方案**（2026-10-17 前的實況：八個系統四套互不相容的訂閱與點數，ADR 012 脈絡）：違反 §0b 第 4、5 條；改成每塊只問 `can()`、供應商在接頭後。
- **把對外五種方式存成一個 enum**：「買斷＋代操」「只串 API」沒地方放，每加一種改程式；存三軸（§0）。
- **買斷＝線上權利表裡一筆沒有到期日的列**：客戶還在我們主機、用我們的 API，賣一次永遠倒貼（操作者 2026-10-14 更正）。
- **每個模組拆成獨立 app**：多出好幾套登入和主題（016「不採用」同理）。
- **價格寫在程式裡**：每次調價都要部署。
- **買斷版靠執行時開關擋 SAFETY_GATE**：客戶改得掉，等於可購買（012:59 紅線）。
- **買斷版遠端關閉開關**：違反買斷承諾。

## 後果

- 正面：新產品、新功能、新方案、改價格都是資料；產品程式只問一次 `can()`；買斷不增加我們的 API 成本，客戶資料也不在我們手上。
- 代價：控制面多兩張表、許可簽發與靜態檢查；每個產品維護模組清單；買斷要有建置變體、更新管道和版本支援期，是持續成本。
- 需跟進：`lib/portal/products.ts`＋`__tests__/products.test.ts`、`lobster-factory/packages/db/migrations/`（plans、entitlements、0062 擴充）、`ai_lego/platform/entitlement/check.py`、wp-bridge 外掛（付款通知）、一鍵架站總藍圖（加買斷安裝階段）、`ADR_INDEX.md`。
