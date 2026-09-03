# Policy and External-Fact Freshness Standard

Architecture decisions depending on laws, standards, vendor limits, certificates, APIs, security advisories, pricing, or other mutable external facts MUST carry `verified_at`, source, owner and freshness class.

Freshness classes: CRITICAL, HIGH, MEDIUM, LOW. Each project profile maps classes to review cadences. If evidence exceeds its SLA at a gate, mark `STALE_EVIDENCE`; do not silently treat it as verified.
