# PHASE_5_MODE_SELECTION_CODEX_COMPARISON
Status: PROPOSED（比較完成；**2026-08-30 Mode 選擇本身已由 `docs/adr/ADR-014-phase-5-mode-selection-research.md` 批准（Research Mode）**——但該 ADR 刻意只批准這一個決策點，不豁免 Phase 3/4 完成前提，最終切片實際啟動仍待操作者 Phase 2 STOP-FOR-HUMAN-REVIEW 批准，本文件與該 ADR 皆不改變那個既有閘門）
Date: 2026-08-30

## 0. Scope & Boundary（範圍聲明）

`AI_LEGO_OS_Program_Plan_v1.md` §9 要求 Phase 5 的 Learning/Research/Business 三選一「Claude 與 Codex 各自論證後比較」。`MVP_VERTICAL_SLICE_PLAN.md`（Status: PROPOSED，2026-08-29）已是 Claude 論證版全文。`ADR_INDEX.md`「Codex 對抗式覆審」段落誠實記錄過**一次失敗的嘗試**：*"另跑一輪 Codex 獨立分析 Phase 5 MVP 切片選擇...未產出與 Research Mode 競爭的替代選擇...這不構成 directive §9 要求的『Claude 與 Codex 各自對三選一做出獨立選擇後比較』——Codex 從未明確評估 Learning Mode，也未對 Research vs Business 給出直接對比判斷"*（`ADR_INDEX.md:36`）。

本文件記錄**第二次嘗試**：重新設計 prompt，明確要求 Codex 獨立探索三母文件與 Phase 0/1 registers 自行找證據、明確排除讓它看到 Claude 已寫好的 §2 結論（避免定錨）、強制要求給出單一明確 pick（不准迴避）。這次成功產出真正獨立的論證，逐一評估三個模式並給出對比判斷——閉環 Program Plan §9 這個先前未完成的要求。

**本文件不是 ADR，不批准 Phase 5 啟動**——`MVP_VERTICAL_SLICE_PLAN.md` 自己的邊界聲明已明確：「實際執行本切片須待 Phase 3、Phase 4 完成、且本文件本身通過操作者 Phase 2 STOP-FOR-HUMAN-REVIEW 批准之後」。本文件只完成「兩方論證都存在，可供比較」這個前置條件，最終選擇與啟動時機仍是操作者的決定。

## 1. Codex 獨立論證全文

**方法揭露**：Codex 被要求不查看 `MVP_VERTICAL_SLICE_PLAN.md` §2（Decision & Rationale），改自行探索三母文件、Method Atlas §13 worked recipe 範例、與 `.ai/research/phase-0/`、`.ai/research/phase-1/` 的 finding registers，自行找出三個模式各自會/不會觸及哪些既有機制、各自現況卡在哪個缺口，並被要求「不准迴避單一明確選擇」。完整背景 prompt 見 `agency-os/reports/oracle/2026-08-30-inspect-5ed95209.md`（本次任務的 artifact，含完整 codex 回應）。

