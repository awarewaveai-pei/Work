# SECURITY_THREAT_MODEL
Status: PROPOSED
Date: 2026-08-29

## 0. Scope & Boundary（範圍聲明）

本文件是 AI LEGO Cognitive Engineering OS **Phase 2 Architecture Convergence** 產出，履行 Execution Contract §32 Security Change Contract（EC:1255-1284）對 tenant isolation / crypto / AI tools / user content 類變更「必須 Threat Review」的要求，最低要素比對如下：

| EC §32 要求要素 | 本文件對應章節 |
|---|---|
| Assets | §2.1 |
| Trust Boundaries | §2.2 |
| Entry Points | §2.2 表格「Between」欄 |
| Threats | §3（STRIDE）+ §4（LINDDUN） |
| Controls | §3/§4 表格「Mitigation」欄 |
| Residual Risk | §3/§4 表格「Residual」欄 + §6 |
| Test Evidence | **不適用於本階段**，見下方範圍聲明 |

EC§32 明文：「Method Atlas 可選 STRIDE / LINDDUN / Attack Tree / PASTA」——本文件選用 STRIDE + LINDDUN，依 Method Atlas 正式定義執行（見 §1）。

**此為規劃/文件審查，非滲透測試**：不修改三母文件、不建立任何 policy 檔案、未執行任何實際攻擊行為。三母文件目前無程式碼、無 API、無部署（`AI_LEGO_OS_Program_Plan_v1.md` Phase 3 `Status: NOT_STARTED`），Attack Tree 與 Adversarial Test 若在此刻進行只會是臆測，違反 R0「不接受『可能是』」——誠實列為待辦而非勉強產出，見 §1 範圍表。

---

## 1. Method Used（方法核校）

**STRIDE**（Method Atlas §11.44，MA:2234-2255）：
> 六類：Spoofing / Tampering / Repudiation / Information Disclosure / Denial of Service / Elevation of Privilege
> 使用方式：`Data Flow Diagram → element-by-element threat enumeration → controls → residual risk`

**LINDDUN**（Atlas §11.45，L2258-2276）：
> 用途：補 STRIDE 主要偏 security 之不足，專門看 privacy threats。
> 七維度：Linkability / Identifiability / Non-repudiation / Detectability / Disclosure / Unawareness / Non-compliance

**Security Review Recipe**（Atlas §13.11，L3504-3519，完整正式鏈）：
```
Asset Inventory → Data Flow Diagram → Trust Boundaries → STRIDE → LINDDUN
→ Attack Tree → Secret/Identity Review → Supply Chain Review → Control Mapping
→ Adversarial Test → Residual Risk → Human Security Approval
```

本文件在 12 步鏈中的涵蓋範圍（誠實揭露，不隱藏未做部分）：

| Recipe 步驟 | 涵蓋狀態 | 理由 |
|---|---|---|
| Asset Inventory | ✅ 完成（§2.1） | |
| Data Flow Diagram | ✅ 完成，元件層級文字化（§2.2） | Phase 2 無程式碼，此為現階段可達最細粒度 |
| Trust Boundaries | ✅ 完成（§2.2） | |
| STRIDE | ✅ 完成（§3） | |
| LINDDUN | ✅ 完成，聚焦個資流（§4） | |
| Attack Tree | ❌ 不含，列 Phase 3 待辦 | 需具體 API/protocol/code 才能畫出可信攻擊樹，現在畫等於臆測 |
| Secret / Identity Review | ❌ 不含，列 Phase 3 待辦 | 尚無 IdP/secret store 實作可審 |
| Supply Chain Review | ⚠️ 部分（STRIDE T1 段落點出缺口，未做實際 SBOM/簽章稽核） | 無 CI pipeline 可稽核 |
| Control Mapping | ✅ 完成（§3/§4 表格內建） | |
| Adversarial Test | ❌ 不含 | 任務邊界明確禁止實際攻擊行為 |
| Residual Risk | ✅ 完成（§3/§4 表格 + §6） | |
| Human Security Approval | ⏳ 待辦——本文件即提交操作者核准前的草稿 | 對應 Program Plan Phase 2 STOP-FOR-HUMAN-REVIEW gate |

