# ADR-016: Zero Trust Workload Identity & Policy Decision Point Selection (Partial — IdP Provider Excluded)

Status: ACCEPTED（Sub-decisions b、c 適用；Sub-decision a **明確不批准**，維持 PROPOSED，保留給操作者）
Date: 2026-08-30
Related: `docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md`（Status 維持 PROPOSED，本 ADR 批准其 §1/§3 rows 2-3，明確排除 row 1）、ADR-015（姊妹 ADR，同一份來源文件的 Gap 2 Supply Chain，全數批准，可對照本 ADR 為何唯獨此處保留一項不批准）、ADR-004（Cedar principal/action/resource/context 對應到本專案已批准的 R0-R4/A0-A4 詞彙）

## Context

`.ai/research/phase-1/GAP_REGISTER.yaml` `P1-GAP-SEC-1`（severity: high，L190-197）：Master Plan 的 `Identity → Workload Identity → Mutual Authentication → Short-lived Credentials → Policy Decision → Resource Access` 流程圖（`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2668`）只有階段名稱，無 IdP/OIDC provider、無 workload identity 標準、無 Policy Decision Point 引擎名稱。

`ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md` §1/§3 rows 1-3 已完成 3 項推薦：IdP=WorkOS、workload identity=雲端原生 mTLS 先行（延後 SPIFFE）、PDP=Cedar。**本 ADR 逐項檢視後，只批准後兩項**——見 Decision Driver 1 的判準。

## Decision Drivers

1. **與姊妹 ADR-015 相同的供應商支出判準，但此處產生相反結論的一項**：IdP/OIDC provider（row 1）是本次任務唯一真正涉及新增供應商付費承諾的選型——WorkOS 是新的 managed SaaS，依 SSO connection/SCIM directory 數計費，來源文件自己的風險分析（§4 risk 1）明確建議「先拿多年期真實報價再定案」。這正是 `agency-os/AGENTS.md` R0 明文列出的停止條件之一：「取捨影響產品方向」——即使在一般性「你決定」委任下，這類決策仍應停止並回報，不應單方面拍板。Workload identity（row 2）與 PDP engine（row 3）性質不同：row 2 的建議是**不**採用任何新供應商（延後 SPIFFE，改用雲端原生機制），row 3 的 Cedar 是 Apache-2.0 免費 OSS——兩者都沒有新增供應商鎖定或持續帳單，落在 ADR-015 已確立的可拍板類別。
2. **延後 SPIFFE 的決策本身必須附具體、可檢查的重新評估條件，而非開放式「以後」**——同 ADR-015 Decision Driver 4 對 SLSA L3 的處理邏輯；來源文件 §4 risk 2 已自行提出兩個具體觸發條件（服務數門檻、首個跨租戶 agent 委派情境），本 ADR 直接沿用，不發明新條件也不放任其停留在文字警示層級。
3. **Cedar 的 principal/action/resource/context 模型與本專案已批准的 R0-R4/A0-A4 詞彙（ADR-004）高度吻合**，且形式驗證+可讀性對本專案「需要被法遵、操作者本人稽核」這個真實需求是精確對應，非過度延伸。

## Sub-decision (a): IdP / OIDC Provider — **明確不批准**

**NOT RATIFIED.** 維持 `TBD_PENDING_OPERATOR_VENDOR_DECISION`。來源文件推薦 WorkOS（managed），理由具體且有據（多租戶原生模型 + 內建 AI Agent Registration 直接對應 A0-A4 情境）——但這是一個真實的新增持續性供應商支出+多年期鎖定風險決策，不是「重讀既有文件找出已隱含答案」的架構內部判斷。需要操作者本人完成：(1) 取得 WorkOS 真實多年期報價；(2) 在「付費上managed IdP」與「自架 Zitadel/Keycloak 承擔永久維運負擔」之間做 build-vs-buy 抉擇——這是本專案 30 年營運週期的真實取捨，理應由操作者裁決，非 Claude 在通用委任下自行拍板。

## Sub-decision (b): Workload Identity 標準

**ACCEPTED** — 先用雲端原生 workload identity + 短期憑證 mTLS，非一開始就上完整 SPIFFE/SPIRE。SPIFFE 延後附兩個具體重新評估觸發條件（服務數超過操作性設定的門檻 N；或出現第一個跨租戶 AI agent 委派情境），非開放式「以後再說」。理由：SPIRE 控制平面建置成本與現有團隊規模不成比例，多篇 2026 年來源指出多數團隊負擔不起把 SPIFFE 做對；雲端原生 mTLS 已滿足流程圖的 Mutual Authentication + Short-lived Credentials 兩階段。

