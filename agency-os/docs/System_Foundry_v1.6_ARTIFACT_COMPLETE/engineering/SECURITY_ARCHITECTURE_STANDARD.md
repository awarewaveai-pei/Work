# Security Architecture Standard

New attack surface MUST NOT ship without a threat model; "we'll secure it later" is a rejected plan, not a deferred task.

Required: an explicit trust-boundary diagram identifying where untrusted input enters the system, least-privilege as the default posture for every service/credential (`engineering/IAM_STANDARD.md`), approved cryptographic primitives and key-management procedure (no home-rolled crypto), secrets sourced from a secrets manager at runtime and never committed to source control, dependency and supply-chain scanning as a release gate (`engineering/SUPPLY_CHAIN_SECURITY_STANDARD.md`), and an incident-response linkage so a detected vulnerability has a defined path to triage and remediation.

Security review MUST happen before new externally-reachable surface ships, not as a post-hoc audit. A security exception (accepting a known risk) MUST follow `governance/EXCEPTION_STANDARD.md` with a mandatory expiry — it MUST NOT become permanent by default through inattention.
