# System Foundry v1.7 — 從「選對積木」到「Claude 能開工」＋每個系統自帶監工台

審核 2026-10-18（操作者：「選擇選項送出後，可以出完美文件讓 Claude 開始開工？會產生連動的監工台？」）。結論：**選擇正確、產出不能開工、沒有監工台。** 選擇引擎留，產出層重做。

## 實測（`generated/`、`scripts/foundry_generate.py`）

| 項 | 事實 | 證據 |
|---|---|---|
| 產生器能跑 | 263 題全答 → 0.3 秒、180 檔（173 md）、7 模組 | 2026-10-18 `foundry_generate.py --input <全答> --out $TEMP/sf-audit/out-*` |
| 藍圖 74 節＝3 種內容 | 62 節同一段樣板（Purpose／Current Truth／Target Truth／Evidence／Decisions／Risks／Exact Paths 全同） | `docs/blueprint/04_MARKET_AND_INDUSTRY_RESEARCH.md` 與 `08_DOMAIN_MODEL.md` 逐段相同；md5 分組 74→3 |
| 模組 backlog 不可執行 | 每模組固定 2 條：`TASK-<M>-001 Establish module boundary`、`-002 Prove integration`；Exact path＝`implementation/<m>` 或「architecture 選的路徑」；無指令、無測試名、無預期輸出 | `generated/sample-commerce-os/docs/modules/customer_service/08_IMPLEMENTATION_BACKLOG.md:20-35` |
| 程式骨架＝README | `packages/<m>/README.md` 一檔，`SCAFFOLDED` | `generated/sample-commerce-os/packages/customer-service/README.md` |
| 能力定義無驗收 | CAP 只有 id／name／module／requires／description | `capabilities/catalog.json`（`CAP-TICKETING`） |
| 模組 manifest 有實料 | invariants／security／test／operational／recovery obligations | `docs/modules/<m>/MODULE_MANIFEST.json` 13 欄 |
| 範例 intake 過期 | sample 181 答 vs 問卷 263 題 → 產生器 fail closed（`active question unanswered`） | `generated/sample-commerce-os/.foundry/intake/answers.json` |
| 監工台 | 無；`.foundry/handoffs/` 空 | `generated/*/.foundry/handoffs/` |
| 與 AwareWave 接軌 | 無登記列、無 `new-product.mjs`、無「AwareWave 積木」節（ADR 017 §0b 第 7–8 條已定義，未建） | `questionnaires/catalog.json` categories 無 `AW` |
| 產業包 | 只有 `construction-mep` | `industries/` |

## 判定

- **留**：問卷 263 題、規則引擎、能力閉包、模組投影、`make verify` 的選擇正確性證明（真正的資產）。
- **刪**：74 節樣板藍圖（62 節重複＝純 token 浪費，違反 AGENTS §9「事實密度優先」）、9 份模組文件裡重複的能力清單、`packages/*/README.md` 空殼。
- **補**：每模組一張可執行卡、每專案一個監工台、與 `products.ts`／`new-product.mjs` 的接軌、範例 intake 自動重生。

## 目標產出（一個專案資料夾）

```
<project>/
  .foundry/resolution/foundry-plan.json     機器真相（不變）
  PLAN.md                                   一頁：選了什麼、為什麼、73 節適用表（一行一節）、交付登記（五答）
  cards/<module>.md                         每模組一張：Decision／Files／指令→預期／突變／Rollback（格式同 agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/）
  supervisor/{data.mjs,build.mjs,check.mjs,supervisor.html}   監工台：STEPS＝cards、RULES＝foundation 18 條、OPEN＝UNRESOLVED 決策
  modules/<m>/MODULE_MANIFEST.json          十項宣告（kernel/06），obligations 照抄現有 manifest
```

## 卡（照序做；每張 Low 除非註明）

### V17-1 樣板瘦身
- 刪 `docs/blueprint/*`（74 檔）與 `docs/modules/<m>/00–07`；適用性改成 `PLAN.md` 一張表（section id、ACTIVE／NA、原因 rule id）。
- 改 `scripts/foundry_generate.py` `write_blueprint*`／`write_module_docs`；`EXPECTED_BLUEPRINT_COUNT` 改為表列數檢查；`validate_artifact_generation.py` 同步。
- 驗收：全答產生 → 檔數 ≤ 40；`make verify` 綠；`PLAN.md` 含 73 列。

### V17-2 每模組一張可執行卡
- `capabilities/catalog.json` 每個 CAP 加 `acceptance: [{test, expect}]`（一句測試名＋預期），缺者產卡時寫 `TODO` 並讓 `make verify` 列出缺數（不擋，先可見）。
- `generation/card-template.md`＝與 agency-os 卡同格式；`write_cards()` 從 manifest obligations＋CAP acceptance 填。
- 驗收：`cards/customer_service.md` 含 ≥1 條非 TODO 的「指令→預期」；突變：拔掉一個 CAP 的 acceptance → 卡出現 TODO、verify 計數 +1。

