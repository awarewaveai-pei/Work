---
proposal_id: "030"
slug: "pii-formal-definition-ec"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md"
target_baseline_hash: "2ad2a179944b917fe390119b6340ba9019344d7d15fcc9b77fdda3677937fc1e"
affected_line_ranges: ["L2955-2971", "L2974-2999"]
related_open_questions: []
change_class: "missing_contract"
authored_by: "Claude"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "39 個都核准"
applied_commit: "e0c2d513f"
---

## PROPOSED_CHANGE

Execution Contract §101 Data Classification（L2955-2971）與 §102 Logging Contract（L2974-2999）都依賴「哪些資料需要保護／redacted」這個概念，但全文（連同 Master Plan、Method Atlas）Grep `PII` 零命中——這個詞從未在三份母文件中被正式定義過，即使 §101 的 `logs redacted` 與 §102 的 `redacted` 要求實質上就是在管制 PII。本提案在 §101（分級定義的天然歸屬位置）新增一段正式的 PII 定義，並在 §102 加一句交叉引用句指向該定義，而不是在兩處各寫一份定義文字——兩節都不新增章節編號、不影響後續章節（§103 起）的編號與行號結構，只在既有段落內插入文字。

## RATIONALE

ADR-007（`docs/adr/ADR-007-pii-redaction-vs-pseudonymization-timing.md`）Context 段逐字核對確認：「`PII` 一詞全文（MP+EC+Atlas 三份母規格）Grep **零命中**（僅在 `.ai/research/` 分析檔案與 ADR-002 中出現，母文件本身從未使用此詞）」。這造成一個實際缺口：§102 要求 log「redacted」，但「什麼樣的欄位算需要 redact」這個判準——即 PII 的定義——從未寫進條文本身，只能靠讀者自行推斷。ADR-007 Recommendation 明確列出這是「需要新增的規格缺口」第 4 項：「EC §101/§102 需要在條文中補上 `PII` 一詞的正式定義（目前全文零出現），並註明『Restricted/Confidential 分級中屬於可識別自然人的欄位 = PII，v1 走 tokenization』」。本提案逐字落地該項缺口。定義放在 §101（Data Classification 本來就是四值分級 Public/Internal/Confidential/Restricted 的定義段落，PII 判準直接建立在這個既有分級之上，是最小侵入的插入點），§102 僅加一句交叉引用，避免同一份定義在兩處各寫一次、未來修改時只改到一邊造成漂移（同 ADR-007 Decision Driver 4「必須重用既有詞彙與基礎設施...不新建第四套平行機制」的精神）。

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md`

## AFFECTED_SECTIONS

§101 Data Classification（L2955-2971）、§102 Logging Contract（L2974-2999）

## DEPENDENCIES

依賴 `policies/privacy/pii-redaction.policy.yaml`（status: ACTIVE，已建）——該檔案已經是 ADR-007 Recommendation 的機器可讀正本，其 `pii_field_policy` schema body 正是「classification_tag（Confidential/Restricted）+ identifies_natural_person → redaction_required」這條判準的可執行版本，本提案在 §101 新增的 PII 定義文字與該檔案的 `compilation_decisions` 第一、二題（classification 與 identifies_natural_person 兩個條件並存，缺一不可）逐字一致，不是另創一套判準。與 `029-pseudonymization-v1-baseline-split-mp` 同屬 ADR-007 母文件套用批次，兩者行區間互不重疊（本提案僅動 EC §101/§102，029 僅動 MP §149），可各自獨立套用。

## COMPATIBILITY

純增量：§101 現有三行 Restricted 條列（L2966-2971：`external provider routing must be policy-approved` / `logs redacted` / `local / sovereign route when required`）逐字不動，新增定義段落插在分級程式碼區塊與 Restricted 條列之間；§102 現有 `structured/correlatable/redacted/bounded/retention-controlled` 五值、8 個最低 keys、禁止全量 dump 句逐字不動，新增交叉引用句插在既有內容之後。Grep 確認（見下方 BUGHUNT 範疇）目前 repo 內引用 EC §101/§102 的既有 spec/policy 檔案（`policies/ai-execution/network-egress.yaml`、`specs/security/personal-data-envelope.schema.yaml`、`specs/security/log-redaction-token.schema.yaml` 等）均以行號範圍或欄位列表方式引用，不依賴「該段落只有這幾行、多一行就壞」的假設，純增量插入不破壞既有 consumer。

## MIGRATION

`Edit` 工具精確字串替換套用 diff；套用後（若操作者核准）§101/§102 之後的行號會整體位移（新增文字行數），需同步更新所有以絕對行號引用 §101/§102 之後章節的既有文件——這是本提案套用時機的已知代價，套用前建議先跑一次 grep 盤點所有引用「EC L3000 之後」行號的檔案清單，作為套用時的配套動作，不在本 DRAFT 提案的 diff 範圍內。套用後需重算 EC baseline hash 並更新 `document-hashes.yaml`（若存在）或等效 hash 登記處。

## ROLLBACK

`git revert` 對應 commit 即可完整還原成套用前版本。純文字新增、無刪除既有內容，回退無資訊遺失風險。

## EVIDENCE

- `docs/adr/ADR-007-pii-redaction-vs-pseudonymization-timing.md`（Context 段「PII 一詞...Grep 零命中」逐字核對；Recommendation「需要新增的規格缺口」第 4 項）
- `policies/privacy/pii-redaction.policy.yaml:54-103`（`compilation_decisions` 前兩題：classification_tag 與 identifies_natural_person 並存判準，本提案 §101 定義文字據此撰寫）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2955-2971`（§101 現況逐字讀取確認）
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:2974-2999`（§102 現況逐字讀取確認）
- `docs/architecture/MACHINE_READABLE_SPEC_PLAN.md:330`（MRSP-2 列：確認 ADR-007 裁決已定案，母文件套用為剩餘工作）

## Diff

### Original

§101（L2955-2971，逐字）：

````text
# 101. Data Classification

執行前：

```text
Public
Internal
Confidential
Restricted
```

Restricted：

- external provider routing must be policy-approved
- logs redacted
- local / sovereign route when required
````

§102（L2974-2999，逐字）：

````text
# 102. Logging Contract

Log 必須：

```text
structured
correlatable
redacted
bounded
retention-controlled
```

最低 keys：

```text
timestamp
level
service
trace_id
task_id
execution_id
event
status
```

禁止敏感 payload 全量 dump。
````

### Proposed

§101：

````text
# 101. Data Classification

執行前：

```text
Public
Internal
Confidential
Restricted
```

PII（Personally Identifiable Information，個人識別資訊）定義：分級為 Confidential 或 Restricted，且其值本身或與常一併出現的其他欄位組合後可識別特定自然人的欄位，即為 PII。v1 去識別化機制見 `policies/privacy/pii-redaction.policy.yaml`。

Restricted：

- external provider routing must be policy-approved
- logs redacted
- local / sovereign route when required
````

§102：

````text
# 102. Logging Contract

Log 必須：

```text
structured
correlatable
redacted
bounded
retention-controlled
```

最低 keys：

```text
timestamp
level
service
trace_id
task_id
execution_id
event
status
```

禁止敏感 payload 全量 dump。redacted 之判定依 §101 PII 定義；凡屬 PII 之欄位，一律經 `policies/privacy/pii-redaction.policy.yaml` 之機制去識別化後始得寫入 log，不得另立判準。
````

### Reason

依 ADR-007「需要新增的規格缺口」第 4 項逐字落地。PII 定義放在 §101 而非 §102，因為 §101 是母文件既有的分級定義段落（Public/Internal/Confidential/Restricted 四值），PII 判準本質上是「哪些欄位屬於 Confidential/Restricted 中的一個子集」，定義理應建立在既有分級之上而非另立新段。§102 僅加一句交叉引用而非重複整段定義文字，避免同一概念在兩處各寫一份、未來修改時產生漂移——這正是任務指示「reference it from both places rather than duplicating the definition text twice」的具體實作。兩處新增文字均與 `pii-redaction.policy.yaml` 已建的機器可讀判準（classification_tag ∈ {Confidential, Restricted} AND identifies_natural_person = true → redaction_required）逐字一致，不引入與已建 policy 檔不同的第二套定義。
