# ADR-015: Supply Chain Security Tooling Selection

Status: ACCEPTED（2026-08-30，操作者明示授權 Claude 行使架構師裁決權，「你決定」。**授權性質與 ADR-001~013 略有不同，見 Decision Driver 1 的判準說明**：本 ADR 批准的是開放標準/OSS 工具選型，非新增供應商付費承諾——這個判準本身才是「可以在一般委任下拍板」的依據，不是單純沿用先前 ADR 的委任範圍）
Date: 2026-08-30
Related: `docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md`（Status 維持 PROPOSED，本 ADR 批准的是其 §2/§3 rows 4-8 的內容，不是把整份文件升格）、ADR-016（同一份來源文件的姊妹 ADR，處理 Gap 1 Zero Trust，唯一差異：ADR-016 有一項因真實供應商成本鎖定而明確不批准）

## Context

`.ai/research/phase-1/GAP_REGISTER.yaml` `P1-GAP-SEC-2`（severity: high，L198-205）：Master Plan 的 `Source → Signed Commit → CI → SBOM → Dependency Scan → Artifact Signing → Verified Deployment` 流程圖（`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2772`）全文搜尋 SLSA/cosign/sigstore/SPDX/CycloneDX/CVSS/CVE 皆 0 命中——只有階段名稱，無任何協定/標準版本綁定。

`docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md`（本次任務稍早由 `web-researcher` agent 唯讀 WebSearch 完成，Status: PROPOSED）已完成 §2 的完整研究比較（SBOM 格式、簽章機制、SLSA 等級、漏洞掃描與門檻），§3 給出 5 項具體推薦（該文件的 items 4-8），每項附信心水準標註的引用來源（§5）。該文件自己的 §0 明確聲明「這不是 ADR...本次任務的授權範圍都明確排除 Claude 自行拍板廠商選型」。

**本 ADR 要解決的問題**：那份排除聲明是否適用於全部 8 項推薦，還是只適用於其中真正涉及新增供應商付費承諾的項目？逐項檢視後，items 4-8（本 ADR 範圍）與 items 1-3（Zero Trust，見姊妹 ADR-016）性質不同——見 Decision Driver 1。

## Decision Drivers

1. **供應商支出判準（vendor-spend litmus test），不是「廠商選型一律排除」的一刀切規則**：`ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md` 原始排除聲明的真正理由是「廠商/成本取捨」——逐項檢視 items 4-8：CycloneDX/SPDX 是免費開放格式；Sigstore/cosign 是 OpenSSF OSS；SLSA L2 是 GitHub Actions 既有訂閱下零邊際成本的既有功能；Grype 是 OSS，Dependabot 是 GitHub 內建免費功能；CVSS/EPSS/KEV 分層只是掃描門檻政策，不是採購。這 5 項沒有一項讓組織承擔新的持續帳單或多年期供應商合約——正是原始排除聲明想排除的那個風險類別本身不存在。這與 ADR-001~013 已經行使過的判斷是同一類（從既有證據推導出有客觀依據的正確答案），只是這次的證據來源是外部 WebSearch 研究而非母文件重讀。
2. **2026-03-19 Trivy 供應鏈遭真實入侵事件**（Aqua 官方安全公告，非臆測）直接支撐「不可單一依賴一套掃描工具」的結論——這正是本專案 ADR 一貫要求的「外部真實佐證，非訓練資料猜測」紀律。
3. **GitHub Artifact Attestations 在 GitHub-hosted runner 上零額外成本達成 SLSA L2 是已查證事實**（GitHub 官方文件直接引用），批准「立即上 L2」只是承認既有工具鏈已具備的能力，不是新增承諾。
4. **§4 risk 6 的警訊必須被本 ADR 正面處理，不能重蹈覆轍**：來源文件自己指出 SLSA L2→L3 若無明確日期待辦，依本組織一貫的「政策存在但沒東西真的強制執行」模式，很可能永遠不會發生。因此本 ADR 的 Recommendation 不能只寫「以後做 L3」，必須綁定一個具體、可檢查的觸發事件（見 Sub-decision c）。

## Sub-decision (a): SBOM 格式

**ACCEPTED** — CycloneDX 為主，SPDX 依需求另產。理由：CI/CD 原生預設（GitHub/GitLab/Azure DevOps 皆預設輸出）、主流掃描工具全支援；美歐法規皆未強制單一格式。

## Sub-decision (b): 簽章機制

**ACCEPTED** — Sigstore/cosign（keyless）。理由：OpenSSF 已畢業、消除長期私鑰管理負擔、與 GitHub 原生 Artifact Attestations 直接吻合；GPG 僅在完全離線情境勝出，不適用本專案（線上 SaaS）。

## Sub-decision (c): SLSA Provenance 目標等級

**ACCEPTED** — 立即達成 Build L2（GitHub-hosted runner 上近乎零成本），改用 reusable workflow 達成 L3 的**觸發時機明訂為「Phase 4 CI/CD 建置啟動時」**（一個具體事件，非開放式「以後」）——因為目前 corpus 中不存在任何 Phase 4 具體排程可引用，發明一個假日期反而是捏造承諾；綁定既有 corpus 概念（Atlas 自己的 dev-priority 排序已將 CI/CD 具體建置排在 Phase 4）給 §4 risk 6 的疑慮一個真實、可檢查的掛勾，而非虛構日期。

## Sub-decision (d): 漏洞掃描與工具分工

