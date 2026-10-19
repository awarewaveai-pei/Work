# 第 1 項：登記表補齊、每個工具目錄歸位、產生器、機械閘

**風險** Low　**模型** Opus 5.5　**前置** 無　**正本** ADR 017 順序 1、ADR 018 §2／§5

## Decision
- `lib/portal/products.ts` 加 `features[]`（`feature_key`、`name`、`limitKind: QUOTA|RATE_LIMIT|SAFETY_GATE`、`buyout: boolean`）與 `accessChannels: readonly ("ui"|"api")[]`。
- `app/(shell)/tools/` 現有 14 個目錄只有 `social` 有登記列。每個目錄歸位成「產品」或「員工門工具（非產品）」，預設如下，操作者可改：

| 目錄 | 歸位 | 登記 key |
|---|---|---|
| social | 產品 | social（已有） |
| video | 產品 | video（0066 `media_` 帳本的主人；ADR 012 §8 點名的違反） |
| tarot | 產品 | tarot |
| studio | 產品 | studio |
| canvas、designs、mockup、banner、vector-editor | 一個產品 | design（修圖／設計積木，同一組 Fabric 元件） |
| content、publish、events | 一個產品 | content |
| theme、ai-models | 員工門工具，非產品 | 列入 `STAFF_UTILITIES`，各附一句理由，且測試證明它們不 import 付費 SDK |
| `ops/cs`＋`cs-widget`＋`ops/knowledge` | 產品（會給客戶用、叫付費 AI：`lib/cs/llm.ts`） | cs（door `/cs`、api `/api/cs`、subdomain `cs`） |
| `ops/collect` | 產品（蒐集器，會給客戶用） | collect（door `/collect`、api `/api/collect`、subdomain `collect`） |
| `outreach`（cold email） | 產品（行銷） | outreach（door `/outreach`、api `/api/outreach`、subdomain `outreach`） |
| `ops/clients、schedules、repairs、integrations、system-modes、approvals、backup、inbox、costs、onboarding、tools`、`build`、`ops-console`、`onboard`、`api-check*` | 後台（員工管 AwareWave 營運） | 列入 `BACK_OFFICE`，各附一句理由 |

- 住在 `/ops` 下的產品（cs、collect、outreach）**本步只補登記列**（`status: coming_soon`、子網域保留），路徑、資料表、API 前綴都不動；反向登記測試掃 `app/(shell)/tools/*`、`app/(shell)/ops/*`、`app/(shell)/*` 與 `app/<門前綴>`，每個目錄要在登記表或 `BACK_OFFICE` 清單之一。
- **從 /ops 開成產品門的固定配方**（之後每個產品都一樣，不在本步做）：①頁面抽成共用元件（照 `app/social/page.tsx` 與 `app/(shell)/tools/social/` 共用 `SocialApp` 的做法）；②加 `app/<key>/{layout,page}.tsx` 產品門路由渲染同一元件；③`status: available`＋DNS、nginx（High，要 go）。員工門舊路徑保留。
- 產生器 `scripts/new-product.mjs` 兩種用法：`--from-foundry <generated 專案目錄>`（讀 `.foundry/resolution/foundry-plan.json`、`docs/modules/<module>/00_REQUIREMENTS.md … 08_IMPLEMENTATION_BACKLOG.md` 與藍圖末節「交付登記」，十項宣告填進 manifest，只補問子網域與收費功能；目錄缺 `foundry-plan.json` 即拒絕）或直接問 SOP §18 五題 → 寫登記列、`app/<page>/{layout,page}.tsx` 骨架（複製 `app/social/` 的精簡版面）、`lib/<key>/can-points.ts`（一個呼叫 `can()` 的範例，第 3 步前先 throw「尚未接 can()」）、`lib/portal/__tests__/products.test.ts` 不用改（它讀登記表）。
- `lib/portal/doors.ts` `doorForHost`：未知 host 回 `{ kind: "none" }`，middleware 回 404；員工門只認 `STAFF_HOSTS`（逗號分隔，預設 `app.<base domain>`，開發環境加 `localhost`）；測試：偽造 Host → 404（ADR 018 §1，Codex M19）。
- 子網域每個產品都保留（ADR 018 §2）；開不開是 `status`。產生器不問、登記表不收「支援哪幾種方式」：五種全由共用層給（ADR 017 §0「產品不選方式」）；預設 `features[].buyout = true`（SAFETY_GATE 例外）、`modules.dependsOn = []`。測試：登記表型別不得出現這些確切欄位名：`audience`、`ways`、`supportedWays`、`channels`（`accessChannels` 允許）。
- `scripts/sync-foundry-catalog.mjs`（新）：讀 `products.ts`（經 `tsx` 載入）寫 `agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generation/awarewave-products.json`，並在 `questionnaires/catalog.json` 生成（或更新）一節 `AW` 「AwareWave 積木」：每產品一題 `Q-AW-<KEY>`（label＝產品名，description＝一句用途）、對應 `CAP-AW-<KEY>`、`rules/question-rules.json` 的依賴＝`dependsOn`；`--check` 模式只比對不寫，差異即 exit 1（ADR 017 §0b 第 7 條，操作者 2026-10-18「在 System Foundry 選擇項目組裝上去」）。SF 側 `make verify` 加 `node ../../../scripts/sync-foundry-catalog.mjs --check`。
- 產生器同時寫 `lib/<key>/MODULE_MANIFEST.json`：System Foundry `kernel/06` 的十項宣告（state／behavior／API 與事件／不變量／依賴／失敗隔離／資料生命週期／可觀測／遷移回滾／替換策略），空欄用 `TODO` 字樣，`products.test.ts` 擋 `TODO` 進 `status: available` 的產品（ADR 017 §0b）。

