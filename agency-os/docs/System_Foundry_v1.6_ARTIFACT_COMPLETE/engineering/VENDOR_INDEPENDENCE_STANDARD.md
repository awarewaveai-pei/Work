# Vendor Independence Standard

Every critical external vendor MUST sit behind an owned capability adapter (`engineering/PROVIDER_RESILIENCE_STANDARD.md`); the application MUST depend on the adapter's interface, never on the vendor's SDK/wire format directly, across the codebase.

Required: an inventory of critical vendors with a stated criticality tier per vendor, a capability-adapter boundary for each, an evaluated replacement/switch cost per vendor (engineering effort, data migration, contractual lock-in), and a concretely planned (not merely asserted) exit path per `assurance/VENDOR_EXIT_TEST.md`.

A vendor MUST NOT become a de facto architectural dependency by having its vendor-specific concepts leak into the domain model (`engineering/DOMAIN_ARCHITECTURE_STANDARD.md`). Switch cost MUST be periodically re-evaluated as usage grows — a low-switch-cost vendor adopted early can become high-switch-cost silently if the adapter boundary erodes over time.
