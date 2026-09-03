"""Local, synthetic-only Key Vault implementing the ADR-002 crypto-shred mechanism.

Record shapes are owned by ``specs/security/key-vault-lifecycle.schema.yaml``
(``key_record``, ``key_destruction_record``, ``vault_restore_event``) and
``specs/security/personal-data-envelope.schema.yaml``.

Design (envelope encryption is real, not decorative):

* A tenant KEK wraps every per-subject DEK. The vault persists ONLY wrapped
  DEKs (``wrapped_deks``) plus the KEK material (synthetic scope: a local
  file stands in for a KMS/HSM). Raw DEK bytes exist only transiently.
* ``decrypt_or_redact`` is a policy check followed by an unwrap: the record
  must exist, belong to the caller's tenant and subject (checked BEFORE any
  state-dependent answer, so a foreign tenant learns nothing from the
  response), and be ACTIVE; then the envelope's own ``dek_wrapped`` is
  unwrapped with the tenant KEK and the field decrypted.
* Destruction deletes the wrapped DEK and marks the LIVE copy destroyed. A
  backup copy the vault cannot reach (WORM snapshot) is recorded honestly as
  ``destroyed: false`` pending restore-time replay -- ADR-002's own mechanism
  for exactly that copy -- and flips to true only when the replay re-destroys
  it in a restored vault.
* Restore-time replay compares instants (never ISO strings) and confirms
  re-destruction by re-checking the records, not by comparing two lists
  derived from the same filter.

Residual (documented in docs/PHASE5_RESEARCH_SLICE.md, OQ-P5-7): each ledger
envelope carries ``dek_wrapped`` under the tenant KEK, so after a DEK is
destroyed the KEK is the remaining secret; a production deployment must keep
the KEK in a KMS/HSM whose unwrap authorization is revoked per subject, or
rotate the KEK on erasure. This vault does neither -- it never claims to.
"""

from __future__ import annotations

import copy
import secrets
from pathlib import Path
from typing import Any, Callable

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ai_lego.core.support import SyntheticClock, b64, parse_timestamp, read_json, sha256_bytes, stable_id, unb64, write_json
from ai_lego.errors import InvariantViolation

REDACTED = "REDACTED"
DECRYPT_BLOCKED_PENDING_REPLAY = "DECRYPT_BLOCKED_PENDING_REPLAY"
LIVE_COPY = "local-vault-live"
PENDING_RESTORE_REPLAY = "PENDING_RESTORE_TIME_REPLAY"

Validator = Callable[[str, Any, str], None]


