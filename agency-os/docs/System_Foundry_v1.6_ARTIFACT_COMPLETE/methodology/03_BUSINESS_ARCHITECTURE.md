# Business Architecture Standard

## Purpose
建立商業層的架構（誰受益、價值怎麼實現、營運模式是什麼），作為 `04_DOMAIN_DISCOVERY.md` 技術領域建模的邊界條件——業務架構限制技術選項，但不指定技術選項。

## Sequencing
Step 03. Consumes requirements from `02_REQUIREMENT_DISCOVERY.md`. Its output feeds `04_DOMAIN_DISCOVERY.md` (bounded contexts should map to business capabilities) and `commercial/PRODUCTIZATION_STANDARD.md` (product boundary should map to a business capability).

## Required Scope
- capability map
- value streams
- operating model
- stakeholders
- value realization

## Required Fields
1. **Business capability map** — what the business does (not how), at a level stable even if the underlying technology changes entirely — this is the anchor `04_DOMAIN_DISCOVERY.md`'s bounded contexts should trace back to.
2. **Value streams** — the end-to-end sequence of activities that deliver value to a customer/user, used to identify where this idea actually inserts value versus where it's peripheral.
3. **Operating model** — who runs this day to day, referencing `commercial/OPERATING_MODEL_STANDARD.md`'s deployment-spectrum categories where applicable.
4. **Stakeholder map** — every party with a material interest (not just the buyer/user from `00_IDEA_INTAKE_STANDARD.md`) — includes support, compliance, finance where relevant.
5. **Value realization** — the specific mechanism by which value becomes measurable (ties back to `00_IDEA_INTAKE_STANDARD.md` success metrics), stated concretely enough that `13_CONVERGENCE_STANDARD.md` can later judge whether it was achieved.

## Gate
This step has no dedicated entry in `runtime/stage-gates.yaml` — the canonical `G3_POLICY_CONTEXT_RESOLVED` is a different concept (risk classification / authority / tool-boundary resolution), not business architecture. This step's own local check: reject a stated business capability with no owner, or a value-realization statement that cannot be tied to a concrete, observable metric.
