# CONVERGENCE_MATRIX — Claude × Codex 獨立分析比對

**日期**：2026-08-29
**輸入**：[CLAUDE_REVIEW.md](CLAUDE_REVIEW.md)（71 條 verified findings + 架構評估）×[CODEX_REVIEW.md](CODEX_REVIEW.md)（CDX-1~9 + PART B/C）。兩方各自獨立產出（反 anchoring 協議合規：Claude 先寫檔未餵 Codex；Codex prompt 無 Claude 結論並自我聲明未讀他方分析）。
**分類規則**：`AGREE / PARTIAL_AGREEMENT / DISAGREE / UNKNOWN / REQUIRES_EVIDENCE / REQUIRES_HUMAN_DECISION`。**AI consensus ≠ FACT**——雙方同意的上限是 `AGREE`；`CLAUDE_ONLY` = Codex 未觸及（≠ 反對）。Codex 每條新主張已由 Claude 逐一 Grep 驗證 file:line（EC 行號有系統性 −28 偏移，內容全真，已於 CODEX_REVIEW 標註）。

---

## 1. Codex findings ↔ Claude findings（9/9 全部有交集，0 DISAGREE）

| Codex | Claude 對應 | 分類 | 備註 |
|---|---|---|---|
| CDX-1 filename/identity 衝突（High） | CROSS-T-1 / T-2 / R-1 / R-2 | **AGREE** | 雙方獨立認定為最高風險之一。lineage 已由操作者裁決（OQ-2：v1 = canonical）→ 修法進 Phase 2 |
| CDX-2 MP 越權立 method contract（Med） | CROSS-T-14 + CROSS-R-3 + MP §8.5 自禁條款 | **PARTIAL_AGREEMENT** | Claude 登錄了鄰接面（ID 漂移、型別缺失）；Codex 把 MP §8.4 的 fishbone/swot I/O 範例定性為 authority violation——框架更廣，證據已驗真（MP L742-746 ✅）。採納入 Phase 1 CONFLICT_REGISTER |
| CDX-3 primitive kernel 缺 5 tokens（High） | DOC-method_atlas-2 | **AGREE** | 同一缺陷，兩方引用不同出現點（L187-191 vs L199-203/996），互補 |
| CDX-4 method ID grammar 三套（High） | DOC-method_atlas-1 + CROSS-T-14 | **AGREE**＋Codex 新增證據 | Codex 補 2 個 Claude 未登錄的站點：MP L825 `research.thematic_analysis`、L833 `evidence.triangulation`（Grep ✅）→ 併入 register |
| CDX-5 risk_tier 兩套 enum（High） | CROSS-T-3 / CROSS-R-10 | **AGREE** | 雙方獨立推導出同一後果：gate injection 機器上無法觸發 → OQ-7 |
| CDX-6 blocked 狀態碼多版且不入 state machine（Med） | CROSS-T-5 / CROSS-R-4 + DOC-execution_contract-9 | **AGREE** | Codex 追加的問題框架「是 status 還是 BLOCKED 的 reason？」→ 新 OQ-13 |
| CDX-7 epistemic/provenance enum drift（High） | CROSS-T-6 / CROSS-R-9 | **AGREE**＋Codex 新增證據 | **Codex 抓到 Claude 漏的第 4 套詞彙**：MP §12 authorship 標籤 `HUMAN ORIGINAL / AI GENERATED / HUMAN APPROVED / SOURCE QUOTATION`（MP L995-1000，Grep ✅）。信任邊界詞彙實為 **4 套**非 3 套 → OQ-8 context 已更新 |
| CDX-8 lock token 空格/底線並存（High） | CROSS-T-8 / CROSS-R-11 | **AGREE** | Codex 補第三種寫法 MP L970 `Locked Fact`（title case）；雙方同指 silent-overwrite 後果 |
| CDX-9 machine contracts 被要求但全缺（High） | CROSS-R-3 + CROSS-T-18 + DOC-method_atlas-7/-9 | **AGREE** | Codex 的 PART C-8 進一步指出 bootstrap 悖論：EC Boot Contract 要求 resolve 尚不存在的 specs |

## 2. Codex 獨有貢獻（Claude 未提出，已逐條 Grep 驗真）

