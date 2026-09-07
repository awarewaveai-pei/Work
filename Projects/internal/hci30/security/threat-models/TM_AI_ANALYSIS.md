# Threat Model — AI Analysis Boundary

P0-08 / 3 of 4. Scope: threats specific to HCI's AI-driven analysis steps
(claim extraction, source-independence scoring) and their boundary with the
underlying AI LEGO Cognitive Engineering OS, per `09_AI_LEGO_COGNITIVE_OS_
BOUNDARY.md`'s §HCI must not duplicate rule — this file cross-references
AI LEGO's own threat model rather than re-deriving it.

## Prompt injection at the claim-extraction boundary

**Status: same open mechanism gap as AI LEGO's own threat model — one
threat, two documents pointing at the same unbuilt control.**

HCI's claim-extraction step reads attacker-influenceable web content
(`06_HCI30_PUBLIC_INTELLIGENCE.md` §Content isolation & authenticity check,
`HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-04 — full threat
narrative in [TM_PUBLIC_INTELLIGENCE.md](TM_PUBLIC_INTELLIGENCE.md)). This is
not a new threat class: AI LEGO's own drafted threat model already carries
it as a named row —

`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/docs/architecture/SECURITY_THREAT_MODEL.md`:
- **TB-1** (Tampering/Boundary): "Untrusted External Content ↔ Policy/System
  Instructions" — PDF/Web/Email/Upload/Tool Output default to `UNTRUSTED
  DATA` (EC§35). Status: "結構原則存在，機制未定義（SEC-4）" (structural
  principle exists, mechanism undefined) — literally cross-referencing this
  same SEC-4 finding.
- **T2** (Tampering / cross-Elevation): prompt injection tampering with a
  tool-call decision; **if written into Knowledge Memory, the injected
  content gains permanent, falsely-trusted status** — a materially worse
  outcome than a single-turn injection.
- **E4** (Elevation of Privilege): the same injection succeeding =
  attacker-controlled content self-granting elevated tool authority via the
  `Capability+Policy+Authority` decision chain.

AI LEGO's own tracked open item (`SECURITY_THREAT_MODEL.md:149`): "T2/E4/Uw1
untrusted-content marking's survival mechanism through the Knowledge Memory
write path must be resolved before the memory subsystem's ingestion pipeline
is designed." HCI's claim-extraction pipeline is exactly such an ingestion
path into HCI's own persistent store (`hci.subject_records` CLAIM rows) —
**if HCI's claim-extraction ever writes fetched content toward Knowledge
Memory (it does not today; Claims and AI LEGO's Knowledge Memory are
separate stores per the Boundary doc), this same unresolved survival-
mechanism question would apply to HCI's own data, not just AI LEGO's.**
Tracked here as a dependency, not solved here — AI LEGO owns the fix per the
Must-Not-Duplicate boundary.

## Source-independence scoring as an AI-integrity target

**Status: OPEN, see [TM_PUBLIC_INTELLIGENCE.md](TM_PUBLIC_INTELLIGENCE.md)
§Source poisoning.** Once an automated independence-threshold algorithm
ships, it becomes an adversarial-ML-style target: anyone who studies its
rules can manufacture inputs (sockpuppet sources) that satisfy it without
being genuinely independent (`HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_
REVIEW.md` SEC-15). Not re-detailed here to avoid duplicating the fuller
treatment in that file.

## AI agents as an access-control actor (operational, not product)

**Status: named gap, no policy decision recorded.** Distinct from the two
threats above: this is about AI coding agents (Claude/Codex) with standing
SSH/DB credentials on the box that will eventually host real HCI person
data during build/ops — not about the shipped product's own AI-analysis
pipeline. `11_SECURITY_PRIVACY_GOVERNANCE.md`'s defense-in-depth chain
(Edge/Identity/Gateway/Policy/Tenant-Context/App-Authz/DB-RLS/Encryption/
Audit) has no actor category for autonomous coding agents at all
(`HCI30_RESEARCH_REVIEW/07_SECURITY_PRIVACY_REVIEW.md` SEC-12). No document
states whether an agent debugging production may query RESTRICTED person/
evidence tables, whether that requires the same break-glass logging as a
human operator (SEC-07), or whether agents must use synthetic fixtures only.
Flagged here because it is genuinely unaddressed anywhere in the blueprint,
not because this file can resolve it — it is an organizational governance
decision (`D:\Work\agency-os\AGENTS.md`'s own scope), not an HCI schema gate.

## What this file does not cover

SSRF, source poisoning, investigation-footprint —
[TM_PUBLIC_INTELLIGENCE.md](TM_PUBLIC_INTELLIGENCE.md). Cross-tenant data
isolation — [TM_MULTI_TENANCY.md](TM_MULTI_TENANCY.md).
