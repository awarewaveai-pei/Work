"""Tenant -- Domain Model object #23 (ADR-003), the outermost blast-radius boundary.

The record shape is owned by ``specs/domain/tenant.schema.yaml``; this module
only builds instances and holds the two SYNTHETIC tenants the Phase 5 slice
uses. Nothing here is a real customer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SyntheticTenant:
    tenant_id: str
    legal_name: str
    label: str
    home_jurisdiction: str = "jurisdiction-pack.eu-gdpr.v1"
    data_residency_region: str = "eu-west"

    @property
    def kek_ref(self) -> str:
        return f"kek:{self.tenant_id}"

    def record(self, created_at: str) -> dict[str, Any]:
        """Instance of ``ai-lego://specs/domain/tenant.schema.yaml``."""
        return {
            "tenant_id": self.tenant_id,
            "legal_name": self.legal_name,
            "status": "active",
            "home_jurisdiction": self.home_jurisdiction,
            "data_residency_region": self.data_residency_region,
            "encryption_root_key_ref": self.kek_ref,
            "created_at": created_at,
            "deleted_at": None,
        }


NORDBROOK = SyntheticTenant(
    tenant_id="11111111-1111-4111-8111-111111111111",
    legal_name="Nordbrook Research Lab (synthetic)",
    label="TEN-NORDBROOK",
)
CASCADIA = SyntheticTenant(
    tenant_id="22222222-2222-4222-8222-222222222222",
    legal_name="Cascadia People Ops Consultancy (synthetic)",
    label="TEN-CASCADIA",
)
