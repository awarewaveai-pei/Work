# ADR-014: Phase 5 First Vertical Slice Mode Selection — Research Mode

Status: ACCEPTED（2026-08-30，操作者明示授權 Claude 行使架構師裁決權，同 ADR-001~013 授權模式，「你決定」，本次對話操作者已即時審閱 §2 引用的雙方收斂分析內容後再次明示委任）
Date: 2026-08-30
Related: `AI_LEGO_OS_Program_Plan_v1.md` §9（Phase 5 exit gate 定義與三選一要求）、`docs/architecture/MVP_VERTICAL_SLICE_PLAN.md`（Status: PROPOSED，Claude 論證版，本 ADR 不改變其 Status，只批准其 §2 的 pick）、`docs/architecture/PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md`（Status: PROPOSED，Codex 獨立論證版與雙方比較，本 ADR 同樣不改變其 Status）、`ADR_INDEX.md`「Codex 對抗式覆審」段落（記錄了失敗的第一次嘗試與成功的第二次嘗試）

## Context

`AI_LEGO_OS_Program_Plan_v1.md` §9 要求 Phase 5 的 Learning/Research/Business 三選一必須「Claude 與 Codex 各自論證後比較」。這件事本身分兩階段完成：

1. **論證存在且雙方獨立收斂**（已完成）：`MVP_VERTICAL_SLICE_PLAN.md` 是 Claude 用 MCDA+Weighted Decision Matrix 做出的論證版（pick: Research）；第一次嘗試讓 Codex 獨立論證失敗（`ADR_INDEX.md:41` 誠實記錄：Codex 未給出與 Research 競爭的替代選擇，不構成 directive 要求的獨立比較）；2026-08-30 第二次嘗試重新設計 prompt（隔絕 Claude 已寫的結論、強制單一明確 pick）後成功——見 `PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md`，Codex 獨立收斂於同一個選擇（Research），排除 Business 與 Learning 的核心理由與 Claude 論證版一致，且額外貢獻一個新引用（`P1-GAP-PROD-10`）。
2. **誰來拍板這個已收斂的選擇**（本 ADR 要解決的）：兩份文件本身都明文聲明「本文件不是 ADR，不批准 Phase 5 啟動」——這件事此前一直懸而未決。

**方法**：本 ADR 不重新做 Research vs Learning vs Business 的比較分析（那已經被兩個獨立方法論的論證做完，見上方兩份文件全文），而是對「這個已收斂的選擇是否可以正式定案」本身做判斷。

## Decision Drivers

1. **兩個獨立方法論的真收斂，非同一結論包裝兩次**：Claude 用結構化評分表（MCDA+Weighted Decision Matrix），Codex 用探索式證據蒐集+單一敘述式論證；兩者互不知道對方結論；排除 Business 的理由都指向同一個已登記的 `P1-CONFLICT-4`（finance domain pack 空殼，依文件自己紅線現在就該 BLOCKED）；排除 Learning 的理由都指向「驗證強度不足」，且 Codex 額外找到一個 Claude 未引用的新缺口（`P1-GAP-PROD-10`）。這是可驗證的收斂事實，不是主觀評分（同 ADR-013 Decision Driver 2 的「忠實度是可驗證事實」同一類判準）。
2. **這是內部工程排序決策，不是商業承諾**——選哪個 Recipe 先做垂直切片來驗證架構，不涉及採購、不涉及供應商鎖定、可完全回滾（先做 Research 不代表 Learning/Business 未來不能做，只是排序）。這與本次任務另外兩份 ADR（ADR-015/016）處理的廠商選型是完全不同的風險類別——沒有理由套用同一套「操作者才能拍板」的保留邏輯。
3. **操作者當下在場即時審閱**——本次對話上一輪已將兩份文件的完整內容（Codex 論證全文、對比表、收斂結論）逐條呈現給操作者，操作者隨後明示「你決定」。這滿足 Program Plan §9 与 `MVP_VERTICAL_SLICE_PLAN.md` 自己所稱 STOP-FOR-HUMAN-REVIEW 閘門「人類需要先看到分析再點頭」的實質要求——但本 ADR 刻意只批准「哪個 Mode」這一個具體決策點，不擴大解釋為批准了該文件的其餘全部內容（見 Sub-decision b 的範圍限定）。
4. **`P1-GAP-PROD-10`（Codex 新發現）不影響當前選擇，但必須留存**——它只在「未來重新考慮 Learning Mode」時才有意義，`PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md` §4 自己已誠實聲明「不主動開新任務」，本 ADR 尊重這個範圍限定，不越權處理。

## Sub-decision (a): Phase 5 第一條垂直切片的目標 Mode = Research

**ACCEPTED**——Research Mode（Qualitative Research 為主幹，疊加一個輕量 Quantitative/Trusted-Compute 步驟），依 `MVP_VERTICAL_SLICE_PLAN.md` §1-2 與 `PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md` §1-3 雙方收斂結論。