## Files
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts`（`RESERVED_SUBDOMAINS` 不動）
- `scripts/new-product.mjs`（新）
- `scripts/__tests__/new-product.test.mjs`（新；用 `$env:TEMP` 下的拋棄式 app 目錄跑，不碰 repo）

## 步驟
1. `git log --oneline -10 -- lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/`
2. 型別與欄位（含 `features[].billing: "contract" | "credits"`）；現有三列：social 的 `features` 從 `lib/social/` 實際付費動作盤點（AI 改寫、發文派送…）、cognitive 的 `features` 從 `ai_lego/apps/api/main.py` 9 個 `check_entitlement` 呼叫點的 capability id 盤點、hci 未開工可空；規則：`status: "available"` 的產品 `features` 不得為空（測試擋），`coming_soon` 可空（Codex 2026-10-18 M12）。
3. 新增 video／tarot／studio／design／content／cs 六列，`status: "coming_soon"`、`selfSignup: false`、`loginSources: ["local"]`、`standalone` 依 ADR 017 §5 模組清單暫填 `false`，`features` 先填每個目錄裡實際呼叫付費 AI 的動作各一條（grep `lib/ai/gateway.ts`、`replicate` 的呼叫端）。
4. 測試加三條：`every directory under app/(shell)/{tools,ops} and app/(shell)/* maps to a product or a listed back-office or staff utility`；`every feature declares a limit kind and no buyout module carries SAFETY_GATE`；`staff utilities import no paid SDK`（掃 `app/(shell)/tools/theme/**`、`ai-models/**` 的 import 字串）。
5. 寫產生器與其測試。
6. 跑驗收。

## Acceptance（指令 → 預期）
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run lib/portal
```
→ 全綠，含上面三條新測試名字。
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx tsc --noEmit -p .
```
→ exit 0。
```bash
cd D:/Work && node scripts/new-product.mjs --key demo --name 示範 --subdomain demo --page /demo --login local --standalone no --features "demo.run:QUOTA" --app lobster-factory/infra/hetzner-phase1-core/apps/next-admin
```
→ 印出建立的 5 個檔案路徑（含 `lib/demo/MODULE_MANIFEST.json`）；再跑 `npx vitest run lib/portal` 綠；
```bash
cd D:/Work && node scripts/new-product.mjs --from-foundry agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/generated/sample-commerce-os --key demo2 --subdomain demo2 --features "demo2.run:QUOTA" --app lobster-factory/infra/hetzner-phase1-core/apps/next-admin
```
→ manifest 十項從藍圖填入（非 TODO 的欄 ≥ 6），登記列 `modules.dependsOn` 來自 `foundry-plan.json` 的模組清單；對不存在的目錄 → exit 2 `no foundry-plan.json`；`git show HEAD:lib/portal/products.ts > lib/portal/products.ts && rm -r app/demo app/demo2 lib/demo lib/demo2` 還原（共享工作目錄不得用 `git checkout --`）。
```bash
cd D:/Work && node scripts/sync-foundry-catalog.mjs && node scripts/sync-foundry-catalog.mjs --check && cd agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE && python scripts/validate_configurator.py
```
→ 目錄檔寫出、`--check` exit 0、SF 驗證綠（`Q-AW-*` 每題有 YES 規則、`CAP-AW-*` 可達）；在 `products.ts` 改一個產品名再 `--check` → exit 1；還原。
突變：手動把 `app/(shell)/tools/tarot` 的登記列刪掉 → `npx vitest run lib/portal` 紅（反向登記）；還原綠。

## 完成後
`data.mjs` 的 `STEPS[0]` 改 `status: 'done'`、填 `commit`；`node build.mjs && node check.mjs`；重發同一網址。WORKLOG 四行證據。

## Rollback
`git revert <commit>`；無 migration、無環境變數。