> **Recommendation**
>
> `Research` is the best current Phase 5 pick. `Business` is the strongest stress-test on paper, but the corpus itself registers a hard blocker in its flagship finance step; `Learning` is less architecturally demanding and leaves too much of the risky machinery untouched. That matches the Program Plan's criterion to choose the slice that most validates architecture, not the one with the most features or the least effort.
>
> **Evidence By Mode**
>
> - **Learning**: verified flow `Lecture Video → Transcription → ... → Flashcards → Quiz → Exam Questions` (`Master Plan:2205`) exercises source/ingest/normalize/knowledge/artifact generation, but the closest Atlas recipe is explicitly low-risk and "not for high-risk formal decisions" (`Atlas:3227, 3246`) — does not naturally force Trusted Compute, research-grade provenance, or the full high-risk gate stack. **New finding, not previously cited by Claude's own document**: `P1-GAP-PROD-10` — this learning pipeline is not cross-linked to academic-integrity control (generating `Exam Questions` from course material without the promised integrity guard in the chain), confirmed at `Master Plan:2205`.
> - **Research**: the Atlas recipe explicitly forces `Literature Search`, `Evidence Matrix`, `Assumption Registry`, `Counterevidence`, `Causal Model`, `Methodology Review`, `Validation Design`, `Analysis Plan`, `Human Review` (`Atlas:3282, 3298`), and — because of the light quantitative step — naturally routes through `Trusted Compute Engine → Validation → Result Artifact` (`Master Plan:1690`). Most directly exposes already-registered weak points: the research-provenance split between `SOURCE→EVIDENCE→CLAIM` and `Paper Sentence→Result→AnalysisRun→Code→Dataset→Original Source` (`Master Plan:1046, 1942`); missing execution-level research gates (`Master Plan:2523`); undefined qualitative methodology (`Master Plan:2033`).
> - **Business**: on paper the *broadest* stress-test — the Board-grade Strategy recipe forces `Jurisdiction Context`, `Stakeholder Intelligence`, `PESTEL`, `Financial Model`, `Monte Carlo/Sensitivity`, `Red Team`, `Independent Judge`, `MCDA`, `Minority Opinion`, `Human Decision`, `Reversal Criteria` (`Atlas:3311, 3334`) — would hit high-risk gates, human authority, numeric compute, dissent, reversal, and jurisdiction-aware review more thoroughly than either other mode. But it is **hard-blocked today**: the flagship Financial Assumptions step is exactly `P1-CONFLICT-4` (`Master Plan:2137, 45, 47`) — the flagship step should fail-closed before the full chain is even proven.
>
> **Mechanisms Covered vs Left Untested**: Research most unavoidably exercises provenance/evidence/claim handling, human review, and Trusted Compute. Business most unavoidably exercises high-risk gates, dissent, reversal, jurisdiction-sensitive flow. Learning leaves the most risky machinery unforced. **Neither crypto-shred/personal-data deletion nor tenant-scoped CAS isolation is naturally forced by any of the three recipes themselves** — both require the walkthrough scenario to deliberately engineer a deletion request or a cross-tenant duplicate-content case, independent of which mode is chosen (`Master Plan:2546, 2580, 268`).
>
> **Pick**: `Research`, with `Business` a close second on pure stress coverage. "`Business` would be my architecture pick if it were executable today, but the repo's own findings say its finance core is presently blocked. `Research` still forces the most important risky integrations that are both architecturally central and currently weak."
>
> **What Would Change My Mind**: (1) If Business gained a verified, Atlas-backed Financial Assumptions path, switch to Business — it stresses more of the high-risk gate/jurisdiction/reversal/dissent machinery than Research. (2) If the decision criterion changed from "prove the full chain" to "prove fail-closed/BLOCKED behavior first," also switch to Business, since it already surfaces a concrete method-resolution block. (3) Would not switch to Learning unless the weighting moved away from risk exposure toward cheapest-plumbing-demo — which the Program Plan explicitly says not to do.

## 2. 對比：Claude 論證版（`MVP_VERTICAL_SLICE_PLAN.md` §1-2）vs Codex 獨立論證

