# ADR-007: PII Redaction Effective-Date vs Pseudonymization "Future Capability" Timing Conflict
（v1 即生效的日誌去識別化政策 vs 被自稱「未來能力」的唯一命名技術）

Status: ACCEPTED（2026-08-29，操作者明示授權 Claude 行使架構師裁決權，見 ADR-001 同款範圍聲明：ADR 決策定案 ≠ 母文件已編輯，套用仍須走 ADR-006 `.ai/proposals/` 流程，該流程 APPROVED 僅操作者可推進）
Date: 2026-08-29

## Context

Phase 1 對抗式驗證（`CONFLICT_REGISTER.yaml` P1-CONFLICT-3，severity: high，origin: security_privacy_iam GAP-9 promoted from GAP_REGISTER duplication_candidates note）確認一條時效矛盾，是 4 條 high-severity CONFLICT 之一；`MACHINE_READABLE_SPEC_PLAN.md:19` 與 `:184` 已明確登記本衝突**尚無 ADR**，並把 `policies/privacy/` 的 PII/pseudonymization 段標記 `BLOCKED_PENDING_ROUND2_ADR`——本 ADR 是該項的裁決。

**Statement A**（Execution Contract §101 Data Classification + §102 Logging Contract，逐字，v1 即生效）：

- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2966-2971`（§101，Restricted 分級下）：

  ```text
  Restricted：
  - external provider routing must be policy-approved
  - logs redacted
  - local / sovereign route when required
  ```

- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2974-2999`（§102 Logging Contract）：Log 必須同時具備 `structured / correlatable / redacted / bounded / retention-controlled`（值於 L2979-2984，**`correlatable` L2980 與 `redacted` L2981 緊鄰**）；並在 L2999 明文「禁止敏感 payload 全量 dump」。

**Statement B**（Master Plan §149 Privacy-preserving Computation，逐字，自我歸類為未來能力）：

- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5659-5672`：

  ```text
  # 149. Privacy-preserving Computation
  未來高階能力可支援：
  - Pseudonymization
  - Tokenization
  - Differential Privacy
  - Secure Enclaves
  - Federated Analysis
  - Federated Learning
  - Secure Multi-party Computation
  - Homomorphic Encryption（只在適用成本與成熟度下）
  不得為了「先進」而無條件採用高複雜技術；需通過成本、維護、威脅模型驗證。
  ```

**不相容原因（逐字核對後的精確版本，比 CONFLICT_REGISTER 摘要更細）**：`PII` 一詞全文（MP+EC+Atlas 三份母規格）Grep **零命中**（僅在 `.ai/research/` 分析檔案與 ADR-002 中出現，母文件本身從未使用此詞）。EC §102 v1 即生效地要求 log 同時滿足「redacted」與「correlatable」；MP §149 把唯一命名的去識別化技術 **Pseudonymization** 與 **Tokenization**，和貨真價實仍在成熟中的 **Homomorphic Encryption / Federated Learning / SMPC** 並列在同一份「未來高階能力」清單，**未做任何成熟度分級**——這正好違反該段自己接下來那句話的精神（L5672：「不得為了『先進』而無條件採用高複雜技術；需通過成本、維護、威脅模型驗證」）：清單本身從未通過這個驗證就被整批貼上「未來」標籤。

**外部查證（WebSearch，2026-08-29）確認清單內部成熟度落差是真實的，不是本 ADR 的臆測**：
- GDPR Art. 4(5) 自 2016/2018 生效起即正式定義 Pseudonymisation：「在不使用額外分開存放且有技術/組織措施保護的資訊下，個資不能再被歸屬到特定資料主體的處理方式」；Art. 32 把它列為**應考慮的基準安全措施**（security measure），與加密同級，不是先進技術。Tokenization 是業界對同一原理的具體實作（keyed hash / vault lookup），同樣是十年以上的成熟基準模式（IAPP、ICO、Ireland DPC 官方指引一致確認）。
- 對比 Homomorphic Encryption：即使到 2026 年，CPU-only 實作仍可能比明文運算慢達 10,000 倍，只有搭配硬體加速的批次分析類工作負載才勉強達到 production SLA，即時交易級延遲仍不可行（Duality Technologies 2026 FHE benchmark）。Federated Learning 相對成熟但屬於分散式訓練基礎設施，與「log 裡的一個欄位怎麼記」是完全不同量級的工程投資。
- 結論：MP §149 把「十年前就有法規明文定義、業界標準做法」的 Pseudonymization/Tokenization，和「2026 年仍在效能爬坡、需要專門硬體」的 Homomorphic Encryption 混在同一個「未來」標籤下，是**清單本身的分級缺陷**，不是「這整類技術都還沒準備好」。

**Scoped Authority 分析（為什麼 EC §2.1 的衝突解決順序不會自動解掉這條矛盾）**：`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:96-125`（§2 Scoped Authority 表 + §2.1 衝突解決順序）把「AI 執行生命週期」（EC §102 Logging Contract 所屬）與「Security/Data/Deployment 架構」（MP §149 所屬）列為**兩個不同 Scope**，各自的 Authoritative Source 不同（EC vs MP+approved machine policies）。兩份文件目前都只是「Scoped Normative Document」（衝突解決順序第 5 層），尚未有任何 `Approved Machine-readable Contract/Schema`（第 3 層，權威高於兩者）把兩個 Scope 的宣稱綁在一起——這正是 `MACHINE_READABLE_SPEC_PLAN.md` 把 `policies/privacy/` 標記 BLOCKED 的根本原因：矛盾不會自動被既有治理層級表解開，必須新增一份權威更高的 machine-readable policy 把兩邊的宣稱統一，這正是本 ADR 要產出的東西。

**現有可掛鉤的鄰接積木（本 ADR 必須重用，不得發明第四套平行機制）**：

| 既有機制 | 位置 | 可用於 |
|---|---|---|
| 資料分級 Public/Internal/Confidential/Restricted | MP §61（L2639-2664）與 EC §101（L2955-2971）**完全一致**，無漂移 | 判斷哪些 log 欄位需要走本 ADR 機制，不必新發明第五種分級 |
| Encryption & Key Sovereignty（§148） | MP L5637-5656 | 本 ADR 的 HMAC 金鑰主權層級直接沿用，不新建第二套 Key Vault |
| ADR-002 `personal-data-envelope.schema.yaml` + `key-vault-lifecycle.schema.yaml`（`MACHINE_READABLE_SPEC_PLAN.md:146-147`，Wave 2，READY） | 已為 crypto-shredding 建立 tenant 級 KEK + per-subject DEK 的 Key Vault 基礎設施 | **本 ADR 的 v1 log 去識別化機制直接消費同一個 Key Vault**，只是多開一種金鑰用途（HMAC 簽章金鑰，非 DEK），不是重造 |
| `policies/privacy/`（`MACHINE_READABLE_SPEC_PLAN.md:48, 184`） | 目前部分 BLOCKED_PENDING_ROUND2_ADR | 本 ADR 的 Recommendation 直接填入此目錄的內容缺口 |

**與 P1-CONFLICT-1（ADR-002）的血緣關係**：ADR-002 自己的 Evidence 段（`docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:124`）已經點名 MP §149「標注『未來能力』，與 P1-CONFLICT-3 同源」——本 ADR 是 ADR-002 當時預留的未爆彈，兩者同屬個資分級體系的鄰接決策，Key Vault 基礎設施本應一次建好給兩邊共用。

**附帶發現的文件缺陷（不在本 ADR 修復範圍，僅誠實記錄避免誤導）**：`GAP_REGISTER.yaml:264` 的 `duplication_candidates` 註記寫「見 DUPLICATION_REGISTER.yaml P1-DUP-4（PII redaction 政策 vs pseudonymization「未來能力」時序矛盾...)」，但實際 Grep `DUPLICATION_REGISTER.yaml:62-71` 的 `P1-DUP-4` 內容是「因果推論方法在 MP 敘事列表與 Atlas F11 結構化目錄中重複定義」，與 PII 完全無關——這是一條**指錯 ID 的內部交叉引用**（真正的 PII 矛盾唯一正確登錄在 `CONFLICT_REGISTER.yaml` 的 `P1-CONFLICT-3`）。此為 GAP_REGISTER.yaml 自身的索引錯誤，與三母文件無關，不影響本 ADR 的裁決依據，故不在此修正，僅記錄供後續文件清理參考。

## Decision Drivers

1. **不能是補丁**（AGENTS.md R0 補丁判準）：必須定義「這一類問題的不變量」——未來任何新的個資去識別化技術被提出時，判斷它屬於 v1 baseline 還是 future advanced 的規則必須是可重複套用的，不是本次只解「Pseudonymization」這一個字眼的個案修法。
2. EC §102 Logging Contract 是 **v1 即生效**的硬性要求，且同時要求 `redacted` 與 `correlatable`（L2980-2981 緊鄰）——任何方案若犧牲其中一項就是製造新矛盾，不是解決舊矛盾。
3. MP §149 自己的驗證原則（L5672：成本/維護/威脅模型驗證）必須真的被套用在清單分級上，而不是被清單本身違反。
4. 必須重用既有詞彙與基礎設施（§61 分級、§148 金鑰主權、ADR-002 Key Vault），不新建第四套平行機制。
5. 專案目前是 pre-MVP 文件階段，尚無 production log 資料，現在決定的遷移成本趨近於零。
6. 必須解除 `MACHINE_READABLE_SPEC_PLAN.md:184` 的 `BLOCKED_PENDING_ROUND2_ADR`，讓 `policies/privacy/` 可以往下走。

## Sub-decision (a)：v1 log 去識別化的具體技術機制 — Options Considered

比較維度：Correctness（同時滿足 redacted+correlatable）/ Regulatory validity / Complexity / 是否重用 ADR-002 Key Vault / Migration / 30-year Survivability。

| 維度 | A. Deterministic Keyed-HMAC Tokenization | B. 純 Static Masking/Drop | C. 完整 Envelope Encryption（比照 ADR-002 DEK 模式套用在 log 欄位） | Status Quo |
|---|---|---|---|---|
| Correctness（同時滿足兩要求） | High — 同一 subject 每次雜湊出同一 token，可關聯；原始明文不落地 | **Low** — 遮蔽/丟棄後不同 log 行之間**無法關聯同一個使用者**，直接牴觸 EC L2980 `correlatable` 硬性要求 | High，但需要對每筆 log 呼叫解密才能關聯，效能與威脅面成本遠高於單向雜湊需求 | N/A（規則彼此矛盾） |
| Regulatory validity | High — 正是 GDPR Art.4(5)/Art.32 定義的 pseudonymisation：需額外資訊（此處=HMAC 金鑰）分開保存才能還原 | 若做成不可逆遮蔽，技術上更接近 anonymization 而非 pseudonymization，但犧牲關聯性 | High（同 ADR-002 Option A 已驗證的法規認可） | 未定義 |
| Complexity | Low-Medium — 只需一把 tenant 級 HMAC 簽章金鑰 + 標準函式庫（HMAC-SHA256） | Low | Medium-High — 每次讀 log 都要解密，且 log 系統通常是唯寫/低延遲場景，不適合掛加解密往返 | N/A |
| 重用 ADR-002 Key Vault | **是**——多開一種金鑰用途（HMAC signing key），Key Vault 生命週期管理機制完全共用 | 否，不需要金鑰但也放棄了關聯能力 | 是，但要求的是完整 DEK envelope，對 log 這種高吞吐、唯寫場景是過度設計 | N/A |
| Migration | 低（現況零 log 資料） | 低 | 中（需在 log pipeline 加解密路徑，影響面比 A 大） | 零（債務累積） |
| 30-year Survivability | High — 與 ADR-002 同一套 Key Vault 治理，金鑰輪替/銷毀機制天然共用 | 中——需求方遲早會補「其實需要能查同一使用者的所有 log」，屆時要重做 | 中——log 系統效能負擔隨資料量線性增加，30 年後是很重的技術債 | 最低——已被標記為時序矛盾 |

**FMEA 輕量檢查（沿用 ADR-002 的借用做法，Method Atlas 同無正式命名的 Causal/Compliance-timing 方法，見下方 Method Used 誠實聲明）**：

| Function | Failure Mode | Effect | Severity |
|---|---|---|---|
| Log 去識別化 | 使用不加鹽/不加密鑰的裸雜湊（如純 `sha256(email)`） | 低熵值個資（email/手機號）可被字典攻擊還原，等於沒有去識別化 | High（不可接受）——本 ADR 因此明訂**必須**用 keyed HMAC，金鑰存於 Key Vault，不得用無金鑰雜湊 |

## Sub-decision (b)：MP §149 清單本身的重新分級 — Options Considered

| 維度 | A. 依成熟度拆成兩層清單（v1_baseline vs future_advanced） | B. 僅加一句澄清文字（不重排清單） | C. 把 Pseudonymization/Tokenization 整條移出 §149，直接寫入 §101/§102 | Status Quo |
|---|---|---|---|---|
| 是否解決不變量 | 是——建立「成熟度分級」規則，未來任何新技術被提名時都套用同一驗證標準（L5672 原則），非一次性個案 | **否**——只是在矛盾旁邊加註解，機制仍未定義，違反 R0 補丁判準（「只關掉這一個實例」） | 部分——解決了本次矛盾，但清單分級的**規則**沒有被建立，下一個類似技術（例如未來新增 "Format-Preserving Encryption"）出現時，又要重新吵一次該歸哪邊 | N/A |
| 與既有內容相容性 | 高——清單其餘 6 項（Differential Privacy 起）維持不動，只是多一層分類標籤 | 高 | 中——破壞 §149 清單的完整性，Homomorphic Encryption 等 6 項失去與 Pseudonymization 並列比較的上下文 | N/A |
| 30-year Survivability | High——分級規則本身可重複套用於未來任何新技術提案 | 低——矛盾的「形狀」還在，換個技術名字就會再犯 | 中 | 最低 |

## Method Used

**如實聲明（比照 ADR-002 §Method Used 的誠實揭露原則）**：Method Atlas 全文 Grep 確認**沒有**一個正式命名、專門處理「政策生效時點 vs 能力成熟時點衝突」這一類問題的方法。最接近的是兩個**表格列項、未展開為獨立 `## 11.x` 協定小節**的工具：

