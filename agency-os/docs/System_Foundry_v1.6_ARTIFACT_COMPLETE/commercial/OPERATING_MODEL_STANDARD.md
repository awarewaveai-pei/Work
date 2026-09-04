# Operating Model Standard

## Purpose
Define who actually runs the commercial machinery day to day (support, billing operations, customer success) across the deployment spectrum this framework can generate — from a single self-serve user up to a private enterprise deployment — and what is automated versus human-gated at each point.

## Deployment-Spectrum Operating Models
1. This framework's generated systems MUST explicitly declare which operating model(s) they support along the spectrum: self-serve individual, small team, company-managed, enterprise-managed, group/multi-entity, and private deployment (`commercial/PRIVATE_DEPLOYMENT_STANDARD.md`). Support and billing operations MUST be defined per selected model, not assumed identical across all of them.
2. Moving a customer from one operating model to another (e.g. self-serve team upgrading to enterprise-managed) MUST be a defined transition with its own entitlement, support, and billing consequences — not an undocumented manual process.

## Automation vs. Human Gate
3. Routine, low-risk commercial operations (trial start, invoice generation, standard dunning steps) MUST be automated per `commercial/PROVISIONING_STANDARD.md` and `commercial/BILLING_ARCHITECTURE.md`. High-impact or irreversible operations (data deletion, legal-hold release, large refunds) MUST require a documented human authority per `governance/HUMAN_OVERSIGHT_STANDARD.md`.
4. Every automated commercial operation MUST have a documented escalation path to a human when it fails or its preconditions aren't met — automation MUST NOT silently retry forever or silently no-op on failure.

## Support Access and Escalation
5. Support staff operating on a customer's behalf MUST act under a scoped, audited authority grant (`governance/AUTHORITY_MODEL.md`), not standing admin access, regardless of operating model.
6. Escalation tiers (self-serve help center -> ticketed support -> named account team) MUST be tied to the operating model and/or edition (`commercial/ENTERPRISE_STANDARD.md`), and the mapping MUST be documented, not tribal knowledge.

## Ownership
7. Each operating-model-specific process MUST have a named owning role responsible for its correctness, distinct from the engineers who build the underlying entitlement/billing primitives — this is the commercial analogue of the design/assurance independence required elsewhere in this framework (`kernel/04_SUBAGENT_INHERITANCE.md`).
