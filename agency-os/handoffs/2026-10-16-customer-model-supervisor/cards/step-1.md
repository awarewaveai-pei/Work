# 第 1 項：登記表補齊、每個工具目錄歸位、產生器、機械閘

**風險** Low　**模型** Opus 5.5　**前置** 無　**正本** ADR 017 順序 1、ADR 018 §2／§5

## Decision
- `lib/portal/products.ts` 加 `features[]`（`feature_key`、`name`、`limitKind: QUOTA|RATE_LIMIT|SAFETY_GATE`、`buyout: boolean`）與 `accessChannels: readonly ("ui"|"api")[]`。
- `app/(shell)/tools/` 現有 13 個目錄只有 `social` 有登記列。每個目錄歸位成「產品」或「員工門工具（非產品）」，預設如下，操作者可改：

| 目錄 | 歸位 | 登記 key |
|---|---|---|
| social | 產品 | social（已有） |
| video | 產品 | video（0066 `media_` 帳本的主人；ADR 012 §8 點名的違反） |
| tarot | 產品 | tarot |
| studio | 產品 | studio |
| canvas、designs、mockup、banner、vector-editor | 一個產品 | design（修圖／設計積木，同一組 Fabric 元件） |
| content、publish、events | 一個產品 | content |
| theme、ai-models | 員工門工具，非產品 | 列入 `STAFF_UTILITIES`，各附一句理由，且測試證明它們不 import 付費 SDK |

- `lib/cs/`（客服，`lib/cs/billing.ts` 已引用 `product_key`）登記 key `cs`，`door: { app: "next-admin", page: "/cs", api: ["/api/cs"] }`，subdomain `cs`。
- 產生器 `scripts/new-product.mjs`：問 SOP §18 五題 → 寫登記列、`app/<page>/{layout,page}.tsx` 骨架（複製 `app/social/` 的精簡版面）、`lib/<key>/can-points.ts`（一個呼叫 `can()` 的範例，第 4 步前先 throw「尚未接 can()」）、`lib/portal/__tests__/products.test.ts` 不用改（它讀登記表）。
- 子網域每個產品都保留（ADR 018 §2）；開不開是 `status`。
- 產生器同時寫 `lib/<key>/MODULE_MANIFEST.json`：System Foundry `kernel/06` 的十項宣告（state／behavior／API 與事件／不變量／依賴／失敗隔離／資料生命週期／可觀測／遷移回滾／替換策略），空欄用 `TODO` 字樣，`products.test.ts` 擋 `TODO` 進 `status: available` 的產品（ADR 017 §0b）。

## Files
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/doors.ts`（`RESERVED_SUBDOMAINS` 不動）
- `scripts/new-product.mjs`（新）
- `scripts/__tests__/new-product.test.mjs`（新；用 `$env:TEMP` 下的拋棄式 app 目錄跑，不碰 repo）

## 步驟
1. `git log --oneline -10 -- lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/`
2. 型別與欄位；三個現有產品補 `features: []`、`accessChannels: ["ui"]`。
3. 新增 video／tarot／studio／design／content／cs 六列，`status: "coming_soon"`、`selfSignup: false`、`loginSources: ["local"]`、`standalone` 依 ADR 017 §5 模組清單暫填 `false`，`features` 先填每個目錄裡實際呼叫付費 AI 的動作各一條（grep `lib/ai/claude-request.ts`、`replicate` 的呼叫端）。
4. 測試加三條：`every tool directory under app/(shell)/tools maps to a product page prefix or a listed staff utility`；`every feature declares a limit kind and no buyout module carries SAFETY_GATE`；`staff utilities import no paid SDK`（掃 `app/(shell)/tools/theme/**`、`ai-models/**` 的 import 字串）。
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
→ 印出建立的 4 個檔案路徑；再跑 `npx vitest run lib/portal` 綠；`git checkout -- lib/portal/products.ts && rm -r app/demo lib/demo` 還原。
突變：手動把 `app/(shell)/tools/tarot` 的登記列刪掉 → `npx vitest run lib/portal` 紅（反向登記）；還原綠。

## 完成後
`data.mjs` 的 `STEPS[0]` 改 `status: 'done'`、填 `commit`；`node build.mjs && node check.mjs`；重發同一網址。WORKLOG 四行證據。

## Rollback
`git revert <commit>`；無 migration、無環境變數。
