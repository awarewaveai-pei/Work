# Testing Standard

A test suite that passes without ever having caught a real bug is unproven, not trustworthy — passing is necessary but not sufficient evidence of test quality (`assurance/GOLDEN_TEST_STANDARD.md`).

Required layers: unit tests for logic-level correctness, integration tests across real (or realistic) dependency boundaries, contract tests for every published API/event surface (`engineering/API_ARCHITECTURE_STANDARD.md`, `engineering/EVENT_ARCHITECTURE_STANDARD.md`), end-to-end tests for critical user journeys, security tests (at minimum dependency/SAST scanning as a gate), performance tests for capacity-sensitive paths, migration tests that actually run the expand-contract sequence against realistic data, and restore tests that actually perform a restore (`assurance/RESTORE_VERIFICATION.md`).

Test quality MUST be periodically checked with mutation testing or an equivalent technique to prove tests fail when the code they cover is broken — a green suite alone does not establish this. Flaky tests MUST be fixed or quarantined with a tracked ticket; a flaky test silently re-run until green is a rejected practice.
