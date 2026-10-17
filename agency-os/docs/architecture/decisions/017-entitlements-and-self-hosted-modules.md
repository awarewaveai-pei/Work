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
- System Foundry 問卷要對齊三軸：已有 CAP-SUBSCRIPTION／CAP-PREPAID-CREDITS／CAP-LICENSE／CAP-MULTI-TENANT／CAP-CUSTOMER-USERS；缺「代操」、缺 `self_hosted` 獨立題、缺 API 通道；藍圖必寫「許可只問 `can()`，不自建帳本」（TASKS 2026-10-16）。

### 0b. 每個系統同一個模式：積木契約（操作者 2026-10-17「每次開發系統要用同一個模式」「樂高積木」「未來某天不掛 WordPress」）

一個產品＝一塊積木。十項宣告照 System Foundry `kernel/06_MODULARITY_CONTRACT.md`（state／behavior／API 與事件契約／不變量／依賴／失敗隔離／資料生命週期／可觀測／遷移回滾／替換策略），寫在登記表那一列的 `modules` 與產生器產出的 `MODULE_MANIFEST.json`。本 ADR 加的、每塊都要過的八條：

1. **登記列**：`products.ts` 一列（門、登入來源、`features[]`、`accessChannels`、`modules`）。沒有列＝不是產品，拿不到許可。
2. **自己的門**：子網域保留，頁面在自己的前綴下（ADR 018）。
3. **自己的資料**：不讀寫別的產品的表（HCI ADR-0002）；要資料走對方的 API 或簽章事件。
4. **只問一個判斷**：收費動作前 `can(主體, feature_key, actor)`；不自建帳本、不自建方案表。
5. **外部供應商一律在接頭後面**，接頭的值是設定不是程式：付款 `payments: woo | stripe | local`、會員與登入 `loginSources`（ADR 018 §3）、CRM 事件下游 `crm: fluentcrm | none`、AI `lib/ai/gateway.ts`、主機商 `serverAdapterFactory`。
6. **離開 WordPress 測試**（可替換性的具體形式）：整套測試以 `payments=local`、`loginSources=[local]`、`crm=none` 跑一遍必須全綠；任何核心邏輯 import WordPress／Woo／Fluent 的符號即紅燈（第 2 步 import-boundary 閘加這一組）。WordPress 是今天的門口與收銀台（ADR 015），不是房子；哪天自建會員與金流，換接頭的值，產品程式不動。
7. **選配**：`features[]` 與 `plans` 決定一個客戶能用哪些功能；`standalone`＋`dependsOn` 決定買斷能單獨裝哪些積木。
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
- 新表 `plans`：`plan_key`、`product_key`、`kind`（base 基本／addon 加購）、給哪些 `feature_key`、各 QUOTA 上限、`woo_product_ids`。新方案＝加一列。
- 價格只在 WooCommerce。付款通知帶 Woo 商品 id，控制面用 `plans.woo_product_ids` 查出方案（對應放在 Supabase，ADR 005:16）。
- **SAFETY_GATE**（例：HCI 持續監測，012:57）不進任何方案，也不能買斷。買斷版的安裝在建置時就排除含 SAFETY_GATE 功能的程式碼，不靠執行時開關（客戶擁有主機，開關改得掉）。登記表機械閘檢查「可買斷的模組沒有任何 SAFETY_GATE 功能」。

### 3. 線上：合約 → 權利 → 許可