- **Compliance Gap Analysis**（Atlas F23，`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:947`：`required controls vs implemented→gaps→severity→plan`）——結構與本衝突的形狀完全對應（required=EC§102 今天要的、implemented=無、gap=Pseudonymization 被誤標未來），本 ADR 借用它的四步骨架組織 Context/Recommendation。
- **MoSCoW**（Atlas F16，`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:760`：`Must/Should/Could/Won't`，用於 release scope）——為 Sub-decision (b) 的「拆成 v1_baseline（Must，本次上線就要）vs future_advanced（Won't，明確排除待未來）」提供現成詞彙，避免發明第四套分級名稱。

兩者皆未在 Atlas 中發展成完整協定小節，屬於工具箱條目而非正式指定方法，比照 ADR-002 借用 FMEA 的做法——**借用相鄰工具補位，不是 Atlas 對本情境的正式指定方法**，如實聲明而非佯稱有精確對應方法。

**沿用 ADR-002 已驗證的方法**（同一衝突家族，ADR-002 Evidence 已預先點名 §149 與本衝突同源）：
- **LINDDUN 隱私威脅建模**（Atlas §11.45，`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:2258-2276`）：用於 Sub-decision (a) 各選項的 Identifiability 分析——Option A（keyed-HMAC）殘留風險與 ADR-002 Option A 相同等級（metadata 仍可能洩漏「此 subject 曾存在」，但明文不可還原）。
- **DPIA/PIA**（Atlas §11.46，`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:2278-2296`）：作為 Recommendation 段落的骨架（Processing→Purpose→Necessity→Risks→Controls→Residual Risk）。