**方法選用之外的誠實聲明**：Atlas 自己的方法選擇表（L1121）明文警告 Security 類任務「不應預設 Checklist only」；Phase 1 六角色群 lens scan（產出 9 條 P1-GAP-SEC）正是接近「checklist/自由搜尋」的模式，本文件是該工作首次套用 Atlas 正式指定的 STRIDE/LINDDUN 系統化方法——§3/§4 會顯示這個方法差異本身就找到了 Phase 1 完全沒觸及的一整個 STRIDE 維度（見 D3）。

---

## 2. Assets & Trust Boundaries

### 2.1 Assets

| # | Asset | 分級（MP§61, L2641-2648） | 說明 |
|---|---|---|---|
| A1 | Event Ledger 個資欄位 | Confidential/Restricted | `ClaimCreated`/`DocumentUploaded` 等 event payload（MP§57 L2546-2566） |
| A2 | Key Vault：per-subject DEK + tenant KEK | Restricted | ADR-002 若核准則新建之元件，crypto-shred 機制本體 |
| A3 | CAS 儲存物件 `/objects/sha256/...` | 依內容而定 | MP§58 L2570-2586 |
| A4 | Knowledge Memory 六型（Episodic/Semantic/Project/Personal Preference/Organization/Temporary） | 混合 | MP§14 L1116-1129 |
| A5 | Execution Manifest（document_version+content_hash） | Internal | 稽核鏈錨點，判斷載入哪版方法/政策 |
| A6 | Method Atlas / 母規格文件本身 | Internal | AI 決策依循的方法論本體，若可竄改則整條裁決鏈失效 |
| A7 | Provenance of Human Judgment 記錄 | Confidential | decision/actor/timestamp/reason/dissent（EC§87 L2664-2683） |
| A8 | Tenant 身分/設定 | Internal | tenant_id/encryption_root_key_ref/data_residency_region（ADR-003 schema） |
| A9 | Supply Chain 簽章金鑰 | Restricted | Signed Commit / Artifact Signing（MP§66 L2772-2790） |
| A10 | Jurisdiction Pack 規則集 | Internal | 決定 Global Privacy Engine Rights Model 各項權利落地（MP§100 L4259-4278） |
| A11 | AI Gateway 路由決策 | Internal | Capability Resolver→Policy Engine→Gateway（MP§7 L577-601） |
| A12 | 人類 Approver 認證 session | Restricted | R3/R4 核准權信任根（EC§8 L379-476） |

### 2.2 Trust Boundaries

| ID | Between | 說明 | 現況 |
|---|---|---|---|
| TB-1 | Untrusted External Content ↔ Policy/System Instructions | PDF/Web/Email/Upload/Tool Output 一律預設 `UNTRUSTED DATA`（EC§35 L1370-1408） | 結構原則存在，機制未定義（SEC-4） |
| TB-2 | 攻擊者 ↔ 人類 Approver session | R3/R4 核准權（EC§8 L454-476） | 無驗證強度要求（SEC-3） |
| TB-3 | R3/R4 核准 gate ↔ AI 自主執行 | `Capability ≠ Authority`（EC§9 L478-484） | A0-A4 對應人類組織角色未定義（SEC-6） |
| TB-4 | AI Agent capability ↔ Tool Broker authority | Tool Broker 可限制 command/path/network/DB role 等（EC L2867-2876） | 哪個角色可請求哪個 capability 無 RBAC/ABAC schema（SEC-5） |
| TB-5 | Tenant A ↔ Tenant B（儲存層） | ADR-003 tenant-scoped CAS 命名空間 | **僅 CAS 層**；relational data + 共用 Vector Index/Knowledge Graph 未定義（SEC-7 部分） |
| TB-6 | Local Model ↔ Cloud Model 路由 | MP§61 分級路由（Restricted→deny external AI）；AI Gateway L577-601 | 依賴資料先被正確標記分級，標記機制與 fail 行為未定義（I3，新發現） |
| TB-7 | Event Ledger ↔ Key Vault | ADR-002 新引入邊界 | Key Vault 可用性成為新單點故障（D1） |
| TB-8 | CI/Build Pipeline ↔ Production Deployment | Supply Chain（MP§66 L2772-2790） | SBOM/簽章/SLSA 無具體標準版本（SEC-2） |
| TB-9 | Sovereign Regional Cell（EU/US/APAC）↔ 彼此 | Local KMS per Cell（MP§104 L4405+） | 網路層強制執行機制未定義（P1-GAP-INFRA-12） |