class LocalKeyVault:
    def __init__(self, path: Path, clock: SyntheticClock, run_id: str, validator: Validator | None = None) -> None:
        self.path = path
        self.clock = clock
        self.run_id = run_id
        self.validator = validator
        self.kek_material: dict[str, bytes] = {}
        self.wrapped_deks: dict[str, str] = {}
        self.kek_records: dict[str, dict[str, Any]] = {}
        self.dek_records: dict[str, dict[str, Any]] = {}
        self.destruction_records: list[dict[str, Any]] = []
        self.decrypt_serviceable = True
        self.restore_event: dict[str, Any] | None = None

    # ------------------------------------------------------------------ keys
    @property
    def key_records(self) -> list[dict[str, Any]]:
        return list(self.kek_records.values()) + list(self.dek_records.values())

    def _validate_records(self) -> None:
        if self.validator is None:
            return
        for record in self.key_records:
            self.validator("ai-lego://specs/security/key-vault-lifecycle.schema.yaml#/definitions/key_record", record, f"key record {record['key_id']}")

    def add_tenant_kek(self, tenant_id: str, offset: float = 0) -> str:
        key_id = f"kek:{tenant_id}"
        if key_id in self.kek_records:
            raise InvariantViolation(f"KEK_ALREADY_ISSUED: {key_id}")
        self.kek_material[key_id] = AESGCM.generate_key(bit_length=256)
        self.kek_records[key_id] = {
            "key_id": key_id,
            "key_use": "KEK",
            "tenant_id": tenant_id,
            "subject_id": None,
            "algorithm": "AES-256-GCM",
            "sovereignty_mode": "Local-only Keys",
            "wrapped_by_kek_ref": None,
            "status": "ACTIVE",
            "issued_at": self.clock.at(offset),
            "destroyed_at": None,
            "rotation_policy": {"rotation_interval": "NOT_IMPLEMENTED_SYNTHETIC_VAULT", "last_rotated_at": None, "rotation_breaks_correlatability": False},
            "physical_copies": [{"location": LIVE_COPY, "is_live": True, "snapshot_taken_at": None}],
        }
        self._save()
        return key_id

    def _wrap(self, kek_ref: str, key_id: str, dek: bytes) -> str:
        wrap_nonce = secrets.token_bytes(12)
        return b64(wrap_nonce + AESGCM(self.kek_material[kek_ref]).encrypt(wrap_nonce, dek, key_id.encode("utf-8")))

    def _unwrap(self, kek_ref: str, key_id: str, wrapped_b64: str) -> bytes:
        if kek_ref not in self.kek_material:
            raise InvariantViolation(f"TENANT_KEK_MISSING: {kek_ref}")
        blob = unb64(wrapped_b64)
        return AESGCM(self.kek_material[kek_ref]).decrypt(blob[:12], blob[12:], key_id.encode("utf-8"))

    def _get_or_create_dek(self, tenant_id: str, subject_id: str, offset: float) -> tuple[str, bytes, str]:
        key_id = f"dek:{tenant_id}:{subject_id}"
        existing = self.dek_records.get(key_id)
        if existing:
            if existing["status"] != "ACTIVE" or key_id not in self.wrapped_deks:
                raise InvariantViolation(f"DEK_NOT_ACTIVE: refusing to encrypt with {key_id}")
            kek_ref = existing["wrapped_by_kek_ref"]
            return key_id, self._unwrap(kek_ref, key_id, self.wrapped_deks[key_id]), kek_ref
        kek_ref = f"kek:{tenant_id}"
        if kek_ref not in self.kek_material:
            raise InvariantViolation(f"TENANT_KEK_MISSING: {tenant_id}")
        dek = AESGCM.generate_key(bit_length=256)
        self.wrapped_deks[key_id] = self._wrap(kek_ref, key_id, dek)
        self.dek_records[key_id] = {
            "key_id": key_id,
            "key_use": "DEK",
            "tenant_id": tenant_id,
            "subject_id": subject_id,
            "algorithm": "AES-256-GCM",
            "sovereignty_mode": None,
            "wrapped_by_kek_ref": kek_ref,
            "status": "ACTIVE",
            "issued_at": self.clock.at(offset),
            "destroyed_at": None,
            "rotation_policy": None,
            "physical_copies": [{"location": LIVE_COPY, "is_live": True, "snapshot_taken_at": None}],
        }
        self._save()
        return key_id, dek, kek_ref

    # ------------------------------------------------------------- envelopes
    def encrypt(self, tenant_id: str, subject_id: str, plaintext: str, classification_tag: str, offset: float = 0) -> dict[str, str]:
        """Instance of ``personal-data-envelope.schema.yaml``; ``dek_wrapped`` is a fresh wrap of the subject DEK."""
        if classification_tag not in {"Confidential", "Restricted"}:
            raise InvariantViolation("ENVELOPE_CLASSIFICATION_INVALID: only Confidential/Restricted data enters an envelope")
        key_id, dek, kek_ref = self._get_or_create_dek(tenant_id, subject_id, offset)
        nonce = secrets.token_bytes(12)
        return {
            "cipher_alg": "AES-256-GCM",
            "kek_ref": kek_ref,
            "dek_key_id": key_id,
            "dek_wrapped": self._wrap(kek_ref, key_id, dek),
            "iv": b64(nonce),
            "ciphertext": b64(AESGCM(dek).encrypt(nonce, plaintext.encode("utf-8"), subject_id.encode("utf-8"))),
            "classification_tag": classification_tag,
        }

    def decrypt_or_redact(self, tenant_id: str, subject_id: str, envelope: dict[str, str]) -> str:
        """Policy check (ownership BEFORE state), then unwrap + decrypt. Destroyed key -> REDACTED at any replay time."""
        record = self.dek_records.get(envelope["dek_key_id"])
        if record is None:
            return REDACTED  # unknown key: tenant-independent answer, no oracle
        if record["tenant_id"] != tenant_id:
            raise InvariantViolation("VAULT_TENANT_ACCESS_DENIED")
        if record["subject_id"] != subject_id:
            raise InvariantViolation("DEK_SUBJECT_BINDING_MISMATCH")
        if not self.decrypt_serviceable:
            return DECRYPT_BLOCKED_PENDING_REPLAY
        if record["status"] != "ACTIVE" or record["key_id"] not in self.wrapped_deks:
            return REDACTED
        if envelope["kek_ref"] != record["wrapped_by_kek_ref"]:
            raise InvariantViolation("ENVELOPE_KEK_MISMATCH")
        dek = self._unwrap(envelope["kek_ref"], record["key_id"], envelope["dek_wrapped"])
        return AESGCM(dek).decrypt(unb64(envelope["iv"]), unb64(envelope["ciphertext"]), subject_id.encode("utf-8")).decode("utf-8")

    # ------------------------------------------------------------ destruction
    def _destroy_record(self, record: dict[str, Any], destroyed_at: str) -> str:
        wrapped = self.wrapped_deks.pop(record["key_id"])
        record["status"] = "DESTROYED"
        record["destroyed_at"] = destroyed_at
        copies = []
        for copy_location in record["physical_copies"]:
            if copy_location["is_live"]:
                copies.append({**copy_location, "destroyed": True, "destroyed_at": destroyed_at})
            else:
                copies.append({**copy_location, "destroyed": False, "destroyed_at": None, "pending": PENDING_RESTORE_REPLAY})
        record["physical_copies"] = copies
        return sha256_bytes(unb64(wrapped))

    def destroy_subject_dek(
        self,
        tenant_id: str,
        subject_id: str,
        authorization_ref: str,
        verification_envelopes: list[tuple[str, dict[str, str]]],
        offset: float,
    ) -> dict[str, Any] | None:
        """Crypto-shred one subject in one tenant; returns the ``key_destruction_record`` or None if already destroyed.

        Verification is performed: every ``(reference, envelope)`` is actually
        tried after destruction and must come back REDACTED.
        """
        matching = [record for record in self.dek_records.values() if record["tenant_id"] == tenant_id and record["subject_id"] == subject_id]
        if not matching:
            raise InvariantViolation("UNKNOWN_DATA_SUBJECT")
        if len(matching) != 1:
            raise InvariantViolation(f"DEK_CARDINALITY_INVALID: expected one DEK for {subject_id}, found {len(matching)}")
        record = matching[0]
        if record["status"] == "DESTROYED":
            return None
        if record["status"] != "ACTIVE" or record["key_id"] not in self.wrapped_deks:
            raise InvariantViolation(f"DEK_STATE_INVALID: cannot destroy from state {record['status']}")
        destroyed_at = self.clock.at(offset)
        commitment = self._destroy_record(record, destroyed_at)
        attempted = [reference for reference, _ in verification_envelopes]
        outcomes = [self.decrypt_or_redact(tenant_id, subject_id, envelope) for _, envelope in verification_envelopes]
        if any(outcome != REDACTED for outcome in outcomes):
            raise InvariantViolation("KEY_DESTRUCTION_VERIFICATION_FAILED: an envelope still decrypts after DEK destruction")
        destruction = {
            "key_id": record["key_id"],
            "key_use": "DEK",
            "subject_id": subject_id,
            "destroyed_at": destroyed_at,
            "authorization_ref": authorization_ref,
            "destruction_scope": [
                {
                    "copy_location": copy_location["location"],
                    "destroyed": bool(copy_location.get("destroyed")),
                    "destroyed_at": copy_location.get("destroyed_at"),
                    **({"pending": copy_location["pending"]} if copy_location.get("pending") else {}),
                }
                for copy_location in record["physical_copies"]
            ],
            "verification": {
                "attempted_decrypt_refs": attempted,
                "all_decrypts_failed": bool(attempted) and all(outcome == REDACTED for outcome in outcomes),
                "attempted_count": len(attempted),
            },
            "independent_audit_log_ref": f"audit://local/synthetic/key-destruction/{tenant_id}/{subject_id}",
            "key_material_destroyed_commitment": commitment,
            "on_decrypt_failure_projection_behavior": REDACTED,
        }
        self.destruction_records.append(destruction)
        self._save()
        return destruction

    # ------------------------------------------------------- backup/restore
    def create_backup_snapshot(self, snapshot_path: Path, snapshot_at: str) -> dict[str, Any]:
        """Independently restorable synthetic backup; registers itself as a (non-live) physical copy of every key."""
        snapshot_id = stable_id("SNAP", self.run_id, snapshot_at)
        backup_location = f"local-vault-dr-snapshot:{snapshot_id}"
        for record in self.key_records:
            record["physical_copies"].append({"location": backup_location, "is_live": False, "snapshot_taken_at": snapshot_at})
        snapshot = {
            "SYNTHETIC_ONLY": True,
            "snapshot_id": snapshot_id,
            "snapshot_at": snapshot_at,
            "kek_records": copy.deepcopy(list(self.kek_records.values())),
            "dek_records": copy.deepcopy(list(self.dek_records.values())),
            "kek_material_b64": {key_id: b64(key) for key_id, key in self.kek_material.items()},
            "wrapped_deks": dict(self.wrapped_deks),
        }
        write_json(snapshot_path, snapshot)
        self._save()
        return snapshot

    @classmethod
    def restore_from_backup(cls, snapshot_path: Path, target_path: Path, clock: SyntheticClock, run_id: str, restore_at: str, validator: Validator | None = None) -> "LocalKeyVault":
        """Restore with decryption BLOCKED until independent destruction records are replayed (ADR-002, proposal 009)."""
        snapshot = read_json(snapshot_path)
        restored = cls(target_path, clock, run_id, validator)
        restored.kek_records = {record["key_id"]: record for record in snapshot["kek_records"]}
        restored.dek_records = {record["key_id"]: record for record in snapshot["dek_records"]}
        restored.kek_material = {key_id: unb64(value) for key_id, value in snapshot["kek_material_b64"].items()}
        restored.wrapped_deks = dict(snapshot["wrapped_deks"])
        restored.decrypt_serviceable = False
        restored.restore_event = {
            "restore_event_id": stable_id("RESTORE", snapshot["snapshot_id"], restore_at),
            "restored_from_snapshot_at": snapshot["snapshot_at"],
            "restore_initiated_at": restore_at,
            "decrypt_serviceable": False,
            "replay_gate": {"status": "PENDING", "destruction_records_to_replay": [], "records_replayed": [], "re_destruction_confirmed": False},
        }
        restored._save()
        return restored

    @classmethod
    def load(cls, path: Path, clock: SyntheticClock, run_id: str) -> "LocalKeyVault":
        """Re-open a persisted vault (tests use this to decrypt with the real key state)."""
        saved = read_json(path)
        vault = cls(path, clock, run_id)
        vault.kek_records = {record["key_id"]: record for record in saved["key_records"] if record["key_use"] == "KEK"}
        vault.dek_records = {record["key_id"]: record for record in saved["key_records"] if record["key_use"] == "DEK"}
        vault.kek_material = {key_id: unb64(value) for key_id, value in saved["kek_material_b64"].items()}
        vault.wrapped_deks = dict(saved["wrapped_deks"])
        vault.destruction_records = list(saved["destruction_records"])
        vault.decrypt_serviceable = saved["decrypt_serviceable"]
        vault.restore_event = saved["vault_restore_event"]
        return vault

    def replay_post_snapshot_destruction_records(self, independent_records: list[dict[str, Any]]) -> list[str]:
        """Re-apply every destruction that happened AFTER the snapshot instant; confirm by re-checking the records."""
        if self.restore_event is None:
            raise InvariantViolation("RESTORE_EVENT_MISSING")
        snapshot_instant = parse_timestamp(self.restore_event["restored_from_snapshot_at"])
        records = [record for record in independent_records if parse_timestamp(record["destroyed_at"]) > snapshot_instant]
        to_replay = [record["independent_audit_log_ref"] for record in records]
        gate = self.restore_event["replay_gate"]
        gate["status"] = "IN_PROGRESS"
        gate["destruction_records_to_replay"] = to_replay
        replayed: list[str] = []
        for destruction in records:
            record = self.dek_records.get(destruction["key_id"])
            if record is None:
                raise InvariantViolation(f"RESTORE_REPLAY_DEK_MISSING: {destruction['key_id']}")
            if record["status"] == "ACTIVE" and record["key_id"] in self.wrapped_deks:
                self._destroy_record(record, destruction["destroyed_at"])
            # In the restored vault every copy is now reachable and re-destroyed.
            record["physical_copies"] = [{k: v for k, v in copy_location.items() if k != "pending"} | {"destroyed": True, "destroyed_at": destruction["destroyed_at"]} for copy_location in record["physical_copies"]]
            self.destruction_records.append(copy.deepcopy(destruction))
            replayed.append(destruction["independent_audit_log_ref"])
        confirmed = all(
            self.dek_records[destruction["key_id"]]["status"] == "DESTROYED" and destruction["key_id"] not in self.wrapped_deks
            for destruction in records
        )
        gate["records_replayed"] = replayed
        gate["re_destruction_confirmed"] = confirmed and len(replayed) == len(to_replay)
        gate["status"] = "COMPLETE" if gate["re_destruction_confirmed"] else "FAILED"
        self.decrypt_serviceable = gate["status"] == "COMPLETE"
        self.restore_event["decrypt_serviceable"] = self.decrypt_serviceable
        self._save()
        return replayed

    # ------------------------------------------------------------ persistence
    def _save(self) -> None:
        self._validate_records()
        write_json(
            self.path,
            {
                "SYNTHETIC_ONLY": True,
                "key_records": self.key_records,
                "wrapped_deks": self.wrapped_deks,
                "kek_material_b64": {key_id: b64(key) for key_id, key in self.kek_material.items()},
                "destruction_records": self.destruction_records,
                "decrypt_serviceable": self.decrypt_serviceable,
                "vault_restore_event": self.restore_event,
            },
        )
