# Phase 1 E2E Acceptance

Run the source-defined 11-step dispatch flow and RWD/offline scenarios.

Offline scenarios: synchronize -> disconnect -> read cached allowed data -> queue acknowledgement -> reconnect -> one authoritative commit -> provider/outbox side effects; stale dispatch revision must reject/conflict; revoked user must reject; no cross-user cache leakage.