---

## 3. STRIDE Analysis

| # | STRIDE | Element/Boundary | 威脅描述 | Source | Severity | Mitigation（既有/待建） | Residual Risk |
|---|---|---|---|---|---|---|---|
| S1 | Spoofing | AI Gateway / Workload identity（TB-6） | Zero Trust 鏈（MP§62 L2668-2673）只有階段名稱，無 IdP/OIDC、無 SPIFFE/mTLS、無 PDP 引擎綁定 | P1-GAP-SEC-1 | High | **UPDATED（2026-08-30，全數 3 項）**：`docs/adr/ADR-016-zero-trust-workload-identity-and-pdp-selection.md` 已裁決全部 3 子項——workload identity（雲端原生 mTLS，SPIFFE 延後附具體重評條件）+ PDP 引擎（Cedar）由 Claude 依供應商支出判準批准；IdP/OIDC provider 依判準正確保留給操作者後，操作者同日於對話中直接明示決定自架 **Zitadel**（優於 Keycloak），非 Claude 拍板；已建成 `policies/security/zero-trust.policy.yaml`（`status: ACTIVE`） | 3 項協定/引擎全數定案，威脅模型「形狀未定」缺口已關閉；剩餘殘留風險是**實作層級**（Zitadel 自架的部署/patch/scale/on-call 是否落實），非本列原本描述的「無協定綁定」問題 |
| S2 | Spoofing | 人類 Approver session（TB-2） | 釣魚/session 劫持者對 R3/R4 破壞性操作按下核准，Audit Event 記錄「合法核准者身分」 | P1-GAP-SEC-3 / P1-RISK-SEC-1 | High | EC§87 要求豐富 provenance，但這是**核准後的紀錄品質**，不解決**核准當下的身分驗證強度** | 即使記錄完整，仍只證明「哪組憑證」按下核准，不證明「真人」按下 |
| T1 | Tampering | Supply Chain 簽章金鑰（A9, TB-8） | CI/簽章金鑰外洩 → 惡意 artifact 通過「Verified Deployment」 | P1-GAP-SEC-2 / P1-RISK-SEC-4 | High | **UPDATED（2026-08-30）**：`docs/adr/ADR-015-supply-chain-security-tooling-selection.md` 裁決 Sigstore/cosign **keyless** 簽章——這不只是「選了一個格式」，而是結構性改變原始威脅：keyless 簽章不存在需要長期保管的 CI 簽章私鑰（改用 OIDC 短期憑證 + Fulcio + Rekor 透明日誌），P1-RISK-SEC-4 描述的「簽章金鑰外洩」攻擊面本身被消除，非僅緩解；已建成 `policies/security/supply-chain-security.policy.yaml` | **訂正（2026-08-30，真實 `/codex-review` MEDIUM finding，已驗真）**：原文誤稱 keyless 簽章的信任根「與 ADR-016 IdP 選型形成未斷開的依賴」——這混淆了兩個不相干的信任域。ADR-015 選定的即時機制是「GitHub Artifact Attestations on GitHub-hosted runners」，其 OIDC 憑證由 **GitHub Actions 自己內建的 token issuer** 簽發給 Fulcio（GitHub 自己的基礎設施，非本專案選的任何廠商）；`idp_provider`（WorkOS vs 自架 Zitadel/Keycloak）管的是本專案**自己的**應用/workload 身分，CI 簽章流程完全不會用到它。原始「該用 §148 哪種 KMS 模式保護簽章私鑰」問題因無長期私鑰而不再適用，且**不存在**與 IdP 選型的跨域依賴——此列風險已乾淨解決，非部分解決 |
| T2 | Tampering / 交叉 Elevation of Privilege（E4） | Untrusted Content → AI 決策流（TB-1, A4） | Prompt injection 竄改 tool-call 決策；若寫入 Knowledge Memory 則等同給予注入內容永久性、被誤信為已驗證的權限 | P1-GAP-SEC-4 / P1-RISK-SEC-2 | Medium（單次）／實質 High（若滲入記憶） | EC§35 已定義結構原則：`Policy/System Instructions ≠ Retrieved Source Data` — 良好結構控制 | 原則存在但無落地機制：無 untrusted span 標記方案，無說明該標記能否在寫入 Knowledge Memory 後存活 |
| T3 | Tampering | Method Atlas / 母文件（A6） | 若 Recipe/Method 定義本身可被竄改，下游 AI agent 會在自以為遵循 SSOT 的情況下執行錯誤流程 | **新發現**（過 Asset A6 才浮現） | Medium | Execution Manifest 已要求記錄 Atlas content_hash——偵測機制存在 | 偵測≠預防；誰有權修改母文件的授權模型未文件化 |
| R1 | Repudiation | 人類 Approval provenance（A7, TB-2） | 與 S2 同一根因 | P1-GAP-SEC-3 / P1-RISK-SEC-1 | High | EC§87 結構設計良好 | 結構完整不等於身分驗證完整 |
| R2 | Repudiation | 「第二個 AI」獨立驗證 | EC 明文「第二個 AI 不是法律意義的人類 approval」（L2031） | 無對應 GAP（既有良好設計） | Low | 已妥善防護 | 建議 `approval.actor_type` 明確區分 human/automated 的機讀 enum |
| I1 | Information Disclosure | 共用 Vector Index / Knowledge Graph（TB-5） | 多租戶 RAG 檢索範圍設定錯誤，Tenant A 問題可能檢索到 Tenant B 機密片段 | P1-GAP-SEC-7 / P1-RISK-SEC-3 | High | **UPDATED（2026-08-29）**：`docs/architecture/DATA_ARCHITECTURE_PLAN.md` §6（同日撰寫但本表當時未交叉引用，屬過期宣稱）已裁決：mandatory tenant_id filter + Row-Level Security（引擎層強制），未來若換不支援原生 RLS 的專用向量產品則強制 per-tenant collection/namespace，漏寫過濾條件回傳空集合而非另一租戶明文——已建成 `specs/security/tenant-isolation-controls.schema.yaml` | 設計已定案並機讀化，但實際 RLS policy SQL/DDL 與跑分測試仍是實作階段任務（見該檔 `open_questions.OQ-TENANTISO-3`）；決策本身已由 ADR-013（2026-08-30）批次追認，`OQ-TENANTISO-1` 已結案 |
| I2 | Information Disclosure / 交叉 Detectability（Dt1） | CAS dedup timing side-channel（A3） | "Instant upload" 洩漏「其他租戶已持有相同內容」事實 | ADR-003 Context（同源 SEC-7） | Medium | ADR-003 Option A（tenant-scoped namespace）結構性消除 | 若改採 Option C 窄化全域例外池，殘留風險移至該分類機制本身是否洩漏租戶參與事實 |
| I3 | Information Disclosure | AI Gateway 分級路由（A11, TB-6） | 路由規則依賴資料被正確標記分級；標記機制、遺漏標記時 fail-open/fail-closed 皆未定義 | **新發現** | Medium-High | 無 | 建議比照 SEC-8 手法，Phase 3 明文：未標記資料一律視為 Restricted（fail-closed） |
| D1 | Denial of Service | Key Vault（A2, TB-7，ADR-002 新元件） | 「若 Key Vault 資料遺失，等同全體使用者個資一次性被 crypto-shred」（ADR-002 自我揭露） | ADR-002 Consequences | High | ADR-002 已標記須納入 §112 30-year Replacement Drill 測項——尚未寫入 EC | 備援設計未定案前維持 High |
| D2 | Denial of Service | AI Gateway 單一瓶頸 | 僅列 "Fallback" 一詞，無 timeout/circuit-breaker/降級模式設計 | **新發現** | Medium | 無（僅詞彙存在） | Phase 3 前需具體設計 |
| D3 | Denial of Service — **方法論 meta-finding** | 全系統 | Phase 1 六角色群 security_privacy_iam cluster 產出 9 條 GAP，**零條屬 DoS 類別** | 本次 STRIDE 首次系統化檢查 | — | — | 印證 Atlas 選方法表警告：ad hoc lens scan 遺漏一整個 STRIDE 維度，形式化方法立刻補上（D1/D2）——建議 Phase 1 registers 追加對應 GAP/RISK 條目 |
| E1 | Elevation of Privilege | RBAC/ABAC（TB-4） | 全文 RBAC/ABAC 僅出現於定價 SKU 條列，零與任何 gate/risk tier 綁定 | P1-GAP-SEC-5 | High | 無 | **阻斷性**：Phase 3 schema 設計前必須先有角色/權限模型可依循 |
| E2 | Elevation of Privilege | 「Role」命名衝突 | 存取控制 role vs. MP§15-19 認知模擬人格 role，全文從未消歧義 | P1-GAP-SEC-5（detail） | Medium（放大 E1） | 無 | 建議未來 schema 用 `access_role` vs `cognitive_persona` 明確分離欄位命名 |
| E3 | Elevation of Privilege | 人類 Least Privilege | 未定義哪些人類職稱有資格核准 R3/R4，也未說明人類組織角色如何對應 A0-A4 | P1-GAP-SEC-6 | Medium | EC§9 定義了 AI 側的 Autonomy Levels；缺人類側對應 | MVP 若為單一操作者可合理延後 |
| E4 | Elevation of Privilege | 同 T2 | Prompt injection 成功操縱 `Capability+Policy+Authority` 決策 = 注入內容自我授予提升的工具權限 | 同 T2 | 同 T2 | 同 T2 | 同 T2（同一根因跨 STRIDE 兩維度屬正常現象） |