- **主體＝計費帳戶**：`coalesce(parent_organization_id, id)`（兩層樹的最上層）。品牌、部門這些子組織用上層的權利，「品牌數」上限算在上層。這是 HCI ADR-0009 租戶模型的 adapter 對應，不改它。
- **合約＝0062**：一列＝一個（計費帳戶、產品、方案）。加 `plan_key`、`source_ref`（Woo 訂閱編號）。唯一索引改為（organization_id, product_key, plan_key）且非 canceled；每產品最多一個 base（控制面寫入時檢查，它是唯一寫入者）。試用＝base 列的 `trial` 狀態，付款時就地改 `active`、填 `plan_key`，不新增列。加購＝另一列 addon 方案。CHECK 改成包含所有登記表的產品（現在缺 `social`）。
- **權利＝新表 `organization_entitlements`**：`organization_id`（計費帳戶）、`product_key`、`feature_key`（必填）、`source`（contract／comp）、`source_ref`（合約 id 或贈送原因）、`starts_at`、`ends_at`、`status`、上限。合約變動時控制面重算該帳戶的權利列。贈送整個產品＝照一個具名方案展開成每個功能一列。
- 點數不變成權利：按次扣點的功能，許可帶「這次最多花多少」（015 §1）。
- **到期與寬限**：權利列 `ends_at = current_period_end + 7 天`（預設，操作者可改）；每日 job（schedules 表一列 `entitlements-expire`）把過期列改 `expired`，不刪列。**試用結束**無付款同樣過期；資料保留 90 天後標 `erasure_due`，實際刪除走既有擦除流程。
- **代操授權**：員工替組織 X 簽許可，只在該員工對 X 有角色（成員列或 `ops_role` owner/admin）時成立，否則 403；`actor` 永遠記員工本人。
- **金鑰**：許可簽章私鑰 `ENTITLEMENT_SIGNING_KEY`（vault → `mcp/user-env.ps1` → 容器 env）；公鑰清單 `ENTITLEMENT_PUBLIC_KEYS`（`kid:公鑰`，可多把，換鑰時新舊並存一個 `expires_at` 窗）。授權檔私鑰 `LICENCE_SIGNING_KEY` 另一把，同法。
- **RLS**：`plans`、`organization_entitlements`、0062 只給 `service_role`；`anon`／`authenticated` 無 policy。價格在 Woo，不在這三表。
- **只有控制面碰這三張表**（0062、`plans`、`organization_entitlements`）：靜態檢查只允許 `lib/entitlements/**` 與 `app/portal/**` 引用它們，其他地方出現就建置失敗。社群、collect 跟控制面在同一個 app，用的是繞過 RLS 的 service-role client（0062:51-52），沒有這道檢查就擋不住直讀。
- **許可**（012 §4 `entitlement_ref` 擴充，取代 ADR-0031 gate 1 欄位）：`tenant`（計費帳戶）、`product_key`、`feature_key`、`entitlement_id`、`source_ref`、上限、可花點數上限、`actor`、`on_behalf_of`（§0 C 軸；`on_behalf_of` 永遠等於 `tenant`，代操時 `actor` 是員工）、`issued_at`、`expires_at`（分鐘級）、`kid`、簽章。只在該功能有 active 權利列時簽發（取代 gate 2 條件）。用量回報帶 `entitlement_id`（取代 gate 4 的 `subscription_ref`）與 `actor`／`on_behalf_of`，點數永遠扣 `on_behalf_of`，稽核永遠記 `actor`。畫面要灰掉沒買的按鈕時，產品要一份簽章的「此帳戶能用的功能與上限」，快取幾分鐘。
- 認知平台：`check_entitlement` 改收 session 對應的計費帳戶與 `feature_key`、驗許可，不再只看 tenant。

### 4. 程式只有一個判斷：`grant = can(主體, feature_key, actor)`

- 回傳 `{allowed, limits, max_spend, report(usage)}`。
- 主體＝計費帳戶（`on_behalf_of`），`actor`＝這次請求是誰（§0 C 軸）；`actor` 只進稽核與用量，不影響 `allowed`。
- 線上：答案來自許可；`report()` 回報用量給控制面記帳。
- 買斷：主體＝這台安裝，答案來自授權檔；`max_spend` 空、`report()` 不做事（用客戶自己的 key）。
- 每個收費的按鈕或 API 呼叫前問一次；產品程式不知道答案來自合約、贈送還是買斷。

