# ADR 012: 共用平台層 — 三類上限、計費 substrate、上架機械閘、跨產品版本相容

- **狀態**：提案
- **日期**：2026-09-10

## 命名空間說明（本身就是一個混亂來源，先講清楚）

本 repo 有**兩套並行的 ADR 編號**，互不從屬：

| 命名空間 | 位置 | 格式 | 管轄 |
|---|---|---|---|
| **agency-os** | `agency-os/docs/architecture/decisions/` | `NNN-`（3 位） | 跨系統邊界、營運、平台層 |
| **HCI / AI LEGO** | `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/` | `ADR-NNNN-`（4 位） | HCI-30 與 Cognitive OS 兩個 peer 產品 |

本檔為 **agency-os 012**。文中 `ADR-00NN`（4 位）一律指 HCI 命名空間。

## 脈絡

八個系統要各自「自用／訂閱／點數／賣人」。實查後，**光「訂閱與點數」就有 4 套互不相容的實作**：

| # | 位置 | 有什麼 | 缺什麼 |
|---|---|---|---|
| 1 | `lobster-factory/packages/db/migrations/0062_organization_product_subscriptions.sql` | 訂閱狀態機 | `product_key CHECK IN ('cognitive','hci')` **只認兩個產品**；無點數；明寫「NOT Stripe」 |
| 2 | `.../0066_media_billing_and_provider_profiles.sql` | **唯一能跑的點數帳本**：`credit_ledger`、`grant/debit/refund/adjustment`、`idempotency_key` unique、月/硬上限、`ON DELETE RESTRICT` | 寫死 `media_` 前綴，只服務 video |
| 3 | `ADR-0031`（HCI） | 簽章驗證的 `entitlement_ref`，跨產品證明「該租戶有訂閱」 | 只設計給 `product_key='cognitive'` |
| 4 | `Projects/internal/ziwei-doushu/lib/entitlements.ts` + `lib/payments/gateway.ts` | 免費額度/訂閱純函式；**唯一的多金流抽象**（Stripe/ECPay/PayPal） | 記憶體 stub，未接 DB，provider 皆 `throw` |

而 `lobster-factory/.../lib/portal/products.ts:30-31` 的產品清單**只有 2 個**（cognitive、hci）——video、SEO、cold email、KB、System Foundry 全不在清單上，**但 0066 已經在對 video 收點數**。清單與計費表對不上。

### 既有決策的邊界（本 ADR 不得逾越，亦不重述）

| 既有決策 | 內容 | 對本 ADR 的拘束 |
|---|---|---|
| **ADR-0013** | kernel 抽到 `Projects/shared/contracts/kernel/`，semver、vendored/pinned、**never a live service or shared database**；內容**恰好三項**：thin refs 7 個、`epistemic_type` enum、R0-R4 risk tier | 本 ADR **不重述** kernel 抽取。且注意其明確排除：`authorship_state`／`locked`／`provenance_record` 複合物**不進 kernel**，屬產品層延伸；**計費 substrate 不進 kernel** |
| **ADR-0009** | Tenant/Organization 模型調和（AI LEGO ADR-003 三層 Tenant 為平台原語；portal `organizations` 是 adapter） | 租戶模型歸該 ADR，本 ADR 不碰 |
| **ADR-0002** | 控制面是 `organization_product_subscriptions` 的唯一 `service_role` writer；**禁止跨產品直接查詢／join／view／`postgres_fdw`** | 共用帳本**不得被各產品直讀**。只能簽章驗證 |
| **ADR-0031** | 每次跨產品執行攜帶簽章 `entitlement_ref`；驗證只驗簽章/到期/`product_key`/租戶符合，**永不直讀對方資料表**。**明確不授權**：選定金流商、建立完整 Product/Plan/Feature/Entitlement/Limit engine | 見下方「前提變更」 |

### ADR-0031 的延後前提已不成立（必須明寫，不得假裝不存在）

ADR-0031 把「完整 entitlement engine」列為**不授權**，理由原文為 *「correctly deferred, no real Enterprise prospect yet」*——那是一個**商業狀態假設**。

2026-09-10 操作者明示：video／System Foundry／SEO writing／cold email **全部**要能獨立串接、自用、開放訂閱或點數、賣人。該假設已不成立。

本 ADR 因此**只解除「最小共用 substrate」這一段的延後**，並**維持 ADR-0031 其餘不授權事項不變**（金流商選定仍 open；跨產品直讀仍禁止；本 ADR 不授權任何真實金流上線）。

## 決策

### 1. 上限分三類，不可互換

判準是「**提高這個上限，風險落在誰身上**」：

| 類型 | 風險落在 | 能否用錢解除 | 例 |
|---|---|---|---|
| `QUOTA` | 你自己的帳單 | ✅ 加購即解 | 每月算圖張數、文章篇數、KB 查詢次數 |
| `RATE_LIMIT` | **外部共用資源** | ❌ 只能靠證明容量/信譽 | 目標站抓取禮貌預算、寄件網域信譽、供應商 API 配額 |
| `SAFETY_GATE` | **第三方的權利** | ❌ 只能靠資格審核 | HCI Continuous Monitoring（`06:263`，防止對非同意私人的隱密跟監） |