**比較矩陣骨架**：依任務指示明確要求驗證後才可引用——已確認 **Weighted Decision Matrix**（Atlas §12.33，`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:2987-3004`：`Options×Criteria×Weights→Scores→Sensitivity→Decision`）確實存在，作為上方兩張比較表的骨架。**MCDA**（Atlas §11.32，`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:1951-1977`）同樣確認存在，是 Weighted Decision Matrix 的加權/多方 stakeholder 進階版；本案兩個 Sub-decision 的選項在多數維度上呈技術上的支配關係（Option A/該 Sub-decision 的推薦選項在幾乎每個維度都不劣於其他選項），不需要 MCDA 的 stakeholder-weight 與 sensitivity 分析機制即可決斷，Weighted Decision Matrix 已足夠支撐判斷——與 ADR-004 §Method Used 的判斷邏輯一致（一般架構比較已足夠時，不強行套用更重的方法）。

## Recommendation

**Sub-decision (a) 採用 Option A（Deterministic Keyed-HMAC Tokenization，重用 ADR-002 Key Vault）；Sub-decision (b) 採用 Option A（把 MP §149 清單依成熟度拆成 `v1_baseline` 與 `future_advanced` 兩層，重用 MoSCoW 的 Must/Won't 詞彙）。**

**不變量陳述**（回應 R0 補丁判準）：

