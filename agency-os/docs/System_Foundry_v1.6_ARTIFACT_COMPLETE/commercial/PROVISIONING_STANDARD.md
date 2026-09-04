# Provisioning Standard

## Purpose
Define what must happen, reliably and idempotently, at the moment a customer signs up, upgrades, or otherwise triggers automated resource/tenant creation — this is the commercial layer's most failure-sensitive automated path.

## Idempotent Provisioning
1. Every provisioning action (trial start, subscribe, tenant creation, upgrade-triggered resource allocation) MUST be idempotent against a caller-supplied or derived request key. A retried or duplicated provisioning request MUST NOT create duplicate tenants/resources.
2. Provisioning MUST be resumable: if it fails partway, retrying MUST continue from a known state, not restart destructively or leave orphaned partial resources.

## Sequenced Lifecycle Events
3. Provisioning steps (trial -> subscribe -> configure -> activate -> upgrade -> suspend -> cancel) MUST each map to a `commercial/CUSTOMER_LIFECYCLE.md` transition; provisioning MUST NOT create tenant/resource state that lifecycle doesn't know about.
4. Activation MUST NOT be signaled to the customer until all required provisioning steps are durably complete — no "partial success" reported as success (mirrors `experience/ERROR_RECOVERY_OPERATOR_SAFETY_STANDARD.md`).

## Rollback on Partial Failure
5. A failed provisioning attempt MUST roll back or clearly mark as failed any resources it partially created, within a bounded time, so failed attempts don't silently consume quota or leak billable resources.
6. Rollback of provisioning MUST NOT be a manual, undocumented cleanup process — it MUST be an automated or explicitly runbooked path per `engineering/ROLLBACK_STANDARD.md`.

## Provisioning SLA
7. Each provisioning action MUST have a stated maximum expected completion time; provisioning that exceeds it MUST raise a visible operational alert, not fail silently while the customer waits indefinitely.

## Suspend and Cancel
8. Suspend and cancel provisioning actions MUST be as reliable and idempotent as create/activate — a suspend that fails halfway MUST NOT leave a customer both billed and blocked, or neither.