**紅線**：`SAFETY_GATE` **永不得**實作為可加購的 quota。把它併進點數 = **加購點數即解鎖跟監能力**。任何把 `SAFETY_GATE` 轉為 `QUOTA` 的變更需新 ADR + 明示批准。

`RATE_LIMIT` 統一涵蓋[資料蒐集計畫](../../data-collection/DATA_COLLECTION_PLAN.md)的跨 run 禮貌預算——同一類事（保護外部共用資源），不再當成兩個概念設計。

### 2. 帳本共用，meter 各異；流量與存量並存

- **共用**：訂閱狀態機、點數帳本、分錄型別、冪等鍵、簽章授權驗證、金流抽象。
- **不共用**：一個「單位」的定義。每個產品在自己的 meter 定義裡宣告。
- **兩種計量形狀必須都支援**：
  - **flow（事件流）**：一次算圖／一篇文章／一封信／一次查詢／一次調查。0066 現行形狀。
  - **stock（存量）**：KB 的 GB-月。**事件流帳本表達不了存量**，需週期性計提分錄。
- 每個 meter 宣告：`{product_key, meter_key, unit, shape: flow|stock, limit_kind: QUOTA|RATE_LIMIT|SAFETY_GATE}`。

### 3. 帳本形狀：泛化 0066，不重寫

0066 已經把難的部分做對了（冪等鍵 unique、四種分錄、`ON DELETE RESTRICT` 拒絕級聯抹除計費史）。**泛化，不重建**：`media_billing_accounts`／`media_credit_ledger` → 加 `product_key`，去 `media_` 前綴。

**遷移必須 expand-contract**（System Foundry `kernel/11` 明令「長壽系統必須優先 additive/expand-contract，禁止 flag-day」）：加可為 null 的 `product_key` → 回填 `'media'` → 設 NOT NULL → 雙寫 → 切讀 → 收舊路徑。**這張表正在對真實 video 用量計費，不是改個名字。**

### 4. 資料流：控制面擁有帳本，產品不得直讀

服從 ADR-0002／0031：

```
控制面（portal / lobster-factory）
  ├─ 唯一 service_role writer of 訂閱表 + 點數帳本
  ├─ mint 簽章 entitlement_ref（含 product_key、tenant、到期）
  └─ 接收產品回報的「簽章用量記錄」→ 寫帳本
產品（video / KB / SEO / cold email / HCI / Cognitive OS / Foundry）
  ├─ 驗證 entitlement_ref 的簽章/到期/product_key/租戶（對照控制面公鑰）
  ├─ 永不查詢控制面資料表
  └─ 執行後回報簽章用量記錄（非直接寫帳本）
```

用量回報是**簽章記錄**而非資料庫寫入，是 ADR-0002 邊界的必然結果，不是額外設計。

### 5. 產品登記表是機械閘，不是清單

`lib/portal/products.ts` 升格為**單一產品登記處**，每個可販售產品一列，宣告：`product_key`、對外網域、狀態、meters[]、所依賴的共用層版本。

**新增 `scripts/verify-product-registry.ps1` 並納入 `scripts/verify-build-gates.ps1`**，機械驗證：

1. 每個有計費表列的 `product_key` 都在登記表中（今日 video 即違反）；
2. 每個登記產品的 meters 皆宣告 `limit_kind`；
3. 沒有任何 `SAFETY_GATE` 被宣告成可加購；
4. 每個產品宣告的 kernel 版本在相容視窗內（見決策 6）。

**理由**：清單是散文，`verify-adr-index.ps1` 會擋、清單不會。第 9 個產品必須被機械擋下，而非靠人記得。

### 6. 跨產品版本相容用既有生命週期契約，不新發明

kernel 是 vendored/pinned（ADR-0013），必然出現版本歪斜：產品 A 在 1.2、產品 B 在 1.4，「同一個 `epistemic_type`」就不再是同一個。ADR-0013 的 CI 契約測試只驗**單一產品對 kernel** 的映射，未驗**跨產品執行期**相容。

補上的部分**直接採用 System Foundry `kernel/11_LIFECYCLE_AND_DEPRECATION_CONTRACT.md`**：`PROPOSED → ACTIVE → DEPRECATED → RETIRING → RETIRED`；棄用須定義替代品、相容視窗、受影響消費者、證明用量的遙測、遷移配方、溝通計畫、回滾、移除判準、證據保留。相容視窗由決策 5 的機械閘強制。

### 7. 共用能力 SSOT 登記表

沒有單一系統最完整；共用層是**按能力挑最佳來源組裝**——ADR-0013 與 `epistemic-label.schema.yaml` 都是這樣做的。

