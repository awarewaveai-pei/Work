# ZERO_TRUST_SUPPLY_CHAIN_SELECTION_PLAN
Status: PROPOSED（本文件本身不是 ADR；**2026-08-30 全數 8 項已批准**——見下方裁決狀態表。前 7 項無新增供應商成本/鎖定，由 Claude 依供應商支出判準批准；第 1 項（IdP）依判準保留給操作者後，操作者同日在對話中直接明示決定：自架 Zitadel，非 Claude 拍板）
Date: 2026-08-30

## 裁決狀態（2026-08-30 更新，置頂速覽）

| # | 決策 | 狀態 | 批准依據 |
|---|---|---|---|
| 1 | IdP/OIDC = **Zitadel（自架）**~~WorkOS~~ | **ACCEPTED（操作者本人決定）** | 操作者對話中明示「偏好自架」+ 於 Zitadel/Keycloak 二選一中選 Zitadel，見 ADR-016 Sub-decision (a) UPDATED |
| 2 | Workload identity = 雲端原生 mTLS 先行 | ACCEPTED | ADR-016 Sub-decision (b) |
| 3 | PDP 引擎 = Cedar | ACCEPTED | ADR-016 Sub-decision (c) |
| 4 | SBOM 格式 = CycloneDX 為主 | ACCEPTED | ADR-015 Sub-decision (a) |
| 5 | 簽章機制 = Sigstore/cosign | ACCEPTED | ADR-015 Sub-decision (b) |
| 6 | SLSA 目標 = L2 立即/L3 Phase 4 CI/CD 建置時 | ACCEPTED | ADR-015 Sub-decision (c) |
| 7 | 漏洞掃描 = Grype+Dependabot | ACCEPTED | ADR-015 Sub-decision (d) |
| 8 | CVSS/EPSS/KEV 分層門檻 | ACCEPTED | ADR-015 Sub-decision (e) |

機讀落實：`policies/security/zero-trust.policy.yaml`（items 1-3，全數 `status: ACTIVE`）、`policies/security/supply-chain-security.policy.yaml`（items 4-8，全數落實）。

**注意**：本文件 §3 表格原文推薦 IdP=WorkOS（研究當下的具體推薦，理由詳見該節）——操作者最終選擇自架 Zitadel，非採納此推薦；原文保留不改動，實際定案以上方裁決狀態表與 `ADR-016`/`zero-trust.policy.yaml` 為準。

## 0. Scope & Boundary（範圍聲明）

本文件回應 `.ai/research/phase-1/GAP_REGISTER.yaml` `P1-GAP-SEC-1`（Zero Trust 只有階段名稱流程圖，無協定/標準綁定，`GAP_REGISTER.yaml:190-197`）與 `P1-GAP-SEC-2`（Supply Chain Security 無具體標準版本，`GAP_REGISTER.yaml:198-205`），對應 `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md` §2.9 `policies/security/` 列（原文：「SKELETON_ONLY（P1-GAP-SEC-1, P1-GAP-SEC-2 全文空白，需操作者選型，非文件收斂）」）。

**這不是 ADR，且不會被本次任務標記為 ACCEPTED**——與本 repo 過去 12 份 ADR（ADR-001~012）不同，這兩個缺口的本質是**廠商/成本取捨**，不是「重讀母文件找出已隱含的正確答案」。§跨模型 oracle 分工表與本次任務的授權範圍都明確排除 Claude 自行拍板廠商選型。本文件的角色是：完成研究、列出真實比較、給出一個具體推薦組合供操作者參考，實際選型仍須操作者本人點頭，比照 `MVP_VERTICAL_SLICE_PLAN.md`（Status: PROPOSED，等待 Claude/Codex 對比後由操作者裁決）同款「PROPOSED 且明講誰才能定案」的框架。

**方法**：外部 WebSearch 研究（`web-researcher` agent，唯讀，非本次任務直接執行），聚焦「這是不是 2025/2026 年真的還成立的現況」而非直接沿用訓練資料裡可能過期的預設值。8 個子決策每一項皆附引用來源與信心水準；標記為 unverified/medium-confidence 的宣稱誠實揭露，不假裝已查證。

---

## 1. Gap 1 — Zero Trust（Identity → Workload Identity → Mutual Authentication → Short-lived Credentials → Policy Decision → Resource Access）

MP 現況（`GAP_REGISTER.yaml:196` 引用）：`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2668` 只有這一條階段流程圖，無任何協定/引擎具名。

### 1.1 IdP / OIDC Provider

