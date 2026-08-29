# ADR-002: Personal-Data Erasure under Event-Native Immutable Architecture
（事件溯源不可變架構下的個資刪除機制）

Status: PROPOSED
Date: 2026-08-29

## Context

Phase 1 對抗式驗證（`CONFLICT_REGISTER.yaml` P1-CONFLICT-1，severity: high）已確認一條結構性矛盾，非單一 lens agent 誤判，屬 4 條 high-severity CONFLICT 之首：

- **Statement A**（Master Plan §57 Event-native Architecture，L2546-2566，逐字）：「核心狀態用 Event Ledger，而非只靠 CRUD」，列舉 `DocumentUploaded / ClaimCreated / ...`，「Current State = Events 的 Projection」，「可以 Replay 到任意歷史狀態」。緊接 §58 Immutable-first（L2570-2586）：「原始資料不得直接覆蓋」+ 全域 Content-addressed 儲存 `/objects/sha256/...`。
- **Statement B**（Execution Contract §31 Data Deletion Contract，L1225-1251，逐字）：Production deletion 流程 `Authorization → Legal Hold Check → Retention Check → Dependency Check → Dry Run → Count/Scope Preview → Approval → Deletion → Verification → Deletion Evidence`；末句：「**Soft delete 不等於合規刪除**」。

**不相容原因**：事件日誌本質 append-only、`event_id` 不得重用（EC §27 Event/Messaging Contract，L1099-1126，明文「Event ID 不得重用」），刪一筆事件會讓所有下游 projection 從該時間點起與原始計算結果不一致；但「合規刪除」要求真正移除個資內容本身，不能只是遮蔽。全文（MP + EC 兩份共 ~9000 行）Grep 確認 `crypto-shred` / `event redaction` / `tombstone` / `PII` / `data subject` **零命中**——事件溯源系統業界慣用的補救手段完全未被提及，僅 `GDPR` 三字作為 Jurisdiction Pack 的示範清單之一出現（MP L4261, L5392-5406），未與任何技術機制掛鉤。

**現有可掛鉤的鄰接積木**（本 ADR 的設計必須落在這些既有詞彙上，而非發明第四套平行機制）：

| 既有機制 | 位置 | 可用於 |
|---|---|---|
| 資料分級 Public/Internal/Confidential/Restricted | MP §61 安全架構，L2639-2664 | 標記哪些 event 欄位是個資，決定要不要走本 ADR 機制 |
| Encryption &amp; Key Sovereignty（Platform-managed/BYOK/HYOK/Customer HSM/Local-only/Region-bound） | MP §148，L5637-5656 | 金鑰主權層級，本 ADR 需要往下擴一層到 per-subject 粒度 |
| Global Privacy Engine 抽象 Rights Model（含 Deletion） | MP §100，L4259-4274 | Deletion 已是一級抽象權利，缺的只是技術落地 |
| Versioned Event Schema + Event ID 不得重用 | EC §27，L1099-1126 | 本 ADR 的 envelope 格式擴充要走這條 schema 演進規則 |
| Execution Manifest（document_version + content_hash） | EC §64，L2123-2164 | 稽核鏈錨點 |
| 30-year Replacement Drill（含 Replay Workflow） | EC §112，L3143-3160 | 驗收本 ADR 方案是否仍可通過既有測項 |

**相關但不在本 ADR 範圍**：P1-CONFLICT-2（全域 CAS 去重 vs Tenant Isolation 最外層邊界）與本衝突同源（不可變/共享儲存 vs 刪除/隔離義務），已於 ADR-003 獨立處理。

## Decision Drivers

1. **不能是補丁**（AGENTS.md R0 補丁判準）：必須定義「這一類問題的不變量」，適用於未來任何新增的含個資 event type，而非只修 `DocumentUploaded`/`ClaimCreated` 兩個實例。
2. EC §31 Data Deletion Contract 是 **v1 即生效**的硬性合規流程，不能因架構衝突而在第一個真實 DSAR（Data Subject Access/Erasure Request）發生時失效。
3. MP §57/§58/§112 的 Replay/Immutability/30-year Replacement Drill 是核心架構承諾，不能整個放棄換取合規。
4. 必須重用既有詞彙（§61 分級、§148 金鑰主權、§27 event schema 版本化）。
5. 專案目前是 pre-MVP 文件階段，現在決定的遷移成本趨近於零，拖到 Phase 3 實作後成本只會線性甚至更高增加。

## Method Used

