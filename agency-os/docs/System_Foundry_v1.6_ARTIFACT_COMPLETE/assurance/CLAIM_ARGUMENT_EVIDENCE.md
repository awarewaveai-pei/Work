# Claim-Argument-Evidence Standard

The atomic unit of every assurance case (`assurance/ASSURANCE_CASE_STANDARD.md`) is a Claim-Argument-Evidence (CAE) record: a claim, the argument for why the evidence supports it, and the evidence itself.

Required fields per record: a unique claim ID (stable across revisions so it can be tracked over time), the argument connecting evidence to claim (not just a list of evidence with no stated reasoning), the evidence itself with a content-addressed reference (`engineering/DATABASE_ARCHITECTURE_STANDARD.md`-style exact reference, not a vague pointer), a coverage statement (what the claim does NOT cover, as explicitly as what it does), a confidence/evidence-state tag (VERIFIED / INFERRED / ASSUMED / UNKNOWN / DISPUTED), and a residual-risk field that MUST NOT be silently omitted.

Contradicting evidence discovered after a claim is recorded MUST be linked to the original claim and MUST downgrade its evidence-state, not be filed separately and left unreconciled. A CAE record supported only by another CAE record's claim (rather than primary evidence) MUST be traced back to primary evidence somewhere in the chain — circular support between claims is prohibited.