| 共用能力 | SSOT | 狀態 |
|---|---|---|
| 模組契約（擁有權/失敗隔離/替換策略） | System Foundry `kernel/06_MODULARITY_CONTRACT.md` | 通用，**採用** |
| 生命週期／棄用／相容視窗 | System Foundry `kernel/11` | 通用，**採用**（決策 6） |
| 30 年演進（穩定 vs 可換資產） | System Foundry `kernel/07` | 通用，**採用** |
| 產業包 / registry / 規則引擎形狀 | System Foundry `industries/` | 已借入 KB（ADR 011 §決策 17） |
| `epistemic_type` enum | `specs/governance/epistemic-label.schema.yaml`（ADR-004） | canonical；**kernel 只 re-export 這一個 enum** |
| `authorship_state` / `locked` / `provenance_record` | 同一 schema 檔 | canonical，但 **ADR-0013 明訂不進 kernel**，屬產品層延伸 |
| R0-R4 風險階梯 | `specs/execution/risk-tier.schema.yaml`（ADR-004） | canonical |
| 方法/元件契約形狀 | Cognitive OS `methods/contracts/*.yaml` | 已借入 KB（ADR 011 §決策 24） |
| 重播 / `REPLAY_UNAVAILABLE` | Cognitive OS 執行契約 | 已借入 KB（ADR 011 §決策 23） |
| 耐久編排 | Trigger.dev（agency-os ADR 004） | canonical |
| **點數帳本（唯一能跑的）** | `0066_media_billing_*` | **需泛化**（決策 3） |
| **跨產品授權驗證** | ADR-0031 的簽章 `entitlement_ref` | 設計完成，**未建** |
| **金流抽象（唯一一份）** | `ziwei-doushu/lib/payments/gateway.ts` | stub，**需上移**；金流商選定仍 open |
| 租戶模型 | ADR-0009 | 已決，未建 |
| thin refs 7 型別 | ADR-0013 | 已決，Wave 3 |
| **模型/prompt registry + drift 監控** | — | **缺口**：`09:94` 明寫「build **one**, not two」，目前**一個都沒有**，而 video/SEO/cold email/客服全在呼叫 LLM |
| **LLM 成本記帳全覆蓋** | `ai_call_logs`（0043） | 存在；**尚未確認**是否所有 LLM 路徑都寫入 |

### 8. 抽取順序（風險遞增，不可顛倒）

1. **契約層**（thin refs／`epistemic_type`／risk tier）— 純型別，零執行期風險。依 ADR-0013，Wave 3。
2. **產品登記表 + 機械閘** — 只讀不寫，先讓現況的違反可見（video 不在清單上）。
3. **授權驗證**（`entitlement_ref` mint/verify）— 新增路徑，不動既有資料。
4. **帳本泛化** — **最後**，expand-contract，碰真實計費。

## 後果

### 正面

- 第 9 個產品上架時，機械閘會擋下「沒接共用層」的情況，不靠人記得。
- `SAFETY_GATE` 不可購買寫成紅線，避免「加購即解鎖跟監」這類不可逆的產品錯誤。
- 帳本泛化而非重寫，保留 0066 已驗證的冪等與級聯保護。
- 共用層按能力指定 SSOT，與 ADR-0013／ADR-004 的既有作法一致，不引入第三種組法。

### 負面／代價

- 帳本遷移動到正在計費的表，即使 expand-contract 也需要雙寫期與切讀驗證。
- 產品登記機械閘上線當天會**立刻變紅**（video 有計費列但不在清單上）——這是刻意的：讓既有違反可見，而非靜默容忍。
- kernel pinned 造成的版本歪斜需要持續維護相容視窗，成本不會歸零。

### 需跟進文件／腳本

- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts`（升格為單一產品登記處）
- `scripts/verify-product-registry.ps1`（新增）＋ `scripts/verify-build-gates.ps1`（納入）
- `lobster-factory/packages/db/migrations/`（帳本泛化 migration + down）
- `agency-os/docs/architecture/decisions/ADR_INDEX.md`（本 ADR 入表；`verify-adr-index.ps1` 機械強制）

## 明確不在本 ADR 範圍（避免與既有決策打架）

- **kernel 抽取本身** → ADR-0013（本 ADR 不重述、不修改其三項範圍）
- **Tenant/Organization 模型** → ADR-0009
- **跨產品資料庫邊界** → ADR-0002
- **金流商選定與真實金流上線** → 仍 open；ADR-0031 明列不授權，本 ADR 維持
- **HCI 的 Continuous Monitoring 資格政策內容** → HCI `06:263`；本 ADR 只規定它是 `SAFETY_GATE`、不可購買

## Related

- agency-os ADR 004（Trigger.dev 編排）、ADR 011（蒐集/KB 邊界）
- HCI ADR-0002、ADR-0009、ADR-0013、ADR-0031、ADR-004
- System Foundry `kernel/06`、`kernel/07`、`kernel/11`
