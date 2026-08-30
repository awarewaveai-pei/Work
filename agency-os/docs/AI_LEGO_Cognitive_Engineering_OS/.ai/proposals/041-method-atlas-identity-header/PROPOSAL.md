---
proposal_id: "041"
slug: "method-atlas-identity-header"
status: APPLIED
target_document: "AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md"
target_baseline_hash: "a47424f96bf6f88023b9870d4112ab1f607e9b424236693572d6a5558d2804a1"
affected_line_ranges: ["L1-L10"]
related_open_questions: ["OQ-1"]
change_class: "missing_contract"
authored_by: "Codex"
approved_by: "操作者"
approved_at: "2026-08-30"
approval_note: "核准"
applied_commit: "f3466264"
---

## PROPOSED_CHANGE

Replace the non-SemVer `版本：1.0` title metadata with the existing registry identity `ai-lego.method-atlas` and SemVer `1.0.0`. Do not add a mutable content hash.

## RATIONALE

ADR-017 (ACCEPTED 2026-08-30) requires a self-identifying Atlas header. Execution Contract §4 already uses `ai-lego.method-atlas`; EC §1 requires internal SemVer. Replacing, rather than retaining, `版本：1.0` prevents two version formats from claiming authority in one header.

## SOURCE_DOCUMENT

`AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md`

## AFFECTED_SECTIONS

Document title metadata before positioning, scope, and design-period fields (current L1-L10).

## DEPENDENCIES

- `docs/adr/ADR-017-mother-document-identity-headers.md` (ACCEPTED).
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md` §4 document registry (`ai-lego.method-atlas`).
- Proposal 040 is independent; either header can be reverted alone.

## COMPATIBILITY

The header's existing v1 lineage is preserved as `1.0.0`. No filename, method semantics, machine spec, or execution-record behavior changes.

## MIGRATION

After explicit operator approval, use the exact replacement below. Do not modify `.ai/research/phase-0/document-hashes.yaml`; it preserves the original baseline. Execution Manifest continues to record current SHA-256.

## ROLLBACK

`git revert <applied_commit>` restores the original title metadata without changing method content or schemas.

## EVIDENCE

- `docs/adr/ADR-017-mother-document-identity-headers.md` — accepted OQ-1 decision.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:201-229` — existing registry ID and manifest fields.
- `AI_LEGO_Cognitive_Engineering_Os_Global_Execution_Contract_v1.md:78-86` — SemVer and identity requirements.
- `AI_LEGO_Cognitive_Method_Atlas_Global_Architecture_v1.md:1-10` — `版本：1.0`, no Document ID.
- `.ai/research/phase-0/document-hashes.yaml:14-18` — frozen proposal baseline hash.

## Diff

### Original

```text
# AI LEGO Cognitive Engineering OS


## Global Cognitive Method Atlas & Modular Brainstorming / Reasoning Architecture

**版本**：1.0
**定位**：AI LEGO Cognitive Engineering OS 的 Brainstorming / Reasoning / Decision 方法論與工程化補充規格
**適用範圍**：全球、跨產業、跨文化、跨政府層級、研究、商業、工程、DevOps、資安、DB/Data、PM、政策、教育與個人學習
**設計期限**：30 年以上
**核心原則**：Human-led / Evidence-centered / Model-replaceable / Typed LEGO / Local-first / Global-ready
```

### Proposed

```text
# AI LEGO Cognitive Engineering OS


## Global Cognitive Method Atlas & Modular Brainstorming / Reasoning Architecture

**Document ID**: `ai-lego.method-atlas`
**Version**: `1.0.0`
**定位**：AI LEGO Cognitive Engineering OS 的 Brainstorming / Reasoning / Decision 方法論與工程化補充規格
**適用範圍**：全球、跨產業、跨文化、跨政府層級、研究、商業、工程、DevOps、資安、DB/Data、PM、政策、教育與個人學習
**設計期限**：30 年以上
**核心原則**：Human-led / Evidence-centered / Model-replaceable / Typed LEGO / Local-first / Global-ready
```

### Reason

The Atlas already has the v1 lineage but lacks Document ID and SemVer. This exact replacement reuses the registered ID and preserves mutable SHA-256 as an Execution Manifest responsibility.
