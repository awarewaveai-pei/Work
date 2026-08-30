# ADR-016: Zero Trust Workload Identity, Policy Decision Point & IdP Provider Selection

Status: ACCEPTED（全部 3 個 Sub-decision 皆已批准。Sub-decision b、c 於首次批准時即 ACCEPTED；Sub-decision a 首次批准時**明確不批准**——原文保留於下方，供稽核軌跡——2026-08-30 同日稍晚由**操作者本人於對話中直接明示決定**（自架，Zitadel 優於 Keycloak）後 UPDATED 為 ACCEPTED，非 Claude 自行拍板）
Date: 2026-08-30（首次批准與 Sub-decision a 更新皆為同日）
Related: `docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md`（Status 維持 PROPOSED，本 ADR 批准其 §1/§3 rows 1-3，全數）、ADR-015（姊妹 ADR，同一份來源文件的 Gap 2 Supply Chain，全數批准）、ADR-004（Cedar principal/action/resource/context 對應到本專案已批准的 R0-R4/A0-A4 詞彙）

## Context

`.ai/research/phase-1/GAP_REGISTER.yaml` `P1-GAP-SEC-1`（severity: high，L190-197）：Master Plan 的 `Identity → Workload Identity → Mutual Authentication → Short-lived Credentials → Policy Decision → Resource Access` 流程圖（`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2668`）只有階段名稱，無 IdP/OIDC provider、無 workload identity 標準、無 Policy Decision Point 引擎名稱。

`ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md` §1/§3 rows 1-3 已完成 3 項推薦：IdP=WorkOS、workload identity=雲端原生 mTLS 先行（延後 SPIFFE）、PDP=Cedar。**本 ADR 逐項檢視後，只批准後兩項**——見 Decision Driver 1 的判準。

## Decision Drivers

1. **與姊妹 ADR-015 相同的供應商支出判準，但此處產生相反結論的一項**：IdP/OIDC provider（row 1）是本次任務唯一真正涉及新增供應商付費承諾的選型——WorkOS 是新的 managed SaaS，依 SSO connection/SCIM directory 數計費，來源文件自己的風險分析（§4 risk 1）明確建議「先拿多年期真實報價再定案」。這正是 `agency-os/AGENTS.md` R0 明文列出的停止條件之一：「取捨影響產品方向」——即使在一般性「你決定」委任下，這類決策仍應停止並回報，不應單方面拍板。Workload identity（row 2）與 PDP engine（row 3）性質不同：row 2 的建議是**不**採用任何新供應商（延後 SPIFFE，改用雲端原生機制），row 3 的 Cedar 是 Apache-2.0 免費 OSS——兩者都沒有新增供應商鎖定或持續帳單，落在 ADR-015 已確立的可拍板類別。
2. **延後 SPIFFE 的決策本身必須附具體、可檢查的重新評估條件，而非開放式「以後」**——同 ADR-015 Decision Driver 4 對 SLSA L3 的處理邏輯；來源文件 §4 risk 2 已自行提出兩個具體觸發條件（服務數門檻、首個跨租戶 agent 委派情境），本 ADR 直接沿用，不發明新條件也不放任其停留在文字警示層級。
3. **Cedar 的 principal/action/resource/context 模型與本專案已批准的 R0-R4/A0-A4 詞彙（ADR-004）高度吻合**，且形式驗證+可讀性對本專案「需要被法遵、操作者本人稽核」這個真實需求是精確對應，非過度延伸。

## Sub-decision (a): IdP / OIDC Provider

**ACCEPTED（2026-08-30，操作者本人直接明示決定，非 Claude 拍板）** — 自架 **Zitadel**。

**原始裁決（首次批准時，2026-08-30 稍早，保留供稽核軌跡）**：*「NOT RATIFIED. 維持 `TBD_PENDING_OPERATOR_VENDOR_DECISION`。來源文件推薦 WorkOS（managed），理由具體且有據（多租戶原生模型 + 內建 AI Agent Registration 直接對應 A0-A4 情境）——但這是一個真實的新增持續性供應商支出+多年期鎖定風險決策，不是「重讀既有文件找出已隱含答案」的架構內部判斷。需要操作者本人完成：(1) 取得 WorkOS 真實多年期報價；(2) 在「付費上managed IdP」與「自架 Zitadel/Keycloak 承擔永久維運負擔」之間做 build-vs-buy 抉擇——這是本專案 30 年營運週期的真實取捨，理應由操作者裁決，非 Claude 在通用委任下自行拍板。」*