---

## 4. LINDDUN Analysis（聚焦個資流）

| # | LINDDUN | Data Flow / Asset | 威脅描述 | Source | Severity | Mitigation | Residual Risk |
|---|---|---|---|---|---|---|---|
| Lk1 | Linkability | Personal Preference + Semantic Memory + 跨 workspace Vector Index（A4） | 缺乏查詢範圍界線，可能讓資料主體的資訊在不同 Project/Workspace 間被連結 | P1-GAP-SEC-9（+ 交叉 SEC-7） | Medium-High | MP§14 僅列願景清單，非具體控制 | High，待 Phase 3 定義跨 project/workspace 記憶檢索範圍規則 |
| Id1 | Identifiability | Event Ledger 個資欄位（A1），ADR-002 crypto-shred 後 | ADR-002 自陳：「Identifiability 維度未完全歸零——event type、timestamp 等未加密 metadata 仍可能洩漏『此 subject 曾經存在過』的事實」 | ADR-002 Option A 段落 | Medium | ADR-002 明確列為 Phase 2 DPIA 待辦 | Medium，已有追蹤機制 |
| Nr1 | Non-repudiation（隱私意義：無法否認） | Provenance of Human Judgment（A7） | EC§87 要求永久保存 decision/actor/reason/dissent —— 對 STRIDE Repudiation 是優點，但對人類 Approver 本人是隱私成本 | **新發現** | Low-Medium | 無討論 | 需 Phase 3 釐清：Approver 本人能否對自己的紀錄行使 Rights Model 的 Access/Deletion 權利 |
| Dt1 | Detectability | CAS dedup timing side-channel（A3） | 同 STRIDE I2 | ADR-003 Context | Medium | ADR-003 Option A 結構性消除 | 同 I2 |
| Ds1 | Disclosure | 共用 Vector Index / Knowledge Graph（A4, TB-5） | 同 STRIDE I1，但 LINDDUN 視角聚焦「資料主體的個資」而非泛指機密資訊 | P1-GAP-SEC-7 / P1-RISK-SEC-3 | High | 同 I1，**UPDATED（2026-08-29）**：見 I1 列，`tenant-isolation-controls.schema.yaml` 已建 | 同 I1（設計已定案機讀化，實作與正式 ADR 批准仍待後續） |
| Uw1 | Unawareness | Semantic Memory / Organization Knowledge（A4） | 注入內容一旦固化進記憶，任何資料主體的檔案被此「知識」豐富化，本人完全不知情該資訊源自攻擊者而非驗證事實 | P1-GAP-SEC-4 / P1-RISK-SEC-2 | Medium-High | 同 T2 | 同 T2 |
| Uw2 | Unawareness | Global Privacy Engine Rights Model（A10） | Jurisdiction Pack 缺失/不完整時，提出刪除請求的資料主體無法知道自己的請求被當「最嚴格處理」還是「不處理」 | P1-GAP-SEC-8 | Medium-High | 無 | High，待寫入 fail-closed 預設 |
| Nc1 | Non-compliance | 同上（A10） | 缺 fail-closed 預設本身即是合規缺口 | P1-GAP-SEC-8 | High | ADR-002 解決「刪除機制本身」，**但不解決「何時該觸發刪除」** | High，ADR-002 必要但不充分 |
| Nc2 | Non-compliance | Knowledge Memory 六型（A4） | 六型使用同一句抽象保留要求帶過，未依資料分級/是否含個資差異化 | P1-GAP-SEC-9 | Medium | MP§14 僅列願景清單 | Medium，待 Phase 3 記憶子系統 schema 設計 |

