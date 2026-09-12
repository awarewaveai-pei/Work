"""``check_entitlement`` -- the single entitlement primitive every capability-execution call
site MUST route through (ENTITLEMENT_STANDARD.md rule 1: "Free-form has_feature_x: true flags
scattered across services are prohibited once an entitlement system exists").

Phase 1 (self-use) implementation: always grants, for any tenant that exists and is active.
This is deliberately NOT a stub that gets deleted later -- Phase 2 (subscription+credits)
replaces the body of ``check_entitlement`` with a real entitlement-store lookup behind this
exact same signature, so every call site built against Phase 1 needs zero changes
(EDITION_ARCHITECTURE.md rule 6: never hardcode a plan/edition name into the call site --
call sites only ever call ``check_entitlement``, they never know Phase 1 always says yes).

Every check is still recorded to the audit trail (ENTITLEMENT_STANDARD.md rule 8) even though
Phase 1 has no real entitlement changes to audit yet -- this makes the Phase 2 migration
"replace the grant logic" rather than "add auditing that was missing," per this project's own
zero-rework decision (.foundry/decision-register.json entry 2).
"""

from __future__ import annotations

from ai_lego.platform.identity.store import IdentityStore


def check_entitlement(store: IdentityStore, tenant_id: str, capability_id: str) -> bool:
    """Returns whether ``tenant_id`` may invoke ``capability_id`` right now.

    Phase 1: grants iff the tenant exists and is active. capability_id is accepted and
    audited but not yet used to differentiate -- there is only one edition today.
    """
    tenant = store.get_tenant(tenant_id)
    granted = tenant is not None and tenant["status"] == "active"
    store.record_entitlement_check(tenant_id, capability_id, granted)
    return granted
