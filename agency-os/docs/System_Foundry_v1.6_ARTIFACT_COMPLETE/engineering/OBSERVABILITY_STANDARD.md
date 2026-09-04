# Observability Standard

A system MUST be debuggable in production from its own telemetry, without requiring a code change to add visibility after an incident.

Required: structured (not free-text-only) logs correlated by a request/trace id propagated across every service a request touches, metrics covering the golden signals (latency, traffic, errors, saturation) at minimum, distributed tracing for cross-service requests, an audit-event stream distinct from operational logs for security/compliance-relevant actions, and alerts defined on user-visible symptoms (error rate, latency) rather than only on internal causes (CPU, queue depth) so on-call is paged for things that actually matter to users.

Dashboards MUST be defined as code and versioned alongside the service, not hand-built and undocumented in a vendor UI. Every alert MUST link to a runbook; an alert with no runbook is a false-positive risk waiting to erode on-call trust.