- **Architecture Trade-off Matrix**（Method Atlas F18，L822；推薦鏈 L825-839：`Current-state Reconstruction → C4/DDD → Quality Attribute Scenarios → Architecture Options → ATAM/Trade-off → Threat Model → ADR → Rehearsal → Canary/Blue-Green → Verify → Rollback`）作為本 ADR 的比較骨架。
- **LINDDUN 隱私威脅建模**（Method Atlas §11.45，L2258-2276；七維度：Linkability/Identifiability/Non-repudiation/Detectability/Disclosure/Unawareness/Non-compliance）補 STRIDE 偏 security 之不足，用於各 Option 的 Privacy 分析，尤其 **Identifiability**（底層儲存是否仍可還原明文）與 **Non-compliance**（是否真正滿足監理機關對「不可逆」的定義）。
- **DPIA/PIA 使用方式**（Method Atlas §11.46，L2278-2296：`Processing → Purpose → Necessity/Proportionality → Data Subjects → Risks → Controls → Residual Risk → Approval`）作為 Recommendation 段落骨架。
- **如實聲明**：Method Atlas 全文 Grep 確認**沒有**正式命名為「Causal Analysis」的方法；相鄰家族是 Root Cause & Failure Analysis（Fishbone/5-Whys/Fault Tree，§11.4）與 **FMEA**（§11.26，L1784-1808：`Function → Failure Mode → Effect → Cause → Existing Control → Severity → Occurrence → Detection → Action Priority`）。本 ADR 借用 FMEA 步驟做輕量失效模式檢查，這是借用相鄰方法補位，非 Atlas 對本情境的正式指定方法。

## Options Considered

比較維度：Correctness / Security / Privacy / Maintainability / Complexity / Migration / Reversibility / 30-year Survivability。

| 維度 | A. Crypto-shredding (per-subject DEK) | B. Payload Externalization | C. PersonalDataRedacted Event | Status Quo |
|---|---|---|---|---|
| Correctness | High — event 序列與 causal chain 完全不動 | Medium — dangling pointer 打破「同組事件永遠重現同結果」假設 | High（對 projection engine 侵入性最低） | N/A（規則彼此矛盾，非「正確與否」可判定） |
| Security | High — 疊在既有 §148 金鑰主權模型上 | Medium — 個資離開 Ledger 保護，落入新的可竄改 mutable store | **Low** — 底層儲存仍可繞過 projection 直讀明文 | 無防線 |
| Privacy | High（有條件，見殘留風險） | High（名義上乾淨） | **Low** — 本質是加強版 soft delete，正是 EC §31 明文禁止的情境 | 未定義 |
| Maintainability | Medium-High — 新建 Key Vault，但重用 §148 既有詞彙 | Medium — 新增「event 序列 + 外部 store 生命週期」雙軌一致性縫 | High（概念簡單） | 最低 |
| Complexity | Medium-High（envelope encryption 是成熟已知模式） | Medium | Low | N/A |
| Migration | Medium，但現況無 production 資料 → 實質趨近零 | Medium-High（動 event schema 本身，影響面比 A 大） | Low（只加一種新 event type） | 零（但債務累積） |
| Reversibility | 銷毀前完全可逆；銷毀後依設計不可逆（GDPR 要求的一部分，非缺點） | 一旦刪外部內容即不可逆，且無等效降級路徑 | 完全可逆（=不合規的根因） | N/A |
| 30-year Survivability | High — 相容 §112 Replay Workflow（replay 出 REDACTED sentinel 而非例外） | Medium — 與 §112 drill 結構性衝突 | 表面相容，實為假象 | 最低——已被 Phase 1 標記為「兩條寫死規則互斥」 |

### Option A — Crypto-shredding：per-subject Data Encryption Key（DEK）

個資欄位（依 MP §61 分級為 Confidential/Restricted 者）寫入 Event Ledger 前，以該 **data subject 專屬**的 DEK（AES-256-GCM）加密；DEK 本身用 tenant 級 KEK（Key-Encryption-Key）包住（envelope encryption），KEK 依 §148 既有主權模型存放於獨立 Key Vault，**不進 Event Ledger**。刪除請求 = 銷毀該 subject 的 DEK 記錄（不可逆、可稽核）。Event 結構本身 100% 不動；projection 讀到已銷毀 DEK 的欄位時，decrypt 失敗依 policy 填入 `REDACTED` sentinel，不中斷 replay。

法規認可依據（WebSearch 2026-08-29）：European Data Protection Board Guidelines 5/2019、UK ICO、法國 CNIL 均明文承認 cryptographic erasure 為有效的「被遺忘權」實作，前提是演算法夠強（AES-256 符合）、金鑰銷毀不可逆、且銷毀本身可稽核。

