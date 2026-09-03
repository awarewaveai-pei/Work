# ADR-001 — Phase 1 Architecture Shape

Status: **PROPOSED**

Decision: use a modular monolith architecture with one RWD web client, relational authoritative database, explicit provider adapters, and durable asynchronous integration delivery.

Framework/provider selection remains open pending team/hosting/exit-strategy comparison.

Rejected by default: microservice decomposition, Kubernetes, native mobile app, PWA/offline subsystem. These can only be introduced by a future verified requirement and architecture decision.
