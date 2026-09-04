# Assurance Case Standard

A system-level assurance case is the assembled argument that the system is trustworthy, built from individual Claim-Argument-Evidence records (`assurance/CLAIM_ARGUMENT_EVIDENCE.md`), not a single sweeping assertion.

Required: a claim tree rooted in the system's top-level trust claims (e.g. "customer data cannot leak across tenants"), each root claim decomposed into sub-claims until each is directly supported by concrete evidence (test results, fitness-function output, independent review), and an explicit residual-risk statement at every level where evidence is incomplete.

The assurance case MUST be owned by a role distinct from those who built the components it argues about (`kernel/04_SUBAGENT_INHERITANCE.md` independence-of-roles requirement) and MUST be re-validated whenever a claim's supporting evidence changes materially, not on a fixed calendar schedule alone. An assurance case with no residual-risk section anywhere is not credible — some residual risk always exists and omitting it MUST be treated as a defect in the case, not as strength.
