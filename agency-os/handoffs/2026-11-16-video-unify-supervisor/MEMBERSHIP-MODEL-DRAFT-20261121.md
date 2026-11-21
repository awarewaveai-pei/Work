# 會員模型（草稿，待操作者核可後升成 ADR）

- 日期：2026-11-21｜狀態：草稿｜現況證據：`WP-MEMBERSHIP-STATUS-20261121.md`（同資料夾）
- NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`
- 承接：ADR 015 §2、ADR 017 §0／§0b、ADR 018 §3。本檔只補三者沒講完的「單位／人／分類／代辦」。

## 1. 操作者已定（2026-11-21）

| # | 決定 | 原話 |
|---|---|---|
| D1 | 每個客戶（單位）＝一個 aware-wave.com 會員，無例外（含代操）；可由我們代為申請 | 「所有客戶(單位)要成為aware-wave.com會員 我才能統一操作, 我們可以代為申請」 |
| D2 | 單位底下的人＝被授權的 app 帳號，不是 aware-wave.com 會員 | 「目前的設計是客戶開放授權…那些人不會是aware-wave.com會員」 |
| D3 | 會員要分類 | 「會員要分類」 |

## 2. 與現有程式相符之處

| 決定 | 現有程式 |
|---|---|
| D1 一會員一組織 | 不變量 `NA/lib/entitlements/wp-customers.ts:7`；對應表 `customer_identities`，鍵 `(site_id, wp_user_id)` |
| D1 員工先建的客戶可被同 email 會員接手 | `adoptableClient` `wp-customers.ts:118-132`（僅 aware-wave.com） |
| D2 人＝app 帳號＋產品角色 | `NA/lib/accounts/client-invite.ts:1-9`；`organization_memberships`；產品層角色例 `social_brand_members` |
| 核心不依賴 WordPress | ADR 017 §0b 第 6 條；import 閘存在且綠（現況報告 §8） |

## 3. 模型（單一敘述）

- 身分來源：WordPress 會員（單位）。app 的 `organizations` 是副本，只由「WordPress 簽章事件」或「員工代辦動作」建立／連結；兩者都落在 `customer_identities` 一列。
- 人：`organization_memberships`＋各產品角色；只存在 app；登入走 `local`。
- 分類：不新增手填欄位。分類＝ADR 017 §0 三軸（部署／商業／操作）的組合，由 app 算出，經 `crm` 接頭單向寫成 WordPress 端 FluentCRM 標籤（ADR 017 §0b 第 5 條 `crm: fluentcrm | none`）。WordPress 端只讀不改分類。
- 方向：會員存在與付款 WordPress → app；分類與權利 app → WordPress。任一事實只有一個寫入方。

## 4. 缺口（照模型才需要的）

| # | 缺口 | 證據 |
|---|---|---|
| G1 | 代辦路徑不存在：連結只在付款事件時建立，非付款不建帳號 | `wp-customers.ts:169`（現況報告 §3） |
| G2 | 現有 6 個 active 組織無 WordPress 會員（僅 2 個測試列，且與 WP id 對不上） | 現況報告 §3、§7 |
| G3 | 分類無實作；`crm` 接頭設定不存在 | 現況報告 §8 |
| G4 | 客戶自己授權他人：只有員工能邀請；產品層只有 social 有成員頁 | `NA/app/api/ops/clients/[slug]/accounts/route.ts:100`；`NA/app/(shell)/tools/social/Members.tsx` |
| G5 | 組織層沒有「管理者」角色在用（正式庫全是 `member`） | 現況報告 §4 |
| G6 | 訪客結帳開著，程式假設結帳必登入 | 現況報告「矛盾」第 4 項 |
| G7 | 登入頁叫客戶去 aware-wave.com 註冊，但該處關著且無進入鈕（死路） | 現況報告「矛盾」第 1 項 |
| G8 | 四個開關關著（NA 密鑰空、`seller_sites` disabled、店外掛停用、WP 密鑰已刪） | 現況報告 §2 |
| G9 | 「全部換成 local 設定跑整套測試」不存在 | 現況報告 §8 |

## 5. 待操作者決定（各附建議）

| # | 問題 | 建議 |
|---|---|---|
| Q1 | 代辦會員用誰的 email？ | 單位的聯絡人 email，且必須由對方點信驗證後才算連上（沿用既有不變量：帳號只給已證明的 email，`client-invite.ts:1-4`）。不用我們自己的信箱代持。 |
| Q2 | 誰能授權單位底下的人？ | 單位的管理者（＝持有會員的那個人）與員工都能；先補組織層 `owner` 角色（G5），再開客戶自助授權（G4）。 |
| Q3 | 分類有哪幾類？ | 不另列清單：直接用五種方式（自用／代操／訂閱／點數／買斷）當標籤名，由三軸算出；一個單位可同時有多個標籤。 |
| Q4 | 先賣什麼？ | 只賣點數（ADR 015 §1）；訂閱外掛等第一個要訂閱的客戶。 |

## 6. 需更正的既有文件

- `CLIENT-CONTEXT-PLAN-20261121.md` 的 C1 寫「ADR 019」；019 已被 `019-staff-tool-grants.md` 使用 → 目前客戶規則用 020，本模型用 021。
- ADR 015 `:3`「尚未實作」、ADR 015 簽章 Ed25519 vs 實作 HMAC、`selfSignup` 等過時文字（現況報告「矛盾」）→ 升成 ADR 時一併改。