---

## 5. Prioritized Threat List

### 必須在 Phase 3 machine-readable spec 定稿前解決

| 順序 | 威脅 | 理由 |
|---|---|---|
| 1 | E1 RBAC/ABAC 角色模型 + E2 命名消歧義 | **阻斷性**：沒有角色/權限模型，Phase 3 schema 無從設計起 |
| 2 | I1/Ds1 relational data RLS 決策 + Vector Index/Knowledge Graph tenant-scoping | ADR-003 明文列為自己的未解 follow-up。**UPDATED（2026-08-29）**：設計層級已透過 `specs/security/tenant-isolation-controls.schema.yaml` 定案並機讀化——本項「Phase 3 machine-readable spec 定稿前解決」的字面要求已達成；正式 ADR 批准與實際 RLS policy 落地仍是後續步驟，非本優先序清單原本要求的範圍 |
| 3 | S1 Zero Trust 協定綁定（選定 IdP/OIDC + workload identity 標準） | Phase 3 任何 auth flow 編碼前必須先有協定可依循 |
| 4 | S2/R1 人類核准驗證強度 + action-binding 簽章 | EC§87 的 provenance record 在此之前只是「看起來完整」 |
| 5 | D1 Key Vault 備援設計 | ADR-002 核准當下必須同時附上，不可「先上線後補」 |
| 6 | T2/E4/Uw1 Untrusted-content 標記在 Knowledge Memory 寫入路徑的存續機制 | 須在記憶子系統 ingestion pipeline 設計前解決 |