| 面向 | Claude | Codex | 判讀 |
|---|---|---|---|
| **最終 pick** | Research | Research | **獨立收斂一致**——兩方使用不同方法（Claude：MCDA+Weighted Decision Matrix 四維度評分表；Codex：探索式證據蒐集+單一敘述式論證），互不知道對方結論，結果相同 |
| **排除 Business 的理由** | `P1-CONFLICT-4`：Financial Assumptions 對應 finance domain pack 是空殼，依文件自己紅線現在就該觸發 BLOCKED | 同一個 `P1-CONFLICT-4`，用詞略有不同（"flagship step should fail-closed before the full chain is even proven"） | **完全一致**，兩方各自獨立找到同一個 registered finding 作為排除理由 |
| **排除 Learning 的理由** | 「驗證強度不足」——幾乎只強迫系統做 LLM 文字轉換，架構中最容易出錯的部分完全沒被碰到 | 同樣結論，但**額外找到一個 Claude 論證版沒引用的新證據**：`P1-GAP-PROD-10`（Learning pipeline 未串接 academic-integrity 控制），具體情境是「生成 Exam Questions 卻沒有承諾的誠信防護」 | Codex 貢獻了一個真實、獨立的新引用，非重複 Claude 已知的論點 |
| **對 Business 的評價強度** | 「2 自然 + 2 硬湊」ADR 觸及數，排在 Learning 與 Research 之間，未特別強調「若無 CONFLICT 會是最佳選擇」 | 明確稱 Business 是「on paper 最廣的架構壓力測試」、「close second」，並列出具體條件（財務缺口補齊、或決策準則改成優先驗證 BLOCKED 機制）下會直接翻盤選 Business | **有意義的視角差異，非結論分歧**——Codex 更明確量化「Business 有多接近成為最佳選擇」，這比 Claude 論證版原本的 Sensitivity 分析（僅提到「若複雜度加權會翻向 Learning」）多了一個 Claude 沒有明確標註的翻轉條件 |
| **Crypto-shred / Tenant-CAS 是否被任一 Recipe 自然觸及** | 未在 §1 比較表明確指出「這兩個機制不是任何 Recipe 本身會自然觸及的」，但 §3 End-to-End Scenario Walkthrough **實際上已經刻意設計**了 P2 GDPR 刪除請求與 Tenant B 位元組相同內容上傳兩個情節，等於用情境設計而非 Recipe 本身補上這兩個機制的驗證 | 明確指出兩者「不是任一 Recipe 本身自然觸及的，需要情境刻意設計」 | **互補而非矛盾**：Codex 點出的是 Recipe 本身的限制，Claude 論證版的 §3 walkthrough 恰好已經用情境設計解決了 Codex 點出的這個缺口——兩者合起來證實「Research + 精心設計的情境」是完整方案，不能只選 Recipe 就期待這兩個機制自動被測到 |

## 3. 結論

**Claude 與 Codex 各自獨立論證後收斂於同一個選擇：Research Mode**，滿足 `AI_LEGO_OS_Program_Plan_v1.md` §9「各自論證後比較」的要求，閉環 `ADR_INDEX.md` 先前記錄的失敗嘗試遺留缺口。

兩方論證方法不同（結構化評分表 vs 探索式敘述）、部分引用不同（Codex 額外找到 `P1-GAP-PROD-10`），但排除 Business 與 Learning 的核心理由完全一致（`P1-CONFLICT-4`、驗證強度不足），且對「Business 若條件改變會翻盤」這個 sensitivity 都有共識，只是各自標註的翻轉條件略有不同、互補而非衝突。這是一次真正獨立、非事後合理化的收斂，不是同一個結論被包裝成兩份文件。

**建議**：`MVP_VERTICAL_SLICE_PLAN.md` 可視為連同本文件一起，已完整滿足 Program Plan §9 的雙方論證要求，可提交操作者做 Phase 2 STOP-FOR-HUMAN-REVIEW 的最終批准。Codex 額外貢獻的 `P1-GAP-PROD-10`（Learning 缺口）與「Business close-second + 明確翻轉條件」兩點，建議操作者批准時一併參考——不影響 Research 作為當前最佳選擇的結論，但完整呈現了決策空間的邊界。

## 4. 尚未解決事項（本文件不代為裁決）

- Codex 指出「決策準則若改成優先驗證 BLOCKED/fail-closed 機制而非證明全鏈」會翻向 Business——這個準則本身的選擇（驗證全鏈 vs 驗證 fail-closed）屬於 Program Plan §9 本身的解釋權，本文件不代為裁決，僅如實記錄這個岔路點供操作者參考。
- `P1-GAP-PROD-10`（Learning 缺口）尚未被任何既有文件登記為需要處理的待辦——若操作者最終選 Research（如兩方論證建議），此缺口不影響本次切片，留待未來若重新考慮 Learning Mode 時處理，本文件不主動開新任務。

---

**邊界確認**：本文件由 `codex-oracle.ps1 -Mode inspect`（真實外部 Codex 呼叫，唯讀）產出獨立論證，並由 Claude 對比 `MVP_VERTICAL_SLICE_PLAN.md` 既有內容完成本文件；全程未對三母文件、任何既有 ADR、或 `MVP_VERTICAL_SLICE_PLAN.md` 本身做任何修改。
