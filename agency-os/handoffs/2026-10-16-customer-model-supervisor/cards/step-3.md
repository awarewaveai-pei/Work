# 第 3 項：每個收費點只問 `can(主體, feature_key, actor)`；認知平台接同一個判斷

**風險** Medium　**模型** Opus 5.5　**前置** 第 2 項　**正本** ADR 017 §4、順序 3

## Decision
- `lib/entitlements/can.ts`：`can(subject, featureKey, actor) → { allowed, limits, maxSpend, report(usage) }`。線上：功能 `billing: contract` 驗許可（第 2 步 `permit.ts`），沒有 active 權利列 → `allowed:false`、`reason: "no_entitlement"`；功能 `billing: credits` 查錢包餘額（經 `lib/entitlements/ledger.ts`），餘額 ≥ 最低扣點才 `allowed`，`maxSpend` = min(餘額, 單次上限)，不足 → `reason: "no_credits"`（Codex C1）。`actor` 只進稽核與用量，不影響 `allowed`。
- `withFeature("<feature_key>", handler)`：收費 API 路由的唯一包裝，先 `can()` 再呼叫 handler，並把「路由→功能」登記進 `lib/entitlements/route-features.ts` 的程式內表（第 6 步 scope 檢查查它；Codex M20）。
- `lib/ai/gateway.ts` 每次呼叫前必帶 grant；沒有 grant 拋 `EntitlementRequired`（型別強制：參數不可省）。
- 代操授權：員工替組織 X 操作時，`on_behalf_of = X` 只在該員工對 X 有角色（`lib/social/authz.ts` 的成員列或 `ops_role` owner/admin）時簽發；否則 403 `not_authorized_for_org`。`actorOf()` 加 `orgId`（從路由 `[slug]` 或品牌 id 解析）。
- **影子模式（操作者 2026-10-19）**：`ENTITLEMENT_MODE` = `shadow`（預設）｜`enforce`。shadow 照算判決、拒絕時寫 `entitlement.would_deny` 稽核但回 allowed，基礎設施錯誤（表缺、金鑰缺、DB 斷）log 後放行不丟例外；enforce fail-closed。翻 enforce 是 High（需操作者 go；前置＝0110 與簽章金鑰已套 prod、internal 與現有客戶 comp／trial 權利已 seed）。詳 ADR 017 §4。
- 呼叫端清單（grep `gateway`／`replicate`／`fal` 的呼叫檔，第 1 步 features 的來源）：社群 AI 改寫、影片管線、塔羅生圖、文章產生、客服 AI 回覆、蒐集器 AI 摘要、Content Studio。每個收費按鈕前一次 `can()`，畫面用一份簽章的「此帳戶能用的功能」灰掉沒買的按鈕（快取 5 分鐘）。
- 認知平台：`Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py` 改成 `can()` 薄接頭（加 `actor`、回 grant 物件）；`ai_lego/apps/api/main.py` 9 處呼叫端同 commit 改；`ai_lego/platform/ai_execution/gateway.py` 呼叫端必帶 grant。HCI 照 ADR-0031 四道閘位置，欄位用本 ADR §3。

## Files
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts`、`__tests__/can.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gateway.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/authz.ts`（`actorOf` 加 orgId）
- 各呼叫端檔（清單在 PR 描述逐一列出）
- `Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py`、`ai_lego/apps/api/main.py`、`ai_lego/platform/ai_execution/gateway.py`

## Acceptance
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run lib/entitlements lib/social lib/ai
```
→ 綠；影子模式測試：`a refusing verdict still allows the call and writes entitlement.would_deny`、`a missing table still allows the call (enforce refuses the same case)`、`an unset ENTITLEMENT_MODE is shadow; only the exact word enforce enforces`；測試名含 `a credits feature is allowed by wallet balance without an entitlement row and refused at zero balance`、`a credits permit carries source=credits, no entitlement_id and max_spend = min(balance, cap)`、`a staff actor acting for a customer org debits that org and the audit row names the staff user`、`a staff actor without a role on the org is refused`、`no active entitlement means allowed=false with reason no_entitlement`、`gateway refuses a call without a grant`。
```bash
cd D:/Work/Projects/internal/cognitive-engineering-os && python scripts/affected_tests.py --run
```
→ 綠；含 `check_entitlement` 新簽章的測試。
突變（各一次，守衛類）：拔掉「員工對 X 有角色」檢查 → 指名測試紅；拔掉 gateway 的 grant 參數檢查 → 紅；還原綠。
真實：本機 staging 用客戶帳號（第 1 步示範產品）按一個收費按鈕 → 無權利列時畫面灰、API 回 403 `{"code":"no_entitlement"}`；手動 insert 一列 active 權利 → 按鈕可用、帳本多一筆 debit、`actor` 欄＝該使用者。

## Rollback
`git revert`；`can()` 預設 fail-closed，revert 後回到第 2 步狀態（入口已收斂、尚未判斷）。

## 收尾：翻 enforce 前（2026-10-23 加；監工台 NEXT ①）
- 證據：prod 7 天 `entitlement.would_deny` 231 筆＝internal `tarot.image` 221、`tarot.prompt` 9（`no_credits`）＋客戶 `social.dispatch` 1（`no_entitlement`）；`plans`／`organization_entitlements`／`media_credit_ledger` 皆 0 列（2026-10-23 psql 唯讀）。
- 根因：`can.ts:40-45` credits 功能只看錢包，不看權利列 → 自用（comp）與代操（contract）無法用在 credits 功能，違反 ADR 017 §0「錢的軸屬於帳戶×產品×功能」。
- Decision：`issuePermit` credits 分支先 `findActiveEntitlement`；有 active 列 → 用列（`source` comp／contract，`max_spend` null，`report()` 因 `source≠credits` 不扣點，`can.ts:115`，用量仍記 `entitlement.usage`）；無列才看錢包。0110 `source`／`feature_key` 無 billing 限制，不改 schema。原 gate「點數功能看餘額不看權利列」改為「無權利列時看餘額」。
- 段 1（已做，影子模式下行為不變）：上列 Decision；`can.ts` `issuePermit`、`__tests__/{can,permit,features}.test.ts`。
- 段 2（已做，操作者 2026-10-23 同意）：internal 的 comp 列不手登，由登記表算出、每日 `/api/internal/entitlements/expire`（Trigger `entitlements-expire`，`0 1 * * *` UTC）補齊；`0117_entitlement_internal_comp` 已套 prod（部分唯一索引限 `source_ref='internal'`＋`entitlement_ensure_internal_comp`）。部署不會套 migration（`sg-deploy.sh` 的 migration 閘只擋），所以先套 prod、再推程式。
- 客戶 5 家的列：照實際合約，操作者提供，不從程式推。
- Acceptance：`npx vitest run lib/entitlements` 綠，含 `a credits feature uses an active comp or contract row before the wallet` 與 `a credits feature without a row still needs balance`；突變：拿掉列優先 → 前者紅，還原綠。段 2 另跑 migration 的 local-verify（真 Postgres：重跑 0 新增、down 後可重套）。prod：段 2 上線後連續 7 天 `would_deny` = 0（或逐筆解釋）→ 才提翻 `ENTITLEMENT_MODE=enforce`（High）。
- Rollback：段 1 `git revert`；段 2 列改 `status='expired'`（不刪，保稽核）＋ migration down。
