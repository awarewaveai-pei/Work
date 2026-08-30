---
proposal_id: "040"
slug: "master-plan-identity-header"
status: DRAFT
target_document: "AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md"
target_baseline_hash: "8e5e67f607477babe60f2a4a354a211a30bd88cb1ece631dd51c5e11b23bac10"
affected_line_ranges: ["L1-L6"]
related_open_questions: ["OQ-1"]
change_class: "missing_contract"
authored_by: "Codex"
approved_by: null
approved_at: null
approval_note: null
applied_commit: null
---

## PROPOSED_CHANGE

Add the existing registry identity `ai-lego.master-plan` and SemVer `1.0.0` to the Master Plan title area. Do not place a mutable content hash in the header.

## RATIONALE

ADR-017 (ACCEPTED 2026-08-30) selected the minimal OQ-1 correction: both missing mother-document headers carry Document ID + SemVer, while current content hash remains an Execution Manifest value. Execution Contract §4 already registers this exact ID, so this proposal does not invent a naming scheme.

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md`

## AFFECTED_SECTIONS

Document title area before the positioning statement (current L1-L6).

## DEPENDENCIES

- `docs/adr/ADR-017-mother-document-identity-headers.md` (ACCEPTED).
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md` §4 document registry (`ai-lego.master-plan`).
- Proposal 041 is independent; each header remains separately reviewable and reversible.

## COMPATIBILITY

Additive metadata only. No filename, v1 lineage, body content, schema, or Execution Manifest hash behavior changes.

## MIGRATION

After explicit operator approval, apply only the exact replacement below. Do not update `.ai/research/phase-0/document-hashes.yaml`: it is the immutable Phase-0 baseline snapshot. Execution Manifest remains responsible for current `sha256`.

## ROLLBACK

`git revert <applied_commit>` removes the header block without affecting body content or runtime artifacts.

## EVIDENCE

- `docs/adr/ADR-017-mother-document-identity-headers.md` — accepted OQ-1 decision and no-header-hash boundary.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:201-229` — registry ID and Execution Manifest fields.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:78-86` — identity = Document ID + Version + Hash.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:1-6` — current header has no ID/version.
- `.ai/research/phase-0/document-hashes.yaml:9-13` — frozen proposal baseline hash.

## Diff

### Original

```text
# AI LEGO Cognitive Engineering OS
## 30 年級 Human–AI 多專業、多利害關係人、研究、商業、學習與決策作業系統
### Global Master Architecture / Product / Engineering / Security / Research / Analytics / Legal / Compliance / Governance Plan

> **定位一句話**
> 建立一套以人類為最終決策者、AI 為可替換能力引擎、證據為真實核心、計算為可重現依據、工作流為可組裝 LEGO、所有成果皆可追溯、可驗證、可回滾、可離線、可上雲、可持續演化 30 年的「認知工程作業系統」。
```

### Proposed

```text
# AI LEGO Cognitive Engineering OS
## 30 年級 Human–AI 多專業、多利害關係人、研究、商業、學習與決策作業系統
### Global Master Architecture / Product / Engineering / Security / Research / Analytics / Legal / Compliance / Governance Plan

**Document ID**: `ai-lego.master-plan`
**Version**: `1.0.0`

> **定位一句話**
> 建立一套以人類為最終決策者、AI 為可替換能力引擎、證據為真實核心、計算為可重現依據、工作流為可組裝 LEGO、所有成果皆可追溯、可驗證、可回滾、可離線、可上雲、可持續演化 30 年的「認知工程作業系統」。
```

### Reason

Smallest missing-contract correction: self-identifying metadata reuses the current registry ID and EC §1 SemVer form; mutable SHA-256 remains in each execution's manifest.