| 面向 | 自架 OSS（Zitadel／Keycloak） | Managed（WorkOS） | Managed（Auth0／Clerk／Cognito） |
|---|---|---|---|
| 多租戶模型 | Zitadel：Instance→Org→Project→App 階層，專為多租戶設計；Keycloak：realm-per-tenant，租戶數一多就不好擴 | 專為多租戶設計（「organizations as the primary unit」） | Auth0 租戶模型非為「一個 tenant 裡塞多個小 org」設計；Clerk 的 SCIM 2026-04 才 GA，企業級功能尚新 |
| 成本模型 | 只有機器成本，但長期工程投入真實存在 | 依 SSO connection／SCIM directory 數計費 | Auth0 依 MAU 計費（B2B 情境可能暴增）；Clerk 依活躍使用者+連線數計費 |
| 維運負擔 | 高——要自己跑/patch/scale 一個 IdP 跑 30 年 | 低 | 低 |
| AI agent / 分級自主權契合度 | 兩者皆無原生「agent identity」概念，agent 需自建 service account/M2M client 模型 | **有專門的 Agent Registration 功能**，明確區別於人類 OAuth 流程 | 研究當下未見同等 agent-specific 功能 |

Zitadel 核心於 2025-03 v3 起改為 AGPL-3.0——這是授權條款問題，不只是技術問題，需要操作者一併評估。WorkOS 的 Agent Registration 是目前查到與本專案「AI agent 依 A0-A4 分級自主權做事」情境最直接吻合的廠商功能。

### 1.2 Workload Identity 標準

SPIFFE/SPIRE 是 CNCF 已畢業、生產環境驗證過的標準（Uber ~4,500 服務、Netflix、Pinterest、Bloomberg、Square、GitHub 自己都在用），且 2025-2026 正被延伸應用到 AI agent workload identity（Stacklok／Palo Alto/Idira／Riptides 的 SPIFFE↔OAuth/MCP 整合工作）。但**基礎設施成本高**——SPIRE 需要 attestation node、registration server、自己的 CA；且 SPIFFE 本身只解決身分，不解決授權（授權仍要另配 PDP，見 1.3）。多篇 2026 年文章明確指出多數團隊「負擔不起把 SPIFFE 做對」所需的平台投資。

對精簡團隊而言，先用「雲端原生 workload identity + 短期憑證 mTLS」（不建完整 SPIRE 控制平面）是更務實的起點，一樣滿足流程圖裡的「Mutual Authentication + Short-lived Credentials」，SPIFFE 留作未來 agent-to-agent 流量成長後的明確升級路徑。

### 1.3 Policy Decision Point 引擎

OPA/Rego 是 CNCF 已畢業（2021）、Kubernetes admission control 與泛用 policy-as-code 最成熟的選項，但 Rego（Datalog/Prolog 風格）學習曲線陡，2025-2026 一篇比較研究稱其「表達力強但易出錯」，複雜規則有 runtime exception 與非決定性風險。Cedar（AWS 2023-05 開源，Apache 2.0）專為授權設計（principal/action/resource/context），已做形式驗證確保安全/正確性，且以可讀性著稱——對本專案已有的 R0-R4 risk_tier / A0-A4 authority_level 概念要能被非工程角色（法遵、操作者本人）稽核這件事，Cedar 的 principal/action/resource/context 幾乎是 1:1 對應。Cedar 範圍較窄（純授權，非泛用 policy 計算）是其限制，若未來需要「policy 順便做資料轉換」這類需求，OPA/Rego 更適合。

---

## 2. Gap 2 — Supply Chain Security（Source → Signed Commit → CI → SBOM → Dependency Scan → Artifact Signing → Verified Deployment）

MP 現況（`GAP_REGISTER.yaml:204` 引用）：`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2772` 只有這一條階段流程圖，全文搜尋 SLSA/cosign/sigstore/SPDX/CycloneDX/CVSS/CVE 皆 0 命中。

### 2.1 SBOM 格式：CycloneDX vs SPDX

CycloneDX 是 CI/CD 原生預設：GitHub／GitLab／Azure DevOps 的 CI 整合預設輸出、Trivy/Grype/Snyk/Anchore 全數原生支援。SPDX 偏法遵/合規（ISO 標準化，貼近 NTIA/CISA 用語）。美國 NTIA 最低要素框架與歐盟 CRA 皆未強制單一格式——CISA 兩者皆認可，CRA 相關次級來源（詳信心水準揭露，未直接查證歐盟官方法條原文）指向 CycloneDX 1.4/1.5+ 或 SPDX 2.3+ 皆可接受。GitHub 官方 `actions/attest-sbom` 動作兩種格式皆吃。鑑於本專案的稽核需求偏「安全資料」而非「法律合規資料」，CycloneDX 為務實預設，SPDX 保留為未來特定法規/客戶指名時的備援輸出。

