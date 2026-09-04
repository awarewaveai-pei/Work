# IAM Standard

Identity, authentication, and authorization are three distinct concerns and MUST NOT be collapsed into one ad hoc check.

Required: a single identity source of truth per principal (human, service account, or automated agent), authentication separated from authorization decisions, an explicit permission model (RBAC and/or ABAC — stated, not implicit in scattered `if user.role == ...` checks), least-privilege defaults for every new role/service account, a break-glass procedure for emergency elevated access that is time-bounded and fully audited, and just-in-time (JIT) elevation preferred over standing elevated access wherever the workflow allows it.

Service accounts and automated agents MUST be identifiable and revocable independently of any human account. Every authorization decision of consequence MUST be attributable after the fact (actor, resource, decision, timestamp) per `governance/AUTHORITY_MODEL.md` — an authorization check with no audit trail is not acceptable for anything beyond read-only, low-sensitivity operations.
