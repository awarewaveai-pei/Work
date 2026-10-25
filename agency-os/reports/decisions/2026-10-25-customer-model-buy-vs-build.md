# 2026-10-25 客戶模型（三軸五方式）：現成方案能取代多少

Mode: 直接決策（非 /decide 面板）。操作者「查清楚 我們寫得要死要活得 還一堆漏洞」。待操作者確認。

## 問題
ADR 017 §0「業界對照」（`docs/architecture/decisions/017-entitlements-and-self-hosted-modules.md:40`）只照抄成熟產品的模型，沒評估直接採用。現有自寫量（2026-10-25 量）：`lib/entitlements` 1,243 行＋測試 1,795、`lib/payments` 519＋244、`lib/accounts` 525、`aware-wave-store` PHP 1,614；10/16 起相關 WORKLOG 44 則。

## 需求（判準）
R1 產品在 WordPress 外（自架 Next.js），WP 掛掉照跑；R2 組織×產品×功能、合約／贈送、起訖＋7 天寬限；R3 跨產品單一錢包，預留→結算→退回、冪等、拒付凍結；R4 WooCommerce Subscriptions＋TapPay；R5 買斷：永久＋可更新至某日、離線簽章授權檔、租戶數上限；R6 代操「誰替誰」稽核、API key 綁組織與功能；R7 離開 WordPress 能跑；R8 可自架、授權可隨整套賣給客戶、非中國廠商。

## 結論（逐部分）
| 部分 | 現成最接近 | 判定 | 理由（已抽查來源標 ✔） |
|---|---|---|---|
| 訂閱收款 | WooCommerce Subscriptions＋TapPay | **維持（已是現成）** | 計費 SaaS 無 TapPay；Stripe 可用國家清單無台灣 ✔ https://stripe.com/global |
| 錢包（按次扣點） | 無 | **維持自寫** | Lago 錢包只在開發票時扣、無預留／直接扣點 API ✔ https://getlago.com/docs/guide/wallet-and-prepaid-credits ；Stripe credits 禁作儲值；WP 錢包外掛（TeraWallet、Account Funds、myCRED）無預留且帳在 WP（違 R1/R7） |
| 權利 | OpenMeter entitlements（Apache 2.0） | **維持自寫** | beta、要 Kafka＋ClickHouse；無贈送來源與寬限；換掉現有已上線的權利表＝重工 |
| 買斷授權 | **Keygen CE**（自架、免費） | **建議採用（第 ⑤ 步尚未開工）** | 授權檔預設 Ed25519、可離線驗證 ✔ https://keygen.sh/docs/api/cryptography/ ；Fair Core License 允許嵌入地端產品（README，未抽查）。待查：「可更新至某日」與租戶數欄位對應、FCL 法務 |
| API key | Unkey（FSL） | 第 6 步開工時再比 | 自架未證實；第一個 API 客戶出現前不做 |
| 代操稽核 | 無 | 維持自寫 | 無候選提供「誰替誰」 |

## 判斷
- 沒有現成方案同時滿足 R1＋R2＋R3；核心兩塊（權利、錢包）換掉不會少漏洞，只會換一組整合漏洞並多一個要維運的服務。
- 現有漏洞多數出在**接縫**（WP→控制面、付款→權利），不在自寫本身；對策是端到端演練（`handoffs/2026-10-16-customer-model-supervisor/cards/step-4.md:40`、`:148` 已寫、未跑；prod `payment_events`＝0），不是換套件。
- 唯一可省大量工的是第 ⑤ 步買斷授權：改用 Keygen CE，不自寫授權檔簽發與驗證。

## 第二輪：只查 WordPress 外掛（操作者「我說的是 wordpress 外掛」）
方法：手選 22 個逐一讀開發者文件（REST／hooks／函式）＋目錄掃描（wordpress.org API 四類別各搜尋詞前 20、woocommerce.com、2025–26 比較文；過濾：安裝 ≥2,000、12 個月內更新、有開發者文件）→ 新候選 20 個，值得追的 2 個已核對。主 agent 抽查 ✔：Teams 開發者文件、API Manager API 文件、Subaccounts 文件、SureCart 授權文件。

| 部分 | 最接近的外掛 | 它能接手 | 仍要自寫 | 關鍵限制（來源） |
|---|---|---|---|---|
| 組織（公司買、員工用） | **Memberships for Teams**（SkyVerge，$129/年） | owner／manager／member、席位、跟訂閱一起停 | 推到產品端的同步 | 無 REST、無「成員加入」hook，只有 `team_created`／`team_saved`／`invitation_created` ✔ woocommerce.com/document/teams-woocommerce-memberships-developer-documentation/ |
| 誰能用哪個產品 | WooCommerce Memberships（$199/年） | 方案狀態機、`wc_memberships_user_membership_status_changed` | 產品端 `can()`、贈送來源、7 天寬限 | REST 路由無文件（只有 PHP 函式、Abilities 需 `manage_woocommerce`） |
| 代操（誰替誰） | 無 | — | 全部 | Teams 的 owner＝付費者，不是替客戶操作的員工；Subaccounts（WebWizards）無任何 API 文件 ✔；Dokan／WCFM 是賣家模型 |
| 錢包 | TeraWallet（REST `wallet/{id}` credit/debit）／myCRED（`mycred_add`、付費 REST） | 加點、扣點、查餘額 | 預留→結算→退回、冪等、拒付凍結；帳在 WP（違 R1/R7） | 兩者文件皆無預留 |
| API key | **WooCommerce API Manager**（Kestrel，$199/年）／License Manager for WC（免費＋Pro，`lmfwc/v2` REST＋webhook） | 發 key、`instance` 啟用數、`status` 查詢、訂閱連動與寬限 | — | API Manager 無 hooks／webhook、只線上驗證 ✔ woocommerce.com/document/api-documentation/ |
| 買斷離線驗證 | 無（EDD SL、LMFWC、API Manager、SureCart 皆只線上驗證；SureCart 綁 api.surecart.com ✔） | — | 簽章授權檔 | → 第一輪結論 Keygen CE 不變 |

目錄掃描新候選（已刷：功能單薄／無文件／<2,000 安裝 的 20 餘個略）：Paid Member Subscriptions（Cozmoslabs，Group Memberships 附加）、WP-Members（hooks 文件完整、無 REST）、Advanced Access Manager（REST／JWT 存取控制）、Points and Rewards for WooCommerce（WP Swings）、Advanced Coupons store credit、EDD Software Licensing、FluentCart Pro、SureCart。皆未改變上表。

**第二輪結論**：WordPress 外掛能接手的是「組織／席位」與「API key 發放」兩段；「誰替誰」稽核、預留結算錢包、離線授權檔，市面上沒有外掛提供。要不要為了那兩段把權利正本搬回 WordPress（違 R1：WP 掛掉產品就停），是操作者的取捨；維持現狀時，這兩段的現成外掛也可只當「賣場端的畫面」，權利正本仍在控制面。

## 未查證（研究員標「?」）
各家公司所在地（R8 中國廠商）、Lago／OpenMeter 與 TapPay 並存、WP 會員外掛外部查詢 API、Cryptlex／LicenseSpring 公司所在地、各授權（AGPL／FSL／FCL）對賣整套的法務效果。

## 來源
web-researcher 2026-10-25（候選 20 個 × R1–R8 表）；主 agent 抽查 3 項（上表 ✔）。
