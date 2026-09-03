# Structured Handoff Standard

Any handoff between agents, humans, teams, sessions, or tools MUST preserve state without relying on chat memory.

Required handoff fields:
- handoff_id, timestamp, from, to
- objective and scope/non-goals
- current lifecycle/stage/gate status
- verified facts with file:line evidence
- assumptions/unknowns/disputes
- decisions and ADR refs
- changed files/artifacts
- tests executed and exact results
- risks/blockers
- rollback/recovery position
- pending tasks with exact next action
- authority/risk context
- hashes/version identifiers when artifacts matter

A recipient MUST be able to continue safely from the handoff alone plus referenced source artifacts.