### 2.2 簽章機制：Sigstore/cosign vs GPG

Sigstore/cosign 現為主流方向：OpenSSF 已畢業（2024-03），npm/PyPI（透過 PEP 740）/Homebrew/GitHub 自己的 Artifact Attestations 皆採用；其透明日誌（Rekor）「涵蓋 17,000+ 開源專案超過 1.7 億筆簽章」（次級來源整合，信心水準：中，未逐字查證原始 blog）。相對 GPG 的核心優勢是維運面：keyless signing（短期 OIDC 憑證）消除了長期私鑰管理負擔——這正是多篇來源指出「多數專案從未真的採用 GPG 簽章」的根因。GPG 仍在一種情境勝出（完全離線、多年後才驗證、無法存取 transparency log 的韌體/bootloader 類場景）——不適用本專案（線上 SaaS，驗證方隨時可連網）。

### 2.3 SLSA Provenance 等級

SLSA v1.0 build track 共 4 級（L0 無合規；L1 provenance 存在但「易被繞過或偽造」；L2 由 hosted platform 簽署/產生 provenance；L3 需要 hardened、tamper-isolated 的 build platform）。具體對應 GitHub Actions：**GitHub Artifact Attestations 在 GitHub-hosted runner 上預設即達 SLSA Build L2，零額外基礎設施**；改用 reusable workflow 產生 attestation 即可達 **L3**（官方文件直接證實，見引用）。對精簡團隊而言，這是異常低成本的 L2→L3 路徑，因為隔離保證來自 GitHub 自己的 reusable-workflow 架構，不需自建。

### 2.4 漏洞掃描與門檻

Trivy 覆蓋面最廣（vuln+secret+IaC+license+K8s）；Grype 更聚焦、SBOM-first，且有 Trivy 缺乏的 EPSS/KEV 複合風險評分；Snyk 額外提供商業維護的漏洞庫與自動修復 PR；Dependabot 的差異化特色是自動修復 PR 而非偵測廣度。**重要且已查證的警訊**：Trivy 的釋出基礎設施（Trivy 本體、`trivy-action`、`setup-trivy`）於 2026-03-19 起遭真實供應鏈攻擊——攻擊者用被盜憑證推送惡意 v0.69.4 版本，透過劫持的 GitHub Actions tag 散布竊憑證惡意程式，持續 3-12 小時才被偵測（Aqua 官方安全公告直接引用，非第三方臆測）。資料庫與工具現已恢復正常，但這是「不能只靠 tag pinning、應 pin 到完整 SHA hash」與「不要單一依賴一套掃描工具」的真實案例，非假設性風險。

門檻設計：2026 年實務已從「CVSS ≥ X 就擋」單一門檻，轉向分層模型——CVSS 做初篩，CISA KEV（已知遭實際利用）與 EPSS（預測利用機率）做優先序/擋點。常見複合政策：KEV 列管 → 24 小時內必須修補/擋下；CVSS ≥ 9.0 且 EPSS > 0.1 → 7 天 SLA；CVSS High（7.0-8.9）→ 30 天；Medium → 90 天；Low → 接受風險或 180 天。純「CVSS ≥ 7 就擋部署」現已被認為過於粗糙，因為未考慮可利用性——稽核仍會要求記錄 CVSS，但不應單獨依賴它做放行/擋下判斷。

---

## 3. 推薦組合（8 項子決策，等待操作者裁決）