> 一項去識別化技術該歸類為「v1 可用」還是「未來能力」，取決於**它是否已是法規/業界認可的成熟基準措施（如 GDPR Art.32 明文列舉的安全措施）且不需要專門硬體或研究級基礎設施**——不取決於它的名字聽起來「先進」與否。凡符合此判準的技術（本次確認：Pseudonymization、Tokenization）立即歸入 v1_baseline；凡真正需要成本/維護/威脅模型驗證仍無法通過（Differential Privacy 之後 6 項，尤其 Homomorphic Encryption 在 2026 年 CPU-only 場景仍慢上萬倍）的技術才歸入 future_advanced。這條判準可重複套用於未來任何新提名的隱私技術，不需要每次個案吵一輪「這個算不算先進」。

具體技術落地：

1. **PII 欄位判定**：重用既有 MP §61/EC §101 的 Confidential/Restricted 分級（不新增第五種分級）；任何 log 欄位若承載可識別自然人的資料，該欄位所屬物件必須先被標記 Confidential 或 Restricted。
2. **v1 機制**：該欄位進入 log 前，以 **tenant 級 HMAC 簽章金鑰**（存放於 ADR-002 已提議的 Key Vault，金鑰用途新增 `hmac_signing_key`，與既有 `DEK`/`KEK` 並列，不新建第二套 Key Vault）做 `token = HMAC-SHA256(key, raw_value)`，log 中只寫入 `token`，不寫明文——同時滿足 `redacted`（明文不落地）與 `correlatable`（同一 subject 每次產生同一 token，可跨 log 行關聯）。
3. **自由文字/大型 payload 一律不進 log**：EC L2999「禁止敏感 payload 全量 dump」維持字面意義，不嘗試對整段自由文字做 tokenize——這類內容本來就不該出現在結構化 log 的欄位值裡，這是既有規則的延續，非本 ADR 新增負擔。
4. **MP §149 重新分級**：

   ```text
   v1_baseline（Must，本次即可用，已是法規承認的基準安全措施）：
     - Pseudonymization
     - Tokenization
   future_advanced（Won't，需個案通過成本/維護/威脅模型驗證後才排入 roadmap）：
     - Differential Privacy
     - Secure Enclaves
     - Federated Analysis
     - Federated Learning
     - Secure Multi-party Computation
     - Homomorphic Encryption（只在適用成本與成熟度下）
   ```

理由排序：Sub-decision (a) 的 Option A 是唯一同時滿足 EC §102 兩項硬性要求（redacted + correlatable）且不需要新建基礎設施的選項；Option B 直接牴觸 correlatable 要求；Option C 對 log 這種高吞吐寫入場景是過度設計，且與其重造一遍 ADR-002 的 envelope encryption，不如把已驗證的 Key Vault 拿來多開一種金鑰用途。Sub-decision (b) 的 Option A 是唯一同時解掉本次矛盾**並**建立可重複套用判準的選項；Option B 是 AGENTS.md 明文禁止的補丁（只關掉這一個實例，未來新技術命名重演同樣爭議）；Option C 犧牲了清單的完整性且同樣沒建立判準。

## Consequences