## Sub-decision (b): 本 ADR 批准範圍的精確邊界

本 ADR **只批准「哪個 Mode」這一個決策點**，明確不做以下事：

1. **不豁免** `MVP_VERTICAL_SLICE_PLAN.md` 自己聲明的「實際執行本切片須待 Phase 3、Phase 4 完成」前提——這個前提本 ADR 完全不觸碰，依然有效。
2. **不授權**現在開始寫 production code / UI / DB schema——`AI_LEGO_OS_Program_Plan_v1.md` §10 Phase 0-2 禁令依然在效，本次任務全程仍是 Phase 3（機讀規格編譯），不是 Phase 5 執行本身。
3. **不逐條批准** `MVP_VERTICAL_SLICE_PLAN.md` 的其餘內容（例如 §3 End-to-End Scenario Walkthrough 的每個情節設計細節）——那些仍是該規劃文件自己的 PROPOSED 內容，未經本 ADR 逐條核可，若未來需要對其中某個具體步驟另做裁決，屬於獨立的未來任務。
4. 本 ADR 批准後，兩份來源文件（`MVP_VERTICAL_SLICE_PLAN.md`、`PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md`）自身的 `Status` 欄位**保持 PROPOSED 不變**——同 ADR-013 §Decision Driver 4 的先例：本 ADR 批准的是「其中一個具體結論」，不是把整份規劃文件升格為 ACCEPTED。

## Sub-decision (c): `P1-GAP-PROD-10` 處理方式

不開新任務，不修改任何既有 register——依 `PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md` §4 自己的範圍聲明保持原樣（Learning pipeline 未串接 academic-integrity 控制，僅在未來重新考慮 Learning Mode 時才有處理必要）。

## Method Used

Evidence Triangulation——交叉核對兩份獨立論證文件的方法、引用、排除理由是否真收斂（而非表面文字相似但論證路徑不同），同 ADR-010/013 使用的方法家族。本 ADR 本身不重新執行 MCDA 或探索式論證，只判斷「已完成的兩次獨立論證是否構成可拍板的收斂證據」。

## Recommendation

1. `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md` 檔頭 blockquote 新增一句話，指出 Mode 選擇本身已由本 ADR 批准，其餘內容與 Phase 3/4 前提不變。
2. `docs/architecture/PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md` 檔頭 Status 行同步註記。
3. `docs/adr/ADR_INDEX.md` 新增本 ADR 條目，「Codex 對抗式覆審」段落補上「本次收斂已由 ADR-014 正式批准」的收尾句。

## Consequences

- **Positive**：Program Plan §9 的雙方論證要求不只「完成」，現在有正式、可稽核的批准記錄，避免未來任何人重新質疑「這個選擇到底定案了沒」。
- **Negative**：無——本 ADR 不產生任何 runtime 或 schema 副作用，Phase 3/4 完成前提與 Phase 0-2 禁令完全不受影響。
- **尚未解決的 follow-up（本 ADR 明確不處理）**：`P1-GAP-PROD-10`（Learning pipeline 缺 academic-integrity 控制）——僅在未來重新考慮 Learning Mode 時才相關；`MVP_VERTICAL_SLICE_PLAN.md` §3 walkthrough 的逐條裁決仍待未來需要時另案處理。

## Migration / Rollback

- **Migration**：零成本——純文件層級的決策記錄，不影響任何既有 schema/policy/recipe 檔案。
- **Rollback**：`git revert` 可完整回退；回退後兩份來源文件的 Status 行與 `ADR_INDEX.md` 條目一併復原，不留殘跡。

## Evidence

- `docs/architecture/MVP_VERTICAL_SLICE_PLAN.md`（全文，§0 一條更正、§1 Recipe Selection Matrix、§2 Decision & Rationale）
- `docs/architecture/PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md`（全文，§1 Codex 獨立論證、§2 對比表、§3 結論、§4 尚未解決事項）
- `docs/adr/ADR_INDEX.md`（「Codex 對抗式覆審」段落，L32-43，記錄第一次失敗嘗試與第二次成功嘗試的完整歷程）
- `agency-os/reports/oracle/2026-08-30-inspect-5ed95209.md`（Codex 第二次獨立論證的原始 artifact）
- `AI_LEGO_OS_Program_Plan_v1.md` §9（Phase 5 exit gate 與三選一要求原文）

**邊界確認**：本 ADR 僅批准「Phase 5 第一條垂直切片選 Research Mode」這一個決策點，不批准、不豁免、不觸碰 `MVP_VERTICAL_SLICE_PLAN.md` 或 `PHASE_5_MODE_SELECTION_CODEX_COMPARISON.md` 的其餘任何內容、Phase 3/4 完成前提、或 Program Plan §10 的 Phase 0-2 禁令。兩份來源文件本身 Status 維持 PROPOSED。