**ACCEPTED** — Grype 為主（EPSS/KEV 評分）+ GitHub Dependabot 做自動修復 PR，且**明訂協調規則**：Grype 是 CI 合併的擋點權威，Dependabot 僅產生 PR 層級提案，不單獨阻擋合併——這是本 ADR 對來源文件 §4 risk 7（雙工具告警噪音風險）的補充裁決，不是重新論證雙工具選擇本身。理由：2026-03-19 Trivy 自身供應鏈遭真實入侵事件後的縱深防禦考量，不單一依賴一套工具。

## Sub-decision (e): CVSS/EPSS/KEV 分層門檻

**ACCEPTED** — 來源文件 §3 row 8 的 4 層模型逐字採納（KEV 列管→立即擋；CVSS≥9.0 且 EPSS>0.1→擋+7天 SLA；CVSS 7.0-8.9→警告+30天 SLA；以下→僅追蹤），並**明訂排程重掃要求**（§4 risk 8：EPSS 分數會隨時間漂移，今天的通過不是永久的）。

## Method Used

沿用來源文件（`ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md`）已完成的外部 WebSearch 研究（`web-researcher` agent，唯讀，per-claim 信心水準揭露）。本 ADR 的方法論貢獻在於：(1) 對「廠商/成本取捨排除聲明」逐項重新檢視，區分真正涉及新供應商支出的項目與純開放標準/OSS 選擇（Decision Driver 1）；(2) 對來源文件自己點名的執行風險（risk 6/7/8）逐一補上具體、可檢查的處理規則，而非照單全收推薦內容卻放任風險描述停留在文字層面。

## Recommendation

1. 建置 `policies/security/supply-chain-security.policy.yaml`，完整落實 Sub-decisions (a)-(e)。
2. 建置對應 golden test fixture `tests/contracts/policies/security/supply-chain-security.fixtures.yaml`。
3. `docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md` 檔頭與 §7「下一步」更新，反映 Gap 2（items 4-8）已全數批准。
4. `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md` §2.9 `security/` 列狀態更新（Gap 2 部分不再是 SKELETON_ONLY）。
5. `.ai/research/phase-1/GAP_REGISTER.yaml` `P1-GAP-SEC-2` 標記為已由本 ADR 解決。
6. `docs/adr/ADR_INDEX.md` 新增本 ADR 條目。

## Consequences

- **Positive**：`P1-GAP-SEC-2` 完整關閉，機讀 policy 檔案首次存在；2026-03-19 Trivy 事件與 §4 risk 6/7/8 三個執行風險都獲得具體、可稽核的處理規則，不是停留在文字警示層級。
- **Negative**：無——本次任務仍在 Phase 0-2（Program Plan §10 禁止 production code/CI 建置），這份 policy 檔案目前無 runtime 依賴，零 blast radius。
- **尚未解決的 follow-up（本 ADR 明確不處理）**：SLSA L3 遷移的實際執行（等 Phase 4 CI/CD 建置啟動時）；`policies/security/zero-trust.policy.yaml`（同一來源文件的 Gap 1）由姊妹 ADR-016 處理，本 ADR 不涉及。
- **本 ADR 這批 commit 事後被真實 `/codex-review` 抓到並修正的 2 個獨立缺口**：(i) `cvss_tiering.rescan_requirement`（Sub-decision e）原本只有 2 句 `const` 文字，無任何機器可讀的間隔/owner，實際實作可以在文字上「符合政策」卻從未真的排程重掃——已修正為 `interval_days`/`owner` 必填欄位（數值本身不發明，同 `l3_migration_trigger` 的克制）；(ii) `.ai/research/phase-1/RISK_REGISTER.yaml` P1-RISK-SEC-4 的 resolution 原文誤稱 keyless 簽章信任根「與 ADR-016 IdP 選型形成依賴」——已訂正：GitHub Artifact Attestations 的 OIDC 憑證由 GitHub Actions 自己簽發，與本專案的 `idp_provider` 選型是不相干的信任域，此風險應為乾淨解決，非部分解決（`SECURITY_THREAT_MODEL.md` T1 列同步訂正）。

## Migration / Rollback

- **Migration**：零成本——文件與機讀 policy 建置，無既有 runtime 資料依賴此檔案。
- **Rollback**：`git revert` 可完整回退；回退後 `P1-GAP-SEC-2` 重新回到 SKELETON_ONLY 狀態，需注意連動的 MACHINE_READABLE_SPEC_PLAN.md/GAP_REGISTER.yaml 也需一併回退。

## Evidence

- `docs/architecture/ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md`（全文，§2.1-2.4、§3 rows 4-8、§4 risks 4/6/7/8、§5 引用來源含信心水準）
- `.ai/research/phase-1/GAP_REGISTER.yaml`（`P1-GAP-SEC-2`，L198-205）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`（L2772，流程圖原文，0 命中確認）
- `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md`（§2.9 `security/` 列，L184）
- `policies/provider/ai-gateway-fallback.policy.yaml`（singleton policy 檔案 shape 慣例先例）

**邊界確認**：本 ADR 僅批准 `ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN.md` §3 items 4-8（Supply Chain Security 子決策），不涉及 items 1-3（Zero Trust，見姊妹 ADR-016）。來源文件本身 Status 維持 PROPOSED——本 ADR 批准的是「這 5 項推薦內容可正式採納為機讀 policy 的權威內容」，不是把整份文件升格。