**正面**：`policies/privacy/` 的 `BLOCKED_PENDING_ROUND2_ADR`（`MACHINE_READABLE_SPEC_PLAN.md:184`）解除；EC §102 的 `redacted`+`correlatable` 雙重要求首次有具體技術落地；MP §149 的清單首次真正套用自己宣稱的驗證原則（L5672）；ADR-002 的 Key Vault 基礎設施獲得第二個消費者，避免重複建設；`PII` 一詞首次在治理文件（本 ADR 與後續 policy 檔）中被正式定義，不再是三母文件的隱形概念。

**負面／代價**：Key Vault 現在同時管理 DEK（ADR-002，加密用）與 HMAC signing key（本 ADR，簽章用）兩種金鑰用途，金鑰生命週期政策需要區分兩種用途各自的輪替頻率與銷毀規則（HMAC 金鑰若輪替，舊 token 與新 token 不再相等，等同破壞歷史 log 的可關聯性——這是 tokenization 的已知代價，需在金鑰輪替政策中明確標註「輪替 HMAC 金鑰 = 犧牲跨輪替邊界的可關聯性，換取降低長期金鑰外洩風險」的取捨，而非隱藏此代價）；需要新的欄位級 PII 標註工作（現況零標註，與 ADR-002 Consequences 項 4 的「event type 零標註」是同一類缺口在不同層級的重現）。

**需要新增的規格缺口**：

1. `specs/security/key-vault-lifecycle.schema.yaml`（ADR-002 已提議，Wave 2 READY）新增 `hmac_signing_key` 金鑰用途類型與其獨立輪替政策欄位。
2. 新增 `specs/security/log-redaction-token.schema.yaml`：定義 `token_alg`（固定 HMAC-SHA256）/`hmac_key_ref`/`classification_tag`/`tenant_scope` 欄位，依附 `key-vault-lifecycle.schema.yaml`。
3. `policies/privacy/pii-redaction.policy.yaml`（`MACHINE_READABLE_SPEC_PLAN.md:48,184` 原 BLOCKED 項）填入本 ADR 的 Recommendation 內容，解除 BLOCKED 狀態。
4. EC §101/§102 需要在條文中補上 `PII` 一詞的正式定義（目前全文零出現），並註明「Restricted/Confidential 分級中屬於可識別自然人的欄位 = PII，v1 走 tokenization」。
5. MP §149 依上方「Recommendation」段落拆分為 `v1_baseline`/`future_advanced` 兩個子清單。
6. 需要一輪欄位級標註工作：逐一檢視現有 log schema（EC §102 最低 keys：`timestamp/level/service/trace_id/task_id/execution_id/event/status`）確認目前 8 個最低欄位皆非 PII（`task_id`/`execution_id` 是系統產生的內部 ID，非可識別自然人資料，現況安全；但未來任何新增 log 欄位若承載使用者輸入或使用者識別資訊，必須先過本 ADR 機制）。

## Migration / Rollback

**Migration**：專案現階段無 production log 資料，此刻採用是遷移成本趨近於零的最佳時機。步驟（比照 ADR-004 每步走 `.ai/proposals/<n>-<slug>/` 流程，需操作者逐案批准）：
1. 在 `key-vault-lifecycle.schema.yaml` 新增 `hmac_signing_key` 金鑰用途（依附 ADR-002，非本 ADR 獨立新建）。
2. 新建 `log-redaction-token.schema.yaml`。
3. 撰寫 `policies/privacy/pii-redaction.policy.yaml`，解除 `MACHINE_READABLE_SPEC_PLAN.md:184` 的 BLOCKED 標記。
4. MP L5659-5672 依 Recommendation 段落拆分為兩個子清單（純文字重排，零語意流失——6 項未來能力全部保留，只是多一層分類標籤）。
5. EC §101/§102 補 `PII` 定義字句。
6. 每步完成後跑 R4「聲稱即驗證」：grep 確認 `MACHINE_READABLE_SPEC_PLAN.md` 的 BLOCKED_PENDING_ROUND2_ADR 字樣在 `privacy/` 這一列已被移除或更新為指向本 ADR。

