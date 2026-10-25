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

## 未查證（研究員標「?」）
各家公司所在地（R8 中國廠商）、Lago／OpenMeter 與 TapPay 並存、WP 會員外掛外部查詢 API、Cryptlex／LicenseSpring 公司所在地、各授權（AGPL／FSL／FCL）對賣整套的法務效果。

## 來源
web-researcher 2026-10-25（候選 20 個 × R1–R8 表）；主 agent 抽查 3 項（上表 ✔）。
