# Canonical Status Code Standard v1.4

`registries/status-codes.yaml` is the single machine source of truth. Runtime gates, validators, agents and project control planes MUST reference only registered codes. Unknown status strings are invalid and fail closed with `REFERENCE_INVALID`.

The registry distinguishes success, failure, blocked/recoverable, recovery and terminal semantics. Adding/removing a status code is a governed contract change and requires validator/tests plus migration impact review.
