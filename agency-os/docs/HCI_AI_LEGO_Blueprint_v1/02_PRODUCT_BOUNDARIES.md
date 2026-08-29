> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/02_PRODUCT_BOUNDARIES.md. See 00_README.md in this folder for why.

# 02 — Product Boundaries

## Purpose

Define the permanent separation between HCI-30 and AI LEGO Cognitive Engineering OS.

---

# HCI-30

## Product identity

**Human Collaboration Intelligence**

HCI answers:

- Who is this person?
- What is known and unknown?
- What has this person done?
- What is the quality of the evidence?
- What patterns appear across time and context?
- What is trustworthy, and in which domain?
- What are the incentives?
- What power and dependency structures exist?
- What collaboration depth is safe?
- What controls are required?
- Should we proceed, limit, pause, review, or exit?

## Core domain objects

```text
Person
Organization
Relationship
Interaction
Observation
Evidence
Claim
PublicEvent
Hypothesis
Assessment
TrustDomain
Risk
Permission
Collaboration
Decision
Outcome
Review
```

HCI remains useful even if no AI exists.

---

# AI LEGO Cognitive Engineering OS

## Product identity

A general-purpose cognitive engineering operating system.

AI LEGO answers:

- What problem are we solving?
- Which cognitive methods should be used?
- In what order?
- Which model/tool/agent should execute them?
- What authority applies?
- How do we verify output?
- How do we cross-review models?
- How do we replay the run?
- How do we detect logic drift?
- How do we hand off?
- How do we rollback?

## Core domain objects

```text
Problem
Goal
Method
MethodContract
Workflow
Recipe
Step
Agent
Model
Tool
ExecutionRun
Authority
Gate
Review
ConvergenceMatrix
Handoff
Replay
Rollback
```

AI LEGO remains useful even if HCI does not exist.

---

# Relationship

They are **peer products**.

```text
HCI-30 <---- optional integration contract ----> AI LEGO Cognitive OS
```

## Must not

- HCI must not own AI LEGO's Method Atlas
- AI LEGO must not own HCI Person/Relationship/Trust data
- HCI must not require AI LEGO for basic CRUD, evidence entry, manual assessment, history, or decision records
- AI LEGO must not know HCI internal database schema
- Neither system may directly query the other's database

## Allowed integration

HCI may submit a case package to AI LEGO for:
- ACH
- red team
- premortem
- decision matrix
- multi-method analysis
- cross-model review

AI LEGO returns an **analysis result package**, not HCI facts.

HCI must pass returned results through HCI validation/admission logic before incorporating them into formal assessments.