## Sub-decision (c): Policy Decision Point 引擎

**ACCEPTED** — Cedar，非 OPA/Rego。理由：AWS 2023-05 開源（Apache 2.0）、已做形式驗證、principal/action/resource/context 模型直接對應本專案 R0-R4/A0-A4 詞彙（ADR-004），可讀性對本專案「非工程角色需能稽核」的真實需求是精確吻合。範圍限制明確揭露：Cedar 較窄（純授權，非泛用 policy-as-code），若未來需要 policy 順便做資料轉換，OPA/Rego 應**疊加**而非取代 Cedar。

## Method Used

同姊妹 ADR-015 的供應商支出判準，應用於同一來源文件的 Gap 1，產生相反結論的一項（row 1 不批准）——這正說明該判準不是一刀切的「本次任務可以拍板廠商選型」或「一律不行」，而是逐項依實際財務/鎖定風險判斷，方法本身在兩份 ADR 間保持一致，只是輸入條件不同導致結論不同。

## Recommendation

1. 建置 `policies/security/zero-trust.policy.yaml`：`workload_identity`、`pdp_engine` 完整落實 Sub-decisions (b)(c)；`idp_provider` 明確保留 `TBD_PENDING_OPERATOR_VENDOR_DECISION` 佔位符 + 完整背景資訊（推薦候選、保留理由、自架替代方案），`status: PROVISIONAL`（非 `ACTIVE`，因仍有一個必要欄位真實阻塞）。
2. 建置對應 golden test fixture `tests/contracts/policies/security/zero-trust.fixtures.yaml`，含一則「idp_provider 被靜默拍板為真實廠商名稱」的 invalid case，確保這個保留決策本身是機器可驗證的，不只是文件描述。
3. `docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md` 檔頭與 §7「下一步」更新，反映 Gap 1 部分批准（2/3）。
4. `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md` §2.9 `security/` 列狀態更新。
5. `.ai/research/phase-1/GAP_REGISTER.yaml` `P1-GAP-SEC-1` 標記為部分解決（2/3 子項），IdP 子項明確保持開放。
6. `docs/adr/ADR_INDEX.md` 新增本 ADR 條目，誠實揭露其為部分批准。

## Consequences

- **Positive**：`P1-GAP-SEC-1` 的 3 個子缺口中 2 個獲得機讀 policy 落實；唯一保留給操作者的一項（IdP）有清楚、可稽核的保留理由與待辦，不是靜默省略也不是被隨手拍板。
- **Negative**：無——`idp_provider` 保持阻塞不影響 `workload_identity`/`pdp_engine` 的獨立生效（schema 層面兩者互不依賴）。
- **尚未解決的 follow-up（本 ADR 明確不處理，且不應由 Claude 處理）**：`idp_provider` 的最終選型，需操作者本人取得真實報價並做 build-vs-buy 決策。

## Migration / Rollback

- **Migration**：零成本——文件與機讀 policy 建置，無既有 runtime 資料依賴此檔案；`idp_provider` 阻塞狀態不影響任何其他檔案。
- **Rollback**：`git revert` 可完整回退；回退後 `P1-GAP-SEC-1` 重新回到全數 SKELETON_ONLY 狀態。

## Evidence

- `docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md`（全文，§1.1-1.3、§3 rows 1-3、§4 risks 1/2/3、§5 引用來源含信心水準揭露）
- `.ai/research/phase-1/GAP_REGISTER.yaml`（`P1-GAP-SEC-1`，L190-197）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`（L2668，流程圖原文）
- `agency-os/AGENTS.md`（R0「遇到以下情況立即停止並回報，不得硬做：...取捨影響產品方向」條款原文，本 ADR Sub-decision (a) 的保留依據）
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md`（R0-R4/A0-A4 詞彙，Cedar 選型的對應依據）
- `policies/ai-execution/mandatory-gates.yaml`（`gate_ref: TBD_PENDING_ROUND2_ADR` 佔位符先例，本 ADR `idp_provider.status` 沿用同一技巧）

**邊界確認**：本 ADR 僅批准 `ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md` §3 rows 2-3（workload identity、PDP engine），明確不批准 row 1（IdP/OIDC provider）——該項連同其完整背景資訊保留在 `zero-trust.policy.yaml` 中，等待操作者本人裁決。來源文件本身 Status 維持 PROPOSED。
