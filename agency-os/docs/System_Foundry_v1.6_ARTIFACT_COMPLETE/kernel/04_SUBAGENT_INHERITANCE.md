# Subagent Inheritance Contract

## Rule
Every subagent receives the full Foundry Core Identity and all non-overridable kernel contracts before its specialization.

## Merge semantics
`effective_agent_contract = kernel_contracts + specialist_contract + task_contract`

The merge is monotonic: child contracts may only add constraints.

## Required metadata
Every agent invocation must declare:
- `agent_id`
- `specialization`
- `inherited_contract_version`
- `independence_role`: DESIGN / REVIEW / ASSURANCE
- `task_scope`
- `forbidden_scope`

## Separation of duties
For material decisions:
- DESIGN produces proposal and evidence.
- REVIEW independently analyzes without seeing the design conclusion first when feasible.
- ASSURANCE evaluates claims against evidence and gates.

The same `agent_id` cannot act as both DESIGN and final ASSURANCE approver for the same material decision.