### 5. 買斷＝一鍵架站＋選購模組（LEGO）

- **另開一個「買斷安裝」階段**，不是在[總藍圖](../../operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md) Stage 4／5 上加一步：Stage 4 用我們的主機商 token 和 SSH key（`:148`），Stage 5 把服務接到我們自己的監控（`:154`）。買斷安裝要：
  1. 主機商 adapter 每次呼叫帶客戶的主機商 token（`lobster-factory/packages/workflows/src/provision/serverAdapterFactory.ts:80`，新主機商＝新 adapter）；
  2. 在客戶主機裝一整套獨立服務（選到的模組需要的聯集）；
  3. 交接時撤掉我們的 SSH key 與所有我們的密鑰；客戶有買維運才保留一把維運用的 key。
- **模組清單**（每個產品一份）：System Foundry `kernel/06_MODULARITY_CONTRACT.md` 的十項，加上：需要的基礎服務（例：社群＝next-admin＋Supabase＋Trigger.dev＋Postiz）、要填的設定值（客戶的 API key、網址）、依賴的模組（例：社群依賴帳號層）、可接的外部來源（§6）。安裝程式只讀這份清單。
- **一份程式**：next-admin 照一個 app 出貨，沒選的模組路由與選單關掉；含 SAFETY_GATE 的程式碼在建置時排除（§2）。
- **授權檔**：`format_version`、`kid`、`install_id`、客戶、模組、每個 `feature_key` 的上限、`updates_until`、`max_tenants`（預設 1；>1 才是轉售，順序第 7 步）、簽章（Ed25519，同 ADR 007）。安裝內存一組可接受的公鑰，換金鑰時舊授權檔仍可驗。功能沒有到期日；`updates_until` 只管能不能拿新版。
- **不放遠端關閉開關**：我們的伺服器停了客戶照常能用。授權檔是合約工具，不是防破解。
- **更新管道**：版本＝簽章的 release（image tag＋migrations＋changelog）放我方 registry；安裝在 `updates_until` 內可拉，過期不擋使用。建置變體 `BUYOUT=1` 把含 SAFETY_GATE 的檔案排除在 image 外，測試在 image 內 grep 證明。
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
| 9 | 買斷怎麼收錢？（操作者 2026-10-17 問，預設值可改） | **三段**：①買斷價＝36 個月訂閱價，含 12 個月更新；②更新年費＝買斷價 20%，選購，不續仍可用最後版本（JetBrains perpetual fallback）；③維運月費分級（備份、監控、更新套用、支援回應時間），選購，含一把維運 key；AI 與平台 API 客戶自付。對照：Atlassian Data Center 年度維護、WHMCS owned licence＋support/updates。 |
| 10 | 做的先後？（操作者 2026-10-17） | ①先服務自己的客戶（代操計費：順序 1→2→3）②訂閱／點數在 aware-wave.com（順序 4）③賣斷給一般公司（順序 5）。所以 `can()` 在 Woo 之前。 |

## 順序（風險由低到高，每段做完現有產品照常）

每步的執行卡（Decision／Files／指令／預期結果／Rollback）在 `agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-N.md`；監工台 `check.mjs` 要求每步都有卡。

