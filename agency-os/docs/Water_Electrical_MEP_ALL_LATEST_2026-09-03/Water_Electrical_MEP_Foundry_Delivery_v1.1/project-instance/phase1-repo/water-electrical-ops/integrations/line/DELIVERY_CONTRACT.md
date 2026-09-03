# LINE Delivery Contract

Supported intents: published, amended, cancelled, reminder.

Each delivery record stores dispatch/version, recipient employee, idempotency key, provider response reference, attempts, final status, timestamps, and last error.

Provider failure is visible/retriable and never silently changes authoritative Dispatch state.