### 應在 Phase 5 MVP 上線前解決

| 順序 | 威脅 | 理由 |
|---|---|---|
| 7 | T1 Supply Chain 標準（SBOM/簽章/SLSA）+ 簽章金鑰綁定 §148 KMS 模式 | 需在第一條真實 CI pipeline 存在前定案 |
| 8 | Uw2/Nc1 Jurisdiction Pack fail-closed 預設 | 即使 MVP 只服務單一管轄權，預設值也應現在寫死 |
| 9 | I3 AI Gateway 分級標記 fail-closed 預設 | 與 #8 同型缺口 |

### 可留待 MVP 之後（追蹤，不阻斷）

| 順序 | 威脅 | 理由 |
|---|---|---|
| 10 | E3 人類 Least Privilege → A0-A4 對應 | MVP 可能為單一操作者 |
| 11 | Nc2 記憶保留期限差異化 | 需累積真實使用者個資規模才觸發實質監理曝險 |
| 12 | Lk1 跨 project/workspace 記憶連結性 | 同 #11 |
| 13 | Nr1 人類 Approver 對自身紀錄的隱私權 | 政策性開放問題 |
| 14 | D2 AI Gateway circuit-breaker 設計 | 維運強化 |
| 15 | Id1 crypto-shred metadata 殘留可識別性 | ADR-002 已自行列為 DPIA 待辦 |