**Rollback**：三份母文件已有 git baseline；MP §149 的拆分是純文字重排（同 ADR-004 §12.1 CALCULATED RESULT 移除的風險等級），`git revert` 對應 commit 即可完整還原成單一清單。`log-redaction-token.schema.yaml` 為新增檔案，回退等同刪除，無其他依賴方（除新寫的 log pipeline 程式碼，但那是 Phase 3+ 實作階段的事，文件階段的本 ADR 回退不受影響）。若日後認為 keyed-HMAC 不足以應付某個更嚴格的司法管轄要求，降級/升級路徑是換掉 token 的計算函式（例如改用不可逆的加鹽單向雜湊，犧牲關聯性換取更強的不可還原保證），Key Vault 與 log schema 本身不必重建——這是 Option A 優於 Option C（完整 envelope encryption）的 Reversibility 理由之一：改動侷限在 token 計算層，不牽動 log pipeline 的其餘部分。

## Evidence

- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2955-2971`（§101 Data Classification，Restricted 分級含 `logs redacted`，L2966-2971）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2974-2999`（§102 Logging Contract，`correlatable`L2980/`redacted`L2981 緊鄰；L2999 禁止全量 dump）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5659-5672`（§149 Privacy-preserving Computation，8 項未來能力清單 + L5672 驗證原則）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:2639-2664`（§61 資料分級，與 EC §101 一致，無漂移）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:5637-5656`（§148 Encryption & Key Sovereignty，本 ADR 的 HMAC 金鑰主權沿用此模型）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:90-125`（§2 Scoped Authority 表 + §2.1 衝突解決順序，解釋為何本矛盾不會被既有治理層級自動解開）
- `.ai/research/phase-1/CONFLICT_REGISTER.yaml:37-50`（P1-CONFLICT-3 原始登錄，逐字核對統計statement_a/b 行號與本 ADR 引用一致，僅 statement_a 的「~2966」在本 ADR 精確化為 L2966-2971 + L2974-2999 兩段）
- `.ai/research/phase-1/GAP_REGISTER.yaml:255-264`（P1-GAP-SEC-9 原始 gap 與其 duplication_candidates 註記；註記中的 P1-DUP-4 ID 經查證為指錯目標，見上方 Context 附帶發現）
- `.ai/research/phase-1/DUPLICATION_REGISTER.yaml:62-71`（P1-DUP-4 實際內容為因果推論方法重複，與 PII 無關，佐證上一條的錯誤引用）
- `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:19`（列出 P1-CONFLICT-3 為 4 條尚無 ADR 覆蓋項目之一）
- `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:48, 146-149, 184, 209-210`（`policies/privacy/` BLOCKED 現況、`specs/security/{personal-data-envelope,key-vault-lifecycle}.schema.yaml` 既有排程，本 ADR 直接依附而非重建）
- `docs/adr/ADR-002-personal-data-erasure-vs-event-immutability.md:16-27, 59-67, 91-93, 105-114, 124`（Key Vault/DEK/KEK 機制、`REDACTED` sentinel 設計、Evidence 段已預先點名 §149 與本衝突同源）
- Method Atlas：`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:947`（Compliance Gap Analysis, F23）／`:760`（MoSCoW, F16）／`:2258-2276`（§11.45 LINDDUN）／`:2278-2296`（§11.46 DPIA/PIA）／`:1951-1977`（§11.32 MCDA）／`:2987-3004`（§12.33 Weighted Decision Matrix）——Grep 全文確認 Atlas 無正式命名的「政策生效時點 vs 能力成熟時點衝突」專屬方法，上述皆為借用相鄰工具，如實聲明。
- 外部查證（WebSearch，2026-08-29）：GDPR Art.4(5)/Art.32 pseudonymisation 定義與基準安全措施地位（IAPP、ICO、Ireland DPC、Hunton Andrews Kurth 對 EDPB 指引的報導）；Homomorphic Encryption 2026 效能現況（Duality Technologies FHE benchmark：CPU-only 場景仍可達明文運算 10,000 倍延遲）。

**邊界確認**：本次任務全程僅執行 Read/Grep（唯讀）與 WebSearch，未對三母文件或任何既有檔案做任何修改；僅新增本檔案 `docs/adr/ADR-007-pii-redaction-vs-pseudonymization-timing.md`。
