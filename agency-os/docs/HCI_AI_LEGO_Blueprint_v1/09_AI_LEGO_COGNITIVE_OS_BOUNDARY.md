> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md. See 00_README.md in this folder for why.

# 09 — AI LEGO Cognitive Engineering OS Boundary

## Product identity

AI LEGO is a general cognitive engineering operating system with:

- human final decision
- replaceable AI engines
- evidence-centric execution
- reproducible computation
- LEGO-style workflows
- 30-year target life

## Existing mother documents

### Global Master Plan

Owns:
- Product
- Architecture
- Security
- Data
- Global jurisdiction
- Governance

### Cognitive Method Atlas

Owns:
- 289 cognitive methods/tools
- method contracts
- method selection rules
- quality gates

Examples:
- brainstorming
- root cause
- red team
- decision matrix

### Execution Contract

Owns:
- AI execution lifecycle
- authority
- change control
- handoff protocol

## Core features

### Scoped Authority conflict chain

```text
Law
→ Security / Privacy
→ Machine-readable Contract
→ ADR
→ Master Plan / Atlas
→ Recipe
```

For HCI integration, add HCI Domain Policy before Recipe where relevant.

### Method Atlas

AI does not choose methods by memory alone.

Each method has a contract and gate.

### Evidence / Replay / Rollback

Each execution preserves:
- Method Atlas version/hash
- workflow version
- model details
- relevant policy versions

### Global jurisdiction

Handles:
- cross-border data protection
- AI regulation
- sanctions/trade constraints
- localization
- jurisdiction conflicts

### Cross-model validation

Example:

```text
Model A planning
+
Model B independent read-only review
+
CONVERGENCE_MATRIX
```

Critical invariant:

```text
AGREE != FACT
```

## AI LEGO must not own

- HCI Person records
- HCI relationships
- HCI trust scores
- HCI public claims
- HCI cooperation decisions

## HCI must not duplicate

Where AI LEGO already provides a general capability, HCI should integrate rather than reimplement:

- Red Team
- ACH
- Premortem
- generic Decision Matrix
- generic Root Cause
- workflow replay
- cross-model convergence
- generic handoff
- model routing
- method selection framework