---

## 6. Residual Risks（誠實揭露，不隱藏）

1. **Key Vault 成為新單點故障**：即使補齊備援設計，crypto-shred 機制本質上仍需要「某個集中金鑰權威」存在——可以做到高可用，無法做到消除概念本身。
2. **ADR-002 Identifiability 殘留**：metadata（event type/timestamp）洩漏「此 subject 曾存在」的事實，已誠實列為 DPIA 待辦而非阻塞項。
3. **ADR-003 若採 Option C**：narrow 全域去重例外池本身是新的、範圍受限但真實存在的攻擊面。
4. **方法論殘留**：Phase 1 六角色群 lens scan 對 DoS 類別零覆蓋（D3），證明 ad hoc scanning 無法保證 STRIDE 六維度完整——建議所有未來新元件在加入時都跑一次本文件等級的正式 STRIDE/LINDDUN。
5. **本文件本身未經 Codex 交叉驗證**：建議操作者核准前安排一輪 `codex-oracle.ps1 -Mode review` 對抗式覆審。
6. **Attack Tree / Adversarial Test 未執行**：這不是「風險已消除」，而是「Phase 2 階段沒有可攻擊的具體對象」——待 Phase 3/4 落地後，本文件的 STRIDE/LINDDUN 表格應作為 Attack Tree 建構的起點被重新引用。

---

## 7. Evidence

**Method Atlas**：L1121（Security 選方法表，禁 Checklist only）／L2234-2255（§11.44 STRIDE）／L2258-2276（§11.45 LINDDUN）／L3504-3519（§13.11 Security Review Recipe）

**Master Plan**：L262-275（§1.5 最小爆炸半徑）／L567-568（§6 RBAC/ABAC 定價條列）／L577-601（§7 AI Gateway）／L1116-1129（§14 Knowledge Memory 分層）／L2546-2586（§57-58 Event-native/Immutable-first）／L2639-2664（§61 安全架構分級/路由）／L2668-2673（§62 Zero Trust）／L2772-2790（§66 Supply Chain Security）／L2794-2817（§67 Deployment）／L4259-4278（§100 Global Privacy Engine Rights Model）／L4405-4413（§104 Sovereign Regional Cell）／L5637-5656（§148 Encryption & Key Sovereignty）

**Execution Contract**：L379-476（§8 Risk Tier, R4 Explicit Human Authority）／L478-484（§9 Autonomy/Authority Levels）／L1099-1126（§27 Event/Messaging Contract）／L1181-1230（§31 Data Deletion Contract）／L1255-1284（§32 Security Change Contract）／L1370-1408（§35 Untrusted Content/Prompt Injection Contract）／L2031（第二個 AI 非法律人類 approval）／L2664-2697（§87-88 Provenance of Human Judgment / Reversal Criteria）／L2867-2897（§97 Least Privilege, Tool Broker）

**ADR**：`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md`（全文）／`docs/adr/ADR-003-tenant-model-and-cas-isolation.md`（全文）／`docs/adr/ADR-001-scoped-authority-precedence-unification.md`（Execution Manifest 記錄 Atlas content_hash 先例）／`docs/adr/ADR_INDEX.md`

**Phase 1 Registers**：`.ai/research/phase-1/GAP_REGISTER.yaml`（P1-GAP-SEC-1~9 全文）／`.ai/research/phase-1/RISK_REGISTER.yaml`（P1-RISK-SEC-1~4 全文）

**邊界確認**：本次任務全程僅執行 Read/Grep/Bash（唯讀），未對三母文件或任何既有規格檔案做任何修改，未建立任何 policy 檔案，未執行任何實際攻擊或滲透測試行為。
