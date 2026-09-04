# API Architecture Standard

Every public API is a compatibility surface (`engineering/COMPATIBILITY_DEPRECATION_STANDARD.md`) and MUST be designed as such from the first version, not hardened retroactively.

Required: an explicit versioning scheme (URI/header/media-type), documented backward-compatibility policy, authentication/authorization boundary per `engineering/IAM_STANDARD.md`, idempotency keys for all mutating endpoints, a stable error taxonomy (machine-readable code plus human message, never a bare string), pagination contract for any list endpoint, documented rate limits and their signaling (headers/status codes), and deprecation signaling (sunset headers or equivalent) ahead of any breaking removal.

Mutating endpoints MUST NOT silently double-apply on retry. Error responses MUST NOT leak internal implementation details (stack traces, raw DB errors) to external callers.
