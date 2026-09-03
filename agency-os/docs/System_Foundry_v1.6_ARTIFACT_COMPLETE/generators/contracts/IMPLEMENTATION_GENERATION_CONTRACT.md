# Implementation Generation Contract

Code generation may begin only after G9_IMPLEMENTATION_READY.
Generated work must map 1:1 to approved tasks and exact paths. Agents may not invent architectural shortcuts outside the approved decision set.

Every generated change must emit a verification bundle containing:
- task ID
- changed paths
- tests executed and results
- migration result
- observability checks
- security checks
- rollback rehearsal/result
- acceptance result
- residual risks