**更新（同日稍晚）**：操作者在對話中直接回答「偏好自架」，跳過取得 WorkOS 報價這一步——選擇完全避開持續性供應商支出/鎖定，而非在報價後比較。Claude 接著就自架的兩個候選（Zitadel、Keycloak）呈現具體取捨後，操作者明示選擇 **Zitadel**。

**Zitadel vs Keycloak 取捨**（呈現給操作者的判斷依據）：
- Zitadel：Instance→Org→Project→App 階層原生對應本專案多租戶架構；核心授權自 v3（~2025-03）起為 AGPL-3.0——僅內部自架使用、不修改後對外提供服務，不觸發 AGPL 的網路使用揭露條款；若未來 fork 修改後對外提供服務才需重新檢視。
- Keycloak：Apache 2.0（授權更寬鬆）+ 企業採用歷史更久，但 realm-per-tenant 模型隨租戶數增加擴展性不如 Zitadel。

**這不是 Claude 自行拍板**——這是操作者本人在對話中直接做出的決定，R0「取捨影響產品方向」停止條件正是為了讓這類決策走到這一步（停下、回報、讓操作者決定），而非被繞過。

## Sub-decision (b): Workload Identity 標準

**ACCEPTED** — 先用雲端原生 workload identity + 短期憑證 mTLS，非一開始就上完整 SPIFFE/SPIRE。SPIFFE 延後附兩個具體重新評估觸發條件（服務數超過操作性設定的門檻 N；或出現第一個跨租戶 AI agent 委派情境），非開放式「以後再說」。理由：SPIRE 控制平面建置成本與現有團隊規模不成比例，多篇 2026 年來源指出多數團隊負擔不起把 SPIFFE 做對；雲端原生 mTLS 已滿足流程圖的 Mutual Authentication + Short-lived Credentials 兩階段。

## Sub-decision (c): Policy Decision Point 引擎

**ACCEPTED** — Cedar，非 OPA/Rego。理由：AWS 2023-05 開源（Apache 2.0）、已做形式驗證、principal/action/resource/context 模型直接對應本專案 R0-R4/A0-A4 詞彙（ADR-004），可讀性對本專案「非工程角色需能稽核」的真實需求是精確吻合。範圍限制明確揭露：Cedar 較窄（純授權，非泛用 policy-as-code），若未來需要 policy 順便做資料轉換，OPA/Rego 應**疊加**而非取代 Cedar。

## Method Used

同姊妹 ADR-015 的供應商支出判準，應用於同一來源文件的 Gap 1，產生相反結論的一項（row 1 不批准）——這正說明該判準不是一刀切的「本次任務可以拍板廠商選型」或「一律不行」，而是逐項依實際財務/鎖定風險判斷，方法本身在兩份 ADR 間保持一致，只是輸入條件不同導致結論不同。

## Recommendation

1. ~~建置 `policies/security/zero-trust.policy.yaml`：`workload_identity`、`pdp_engine` 完整落實 Sub-decisions (b)(c)；`idp_provider` 明確保留 `TBD_PENDING_OPERATOR_VENDOR_DECISION` 佔位符~~ ——**已更新**：`idp_provider` 現改為 `{provider: Zitadel, deployment_model: self-hosted, rationale, licensing_acknowledgment, workos_rejected_reason, keycloak_rejected_reason}`，`status: ACTIVE`（從 `PROVISIONAL` 升級，三個子決策全數不再阻塞）。
2. 建置對應 golden test fixture `tests/contracts/policies/security/zero-trust.fixtures.yaml`——**已更新**：原本測試「idp_provider 被靜默拍板為真實廠商名稱應失敗」的 invalid case，改為測試「provider 設成非 Zitadel（如 WorkOS）應失敗」+ 新增一則「舊阻塞佔位符形狀（`{status: ...}`）現在應失敗」的迴歸測試，確保這個真實決策同樣是機器可驗證的。
3. `docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md` 檔頭與 §7「下一步」更新——**已更新**：Gap 1 全數批准（3/3）。
4. `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md` §2.9 `security/` 列狀態更新——**已更新**：8/8 全數批准。
5. `.ai/research/phase-1/GAP_REGISTER.yaml` `P1-GAP-SEC-1`——**已更新**：標記為全數解決（3/3 子項）。
6. `docs/adr/ADR_INDEX.md`——**已更新**：本 ADR 條目從「部分 ACCEPTED」改為「ACCEPTED」。