| # | 決策 | 推薦 | 理由 |
|---|---|---|---|
| 1 | IdP/OIDC | **WorkOS（managed）**，非自架 Keycloak/Zitadel | 多租戶原生模型 + 內建 AI agent 身分（Agent Registration，直接對應 A0-A4 情境）+ 精簡團隊 30 年維運下最低負擔 |
| 2 | Workload identity | **先用雲端原生 workload identity + 短期憑證 mTLS**，非一開始就上完整 SPIFFE/SPIRE | SPIRE 控制平面建置成本與現有團隊規模不成比例；SPIFFE ID 格式本身可漸進採用，不需要一開始就上完整 SPIRE server 拓樸 |
| 3 | PDP 引擎 | **Cedar**，非 OPA/Rego | 可讀性 + 形式驗證，貼合 R0-R4/A0-A4 需要被非工程角色（法遵、操作者）稽核這件事；範圍較窄可接受，因為需求就是純授權判斷 |
| 4 | SBOM 格式 | **CycloneDX 為主**，SPDX 依需求另產 | CI 原生預設、主流掃描工具全支援；美歐法規皆未強制單一格式 |
| 5 | 簽章機制 | **Sigstore/cosign（keyless）** | 無長期私鑰管理負擔，OpenSSF 已畢業，與 GitHub 原生 Artifact Attestations 工具鏈直接吻合 |
| 6 | SLSA 目標 | **立即達成 Build L2**（GitHub-hosted runner 上近乎零成本）**，6-12 個月內規劃 L3**（改用 reusable workflow） | L2 在 GHA 上幾近免費；L3 需要真的重構 workflow，排入時程而非要求第一天就做到 |
| 7 | 漏洞掃描 | **Grype 為主（EPSS/KEV 評分）+ GitHub Dependabot 做自動修復 PR**，不單一依賴 Trivy | 2026-03 Trivy 自身供應鏈遭真實入侵事件後的縱深防禦考量 |
| 8 | CVSS 門檻 | **分層擋點**：KEV 列管→立即擋；CVSS≥9.0 且 EPSS>0.1→擋+7天 SLA；CVSS 7.0-8.9→警告+30天 SLA；以下→僅追蹤 | 符合 2026 年「純 CVSS 門檻過於粗糙」的共識，仍在稽核紀錄保留 CVSS |

## 4. 風險（每項推薦各自的「可能出錯」）

1. **WorkOS**：身分層的廠商鎖定——租戶上線後要換 managed IdP 成本很高；若未來以「多個小客戶各自 SSO」為主而非「少數大客戶」，per-connection 計費可能不利。建議先拿多年期真實報價再定案。
2. **延後 SPIFFE**：若 AI agent 對 agent 流量成長比預期快，事後把 SPIFFE 身分補回一個已上線的 mTLS 系統是真實遷移工作，非設定切換。建議明訂觸發條件（如：服務數超過 N、或出現第一個跨租戶 agent 委派情境）重新評估，而非「以後再說」。
3. **Cedar**：生態系/工具鏈比 OPA 小（第三方整合較少，若未來需要 K8s admission control 類工具，Cedar 生態較弱）。若 policy 需求超出純授權（如資料形狀驗證），可能演變成 Cedar + 其他工具並存，非 Cedar 一統。
4. **CycloneDX 為主**：若未來企業客戶或法規明確只認 SPDX，需要 SPDX 產生管線已經現成——不能等到被要求才臨時建。
5. **Sigstore/cosign**：keyless signing 依賴外部 OIDC 身分供應商 + Fulcio/Rekor 可用性——Sigstore 若中斷會擋住發版流程，除非已備妥並演練過備援方案（如臨時 GPG 橋接），而非事故當下臨場想。
6. **SLSA L2→L3 路徑**：L3 需要真的重構 workflow——應列入有明確日期的待辦，而非隱性「以後」，否則依本組織自己一貫的「政策存在但沒東西真的強制執行」教訓，很可能永遠不會發生。
7. **Grype + Dependabot 雙工具**：兩套發現結果需要協調，可能有重複告警噪音——需事先訂清楚「誰是最終判準」規則（如：Grype 擋 CI、Dependabot 做 PR 層級修復），否則團隊會開始忽略其中一個。
8. **EPSS/KEV 分層門檻**：EPSS 分數會隨時間變動（一個 CVE 可能在你這邊程式碼沒改動的情況下，從低機率變成高機率）——代表今天的「通過」不是永久的，需要排程重新掃描已核准的產出物，而非只在 build 當下把關一次。

## 5. 引用來源（含信心水準揭露）

**High confidence（官方一手來源直接引用）**：
- SLSA v1.0 等級定義：https://slsa.dev/spec/v1.0/levels
- GitHub Artifact Attestations 達成 SLSA L2/L3 的機制：https://docs.github.com/actions/security-guides/using-artifact-attestations-and-reusable-workflows-to-achieve-slsa-v1-build-level-3
- Trivy 供應鏈遭入侵事件（Aqua 官方安全公告）：https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23
- Cedar 開源公告（AWS 官方）：https://aws.amazon.com/about-aws/whats-new/2023/05/cedar-open-source-language-access-control
- OPA CNCF 畢業公告：https://www.cncf.io/announcements/2021/02/04/cloud-native-computing-foundation-announces-open-policy-agent-graduation/

