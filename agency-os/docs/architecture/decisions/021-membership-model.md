# ADR 021: 會員模型 — 每個客戶（單位）是一個 aware-wave.com 會員；單位底下的人是被授權的 app 帳號；分類由三軸算出

- **狀態**：已接受（操作者 2026-11-21：D1–D3 原話見 §1；Q1–Q4「都照建議」）。**尚未實作**：缺口 G1–G9 待拆卡。
- **日期**：2026-11-21
- **承接**：[ADR 015](015-awarewave-account-and-shared-wallet.md) §2（帳號＝WordPress 會員）、[ADR 017](017-entitlements-and-self-hosted-modules.md) §0（三軸）／§0b（接頭、離開 WordPress）、[ADR 018](018-product-doors-and-buyout-delivery.md) §3（登入來源）。本 ADR 只補三者沒講完的「單位／人／分類／代辦」。
- **現況證據**：`agency-os/handoffs/2026-11-16-video-unify-supervisor/WP-MEMBERSHIP-STATUS-20261121.md`（下稱「現況報告」）。
- NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`

## 1. 決定

| # | 決定 | 操作者原話／來源 |
|---|---|---|
| D1 | 每個客戶（單位）＝一個 aware-wave.com 會員，無例外（含代操）；可由我們代為申請 | 「所有客戶(單位)要成為aware-wave.com會員 我才能統一操作, 我們可以代為申請」 |
| D2 | 單位底下的人＝被授權的 app 帳號，不是 aware-wave.com 會員 | 「目前的設計是客戶開放授權…那些人不會是aware-wave.com會員」 |
| D3 | 會員要分類；分類不手填，＝五種方式（自用／代操／訂閱／點數／買斷），由 ADR 017 §0 三軸算出，一個單位可多類 | 「會員要分類」；Q3 照建議 |
| D4 | 代辦會員用單位聯絡人的 email，對方點信驗證後才算連上；不用我方信箱代持 | Q1 照建議 |
| D5 | 單位的管理者（持有會員的那個人）與員工都能授權單位底下的人；先補組織層 `owner` 角色，再開客戶自助授權 | Q2 照建議 |
| D6 | 先只賣點數；訂閱外掛等第一個要訂閱的客戶 | Q4 照建議；ADR 015 §1 |

## 2. 模型

- 身分來源：WordPress 會員（單位）。app 的 `organizations` 是副本，只由「WordPress 簽章事件」或「員工代辦動作」建立／連結，兩者都落在 `customer_identities` 一列（鍵 `(site_id, wp_user_id)`）。不變量：一會員一組織（`NA/lib/entitlements/wp-customers.ts:7`）。
- 人：`organization_memberships`＋各產品角色，只存在 app，登入走 `local`（`NA/lib/accounts/client-invite.ts:1-9`）。
- 分類：app 由三軸算出，經 `crm` 接頭單向寫成 WordPress 端 FluentCRM 標籤（ADR 017 §0b 第 5 條 `crm: fluentcrm | none`）。WordPress 端不改分類。
- 方向（每個事實只有一個寫入方）：會員存在與付款 WordPress → app；分類與權利 app → WordPress。
- 結帳必登入（訪客付款無法歸戶）。
- 核心不依賴 WordPress：ADR 017 §0b 第 6 條不變。買斷安裝內「單位」＝該安裝的客戶，登入來源照 ADR 018 §3。

## 3. 缺口（未實作）

| # | 缺口 | 證據 |
|---|---|---|
| G1 | 代辦路徑不存在：連結只在付款事件時建立，非付款不建帳號 | `wp-customers.ts:169`；現況報告 §3 |
| G2 | 現有 6 個 active 組織無 WordPress 會員（僅 2 個測試列，且與 WP id 對不上） | 現況報告 §3、§7 |
| G3 | 分類無實作；`crm` 接頭設定不存在 | 現況報告 §8 |
| G4 | 客戶自己授權他人：只有員工能邀請；產品層只有 social 有成員頁 | `NA/app/api/ops/clients/[slug]/accounts/route.ts:100`；`NA/app/(shell)/tools/social/Members.tsx` |
| G5 | 組織層沒有「管理者」角色在用（正式庫全是 `member`） | 現況報告 §4 |
| G6 | 訪客結帳開著，程式假設結帳必登入 | 現況報告「矛盾」第 4 項 |
| G7 | 登入頁叫客戶去 aware-wave.com 註冊，但該處關著且無進入鈕 | 現況報告「矛盾」第 1 項 |
| G8 | 四個開關關著（NA 密鑰空、`seller_sites` disabled、店外掛停用、WP 密鑰已刪） | 現況報告 §2 |
| G9 | 「全部換成 local 設定跑整套測試」不存在 | 現況報告 §8 |

開放註冊的前置條件：G1、G5、G6、G7 完成，且以一個測試會員走完「註冊 → 付款 → 進產品 → 扣點」。

## 4. 沒選的做法

- 單位底下的人也當 WordPress 會員：WordPress 無單位概念，需團隊外掛；與 D2 相反。
- 代操客戶不當會員：操作者無法在 WordPress 統一操作；與 D1 相反。
- 分類存成手填欄位：與三軸重複，會與合約狀態不一致。
- 用我方信箱代持客戶會員：帳號實際歸我方，違反「帳號只給已證明的 email」（`client-invite.ts:1-4`）。

## 5. 需更正的既有文件（實作時一併）

- ADR 015 `:3`「尚未實作」、§2 簽章寫 Ed25519（aware-wave.com 實作為 HMAC）；`selfSignup` 等過時文字：現況報告「矛盾」。
- `agency-os/handoffs/2026-11-16-video-unify-supervisor/CLIENT-CONTEXT-PLAN-20261121.md` C1 的 ADR 編號用 020（019 已被 [019-staff-tool-grants.md](019-staff-tool-grants.md) 使用）。