## Consequences

- **Positive**：`P1-GAP-SEC-1` 的 3 個子缺口全數獲得機讀 policy 落實；IdP 選型是操作者本人的真實決定，有完整、可稽核的決策過程記錄（原始推薦、拒絕理由、最終選擇），不是被 Claude 靜默拍板也不是永久懸而未決。
- **Negative**：無——Zitadel 自架帶來的是真實維運負擔（patching/scaling/on-call），這是操作者已知並接受的取捨，非本 ADR 引入的新風險。
- **已解決的 follow-up（原文保留供稽核）**：*「`idp_provider` 的最終選型，需操作者本人取得真實報價並做 build-vs-buy 決策。」*——操作者選擇跳過報價步驟，直接決定自架，此 follow-up 已閉環。
- **本 ADR 這批 commit 事後被真實 `/codex-review` 抓到並修正的獨立缺口**：`workload_identity.spiffe_reconsideration_triggers`（Sub-decision b）原本是 `items: {type: string}` 的自由文字陣列——任何佔位字串（如「以後再說」）都能通過驗證，本欄位描述聲稱的「具體、可檢查」保證形同虛設；來源文件的觸發門檻「N」也從未在 repo 中被定義成真實欄位。已修正：`spiffe_reconsideration_triggers.items` 改為封閉 2 值 enum（僅 `service_count_exceeds_threshold`/`first_cross_tenant_agent_delegation_scenario` 兩個值，對應來源文件實際指名的兩個觸發條件），新增 `service_count_reconsideration_threshold`（可為 null，操作者設定）+ `allOf`/`if`/`contains`/`then` 規則，強制「一旦觸發條件含 `service_count_exceeds_threshold` 就必須給出真實整數」，門檻數值本身仍不由 Claude 發明。

## Migration / Rollback

- **Migration**：零成本——文件與機讀 policy 建置，無既有 runtime 資料依賴此檔案。實際自架 Zitadel 的基礎設施建置（安裝、設定、與既有系統整合）是獨立於本 ADR 的未來實作任務，本 ADR 只批准「選 Zitadel」這個決策，不涵蓋部署本身。
- **Rollback**：`git revert` 可完整回退本 ADR 的文件/schema 變更；回退後 `P1-GAP-SEC-1` 重新回到全數 SKELETON_ONLY 狀態。若 Zitadel 基礎設施已實際部署，該部分的回滾屬未來實作任務的範圍，非本文件層級的 ADR 決策可回退。

## Evidence

- `docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md`（全文，§1.1-1.3、§3 rows 1-3、§4 risks 1/2/3、§5 引用來源含信心水準揭露）
- `.ai/research/phase-1/GAP_REGISTER.yaml`（`P1-GAP-SEC-1`，L190-197）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`（L2668，流程圖原文）
- `agency-os/AGENTS.md`（R0「遇到以下情況立即停止並回報，不得硬做：...取捨影響產品方向」條款原文——正是這個機制讓本 ADR Sub-decision (a) 先停下回報，再由操作者本人於同日對話中直接決定，而非被繞過）
- `docs/adr/ADR-004-risk-tier-and-epistemic-label-canonicalization.md`（R0-R4/A0-A4 詞彙，Cedar 選型的對應依據）
- `policies/ai-execution/mandatory-gates.yaml`（`gate_ref: TBD_PENDING_ROUND2_ADR` 佔位符先例，本 ADR `idp_provider` 首次批准時的暫時形狀曾沿用同一技巧，操作者決定後已升級為真實值）
- 本次對話原文（2026-08-30，操作者明示「偏好自架」，隨後於 Zitadel/Keycloak 二選一中明示選擇 Zitadel）——本 ADR Sub-decision (a) 更新的唯一依據，非任何文件推導

**邊界確認**：本 ADR 批准 `ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md` §3 rows 1-3（IdP provider、workload identity、PDP engine）全數 3 項。Row 1（IdP）的最終值（Zitadel，自架）是操作者本人在對話中直接明示的決定，Claude 僅忠實轉錄，未自行推導或拍板。來源文件本身 Status 維持 PROPOSED（本 ADR 批准的是「這 3 項推薦/決定內容可正式採納為機讀 policy 的權威內容」，不是把整份文件升格）。
