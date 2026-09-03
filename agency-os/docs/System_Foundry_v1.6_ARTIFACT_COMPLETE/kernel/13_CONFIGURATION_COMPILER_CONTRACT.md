# Configuration Compiler Contract

Version: 1.6.0

## Non-overridable rules

1. User-facing requirement choices MUST be binary: `YES` or `NO`.
2. A question MAY be shown only when YES and NO are both legitimate product/business outcomes.
3. Universal engineering quality requirements MUST be implemented as locked Foundation Baseline capabilities and MUST NOT be offered as optional questions.
4. A requirement that can be deterministically derived from prior answers MUST NOT be asked again.
5. Technology choices such as Kafka, Redis, Kubernetes, CQRS, ORM, cloud vendor, or framework MUST NOT be user intake questions unless the user explicitly imposes them as external constraints.
6. Questionnaire answers MUST compile through canonical rules into a `foundry-plan`; generators MUST NOT consume UI state directly.
7. Capability dependencies MUST be resolved to fixed-point closure before generation.
8. Invalid dependency or contradiction states MUST fail closed before filesystem mutation.
9. Generation MUST occur in staging and be atomically committed only after validation. Existing targets MUST never be overwritten.
10. Custom requirements MUST become formal traceable requirement artifacts. Unmapped custom semantics MUST be preserved for architecture review; they MUST NOT trigger speculative technology decisions.
11. Same questionnaire version + same answers + same rule/capability versions MUST yield the same semantic plan.
12. Every generated module MUST trace to FOUNDATION, USER_SELECTED, DERIVED, DEFERRED preservation, or an approved architecture decision.