| 項目 | 證據 | 分類 | 處置 |
|---|---|---|---|
| 第 4 套信任詞彙（authorship labels） | MP L995-1000 ✅ | **AGREE**（驗真後採納） | OQ-8 擴充 |
| Method ID grammar 新站點 ×2 | MP L825/L833 ✅ | **AGREE** | 併入 findings |
| **Path-as-architecture**：repo 佈局被寫進母規格本身，30 年遷移成本異常高 | MP L612/767/845/1007 ✅ | **PARTIAL_AGREEMENT** | Claude 只登錄了「binding vs advisory 不明」（OQ-11）；Codex 的批判更根本（「該不該寫進憲法」）→ OQ-11 增列 option C |
| Edition / packaging 商業內容寫入母規格 | MP L527-562 ✅ | **REQUIRES_HUMAN_DECISION** | 是否屬 Master Plan 職權（product 定位 vs 過度指定）是取捨非事實 → Phase 2 議程 |
| MP 的 method I/O snippet 是否 normative？ | MP L43 vs L742-746 | **REQUIRES_HUMAN_DECISION** | 與 Claude PART C 的 normative-strength 標記提案同源 → 新 OQ-14 |

## 3. Claude 獨有 findings（Codex 未觸及 ≠ 反對；維持對抗式驗證後狀態，標記單模型來源）

Codex 的 9 條集中在「機器可判定的 enum/ID/契約缺口」；以下 Claude 條目 Codex 未掃到，分類一律 **CLAUDE_ONLY_VERIFIED**：

- **CROSS-T-9**（precedence chain 本身定義兩次已漂移）＋ **CROSS-R-13**（MP 授權模型無 EC 位置）——治理 split-brain 主軸，Phase 2 ADR-1 候選
- **CROSS-T-4 / CROSS-R-6**（Execution Manifest 3–4 套不相容 schema）
- **CROSS-R-5 / CROSS-T-11**（release gate 集合實質不同 + checklist 雙寫已漂移）→ OQ-10
- **CROSS-T-10 / CROSS-R-12**（Architecture Constitution 身分二義）→ OQ-9
- **CROSS-T-15**（rigor 五模式 vs enum 四值）
- 8 組雙寫維護點（reversal / assumption registry / champion-challenger / deprecation / availability enum / Atlas §8vs§11 / ADR 位置 / manifest）
- 結構性缺陷（stray H1 ×4、未閉合 fence、計數錯誤）
- Scope violations（Atlas §18/§19/§21/§22 立法他文件職權）

## 4. 架構評估收斂（PART B）

| 議題 | Claude | Codex | 分類 |
|---|---|---|---|
| Scoped Authority 概念健全（實作壞掉） | B1 ✓ | ✓ | **AGREE** |
| Capability↔Method typed boundary 可建 | B1 ✓ | ✓ | **AGREE** |
| Execution lifecycle 骨架完整 | B1 ✓ | ✓ | **AGREE** |
| 核心缺口 = 契約層（型別/enum/manifest） | B3/B4 ✓ | Risk 1 ✓ | **AGREE** |
| MP 敘事立法平台艦隊 / examples-as-requirements | B2 ✓ | 以 path/edition 具體化 | **PARTIAL_AGREEMENT**（同方向不同切面） |
| 治理 split-brain 為最高風險 | B4-3 ✓ | 未提 | CLAUDE_ONLY_VERIFIED |
| Path-as-architecture 遷移成本 | 未提此框架 | Risk 5 ✓ | CODEX_ONLY（已採納） |

**雙方 Top-risk 交集**：契約真空、filename/ID drift 毀 replay、label/lock drift 毀 human-protection、method 雙 authority。**無任何一項互相矛盾。**

## 5. Codex PART C ↔ Open Questions 映射

C1→OQ-2（已裁決 v1）；C2→**新 OQ-12**（ID grammar）；C3→OQ-7；C4→OQ-8（已擴充至 4 套詞彙）；C5→**新 OQ-13**（status taxonomy）；C6→CROSS-R-3 型別層（Phase 2/3）；C7→**新 OQ-14**（normative-strength 標記）；C8→Phase 3 bootstrap 順序（Program Plan 已以「先建 machine-readable foundation 再實作」回應，於 Phase 2 確認）。

## 6. 統計與結論

- Codex 9 findings：**7 AGREE + 2 PARTIAL_AGREEMENT，0 DISAGREE，0 未驗證**（全數 Grep 驗真；EC 行號偏移已校準）
- Codex 新增可驗證證據 3 組、新決策點 3 個（OQ-12/13/14）
- Claude 獨有 verified findings ~50 條維持 CLAUDE_ONLY_VERIFIED（不升格為 consensus）
- **結論**：兩個獨立模型在「缺陷在機制層、理念層健全、契約層是第一優先」上完全收斂。分歧為零，但這只把共識上限推到 AGREE——依 directive §V，仍非 expert consensus；Phase 2 的每個修正案仍需操作者逐案批准。

**Cross-Review 三件套完成。下一步**：Phase 1 role×failure-mode gap analysis（以本矩陣＋verified-findings 為種子建 6 registers）。
