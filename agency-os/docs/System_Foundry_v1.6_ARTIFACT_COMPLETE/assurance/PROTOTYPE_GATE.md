# Prototype Gate Standard

A prototype exists to resolve a specific uncertainty cheaply; it MUST NOT quietly become production code just because it happened to work.

Required at prototype start: the specific uncertainty it is meant to resolve (not "explore the idea generally"), an explicit scope boundary (what corners are deliberately cut — security review, error handling, test coverage — because they don't bear on the uncertainty being tested), and stated acceptance criteria for what result would resolve the uncertainty one way or the other.

Before a prototype is allowed to graduate toward production, it MUST pass through the standards it was exempted from at prototype start (`engineering/SECURITY_ARCHITECTURE_STANDARD.md`, `engineering/TESTING_STANDARD.md`, data-model review) as if it were new code — prototype code carrying prototype-era shortcuts directly into production is the specific failure mode this gate exists to prevent. A prototype's findings MUST be recorded and used in the real decision (`methodology/05_ARCHITECTURE_OPTIONS.md`) even when the prototype itself is discarded.