### V17-3 監工台套件共用
- 把 `agency-os/handoffs/2026-10-16-customer-model-supervisor/{build,check}.mjs` 抽成 `scripts/supervisor-kit/{build,check}.mjs`（data 格式不變；兩個現有監工台改 import 它，行為不變，閘仍綠）。
- `foundry_generate.py` 寫 `supervisor/data.mjs`：STEPS＝cards（status 全 not_started、card 路徑）、RULES＝foundation 18 條（白話一句）、OPEN＝`UNRESOLVED` 決策（技術棧、供應商）、PRIORITY＝模組依賴拓樸順序。
- 驗收：`node supervisor/build.mjs && node supervisor/check.mjs` 綠；改 `foundry-plan.json` 少一個模組 → check 紅（plan ↔ data 綁定）。

### V17-4 接軌 AwareWave（ADR 017 §0b 第 7–8 條）
- `scripts/sync-foundry-catalog.mjs`（順序 1）生成問卷節 `AW`；`PLAN.md` 末節「交付登記」＝SOP §18 五答＋`modules[]`。
- `new-product.mjs --from-foundry` 讀 `PLAN.md` 交付登記與 `cards/`。
- 驗收：勾 `Q-AW-SOCIAL` → `modules[]` 含 social 與其 `dependsOn`；`new-product.mjs --from-foundry` 產出的 manifest 十項 ≥ 6 非 TODO。

### V17-5 範例 intake 自動重生
- `make verify` 加 `regenerate-samples`：從現行問卷用固定答案組（ALL-NO、ALL-YES、mini）重生 `generated/sample-*`，過期即紅。
- 驗收：改一題 id → verify 紅；重生 → 綠。

### V17-6 新題
- `Q-DEPLOY-001`「裝在客戶自己的主機」（self_hosted；ADR 017 §0 三軸 A）；規則：要 → `CAP-OFFLINE-UPDATE`（requires `FOUND-RELEASE`：簽章版本包、離線套用、失敗回上一版）。不帶 `CAP-LICENSE`：它 requires `CAP-COMMERCIAL`，`test_payment_commercial_gating.py` 禁止未答收費就帶入收費能力（自家主機自用不需授權檔）；收費＋授權仍由 `Q-COM-006` 決定。

### V17-7 能力驗收補齊（V17-2 之後）
- `capabilities/catalog.json` 每個缺 `acceptance` 的能力補 1–2 條 `{test, expect}`：只依該能力的 `description`／`requires`，不寫技術棧字眼，不寫兩個能力共用的泛用句。依模組分批（每批 ≤10 模組），照卡寫死的格式可派 `data-filler`；每批跑 `make verify`。
- 進度＝`python scripts/report_acceptance_gap.py` 的缺數（監工台每次 build 現算）。
- 驗收：缺數 0；監工台 check 在缺數 > 0 時拒絕把本卡標 done。

### V17-8 產品 manifest 補齊（V17-4 之後）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/<key>/MODULE_MANIFEST.json`，每個登記產品一份；格式＝`lib/social/MODULE_MANIFEST.json`＋`services`／`env`（客戶怎麼來 `cards/step-5.md:6`）；十項宣告逐項附 `file:line`；服務與 env 依 ADR 017 §5 盤點表。交付客戶怎麼來 `cards/step-8.md:10`（manifest 無 TODO）與 step-5 的 manifest 部分。
- 「完整」只有一個定義：`scripts/product-manifests.mjs` `manifestStatus()`（十項無 TODO、`services` 非空且每個 service 存在於其 compose 檔、`env` 為字串陣列）。
- 驗收：`manifestStatus()` 全部 ok；收尾加一個測試斷言全部 ok；監工台 check 在未全部 ok 時拒絕把本卡標 done。

## 不做
- 不產程式碼（技術棧未定前產碼＝猜）；骨架由 `new-product.mjs` 在 AwareWave 的 stack 上產。
- 不自寫市場研究／競品章節（04–06 節）：沒有輸入就沒有內容，寫出來的是樣板。
- 不加第二個監工台格式；只有 `supervisor-kit` 一種。

## 追蹤
- 本檔＝v1.7 唯一計畫；狀態在 `agency-os/TASKS.md`「ADR 017 客戶怎麼買」條目與客戶怎麼來監工台「另有」列。
- 本計畫監工台（supervisor-kit）：`agency-os/handoffs/2026-10-18-foundry-v17-supervisor/`；卡號＝本檔 `### V17-n` 標題（`check.mjs` 綁定），狀態只在其 `data.mjs`。