對應 EC §31 步驟：Dependency Check = 找出所有引用此 DEK 的 event/projection/derived artifact；Deletion = 銷毀 DEK 並寫一筆 Key Destruction Record 到獨立稽核日誌；Verification = 對所有已知引用嘗試 decrypt，確認全部失敗。

**LINDDUN 殘留風險（誠實揭露）**：Identifiability 維度未完全歸零——event type、timestamp 等未加密的 metadata 仍可能洩漏「此 subject 曾經存在過」的事實。是否構成額外合規風險需視個案，建議列入 Phase 2 DPIA 待辦而非本 ADR 阻塞項。

### Option B — Event Payload Externalization（業界稱 "Forgettable Payloads"）

個資欄位不進 Event Ledger 本體，只存指標——可直接重用 MP §59 已定義的 **Portable Artifact URI**。實際內容存於外部 mutable store，刪除 = 清除外部內容，event 的 pointer 變成 dangling reference。

**結構性衝突**：與 §112 30-year Replacement Drill 的 Replay Workflow 測項直接對撞——若遇到已刪除 subject 的歷史資料，replay 會回傳 gap 而非明確 sentinel，除非額外引入 Option C 的 redaction-event 機制補洞。此外，個資一旦離開 Event Ledger 落入 mutable store，本身就是新攻擊面，且與 P1-CONFLICT-2（CAS 全域去重）糾纏——若同一份個資被多租戶引用同一 hash，刪除前必須先做跨租戶 dependency check，而 EC §31 目前未列此檢查。

### Option C — 正式 "PersonalDataRedacted" 事件 + Projection-level 覆蓋

新增一級 event type：`PersonalDataRedacted { subject_id, redacted_fields[], redacted_at, authorization_ref }`。原始事件（如 `ClaimCreated`）保留完整不動（**含個資明文**），所有 projection/query 的 read path 在回傳前檢查是否有更新的 redaction event，若有則覆蓋為 `REDACTED`。

**FMEA 輕量檢查**：

| Function | Failure Mode | Effect | Severity |
|---|---|---|---|
| 刪除個資 | 有底層儲存存取權者（DB dump/backup/disk）繞過 projection 層直讀 event 明文 | 完全未達成刪除，僅多一筆「宣稱已刪除」的紀錄 | **High（不可接受）** |

這正是 EC §31 那句「**Soft delete 不等於合規刪除**」原文所指的情境——**Option C 若單獨採用，等於重新製造 P1-CONFLICT-1 本身，只是換了個名字**。C 只適合定位為 **A 的稽核輔助層**（記錄「何時、依哪個 Authorization、刪了哪些欄位」這件事本身需要一個 auditable event，滿足 EC §31 的 Deletion Evidence 步驟），不能是替代方案。

### Status Quo — 不修

Correctness/Security/Privacy 等維度目前皆為 **N/A**，因為問題不是「做得好不好」而是「規則彼此矛盾，尚未決定哪一條讓步」。專案現階段尚未真正踩到這顆雷，但一旦進入 Phase 3 實作、第一個含個資的 event 落地，這個矛盾會從「文件層」變成「機器不可能同時滿足的執行時契約」——第一個 DSAR 真實發生時：要嘛拒絕 GDPR 請求（監理裁罰 + MP §142 Global Deployment Admission Control 可能直接擋下 EU 市場部署），要嘛物理刪 event 破壞 replay/audit 承諾。這不是「留著以後再說」的低風險擱置，是把決策時機押後到監理壓力最大、選項最少的時刻。

## Recommendation

**採用 Option A（crypto-shredding）為主要機制，疊加 Option C（PersonalDataRedacted event）作為稽核輔助層；Option B 收斂為既有 CAS 儲存分層的既定用法（大型二進位附件），不作為結構化個資欄位的主要方案。**

**不變量陳述**（回應 R0 補丁判準）：

> 事件的「發生過」與「因果順序」永遠不可被否認或竄改（append-only、`event_id` 不得重用維持不變）；但事件 payload 中被分類為 Confidential/Restricted 的個資欄位，其「**可讀性**」（非其「**存在性**」）是可以被資料主體個別、不可逆撤銷的**正交維度**。

把「內容可讀性」與「事件存在性」拆成兩個正交維度，是解掉這整類衝突的根本設計——未來任何新增的含個資 event type 自動繼承這條規則，不需要每次個案判斷要不要刪、怎麼刪。