1. `products.ts` 加 `features[]`、`accessChannels`（`ui`；`api` 等順序第 6 步）；登記表機械閘（012 §5）加「收費功能都有登記」「可買斷模組無 SAFETY_GATE」「**反向登記**：`app/(shell)/tools/<x>` 與 `app/<門前綴>` 每個目錄都對得到登記表一列，對不到紅燈；`app/(shell)/ops/*` 是營運後台頁，不是產品，不在登記表」。**現況 13 個 tools 目錄只有 social 有登記列**，本步一次歸位（預設：video、tarot、studio、design＝canvas+designs+mockup+banner+vector-editor、content＝content+publish+events、cs；theme 與 ai-models 列 `STAFF_UTILITIES` 並由測試證明不 import 付費 SDK），表在 `handoffs/2026-10-16-customer-model-supervisor/cards/step-1.md`；**產生器** `scripts/new-product.mjs`（新產品的唯一入口，操作者 2026-10-16「要去哪裡按什麼」）：問 SOP §18 五題，寫登記列、`app/<門前綴>/{layout,page}.tsx` 骨架、`lib/<key>/can-points.ts`（收費點呼叫 `can()` 的範例）、測試；System Foundry 藍圖末節就是這五個答案。之後 `/ops/products` 的「新增產品」表單只是跑同一條命令；`products.test.ts` 改比對全部產品（現在只比 self-signup）。只讀。
2. Migration：`plans`、`organization_entitlements`、`organizations.kind`（`internal`／`customer`，預設 customer，Account#0 改 internal）；0062 加 `plan_key`、`source_ref`、改唯一索引、放寬 CHECK（0062 目前 0 筆，不用雙寫期）；三表只給控制面的靜態檢查。控制面發功能級許可（012 §8 第 3 步）。
3. 各產品收費點接 `can()`；認知平台 `check_entitlement(store, tenant_id, capability_id) -> bool`（`ai_lego/platform/entitlement/check.py:25`）改成 `can()` 的薄接頭：加 `actor`、回傳 grant 物件（allowed／limits／max_spend／report），呼叫端只有 `ai_lego/apps/api/main.py` 9 處，同一 commit 改完；它 docstring 的「Phase 2 換內容不換簽章」由本步取代（讀過 2026-10-16）。HCI 側照 ADR-0031 gate 1–4 的位置落地，欄位改本 ADR §3（`entitlement_id`＋`source_ref`＋`actor`＋`on_behalf_of`）；主體解析照 ADR-0009（portal `organizations` 是 tenant 的 adapter，`external_tenant_id` 對應）。
   **付費入口唯一閘**（第 2、3 步一起落地，補「沒登記也能收錢」的洞）：付費供應商 SDK（`@anthropic-ai/sdk`、`openai`、`replicate`、fal、google-genai）、錢包帳本 client、三張權利表，只准在 `lib/entitlements/**` 與 `lib/ai/gateway.ts`（進去先問 `can()`）引用；測試掃全部 import，別處出現建置失敗。認知平台同理：`ai_lego/platform/ai_execution/gateway.py` 是唯一 AI 入口，呼叫端必須帶 grant。沒登記的產品拿不到 grant，所以收不了錢、也叫不到付費 AI。
4. Woo 付款通知 → 合約與權利；帳本泛化（015 §4 第 2 步）。**前置：ADR 015 順序 1（WordPress 一次性碼進入產品門）**，否則付了錢的人進不了門；營運唯讀頁 `/ops/billing`（合約、權利、餘額、帳本）同步做。
5. 買斷安裝階段：模組清單、建置時排除、授權檔簽發、客戶 token 的 adapter、交接撤 key。排在一鍵架站 Stage 4 之後。
6. API 通道（等第一個只串 API 的客戶）：計費帳戶發 API key（scope＝feature_key 子集），`actor = api_key:<id>`，用量走同一個 `report()`；登記表 `accessChannels` 加 `api`。
7. 轉售（等第一個轉售客戶）：授權檔 `max_tenants > 1`，安裝內租戶數受它限制；合約與價格另訂。**`max_tenants` 數的是根組織**（`parent_organization_id IS NULL` 的 `organizations` 列，0077）：一家公司、或一個集團含子公司／分公司／部門，都是 1，組織樹是產品本來的功能，不另收；多個不相干的客戶（代理商買去代操）才是 >1，隔離責任在客戶主機，合約寫明（操作者 2026-10-16 定案）。我們替買斷客戶代操不算租戶數，是維運加購（產品決定 Q6）。

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