**Medium confidence（次級來源交叉驗證，非直接查證原文）**：
- IdP/多租戶比較（Zitadel vs Keycloak vs WorkOS vs Auth0/Clerk）：https://zitadel.com/blog/zitadel-vs-keycloak、https://workos.com/blog/workos-vs-auth0-vs-clerk-the-best-auth-platform-for-b2b-saas-in-2026（廠商來源，行銷語氣需獨立驗證）、https://workos.com/docs/authkit/agent-auth
- SPIFFE/SPIRE 生產案例：https://spiffe.io/docs/latest/spire-about/use-cases/、https://github.com/spiffe/spire/blob/main/ADOPTERS.md
- CycloneDX vs SPDX 生態系比較：https://www.interlynk.io/resources/cyclonedx-vs-spdx-sbom-format、https://anchore.com/sbom/eu-cra/、https://fossa.com/blog/sbom-requirements-cra-cyber-resilience-act/
- Sigstore 採用規模數字（1.7 億筆簽章／17,000+ 專案）：次級來源整合，未直接查證原始 blog
- Trivy vs Grype 比較：https://lucaberton.com/blog/trivy-vs-grype-2026/
- CVSS/EPSS/KEV 分層門檻實務：https://www.hackerstorm.com/articles/our-blog/vulnerabililty-intelligence/how-security-teams-should-operationalise-the-cisa-kev-catalog-in-2026
- AI agent 身分應用（SPIFFE↔OAuth/MCP）：https://stacklok.com/blog/agentic-identity-explained-how-to-apply-spiffe-and-relationship-based-authorization-to-ai-agents-in-2026/

**Low confidence / 明確未查證（誠實揭露，不假裝已確認）**：
- 歐盟 CRA 法條原文本身未直接查證（僅次級來源交叉比對），若操作者需要正式法遵簽核，建議另外直接查證 eur-lex.europa.eu 原文。
- Rego「表達力強但易出錯」的評價來自次級 blog 引用的比較研究，未直接查證原始研究。

## 6. 版本註記

- SLSA 現行版本為 v1.0（舊版 v0.1/v1.0-alpha 已淘汰）——任何訓練資料裡「SLSA 1-4」的舊敘述與 v1.0 build track 的 0-3 級編號容易混淆，需求證時務必先確認廠商/工具宣稱的是哪個版本。
- Zitadel 核心自 v3（約 2025-03）起改為 AGPL-3.0。
- Cedar 2023-05 開源（Apache 2.0）；AWS 官方文件提及「Cedar 4」，若採用需確認實際版本相容性。
- Clerk 的 SCIM directory sync 至 2026-04 才 GA，企業級 SSO/SCIM 成熟度相對 WorkOS/Auth0 仍新。
- Trivy 事件（2026-03-19 至 2026-03-23）為近期且已排除，但建議正式採用前再次確認 Trivy 目前的安全狀態。

## 7. 下一步（2026-08-30 更新：8/8 全數完成，見置頂裁決狀態表）

1. ~~**操作者裁決**：本文件 §3 的 8 項子決策需要操作者逐項確認或調整~~ ——**已全數完成 8/8**：items 2-8 逐項套用供應商支出判準後，由 Claude 於 ADR-015/016 批准；item 1（IdP）依判準保留給操作者後，操作者同日於對話中直接明示決定（自架，選 Zitadel 優於 Keycloak，跳過取得 WorkOS 報價這一步）。
2. ~~**裁決後轉正式 ADR**~~ ——**已完成**：`docs/adr/ADR-015-supply-chain-security-tooling-selection.md`（Gap 2 全數批准）+ `docs/adr/ADR-016-zero-trust-workload-identity-and-pdp-selection.md`（Gap 1 全數批准，含操作者本人決定的 IdP）。
3. ~~**建置 `policies/security/`**~~ ——**已完成**：`policies/security/zero-trust.policy.yaml`（items 1-3 全數落實，`status: ACTIVE`）+ `policies/security/supply-chain-security.policy.yaml`（items 4-8 全數落實）；`MACHINE_READABLE_SPEC_PLAN.md` §2.9 該列已同步更新。
4. **無剩餘待辦**——8 項子決策全數定案。實際自架 Zitadel 的基礎設施部署（安裝/設定/整合）是獨立於本文件與 ADR-016 的未來實作任務。

---

**邊界確認**：本文件由外部 `web-researcher` agent 唯讀 WebSearch 完成比較研究，未對三母文件、任何既有 schema/policy 檔案做任何修改；`GAP_REGISTER.yaml`/`MACHINE_READABLE_SPEC_PLAN.md` 之連動更新見另外的最小編輯（僅新增本文件的參照，不改動既有內容語意）。本文件本身不具 ADR 效力，Status 維持 `PROPOSED`——8 項子決策的實際定案內容以 `ADR-015`/`ADR-016` 與對應 `policies/security/*.policy.yaml` 為準，本文件保留原始研究與推薦內容供稽核對照。