理由排序：A 是唯一同時滿足「監理機關認可的不可逆刪除」與「event 結構/replay 完全不動」兩個約束的選項；B 打破 event schema 不可變假設且與既有 CAS 去重衝突糾纏；C 單獨採用等於重造原始衝突。

## Consequences

**正面**：GDPR/CCPA/LGPD 等 Jurisdiction Pack 的 Deletion 權利有明確技術落地；§112 Replay Workflow、§64 Execution Manifest、30-year survivability 承諾維持成立；重用既有 §61 分級 + §148 金鑰主權詞彙，未新增第四套平行機制。

**負面／代價**：新建 Key Vault/KMS 整合服務 = 新元件 = 新攻擊面，需過 EC §32 Security Change Contract 的 Threat Review；每個含個資欄位的 event 在 projection rebuild 時都要呼叫金鑰服務解密——金鑰服務可用性變成 replay 的新單點依賴；**Key Vault 本身需要比 Event Ledger 更高規格的備援**：若 Key Vault 資料遺失，等同全體使用者個資一次性被 crypto-shred，是比原始問題更劇烈的新單點故障，必須明確納入 §112 30-year Replacement Drill 測項。

**需要新增的規格缺口**：
1. MP §148 之下新增「Per-Subject DEK 生命週期」小節。
2. EC §27 需定義加密欄位的 envelope 格式（`cipher_alg / kek_ref / dek_wrapped / iv / ciphertext / classification_tag`）。
3. EC §31 需新增分支：「個資刪除（crypto-shred）」與「一般 production row 刪除」是兩種不同的 Verification 定義。
4. MP §57 event 清單旁需標註哪些既有 event type（`DocumentUploaded`/`ClaimCreated` 等）含 Confidential/Restricted 分級欄位——現況零標註。
5. 新增 `PersonalDataRedacted` 事件到 §57 清單（僅稽核輔助角色）。

## Migration / Rollback

**Migration**：專案現階段無 production 事件資料，此刻採用是遷移成本趨近於零的最佳時機；拖到 Phase 3 實作後才決定，成本隨事件量增加，且任何在那之前因 GDPR 壓力被迫破壞不可變性刪除的 event 永久無法回溯修正。

**Rollback**：若日後放棄 crypto-shred，降級路徑是「保留既有密文欄位不變，停止簽發新 DEK / 停止受理新刪除請求」——不破壞任何既有 event 或 replay 能力。這是 A 優於 B 的另一項 Reversibility 理由：B 一旦刪除外部內容即真正不可逆，無等效降級路徑。若要整體改採 B 或 C，因三方案動的是不同層，彼此改換需重新走 Phase 2 收斂流程與另一份 ADR，非可事後 patch。

## Evidence

- MP L2546-2566（§57 Event-native Architecture）／L2570-2586（§58 Immutable-first + CAS）／L2639-2664（§61 資料分級）／L4259-4274（§100 Global Privacy Engine Rights Model）／L5637-5656（§148 Encryption & Key Sovereignty）／L5659-5669（§149，標注「未來能力」，與 P1-CONFLICT-3 同源）
- EC L1099-1126（§27 Event/Messaging Contract）／L1225-1251（§31 Data Deletion Contract）／L1255-1279（§32 Security Change Contract）／L2123-2164（§64 Execution Manifest）／L3143-3160（§112 30-year Replacement Drill）
- Method Atlas L825-839（F18 Architecture Change 推薦鏈）／L1784-1808（§11.26 FMEA）／L2234-2276（§11.44 STRIDE / §11.45 LINDDUN）／L2278-2296（§11.46 DPIA/PIA）
- `.ai/research/phase-1/CONFLICT_REGISTER.yaml` L9-22（P1-CONFLICT-1 原始登錄）
- Grep 全文確認缺席：`PII`/`data subject`/`crypto-shred`/`tombstone`/`redaction` 在 MP+EC 零命中；`GDPR` 僅作為 Jurisdiction Pack 示範清單出現（MP L4261, L5392-5406），未掛鉤任何技術機制
- 外部查證（WebSearch，2026-08-29）：Crypto-shredding 業界模式與法規認可（EDPB Guidelines 5/2019、UK ICO、法國 CNIL）；Event sourcing 領域經典模式命名（Forgettable Payloads / Crypto-Shredding，Mathias Verraes）；GDPR in event-driven architecture 綜合討論

**邊界確認**：本次任務全程僅執行 Read/Grep/Bash（唯讀）與 WebSearch，未對三母文件做任何修改。
